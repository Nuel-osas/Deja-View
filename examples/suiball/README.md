# Suiball migration reference

`migrate.mjs` is the site-specific conversion script from the Suiball experiment. It documents how a public frontend capture was transformed into named TSX sections. It is reference code, not a supported one-command Next.js exporter.

The script is tied to Suiball's inspected DOM, CSS classes and script versions. It expects the working directory to contain:

- `capture/capture-report.json` and its captured asset files;
- `evidence/original.html` containing the original response HTML;
- prepared `public/assets`, `src/app`, `src/components/sections`, and `src/lib` directories;
- a separately initialized Next.js application and `SiteRuntime` component.

It uses the root tool's Cheerio, PostCSS and Prettier dependencies. Its original usage was to run the conversion from the prepared application's directory. It overwrites generated TSX and CSS, so ongoing edits should be made directly in the resulting app.

The migration involved:

1. Inspecting desktop/mobile layouts, scripts, videos and network requests in Chrome.
2. Capturing public files with the downloader.
3. Mapping assets to portable local filenames and obtaining any missing files.
4. Generating ordinary React components from the page sections.
5. Adding a Next.js root layout, metadata, dependency configuration and page composition.
6. Loading vendor scripts in dependency order after React hydration, and giving custom animations mount/disposal handlers.
7. Running a production build, TypeScript checks and desktop/mobile screenshot comparisons with external requests blocked.

The recipe removes Suiball's broken `your.cdn` media placeholders and a Spline canvas observed to be invisible at the inspected desktop/mobile widths. Those decisions must not be generalized to other sites without inspecting them.

No Suiball HTML, artwork, fonts, minified third-party runtime bundles or backend services are bundled here. The conversion does not recreate checkout, claim services, wallet functionality or Webflow's original designer project.
