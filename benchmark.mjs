import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import { parseCaptureArgs, captureHelp } from "./lib/cli.mjs";
import { zipDirectory } from "./lib/zip.mjs";

try {
  const options = parseCaptureArgs(process.argv.slice(2), {
    browserDefault: true,
  });
  if (options.help) {
    console.log(captureHelp);
    process.exit(0);
  }
  const toolRoot = path.dirname(fileURLToPath(import.meta.url));
  const run = path.resolve(
    options.output ||
      "output/run-" + new Date().toISOString().replace(/[:.]/g, "-"),
  );
  try {
    if ((await fs.readdir(run)).length)
      throw new Error("Choose an empty output directory.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const packageRoot = path.join(run, "package");
  const site = path.join(packageRoot, "site");
  const started = performance.now();
  await fs.mkdir(packageRoot, { recursive: true });
  const args = [
    path.join(toolRoot, "mirror.mjs"),
    options.target.href,
    "--out",
    site,
    "--max-pages",
    String(options.maxPages),
    "--concurrency",
    String(options.concurrency),
    "--max-resources",
    String(options.maxResources),
    "--max-bytes",
    String(options.maxBytes),
  ];
  if (options.browser) args.push("--browser");
  if (options.chrome) args.push("--chrome", options.chrome);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Capture failed (exit ${code}). Inspect ${site}/capture-report.json if present.`,
            ),
          ),
    );
  });
  const capture = JSON.parse(
    await fs.readFile(path.join(site, "capture-report.json"), "utf8"),
  );
  await fs.copyFile(
    path.join(toolRoot, "serve.mjs"),
    path.join(packageRoot, "serve.mjs"),
  );
  await fs.writeFile(
    path.join(packageRoot, "README.md"),
    `# Local frontend capture\n\nSource: ${options.target.href}\n\nRun \`node serve.mjs site 4174\` in this extracted folder, then open http://127.0.0.1:4174. Node.js is required; no npm install is needed.\n\n${capture.pages.length} public pages selected. Edit files under site/. Contact forms are disabled locally. External destinations remain links. This archive does not contain private backend code or databases. See site/capture-report.json for failed assets, adaptations and discovery limits.\n`,
  );
  const zip = path.join(run, "site-capture.zip");
  await zipDirectory(packageRoot, zip);
  const elapsed = Number(((performance.now() - started) / 1000).toFixed(3));
  const report = {
    source: options.target.href,
    createdAt: new Date().toISOString(),
    site: "package/site",
    zip: "site-capture.zip",
    scope:
      "Capture, optional browser discovery, file rewriting and stored ZIP packaging. Excludes installation, development and separate validation.",
    totalSeconds: elapsed,
    captureSeconds: capture.timings.totalSeconds,
    pages: capture.pages.length,
    downloadedResources: capture.resources.filter(
      (r) => r.status === "downloaded",
    ).length,
    downloadedBytes: capture.downloadedBytes,
    sourceAssetFailures: capture.failures.length,
    unresolvedRuntimeDependencies: capture.discovery.unresolved,
    browserDiscoveryEnabled: options.browser,
    zipBytes: (await fs.stat(zip)).size,
    metTenSecondTimeTarget: elapsed <= 10,
    captureHasReportedIssues: Boolean(
      capture.failures.length ||
      capture.discovery.unresolved.length ||
      capture.discovery.pageErrors.length,
    ),
  };
  await fs.writeFile(
    path.join(run, "benchmark.json"),
    JSON.stringify(report, null, 2),
  );
  await fs.mkdir(".site-capture", { recursive: true });
  await fs.writeFile(
    ".site-capture/latest.json",
    JSON.stringify(
      {
        site: path.relative(process.cwd(), site),
        run: path.relative(process.cwd(), run),
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ ...report, output: run }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
