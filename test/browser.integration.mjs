import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fixture, command } from "./helpers.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));

test(
  "browser discovers a runtime module on another origin and verification works without the source",
  { timeout: 60000 },
  async (t) => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), "d-j-view-browser-"));
    t.after(() => fs.rm(temp, { recursive: true, force: true }));
    const external = await fixture((req, res) => {
      res.setHeader("Content-Type", "application/javascript");
      res.setHeader("Access-Control-Allow-Origin", "*");
      if (req.url === "/loader.js")
        res.end(
          'import("./chunk.js").then(m => {document.querySelector("h1").textContent = m.title})',
        );
      else if (req.url === "/chunk.js")
        res.end('export const title="Runtime loaded locally"');
      else {
        res.statusCode = 404;
        res.end();
      }
    });
    const source = await fixture((req, res) => {
      if (req.url === "/") {
        res.setHeader("Content-Type", "text/html");
        res.end(
          `<h1>Waiting</h1><script src="${external.origin}/loader.js"></script>`,
        );
      } else if (req.url === "/favicon.ico") {
        res.statusCode = 204;
        res.end();
      } else {
        res.statusCode = 404;
        res.end();
      }
    });
    t.after(source.close);
    t.after(external.close);
    const output = path.join(temp, "site");
    const result = await command([
      path.join(root, "mirror.mjs"),
      source.origin,
      "--out",
      output,
      "--browser",
    ]);
    assert.equal(result.code, 0, result.stderr + result.stdout);
    const report = JSON.parse(
      await fs.readFile(path.join(output, "capture-report.json")),
    );
    assert.ok(
      report.discovery.downloaded.some((url) => url.endsWith("/chunk.js")),
    );
    await source.close();
    await external.close();
    const verify = await command([path.join(root, "verify.mjs"), output]);
    assert.equal(verify.code, 0, verify.stderr + verify.stdout);
  },
);
