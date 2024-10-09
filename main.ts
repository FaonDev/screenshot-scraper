import { zValidator } from "@hono/zod-validator";
import {
  bold,
  brightBlue,
  brightGreen,
  brightYellow,
  dim,
} from "@std/fmt/colors";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import process from "node:process";
import puppeteer from "puppeteer";
import { z } from "zod";

const config = {
  cache: {
    dir: "cache",
    expiration: 1000 * 60 * 60 * 24,
  },
  screenshot: {
    height: 768,
    width: 1366,
  },
};

const app = new Hono();

let cacheHitCount = 1;

let cacheMissCount = 1;

app.get(
  "/",
  zValidator(
    "query",
    z.object({
      url: z.string().url("Invalid URL"),
    }),
  ),
  async (c) => {
    try {
      const query = c.req.valid("query");

      const url = new URL(query.url);

      const cacheFilePath = `${config.cache.dir}/${url.hostname}.png`;

      const startTime = Date.now();

      const cachedFile = await Deno.stat(cacheFilePath).catch(() => null);

      if (
        cachedFile &&
        cachedFile.mtime &&
        Date.now() - cachedFile.mtime.getTime() < config.cache.expiration
      ) {
        const cachedScreenshot = await Deno.readFile(cacheFilePath);

        console.log(
          `${bold(brightGreen(`[CACHE HIT #${cacheHitCount++}]`))} ${
            bold(brightBlue(query.url))
          } ${dim(`(${cacheFilePath})`)}`,
        );

        return c.newResponse(cachedScreenshot, {
          headers: { "Content-Type": "image/png" },
        });
      }

      const browser = await puppeteer.launch({
        defaultViewport: config.screenshot,
        headless: "shell",
        ...(process.platform === "win32" && { handleSIGHUP: false }),
        ...(Deno.env.get("DOCKER") === "1" && { args: ["--no-sandbox"] }),
      });

      const page = await browser.newPage();

      await page.goto(url.toString(), {
        waitUntil: "networkidle2",
      });

      const screenshot = await page.screenshot();

      await browser.close();

      await Deno.writeFile(cacheFilePath, screenshot);

      const elapsedTime = Math.floor(Date.now() - startTime);

      console.log(
        `${bold(brightYellow(`[CACHE MISS #${cacheMissCount++}]`))} ${
          dim("Captured")
        } ${bold(brightBlue(query.url))} ${dim("in")} ${
          bold(
            brightYellow(`${Math.round(elapsedTime / 1000)}s`),
          )
        }`,
      );

      return c.newResponse(screenshot, {
        headers: { "Content-Type": "image/png" },
      });
    } catch (e) {
      console.error(e);

      throw new HTTPException(500, {
        message: "Unable to capture",
      });
    }
  },
);

Deno.serve(app.fetch);

Deno.cron("Clear cache", { hour: { every: 3 } }, async () => {
  for await (const entry of Deno.readDir(config.cache.dir)) {
    if (!entry.isFile || [".gitignore", ".gitkeep"].includes(entry.name)) {
      continue;
    }

    const filePath = `${config.cache.dir}/${entry.name}`;

    const file = await Deno.stat(filePath);

    if (
      file.mtime &&
      Date.now() - file.mtime.getTime() < config.cache.expiration
    ) continue;

    await Deno.remove(filePath);
  }
});
