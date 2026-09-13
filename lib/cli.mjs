import { parseArgs } from "node:util";

export const captureHelp = `D-j-View — public frontend capture

Usage:
  npm run capture -- <URL> [options]
  npm run benchmark -- <URL> [options]

Options:
  --out <directory>       Fresh output directory
  --max-pages <number>    Same-origin public pages (default 10)
  --concurrency <number>  Parallel downloads, 1–64 (default 12)
  --max-resources <n>     Resource limit (default 500)
  --max-bytes <n>         Download byte limit (default 157286400)
  --browser              Discover assets by loading pages in Chrome
  --no-browser           Skip browser discovery (benchmark enables it by default)
  --chrome <path>        Browser executable (or set CHROME_PATH)
  --help                 Show this message

Example:
  npm run benchmark -- https://example.com --out output/example --browser

This captures frontend files. It does not recover private backends or
promise a ten-second result or automatic Next.js conversion.`;

export function parseCaptureArgs(args, { browserDefault = false } = {}) {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      out: { type: "string" },
      "max-pages": { type: "string", default: "10" },
      concurrency: { type: "string", default: "12" },
      "max-resources": { type: "string", default: "500" },
      "max-bytes": { type: "string", default: "157286400" },
      browser: { type: "boolean" },
      "no-browser": { type: "boolean" },
      chrome: { type: "string" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) return { help: true };
  if (positionals.length !== 1)
    throw new Error("Provide exactly one HTTP(S) URL.");
  const target = new URL(positionals[0]);
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password
  )
    throw new Error("Use an HTTP(S) URL without embedded credentials.");
  if (values.browser && values["no-browser"])
    throw new Error("Choose --browser or --no-browser.");
  function integer(name, maximum = Number.MAX_SAFE_INTEGER) {
    const value = Number(values[name]);
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum)
      throw new Error(`--${name} must be an integer from 1 to ${maximum}.`);
    return value;
  }
  return {
    target,
    output: values.out,
    maxPages: integer("max-pages"),
    concurrency: integer("concurrency", 64),
    maxResources: integer("max-resources"),
    maxBytes: integer("max-bytes"),
    browser: values["no-browser"] ? false : (values.browser ?? browserDefault),
    chrome: values.chrome,
  };
}
