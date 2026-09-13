# D-j-View

Capture a public website's frontend, collect its assets, preview it locally, and package the result as a ZIP.

D-j-View is a local Node.js command-line prototype. It can follow same-origin page links, discover common browser-loaded assets with Chrome, rewrite local paths, and report incomplete downloads. It does **not** promise to clone every website in ten seconds, recover private backends, or automatically convert arbitrary websites to Next.js.

## Quick start

Requires Node.js 22 or newer. Node.js 24 is the recommended development version.

```sh
git clone https://github.com/Nuel-osas/D-j-View.git
cd D-j-View
npm ci

# Capture, discover browser-loaded assets, and create a ZIP.
npm run benchmark -- https://example.com --out output/example

# Preview the latest benchmark on this computer.
npm start
```

Open **http://127.0.0.1:4174**. Chrome/Chromium is detected in common macOS, Linux and Windows locations. If a browser is not found:

```sh
npx playwright-core install chromium
```

You can also supply `--chrome "/path/to/chrome"` or set `CHROME_PATH`. Linux may need browser system packages; Playwright's `npx playwright-core install --with-deps chromium` handles those in a suitable environment.

A benchmark writes:

```text
output/example/
  benchmark.json
  site-capture.zip
  package/
    README.md
    serve.mjs
    site/
      index.html
      capture-report.json
      ...captured pages and assets
```

Extract the ZIP and run `node serve.mjs site 4174` inside its folder. The extracted preview only needs Node.js, with no npm install. Edit the HTML, CSS, JavaScript and assets directly. The preview server binds to `127.0.0.1`.

## Commands

| Command                                                  | Purpose                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------- |
| `npm run capture -- URL --out output/site`               | HTTP capture without a browser                                          |
| `npm run capture -- URL --out output/site --browser`     | Capture plus browser asset discovery                                    |
| `npm run benchmark -- URL --out output/run`              | Capture and ZIP, with measured elapsed time; browser enabled by default |
| `npm run benchmark -- URL --out output/run --no-browser` | ZIP workflow without browser discovery                                  |
| `npm start`                                              | Serve the latest benchmark on port 4174                                 |
| `npm start -- output/site 4175`                          | Serve a specific capture and port                                       |
| `npm run verify -- output/site`                          | Check a capture with external HTTP requests blocked                     |
| `npm run verify -- output/site --screenshots`            | Also save desktop screenshots                                           |
| `npm run capture -- --help`                              | List capture options                                                    |

Options include `--max-pages` (10), `--concurrency` (12; maximum 64), `--max-resources` (500), and `--max-bytes` (157286400). Output directories must be empty. The tool does not overwrite an earlier capture.

`npm run verify` requires Chrome. It records missing files, external requests, visible broken images and JavaScript errors, and exits nonzero when those checks fail. It visits pages and scrolls once; it does not prove visual equivalence or exercise every interaction. A downloaded page or successful ZIP is not by itself proof of a working replica.

## What is included

- Parallel fetching of public HTML, stylesheets, scripts, images, fonts and media.
- Same-origin page crawling within configured limits.
- CSS imports, background images, source sets and common lazy-loading attributes.
- Browser discovery for missing script, stylesheet, image, font and media requests.
- Local asset rewriting, including encoded spaces and slashes.
- A static preview server with video byte-range responses.
- Portable ZIP generation without a system `zip` executable.
- Capture, timing and dependency-verification reports.
- Tests using local fixtures, plus GitHub Actions checks.

## Scope and limitations

The captured output is the public frontend, not the original CMS project, server source, database or admin interface. Contact form submissions are blocked by the injected local-preview script. This does not disable every possible custom API call; such calls may still fail or contact their configured service while browsing normally. The verifier blocks external HTTP requests when checking the capture.

Some analytics, reCAPTCHA and speculative navigation scripts are omitted. Unavailable font declarations may be removed to allow browser fallback; those adaptations are reported. External destinations remain links. Use the tool for sites you own or have permission to copy; downloaded material retains its original rights and licenses.

Runtime API data, workers, arbitrary module dependency graphs, authentication, bot challenges, unlinked pages and application-specific interactions need additional work. Same-origin asset URLs that differ only by query parameters currently share a file path. Redirects to another origin can also limit page crawling. JavaScript URL rewriting is heuristic. Failed resources and unfinished discovery are reported, not silently declared complete.

This is a developer tool for local use. It is not a hardened multi-user service accepting arbitrary URLs. Limits constrain downloads but cannot reproduce unlimited sites or guarantee a fixed runtime.

## Next.js migration

The Suiball experiment used this capture tool followed by separate conversion work: generating React sections, fixing assets and adapting the animation runtime. That conversion is **not** a generic feature of the capture command.

[The migration notes and reference recipe](examples/suiball/README.md) explain the separate step. Downloaded third-party websites, assets, minified vendor bundles and personal workspace reports are not part of this repository.

## Timing

`benchmark.json` measures capture, optional browser discovery, file rewriting and stored ZIP packaging. It excludes installing dependencies, developing the tool and later verification. `metTenSecondTimeTarget` only describes elapsed time; inspect `captureHasReportedIssues`, the capture report and verification before assessing quality.

[Historical experiment results](docs/experiments.md) are context from earlier prototype versions, not guarantees for this release.

## Development

```sh
npm ci
npm test
npm run test:browser
npm run check
```

The browser integration test starts local fixture servers, captures a dynamically imported cross-origin module, stops the source servers, then verifies the local copy. Ordinary tests cover URL/options, fresh-directory capture, CSS imports, encoded asset paths, ZIP contents, failure reporting, byte limits and media range serving.

Use `npm run format` after editing. Node.js dependencies are pinned in `package-lock.json`. Captures, local state, ZIPs, environment files and `node_modules` are excluded by `.gitignore`.

## License

`UNLICENSED` — no open-source license has been assigned to this tool. Dependencies retain their respective licenses.
