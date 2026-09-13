import fs from "node:fs/promises";
import path from "node:path";
import { createServer } from "./serve.mjs";

if (process.argv.includes("--help")) {
  console.log(
    "Usage: npm start -- [capture-directory] [port]\nDefaults: latest benchmark, port 4174.",
  );
} else {
  try {
    let directory = process.argv[2];
    if (!directory)
      directory = JSON.parse(
        await fs.readFile(".site-capture/latest.json", "utf8"),
      ).site;
    directory = path.resolve(directory);
    await fs.access(path.join(directory, "capture-report.json"));
    const port = Number(process.argv[3] || 4174);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error("Port must be between 1 and 65535.");
    const server = createServer(directory);
    server.on("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    server.listen(port, "127.0.0.1", () =>
      console.log(
        `Local preview: http://127.0.0.1:${port}\nFiles: ${directory}`,
      ),
    );
  } catch (error) {
    console.error(
      `Cannot start preview: ${error.message}\nRun a benchmark first, or use: npm start -- output/my-site`,
    );
    process.exitCode = 1;
  }
}
