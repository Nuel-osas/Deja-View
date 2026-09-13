import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(process.argv[2] || "output/site");
const port = Number(process.argv[3] || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};
export function createServer(directory = root) {
  directory = path.resolve(directory);
  return http.createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) {
        res.writeHead(405);
        res.end("Local preview: no backend service.");
        return;
      }
      let pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      let filename = path.resolve(directory, "." + pathname);
      if (
        !filename.startsWith(directory + path.sep) &&
        filename !== directory
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      let stat = await fs.stat(filename);
      if (stat.isDirectory()) filename = path.join(filename, "index.html");
      const realRoot = await fs.realpath(directory);
      const realFile = await fs.realpath(filename);
      if (!realFile.startsWith(realRoot + path.sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const body = await fs.readFile(filename);
      let ext = path.extname(filename);
      if (pathname.startsWith("/_external/fonts.googleapis.com/")) ext = ".css";
      const hashedExtension = filename.match(
        /\.(woff2?|ttf|otf|css|js)\.[a-f0-9]{8}$/,
      );
      if (hashedExtension) ext = "." + hashedExtension[1];
      const headers = {
        "Content-Type": types[ext] || "application/octet-stream",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "Accept-Ranges": "bytes",
      };
      const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
      if (range && (range[1] || range[2])) {
        const start = range[1]
          ? Number(range[1])
          : Math.max(0, body.length - Number(range[2]));
        const end =
          range[1] && range[2]
            ? Math.min(Number(range[2]), body.length - 1)
            : body.length - 1;
        if (start >= body.length || end < start) {
          res.writeHead(416, { "Content-Range": `bytes */${body.length}` });
          res.end();
          return;
        }
        res.writeHead(206, {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${body.length}`,
          "Content-Length": end - start + 1,
        });
        res.end(
          req.method === "HEAD" ? undefined : body.subarray(start, end + 1),
        );
      } else {
        res.writeHead(200, { ...headers, "Content-Length": body.length });
        res.end(req.method === "HEAD" ? undefined : body);
      }
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not included in this capture.");
    }
  });
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const server = createServer();
  server.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(`Local clone: http://127.0.0.1:${port}\nFiles: ${root}`),
  );
}
