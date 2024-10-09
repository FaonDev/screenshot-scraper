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
import puppeteer from "puppeteer";
import { z } from "zod";

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

      const cachePath = `cache/${url.hostname}.png`;

      const startTime = Date.now();

      const cachedFile = await Deno.stat(cachePath).catch(() => null);

      if (
        cachedFile &&
        cachedFile.mtime &&
        Date.now() - cachedFile.mtime.getTime() < 1000 * 60 * 60 * 24
      ) {
        const cachedScreenshot = await Deno.readFile(cachePath);

        console.log(
          `${bold(brightGreen(`[CACHE HIT #${cacheHitCount++}]`))} ${
            bold(brightBlue(query.url))
          } ${dim(`(${cachePath})`)}`,
        );

        return c.newResponse(cachedScreenshot, {
          headers: { "Content-Type": "image/png" },
        });
      }

      const browser = await puppeteer.launch({
        args: ["--no-sandbox"],
        defaultViewport: { height: 768, width: 1366 },
        handleSIGHUP: false,
        headless: "shell",
      });

      const page = await browser.newPage();

      await page.goto(url.toString(), {
        waitUntil: "networkidle2",
      });

      const screenshot = await page.screenshot();

      await browser.close();

      await Deno.writeFile(cachePath, screenshot);

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
