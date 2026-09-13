import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright-core";

export async function browserOptions(explicit) {
  const requested = explicit || process.env.CHROME_PATH;
  const candidates = requested
    ? [requested]
    : [
        chromium.executablePath(),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        path.join(
          os.homedir(),
          "Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ),
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        ...[
          process.env.PROGRAMFILES,
          process.env["PROGRAMFILES(X86)"],
          process.env.LOCALAPPDATA,
        ]
          .filter(Boolean)
          .map((root) =>
            path.join(root, "Google/Chrome/Application/chrome.exe"),
          ),
      ];
  for (const executablePath of candidates) {
    try {
      await fs.access(executablePath);
      return { executablePath, headless: true };
    } catch {
      /* Try the next standard location. */
    }
  }
  throw new Error(
    requested
      ? `Browser not found: ${requested}`
      : "Chrome/Chromium not found. Install with: npx playwright-core install chromium; or set CHROME_PATH.",
  );
}
