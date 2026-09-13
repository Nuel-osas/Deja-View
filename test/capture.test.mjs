import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync } from "fflate";
import { fixture, command } from "./helpers.mjs";
import { parseCaptureArgs } from "../lib/cli.mjs";
import { createServer } from "../serve.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));

test("CLI requires a URL, rejects invalid limits, and supports paths with spaces", () => {
  assert.throws(() => parseCaptureArgs([]));
  for (const value of ["0", "-1", "NaN", "1.5"])
    assert.throws(() =>
      parseCaptureArgs(["https://example.com", "--concurrency", value]),
    );
  assert.throws(() => parseCaptureArgs(["file:///tmp/source"]));
  assert.throws(() => parseCaptureArgs(["https://example.com", "--unknown"]));
  assert.equal(
    parseCaptureArgs(["https://example.com", "--out", "folder with spaces"])
      .output,
    "folder with spaces",
  );
});

test("capture and portable ZIP work from a fresh directory, including encoded asset paths and CSS imports", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "d-j-view-test-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const external = await fixture((req, res) => {
    res.setHeader("Content-Type", "image/svg+xml");
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>');
  });
  t.after(external.close);
  const source = await fixture((req, res) => {
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        `<h1>Fixture</h1><link rel="stylesheet" href="/style.css"><a href="/about/">About</a><img src="${external.origin}/hello%20world.svg"><video data-video-urls="${external.origin}/one.svg,${external.origin}/two.svg"></video><form action="${external.origin}/submit"><button>Submit</button></form>`,
      );
    } else if (req.url === "/style.css") {
      res.setHeader("Content-Type", "text/css");
      res.end(
        '@import "more.css";body{background-image:url("/images%2Fblue%20sky.svg")}',
      );
    } else if (req.url === "/more.css") {
      res.setHeader("Content-Type", "text/css");
      res.end("h1{color:blue}");
    } else if (req.url === "/images%2Fblue%20sky.svg") {
      res.setHeader("Content-Type", "image/svg+xml");
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>');
    } else if (req.url === "/about/") {
      res.setHeader("Content-Type", "text/html");
      res.end('<h1>About</h1><a href="/">Home</a>');
    } else {
      res.statusCode = 404;
      res.end("Missing");
    }
  });
  t.after(source.close);
  const output = path.join(temp, "bundle with spaces");
  const result = await command(
    [
      path.join(root, "benchmark.mjs"),
      source.origin,
      "--out",
      output,
      "--no-browser",
    ],
    { cwd: temp },
  );
  assert.equal(result.code, 0, result.stderr + result.stdout);
  const capture = JSON.parse(
    await fs.readFile(path.join(output, "package/site/capture-report.json")),
  );
  assert.equal(capture.pages.length, 2);
  assert.deepEqual(capture.failures, []);
  assert.ok(capture.resources.some((r) => r.file === "images/blue sky.svg"));
  assert.ok(capture.resources.some((r) => r.url.endsWith("/two.svg")));
  const server = createServer(path.join(output, "package/site"));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const localOrigin = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (await fetch(localOrigin + "/images%2Fblue%20sky.svg")).status,
    200,
  );
  const archive = unzipSync(
    await fs.readFile(path.join(output, "site-capture.zip")),
  );
  assert.ok(archive["site/index.html"]);
  assert.ok(archive["serve.mjs"]);
  assert.ok(archive["README.md"]);
  const html = Buffer.from(archive["site/index.html"]).toString();
  assert.ok(html.includes("/_local-preview.js"));
  const duplicate = await command(
    [
      path.join(root, "mirror.mjs"),
      source.origin,
      "--out",
      path.join(output, "package/site"),
    ],
    { cwd: temp },
  );
  assert.notEqual(duplicate.code, 0);
  const run = JSON.parse(
    await fs.readFile(path.join(output, "benchmark.json")),
  );
  assert.equal(run.captureHasReportedIssues, false);
  assert.equal(run.browserDiscoveryEnabled, false);
});

test("failed primary pages produce a report and nonzero exit; byte budgets are enforced", async (t) => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "d-j-view-limits-"));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const source = await fixture((req, res) => {
    if (req.url === "/missing") res.statusCode = 404;
    res.end("x".repeat(1024));
  });
  t.after(source.close);
  for (const [url, args, folder] of [
    [source.origin + "/missing", [], "missing"],
    [source.origin, ["--max-bytes", "100"], "limited"],
  ]) {
    const output = path.join(temp, folder);
    const result = await command([
      path.join(root, "mirror.mjs"),
      url,
      "--out",
      output,
      ...args,
    ]);
    assert.notEqual(result.code, 0);
    const report = JSON.parse(
      await fs.readFile(path.join(output, "capture-report.json")),
    );
    assert.ok(report.failures.length);
    if (folder === "limited") assert.ok(report.downloadedBytes <= 100);
  }
});
