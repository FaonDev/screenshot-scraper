import { zValidator } from "@hono/zod-validator";
import {
  bold,
  brightBlue,
  brightGreen,
  brightYellow,
  gray,
} from "@std/fmt/colors";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import puppeteer from "puppeteer";
import { z } from "zod";

const app = new Hono();

let captureCount = 1;

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

      const start = Date.now();

      const browser = await puppeteer.launch({
        args: ["--no-sandbox"],
        defaultViewport: { height: 768, width: 1366 },
        handleSIGHUP: false,
        headless: "shell",
      });

      const page = await browser.newPage();

      await page.goto(query.url, {
        waitUntil: "networkidle2",
      });

      const screenshot = await page.screenshot();

      await browser.close();

      const end = Date.now();

      const elapsed = Math.floor(end - start);

      console.log(
        `${bold(brightGreen(`[Capture #${captureCount++}]`))} ${
          gray(
            `Scraped ${bold(brightBlue(query.url))} in ${
              bold(brightYellow(`${Math.round(elapsed / 1000)}s`))
            }`,
          )
        }`,
      );

      return c.newResponse(screenshot, {
        headers: { "Content-Type": "image/png" },
      });
    } catch (e) {
      console.error(e);

      throw new HTTPException(500, {
        message: "Unable to scrape",
      });
    }
  },
);

Deno.serve(app.fetch);
