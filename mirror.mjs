import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { load } from "cheerio";
import valueParser from "postcss-value-parser";
import postcss from "postcss";
import { parseCaptureArgs, captureHelp } from "./lib/cli.mjs";
import { browserOptions } from "./lib/browser.mjs";

let options;
try {
  options = parseCaptureArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message + "\nUse --help for usage.");
  process.exit(1);
}
if (options.help) {
  console.log(captureHelp);
  process.exit(0);
}
const { target, maxPages, concurrency, maxBytes, maxResources } = options;
const output = path.resolve(options.output || "output/site");
const browserDiscovery = options.browser;
const launchOptions = browserDiscovery
  ? await browserOptions(options.chrome)
  : null;
const started = performance.now();
await fs.mkdir(output, { recursive: true });
if ((await fs.readdir(output)).length)
  throw new Error(
    "Choose an empty output directory. Existing files will not be overwritten.",
  );

const resources = new Map();
const pages = new Set();
const queue = [];
const failures = [];
const exclusions = new Set();
const adaptations = new Map();
let totalBytes = 0;
let active = 0;
let resolveQueue;
const userAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const tracking =
  /googletagmanager\.com|google-analytics\.com|stats\.wp\.com|\/recaptcha\/|googlesitekit-events|contact-form-7\/modules\/recaptcha/;
const assetExtension =
  /\.(?:css|m?js|png|jpe?g|webp|avif|gif|svg|ico|woff2?|ttf|otf|eot|mp4|webm)(?:[?#]|$)/i;

function normalize(raw, base = target.href) {
  if (!raw || /^(?:data:|blob:|mailto:|tel:|javascript:|#)/i.test(raw))
    return null;
  try {
    const url = new URL(raw, base);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
function localPath(href, isPage = pages.has(href)) {
  const url = new URL(href);
  let pathname = url.pathname;
  if (isPage)
    pathname = pathname.endsWith("/")
      ? pathname + "index.html"
      : pathname + (path.extname(pathname) ? "" : "/index.html");
  if (!pathname || pathname === "/") pathname = "/index.html";
  if (url.origin !== target.origin) {
    const hash = createHash("sha256")
      .update(url.search)
      .digest("hex")
      .slice(0, 8);
    pathname =
      "/_external/" +
      externalKey(url) +
      pathname +
      (url.search ? "." + hash : "");
  }
  return pathname;
}
function externalKey(url) {
  return url.hostname.replaceAll(":", "_") + (url.port ? "_" + url.port : "");
}
function originalForLocal(url, localOrigin) {
  if (url.origin !== localOrigin) return url.href;
  for (const resource of resources.values()) {
    if (localPath(resource.url) === url.pathname) return resource.url;
  }
  if (url.pathname.startsWith("/_external/")) {
    const [, , key, ...segments] = url.pathname.split("/");
    const origin = [...resources.keys()]
      .map((href) => new URL(href))
      .find((source) => externalKey(source) === key);
    return origin
      ? new URL("/" + segments.join("/") + url.search, origin.origin).href
      : null;
  }
  return new URL(url.pathname + url.search, target.origin).href;
}
function rewritten(raw, base, pageLink = false) {
  const href = normalize(raw, base);
  if (!href) return raw;
  if (pageLink && !pages.has(href)) return new URL(raw, base).href;
  if (!resources.has(href) && !pages.has(href)) return raw;
  const fragment = new URL(raw, base).hash;
  const result = localPath(href);
  return (
    (pages.has(href) ? result.replace(/index\.html$/, "") : result) + fragment
  );
}
function enqueue(raw, base, kind = "asset") {
  const href = normalize(raw, base);
  if (!href) return;
  if (tracking.test(href)) {
    exclusions.add(href);
    return;
  }
  if (kind === "page") {
    const url = new URL(href);
    if (
      url.origin !== target.origin ||
      /\/(?:wp-admin|wp-json|feed|comments|xmlrpc\.php)(?:\/|$)/.test(
        url.pathname,
      ) ||
      url.search
    )
      return;
    if (!pages.has(href) && pages.size >= maxPages) return;
    pages.add(href);
  }
  if (resources.has(href)) return;
  if (resources.size >= maxResources) {
    failures.push({ url: href, error: "Resource limit exceeded" });
    return;
  }
  const resource = { url: href, kind, status: "queued" };
  resources.set(href, resource);
  queue.push(resource);
}
function cssReferences(css, base, rewrite = false) {
  const parsed = valueParser(css);
  parsed.walk((node) => {
    if (node.type !== "function" || node.value.toLowerCase() !== "url") return;
    const raw = valueParser
      .stringify(node.nodes)
      .trim()
      .replace(/^(['"])(.*)\1$/, "$2");
    if (!rewrite) enqueue(raw, base);
    if (rewrite)
      node.nodes = [
        { type: "string", quote: '"', value: rewritten(raw, base) },
      ];
  });
  // Quoted CSS imports do not necessarily use url().
  return parsed
    .toString()
    .replace(/(@import\s+)(['"])([^'"]+)\2/g, (whole, prefix, quote, raw) => {
      if (!rewrite) enqueue(raw, base);
      return rewrite
        ? `${prefix}${quote}${rewritten(raw, base)}${quote}`
        : whole;
    });
}
function omitUnavailableFonts(css, base) {
  const tree = postcss.parse(css);
  tree.walkAtRules("font-face", (rule) => {
    const urls = [];
    let family = "";
    rule.walkDecls((decl) => {
      if (decl.prop === "font-family") family = decl.value;
      if (decl.prop !== "src") return;
      valueParser(decl.value).walk((node) => {
        if (node.type === "function" && node.value === "url")
          urls.push(
            normalize(
              valueParser.stringify(node.nodes).replace(/^(['"])(.*)\1$/, "$2"),
              base,
            ),
          );
      });
    });
    if (
      urls.length &&
      urls.every((url) => resources.get(url)?.status === "failed")
    ) {
      adaptations.set(base + ":" + family + ":" + urls.join(","), {
        file: base,
        kind: "unavailable-font-fallback",
        family,
        urls,
      });
      rule.remove();
    }
  });
  return tree.toString();
}
function discoverInlineAssets(text, base) {
  const normalizedText = text.replaceAll("\\/", "/");
  for (const match of normalizedText.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)) {
    if (assetExtension.test(match[0])) enqueue(match[0], base);
  }
}
function processHtml(html, base, rewrite = false) {
  const $ = load(html);
  $("base").remove();
  $("script").each((_, element) => {
    const node = $(element);
    const id = node.attr("id") || "";
    const src = node.attr("src");
    if (
      (src && tracking.test(src)) ||
      /google_gtagjs|jetpack-stats|wpcf7-recaptcha|^swv-js$|^contact-form-7-js/.test(
        id,
      ) ||
      node.attr("type") === "speculationrules"
    ) {
      exclusions.add(src || id || "speculationrules");
      node.remove();
      return;
    }
    if (src) {
      enqueue(src, base);
      if (rewrite) node.attr("src", rewritten(src, base));
    } else {
      discoverInlineAssets(node.html() || "", base);
      if (rewrite) node.html(replaceUrls(node.html() || ""));
    }
  });
  $("link").each((_, element) => {
    const node = $(element),
      rel = node.attr("rel") || "",
      href = node.attr("href");
    if (
      /^(?:stylesheet|icon|shortcut icon|apple-touch-icon|preload|modulepreload)$/.test(
        rel,
      )
    ) {
      enqueue(href, base);
      if (rewrite && href) node.attr("href", rewritten(href, base));
    } else if (rewrite && /dns-prefetch|preconnect/.test(rel)) node.remove();
  });
  $("[src], [poster], [data-src], [data-lazy-src]")
    .not("script")
    .each((_, element) => {
      const node = $(element);
      if (element.tagName === "iframe") return;
      for (const attr of ["src", "poster", "data-src", "data-lazy-src"]) {
        const raw = node.attr(attr);
        if (!raw) continue;
        enqueue(raw, base);
        if (rewrite) node.attr(attr, rewritten(raw, base));
      }
    });
  $("[srcset], [data-srcset]").each((_, element) => {
    const node = $(element);
    for (const attr of ["srcset", "data-srcset"]) {
      const raw = node.attr(attr);
      if (!raw || raw.startsWith("data:")) continue;
      const updated = raw
        .split(",")
        .map((item) => {
          const [url, ...descriptor] = item.trim().split(/\s+/);
          enqueue(url, base);
          return [rewrite ? rewritten(url, base) : url, ...descriptor].join(
            " ",
          );
        })
        .join(", ");
      if (rewrite) node.attr(attr, updated);
    }
  });
  $("[style]").each((_, element) => {
    const node = $(element);
    const css = cssReferences(node.attr("style"), base, rewrite);
    if (rewrite) node.attr("style", css);
  });
  $("*").each((_, element) => {
    const node = $(element);
    for (const [name, value] of Object.entries(element.attribs || {})) {
      if (!name.startsWith("data-")) continue;
      for (const item of value.split(/,(?=https?:\/\/)/))
        if (assetExtension.test(item)) enqueue(item, base);
      if (rewrite) node.attr(name, replaceUrls(value));
    }
  });
  $("style").each((_, element) => {
    const node = $(element);
    const css = cssReferences(node.html(), base, rewrite);
    if (rewrite) node.html(css);
  });
  $("a[href]").each((_, element) => {
    const node = $(element),
      href = node.attr("href");
    if (assetExtension.test(href)) enqueue(href, base);
    else if (!rewrite) enqueue(href, base, "page");
    if (rewrite)
      node.attr("href", rewritten(href, base, !assetExtension.test(href)));
  });
  if (rewrite) {
    $("[data-settings]").each((_, element) => {
      const node = $(element);
      node.attr("data-settings", replaceUrls(node.attr("data-settings")));
    });
    $("[integrity]").removeAttr("integrity");
    $("head").prepend('<script src="/_local-preview.js"></script>');
    return $.html();
  }
  return html;
}
function replaceUrls(text) {
  // Replace known external URLs first; original-origin dynamic paths then work
  // against this local server, rather than silently depending on the source.
  for (const resource of [...resources.values()].sort(
    (a, b) => b.url.length - a.url.length,
  )) {
    if (new URL(resource.url).origin === target.origin) continue;
    const escaped = resource.url.replaceAll("/", "\\/");
    text = text
      .replaceAll(resource.url, localPath(resource.url))
      .replaceAll(escaped, localPath(resource.url));
    const protocolRelative = resource.url
      .replace(/^https?:/, "")
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(
      new RegExp("(?<!:)" + protocolRelative, "g"),
      localPath(resource.url),
    );
  }
  for (const origin of new Set(
    [...resources.keys()].map((href) => new URL(href).origin),
  )) {
    if (origin === target.origin) continue;
    const local = "/_external/" + externalKey(new URL(origin));
    text = text
      .replaceAll(origin.replaceAll("/", "\\/"), local)
      .replaceAll(origin, local);
  }
  return text
    .replaceAll(target.origin.replaceAll("/", "\\/"), "")
    .replaceAll(target.origin, "");
}
async function fetchResource(resource) {
  const before = performance.now();
  try {
    const response = await fetch(resource.url, {
      headers: { "user-agent": userAgent },
      signal: AbortSignal.timeout(25000),
      redirect: "follow",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const chunks = [];
    for await (const chunk of response.body) {
      if (totalBytes + chunk.length > maxBytes)
        throw new Error("Capture byte limit exceeded");
      totalBytes += chunk.length;
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    resource.bytes = bytes;
    resource.contentType = response.headers.get("content-type") || "";
    resource.status = "downloaded";
    resource.seconds = Number(((performance.now() - before) / 1000).toFixed(3));
    resource.finalUrl = response.url;
    if (resource.kind === "page") processHtml(bytes.toString(), resource.url);
    else if (resource.contentType.includes("text/css"))
      cssReferences(bytes.toString(), resource.url);
  } catch (error) {
    resource.status = "failed";
    resource.error = error.message;
    failures.push({ url: resource.url, error: error.message });
  }
}
function pump() {
  while (active < concurrency && queue.length && totalBytes <= maxBytes) {
    const resource = queue.shift();
    active++;
    fetchResource(resource).finally(() => {
      active--;
      pump();
    });
  }
  if (active === 0 && (queue.length === 0 || totalBytes > maxBytes))
    resolveQueue();
}
enqueue(target.href, target.href, "page");
await new Promise((resolve) => {
  resolveQueue = resolve;
  pump();
});
const downloadSeconds = (performance.now() - started) / 1000;
async function writeResource(resource) {
  if (resource.status !== "downloaded") return;
  let bytes = resource.bytes;
  if (resource.kind === "page")
    bytes = Buffer.from(processHtml(bytes.toString(), resource.url, true));
  else if (resource.contentType.includes("text/css"))
    bytes = Buffer.from(
      replaceUrls(
        cssReferences(
          omitUnavailableFonts(bytes.toString(), resource.url),
          resource.url,
          true,
        ),
      ),
    );
  else if (/javascript|json|svg/.test(resource.contentType))
    bytes = Buffer.from(replaceUrls(bytes.toString()));
  const relative = decodeURIComponent(localPath(resource.url)).replace(
    /^\/+/,
    "",
  );
  const destination = path.resolve(output, relative);
  if (!destination.startsWith(output + path.sep))
    throw new Error("Invalid output path");
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.writeFile(destination, bytes);
  resource.file = relative;
}
for (const resource of resources.values()) await writeResource(resource);
await fs.writeFile(
  path.join(output, "_local-preview.js"),
  `document.addEventListener('submit', function(event) { event.preventDefault(); event.stopImmediatePropagation(); alert('Local preview: this form is not connected to a backend.'); }, true);`,
);
const discovery = {
  enabled: browserDiscovery,
  downloaded: [],
  unresolved: [],
  pageErrors: [],
};
if (browserDiscovery && resources.get(target.href)?.status === "downloaded") {
  const { chromium } = await import("playwright-core");
  const { createServer } = await import("./serve.mjs");
  const server = createServer(output);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const localOrigin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    serviceWorkers: "block",
  });
  const inflight = new Map();
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (!["http:", "https:"].includes(url.protocol)) return route.continue();
    if (request.method() !== "GET") return route.abort();
    const isLocal = url.origin === localOrigin;
    if (!isLocal && tracking.test(url.href)) return route.abort();
    const local = isLocal ? await route.fetch() : null;
    if (
      local &&
      (local.status() !== 404 || request.resourceType() === "document")
    )
      return route.fulfill({ response: local });
    if (
      !["script", "stylesheet", "image", "font", "media"].includes(
        request.resourceType(),
      )
    ) {
      discovery.unresolved.push({
        url: request.url(),
        reason: "Missing local resource or backend",
      });
      return local ? route.fulfill({ response: local }) : route.abort();
    }
    const original = originalForLocal(url, localOrigin);
    if (!original) {
      discovery.unresolved.push({
        url: url.href,
        reason: "Unknown external asset origin",
      });
      return route.abort();
    }
    if (!inflight.has(original))
      inflight.set(
        original,
        (async () => {
          if (resources.has(original)) return resources.get(original);
          const resource = { url: original, kind: "asset", status: "queued" };
          if (resources.size >= maxResources) {
            resource.status = "failed";
            resource.error = "Resource limit exceeded";
            failures.push({ url: original, error: resource.error });
            return resource;
          }
          resources.set(original, resource);
          await fetchResource(resource);
          await writeResource(resource);
          if (resource.status === "downloaded")
            discovery.downloaded.push(original);
          else
            discovery.unresolved.push({
              url: original,
              reason: resource.error,
            });
          return resource;
        })(),
      );
    const resource = await inflight.get(original);
    if (resource.status !== "downloaded")
      return local ? route.fulfill({ response: local }) : route.abort();
    return route.fulfill({
      status: 200,
      contentType: resource.contentType,
      body: await fs.readFile(path.join(output, resource.file)),
    });
  });
  const remaining = [...pages];
  try {
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        const page = await context.newPage();
        const pending = new Set();
        let changed = performance.now();
        page.on("request", (r) => {
          pending.add(r);
          changed = performance.now();
        });
        const finished = (r) => {
          pending.delete(r);
          changed = performance.now();
        };
        page.on("requestfinished", finished);
        page.on("requestfailed", finished);
        const waitingForUncapturedRequest = () =>
          [...pending].some((request) => {
            const current = new URL(request.url());
            const original = originalForLocal(current, localOrigin);
            const resource = resources.get(original);
            // Media streams and worker imports may keep a browser request open
            // after the complete file is already safely captured on disk.
            return (
              !resource || !["downloaded", "failed"].includes(resource.status)
            );
          });
        page.on("pageerror", (error) =>
          discovery.pageErrors.push({
            page: page.url(),
            message: error.message,
          }),
        );
        while (remaining.length) {
          const source = remaining.shift();
          try {
            pending.clear();
            changed = performance.now();
            await page.goto(
              localOrigin + localPath(source).replace(/index\.html$/, ""),
              { waitUntil: "load", timeout: 18000 },
            );
            await page.evaluate(() => {
              document
                .querySelectorAll('img[loading="lazy"]')
                .forEach((img) => (img.loading = "eager"));
              window.scrollTo(0, document.body.scrollHeight);
              if (window.Scrollbar)
                for (const bar of window.Scrollbar.getAll())
                  bar.setPosition(0, bar.limit.y);
            });
            const deadline = performance.now() + 8000;
            while (
              (waitingForUncapturedRequest() ||
                performance.now() - changed < 150) &&
              performance.now() < deadline
            )
              await page.waitForTimeout(40);
            if (waitingForUncapturedRequest())
              discovery.unresolved.push({
                url: source,
                reason:
                  "Uncaptured runtime request did not settle within discovery budget",
                pending: [...pending].map((request) => request.url()),
              });
          } catch (error) {
            discovery.unresolved.push({ url: source, reason: error.message });
          }
        }
        await page.close();
      }),
    );
    await Promise.all(inflight.values());
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
  if (queue.length)
    await new Promise((resolve) => {
      resolveQueue = resolve;
      pump();
    });
  for (const resource of resources.values()) await writeResource(resource);
}
const report = {
  source: target.href,
  capturedAt: new Date().toISOString(),
  mode: "fresh HTTP capture, parallel discovery; no asset cache",
  scope: { maxPages, concurrency, maxResources, maxBytes },
  timings: {
    downloadSeconds: Number(downloadSeconds.toFixed(3)),
    totalSeconds: Number(((performance.now() - started) / 1000).toFixed(3)),
  },
  downloadedBytes: totalBytes,
  pages: [...pages],
  failures,
  exclusions: [...exclusions],
  adaptations: [...adaptations.values()],
  discovery,
  limitations: [
    "Public frontend only; no private backend, database or CMS editor.",
    "Forms are disabled locally; external destinations remain links.",
    "Analytics, anti-bot widgets and speculative navigation omitted.",
    "Browser validation and ZIP packaging are measured separately.",
    "Runtime API responses, workers and arbitrary module graphs are not fully captured.",
    "Same-origin asset query variants currently share a file path.",
  ],
  resources: [...resources.values()].map(({ bytes, ...resource }) => ({
    ...resource,
    size: bytes?.length || 0,
  })),
};
await fs.writeFile(
  path.join(output, "capture-report.json"),
  JSON.stringify(report, null, 2),
);
console.log(
  JSON.stringify(
    {
      output,
      pages: pages.size,
      resources: resources.size,
      bytes: totalBytes,
      failures,
      timings: report.timings,
    },
    null,
    2,
  ),
);
if (resources.get(target.href)?.status !== "downloaded") process.exitCode = 1;
