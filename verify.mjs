import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright-core";
import { createServer } from "./serve.mjs";
import { browserOptions } from "./lib/browser.mjs";

const started = performance.now();
let browser, server;
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      chrome: { type: "string" },
      screenshots: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(
      "Usage: npm run verify -- [capture-directory] [--chrome PATH] [--screenshots]\nVisits captured pages with all external HTTP requests blocked. This is a dependency check, not proof of visual or backend equivalence.",
    );
    process.exit(0);
  }
  if (positionals.length > 1)
    throw new Error("Provide at most one capture directory.");
  const directory = path.resolve(
    positionals[0] ||
      JSON.parse(await fs.readFile(".site-capture/latest.json", "utf8")).site,
  );
  const capture = JSON.parse(
    await fs.readFile(path.join(directory, "capture-report.json"), "utf8"),
  );
  const report = {
    source: capture.source,
    conditions:
      "Desktop 1440x1000. External HTTP requests blocked; lazy images prompted to load; page load and one scroll checked. No comparison to the live site.",
    pages: [],
  };
  browser = await chromium.launch(await browserOptions(values.chrome));
  server = createServer(directory);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const source of capture.pages) {
    const resource = capture.resources.find(
      (r) => r.url === source && r.kind === "page",
    );
    const result = { source, externalRequests: [], missing: [], errors: [] };
    if (!resource?.file) {
      result.errors.push("Page was not downloaded.");
      report.pages.push(result);
      continue;
    }
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      serviceWorkers: "block",
    });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (["http:", "https:"].includes(url.protocol) && url.origin !== origin) {
        result.externalRequests.push(url.href);
        return route.abort();
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("response", (response) => {
      if (response.status() >= 400)
        result.missing.push({
          path: new URL(response.url()).pathname,
          status: response.status(),
        });
    });
    page.on("pageerror", (error) => result.errors.push(error.message));
    try {
      const localPath =
        "/" +
        resource.file
          .split(path.sep)
          .map(encodeURIComponent)
          .join("/")
          .replace(/index\.html$/, "");
      await page.goto(origin + localPath, {
        waitUntil: "load",
        timeout: 20000,
      });
      await page.evaluate(() => {
        document
          .querySelectorAll('img[loading="lazy"]')
          .forEach((img) => (img.loading = "eager"));
        window.scrollTo(0, document.body.scrollHeight);
      });
      await page
        .waitForLoadState("networkidle", { timeout: 5000 })
        .catch(() =>
          result.errors.push(
            "Requests did not settle within the verification budget.",
          ),
        );
      await page.waitForTimeout(300);
      result.title = await page.title();
      result.brokenImages = await page
        .locator("img")
        .evaluateAll((images) =>
          images
            .filter(
              (i) =>
                i.getBoundingClientRect().width &&
                (!i.complete || !i.naturalWidth),
            )
            .map((i) => i.getAttribute("src")),
        );
      if (values.screenshots) {
        const shots = path.join(directory, "verification-screenshots");
        await fs.mkdir(shots, { recursive: true });
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: path.join(shots, `page-${report.pages.length + 1}.png`),
        });
      }
    } catch (error) {
      result.errors.push(error.message);
    }
    await context.close();
    report.pages.push(result);
  }
  report.passed =
    report.pages.length > 0 &&
    report.pages.every(
      (page) =>
        !page.externalRequests.length &&
        !page.missing.length &&
        !page.errors.length &&
        !page.brokenImages?.length,
    );
  report.validationSeconds = Number(
    ((performance.now() - started) / 1000).toFixed(3),
  );
  await fs.writeFile(
    path.join(directory, "verification-report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.passed) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
