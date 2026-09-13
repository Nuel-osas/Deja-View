import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createServer } from "../serve.mjs";

test("preview serves pages and seekable media without exposing a backend", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "capture-preview-test-"),
  );
  await fs.writeFile(path.join(directory, "index.html"), "<h1>Local copy</h1>");
  await fs.writeFile(
    path.join(directory, "video.mp4"),
    Buffer.from("0123456789"),
  );
  const server = createServer(directory);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const home = await fetch(origin);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type"), /text\/html/);
  assert.equal(await home.text(), "<h1>Local copy</h1>");
  const head = await fetch(origin + "/video.mp4", { method: "HEAD" });
  assert.equal(head.headers.get("content-length"), "10");
  assert.equal(await head.text(), "");
  for (const [range, contentRange, body] of [
    ["bytes=2-5", "bytes 2-5/10", "2345"],
    ["bytes=7-", "bytes 7-9/10", "789"],
    ["bytes=-3", "bytes 7-9/10", "789"],
    ["bytes=8-99", "bytes 8-9/10", "89"],
  ]) {
    const response = await fetch(origin + "/video.mp4", {
      headers: { Range: range },
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), contentRange);
    assert.equal(response.headers.get("content-type"), "video/mp4");
    assert.equal(await response.text(), body);
  }
  const beyondEnd = await fetch(origin + "/video.mp4", {
    headers: { Range: "bytes=10-" },
  });
  assert.equal(beyondEnd.status, 416);
  assert.equal(beyondEnd.headers.get("content-range"), "bytes */10");
  assert.equal((await fetch(origin + "/absent")).status, 404);
  assert.equal(
    (await fetch(origin + "/contact/", { method: "POST", body: "example" }))
      .status,
    405,
  );
});
