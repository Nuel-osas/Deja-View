# Using D-j-View with Astra

Give Astra access to a checkout of this repository and a shell capable of running Node.js. Browser work needs Chrome or Chromium on that machine. The tool does not require an Astra API key, a model SDK, or a particular chat application's integration.

The [root AGENTS.md](../AGENTS.md) contains the agent's operating instructions. If your application does not load repository instructions automatically, explicitly ask the agent to read that file and this guide. A chat session without filesystem, shell or browser tools can explain the workflow but cannot execute or verify it for you.

## A prompt you can paste

Replace `<TARGET_URL>` with the website you want to work on:

```text
Use https://github.com/Nuel-osas/D-j-View to capture <TARGET_URL>.
Use the existing checkout if present; otherwise clone it into a new folder.
Read AGENTS.md, README.md and docs/astra-guide.md before starting.

Install the pinned dependencies, use a fresh output directory, and run a
benchmark with browser discovery. Read the capture report, run dependency
verification against the explicit capture directory, and investigate failures.
Inspect desktop and mobile appearance and the relevant visible interactions
against the source before describing fidelity. Keep site-specific fixes separate
from reusable tool changes and document any missing functionality.

Start a local preview I can inspect, and give me its working URL, the editable
files, ZIP path, validation results and limitations. Keep the preview running.
Separate measured capture time from setup, repairs, validation and migration.
Do not publish anything or perform checkout, claim or wallet transactions.
```

For a Next.js result, append:

```text
After capturing the source, migrate it into a separate, editable Next.js
application. Read the Suiball example as a reference, but do not run its
site-specific converter against an unrelated website. Create real components
and routes, preserve the appearance, and adapt interactions to the application
lifecycle. Explain any retained vendor animation runtime and absent backend
services. Run the production build and appropriate checks, then validate the
migrated app on desktop and mobile. Deliver the Next.js project and its preview.
```

Add your intended scope to either prompt: just the homepage, selected routes, a page limit, or the interactions you care about. A plain capture request does not require a framework migration.

## Operator workflow

### 1. Set up the checkout

Run the following only when a checkout does not already exist:

```sh
git clone https://github.com/Nuel-osas/D-j-View.git
cd D-j-View
```

From the repository root:

```sh
git status --short
node --version
npm ci
npm run capture -- --help
```

Node.js must be at least 22. The repository's `.nvmrc` selects Node.js 24. Preserve existing uncommitted work; do not reset the checkout to make it match an example.

Installed Chrome is detected automatically in common locations. If it is not found, install Chromium with `npx playwright-core install chromium`, or pass a quoted executable path with `--chrome`. Browser system packages on Linux may need `npx playwright-core install --with-deps chromium`. Use the same executable for capture and verification.

### 2. Capture and package

This runnable example uses `https://example.com`. Replace that URL with your actual target and choose an unused output name:

```sh
npm run benchmark -- https://example.com --out output/demo-001 --max-pages 10 --browser
```

The benchmark enables browser discovery by default; the explicit flag makes the intended scope clear. It produces `output/demo-001/package/site/`, `output/demo-001/site-capture.zip`, and `output/demo-001/benchmark.json`.

For capture without ZIP packaging, use:

```sh
npm run capture -- https://example.com --out output/capture-001 --max-pages 10 --browser
```

Here the captured files are directly in `output/capture-001/`. This command does not update the latest-benchmark pointer used by bare `npm start` or `npm run verify`.

Do not run both examples unless you want two independent captures. A reused nonempty output directory is rejected; choose a new path instead of deleting an existing result.

### 3. Inspect the reports and verify

For the benchmark example:

```sh
npm run verify -- output/demo-001/package/site --screenshots
```

For the direct capture example, substitute `output/capture-001` as the directory. Verification launches and stops its own local server, so it works without a preview process running.

Read these reports, not just the terminal exit status:

| Report                                  | What to inspect                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `package/site/capture-report.json`      | Selected pages, failed or unfinished resources, adaptations, runtime dependencies, page errors and limits     |
| `package/site/verification-report.json` | `passed`, per-page missing responses, external requests, JavaScript errors and visible broken images          |
| `benchmark.json`                        | Timing scope, `browserDiscoveryEnabled`, `captureHasReportedIssues`, byte count and timing-only target result |

The paths above are relative to the benchmark output folder. A direct capture has its two site reports in the capture folder and no benchmark report.

Verification exits nonzero on failed dependency checks. The initial capture can still return success when individual assets fail, so inspect `failures` and `discovery` explicitly. The verifier checks desktop page loading and a scroll, not all application states. It saves screenshots when requested but does not compare them to the original.

When fidelity matters, compare original and local views using the same desktop and mobile viewport sizes. Wait for fonts and entrance animations. Synchronize or pause continuous animations only for measurement, and disclose that condition. Test navigation, scrolling, menus and videos relevant to this site. Do not test a financial or account backend by submitting transactions.

### 4. Preview and edit

```sh
npm start -- output/demo-001/package/site 4174
```

Open **http://127.0.0.1:4174** on the same computer. Keep the terminal or background task alive while inspecting the site. If the port is already used, choose another number, such as 4175, and report the new URL. Do not stop another project to free a port.

Edit HTML, CSS, JavaScript and assets inside the explicit capture folder, then refresh the browser. The extracted ZIP also supports `node serve.mjs site 4174` from its package folder, with Node.js and no npm install.

If Astra runs on a remote machine, its localhost is not your computer. Use your application's port forwarding if available, or transfer the ZIP and run the included server locally. Opening HTML with `file://` can break root-relative assets and scripted navigation.

### 5. Package the version you actually checked

The initial ZIP is created before verification, so it does not automatically receive later screenshots, reports or fixes. If you edit the captured files, rerun verification and create a revised ZIP. For the benchmark example, this command packages the current package folder without overwriting the original archive:

```sh
node --input-type=module -e "import { zipDirectory } from './lib/zip.mjs'; await zipDirectory('output/demo-001/package', 'output/demo-001/site-capture-reviewed.zip');"
```

Choose another filename if that revised ZIP already exists; `zipDirectory` itself does not protect an existing destination. If the benchmark is rerun, choose a fresh output directory. Do not attach the earlier capture duration to subsequent repairs or a Next.js conversion.

## Troubleshooting

| Symptom                                                     | Next step                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Browser not found                                           | Install Chromium or supply the executable through `--chrome`/`CHROME_PATH`; apply it to verification too           |
| Output directory rejected                                   | Choose a new output path; do not wipe a previous or edited capture                                                 |
| Bare `npm start` cannot find a run, or opens the wrong site | Pass the exact capture directory; only benchmarks update `.site-capture/latest.json`                               |
| Address already in use                                      | Start the preview on a different free port                                                                         |
| A ZIP exists but assets are missing                         | Inspect both reports; ZIP creation alone is not a quality check                                                    |
| A page limit was reached                                    | Determine whether the user needs more routes, then recapture into a fresh directory with an appropriate limit      |
| Missing fonts or images                                     | Inspect the original URL and local mapping; distinguish source failures from capture bugs and record any fallback  |
| JavaScript/API/worker errors                                | Inspect the live site's behavior; unsupported dynamic dependencies may need a tool fix or site-specific adaptation |
| Screenshot differs                                          | Match viewport, fonts, loaded assets, scroll position and animation state before changing the UI                   |
| Suiball conversion script fails                             | Read its prerequisites; it is not a generic exporter or a standalone Next.js project                               |

Do not silently drop failing dependencies, claim absent services work, or repeatedly download a site without diagnosing the same failure. For a reusable tool fix, write a focused local fixture that demonstrates the issue, then follow [CONTRIBUTING.md](../CONTRIBUTING.md).

## Handoff format

When returning the work or moving to a new Astra session, include:

```text
Target and requested scope:
Result type: frontend capture / separately migrated application
Repository commit and any uncommitted tool changes:
Capture directory or application directory:
Latest ZIP and whether it includes the final fixes:
Capture/report paths and actual measured timing scope:
Checks performed and their results:
Known failures, adaptations, retained vendor scripts and external services:
Preview URL, machine, port and running process/task identifier:
Next step, if work remains:
```

Do not include secrets. Captures and per-session state are ignored by Git and will not appear in a new clone; transfer required artifacts explicitly. The historical Ameer and Suiball results in [docs/experiments.md](experiments.md) are context, not evidence that the current target has passed.
