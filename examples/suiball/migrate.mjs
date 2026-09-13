import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { load } from "cheerio";
import postcss from "postcss";
import { format } from "prettier";

const report = JSON.parse(
  await fs.readFile("capture/capture-report.json", "utf8"),
);
const $ = load(await fs.readFile("evidence/original.html", "utf8"));
const mapping = new Map(),
  assets = [];
const ignored =
  /splinetool|es-module-shims|webfont\/|fonts.googleapis.com\/_external/;
for (const resource of report.resources) {
  if (
    resource.status !== "downloaded" ||
    resource.kind === "page" ||
    ignored.test(resource.url)
  )
    continue;
  const url = new URL(resource.url);
  let basename = decodeURIComponent(url.pathname)
    .split("/")
    .pop()
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  if (resource.contentType?.includes("text/css") && !basename.endsWith(".css"))
    basename += ".css";
  const destination =
    "/assets/" +
    createHash("sha256").update(resource.url).digest("hex").slice(0, 8) +
    "-" +
    basename;
  mapping.set(resource.url, destination);
  mapping.set(resource.url.replace(/^http:/, "https:"), destination);
  assets.push({ ...resource, destination });
}
// The favicon is linked as "shortcut icon", outside the first capture's icon selector.
const icon = $('link[rel="shortcut icon"]').attr("href");
if (icon && !mapping.has(icon)) {
  mapping.set(icon, "/assets/favicon.png");
  assets.push({
    url: icon,
    destination: "/assets/favicon.png",
    contentType: "image/png",
  });
}
const replacements = [...mapping].sort((a, b) => b[0].length - a[0].length);
function localize(text) {
  for (const [url, local] of replacements) text = text.replaceAll(url, local);
  return text;
}
const queue = [...assets];
await Promise.all(
  Array.from({ length: 12 }, async () => {
    while (queue.length) {
      const asset = queue.shift();
      let bytes;
      // Retrieve original text so paths from the generic mirror do not leak into the migration.
      if (asset.file && !/css|javascript/.test(asset.contentType))
        bytes = await fs.readFile(path.join("capture", asset.file));
      else {
        const response = await fetch(asset.url, {
          signal: AbortSignal.timeout(20000),
        });
        if (!response.ok) throw new Error(`${response.status}: ${asset.url}`);
        bytes = Buffer.from(await response.arrayBuffer());
      }
      if (/css|javascript/.test(asset.contentType))
        bytes = Buffer.from(localize(bytes.toString()));
      await fs.writeFile("public" + asset.destination, bytes);
      asset.localBytes = bytes.length;
    }
  }),
);
const mainCss = mapping.get($("link[rel=stylesheet]").attr("href"));
const googleCss = assets.find((a) =>
  a.url.startsWith("http://fonts.googleapis.com/css?"),
);
let css = await fs.readFile("public" + mainCss, "utf8");
if (googleCss)
  css += "\n" + (await fs.readFile("public" + googleCss.destination, "utf8"));
css +=
  "\n" +
  $("style")
    .map((i, e) => localize($(e).html()))
    .get()
    .join("\n");
await fs.writeFile("src/app/globals.css", css.replaceAll("\u00a0", " "));
$("script,style").remove();
// These are invalid placeholders in the source; the working WebM source remains.
$('[src^="https://your.cdn/"]').remove();
// This embed is display:none at both inspected breakpoints. Preserve the empty container,
// but do not load an invisible Spline scene, its dynamic modules or decoder services.
$("#canvas3d").remove();
$('[href][target="_blank"]').attr("rel", "noopener noreferrer");
const attrNames = {
  class: "className",
  for: "htmlFor",
  tabindex: "tabIndex",
  srcset: "srcSet",
  autoplay: "autoPlay",
  playsinline: "playsInline",
  crossorigin: "crossOrigin",
  maxlength: "maxLength",
  colspan: "colSpan",
  rowspan: "rowSpan",
  readonly: "readOnly",
  strokeWidth: "strokeWidth",
  "stroke-width": "strokeWidth",
  "stroke-linecap": "strokeLinecap",
  "stroke-linejoin": "strokeLinejoin",
  "fill-rule": "fillRule",
  "clip-rule": "clipRule",
  viewbox: "viewBox",
};
const boolAttrs = new Set([
  "autoplay",
  "muted",
  "loop",
  "playsinline",
  "controls",
  "disabled",
  "checked",
  "multiple",
  "required",
  "readonly",
]);
const voidTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);
function jsx(node) {
  if (node.type === "text")
    return node.data ? "{" + JSON.stringify(node.data) + "}" : "";
  if (!node.tagName) return "";
  const tag = node.tagName;
  const props = Object.entries(node.attribs || {})
    .filter(
      ([key]) =>
        !key.startsWith("on") && !["integrity", "crossorigin"].includes(key),
    )
    .map(([key, value]) => {
      const name = attrNames[key] || key;
      value = localize(value);
      if (key === "style") {
        const style = {};
        postcss.parse("a{" + value + "}").first.walkDecls((d) => {
          const prop = d.prop.startsWith("--")
            ? d.prop
            : d.prop
                .replace(/^-ms-/, "ms-")
                .replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          style[prop] = d.value;
        });
        return `style={${JSON.stringify(style)} as CSSProperties}`;
      }
      if (boolAttrs.has(key)) return name;
      if (key === "tabindex") return `${name}={${Number(value)}}`;
      return name + "=" + JSON.stringify(value);
    })
    .join(" ");
  return `<${tag}${props ? " " + props : ""}${voidTags.has(tag) ? " />" : ">" + node.children.map(jsx).join("") + `</${tag}>`}`;
}
async function writeTsx(filename, code) {
  await fs.writeFile(filename, await format(code, { parser: "typescript" }));
}
const components = [
  ["Hero", 0],
  ["SuiOverview", 1],
  ["DesignShowcase", 2],
  ["MobileDesign", 3],
  ["HardwareDetails", 4],
  ["Security", 5],
  ["MobileSecurity", 6],
  ["Features", 7],
  ["Bitcoin", 8],
  ["MobileBitcoin", 9],
  ["SectionSpacer", 10],
  ["Wearable", 11],
  ["NftCompanion", 12],
  ["Preorder", 13],
];
for (const [name, index] of components)
  await writeTsx(
    `src/components/sections/${name}.tsx`,
    `import type {CSSProperties} from 'react';\nexport default function ${name}(){return (${jsx($(".main-wrapper").children().get(index))});}`,
  );
await writeTsx(
  "src/components/Navigation.tsx",
  `import type {CSSProperties} from 'react';export default function Navigation(){return <>${jsx($(".nav-mob").get(0))}${jsx($(".nav_component").get(0))}</>}`,
);
await writeTsx(
  "src/components/Footer.tsx",
  `import type {CSSProperties} from 'react';export default function Footer(){return (${jsx($(".footer").get(0))});}`,
);
await writeTsx(
  "src/app/page.tsx",
  `import Navigation from '@/components/Navigation';import Footer from '@/components/Footer';import SiteRuntime from '@/components/SiteRuntime';${components.map(([name]) => `import ${name} from '@/components/sections/${name}';`).join("\n")}export default function Home(){return <><div className="page-wrapper"><Navigation/><main className="main-wrapper">${components.map(([name]) => `<${name}/>`).join("")}</main><Footer/></div><SiteRuntime/></>}`,
);
const scripts = assets.filter((a) =>
  /jquery|webflow.*\.js|gsap|lenis/.test(a.url),
);
// Load GSAP's site version before Webflow initializes its interaction engine.
const order = [
  ...scripts.filter((a) => /jquery/.test(a.url)),
  ...scripts.filter((a) => /\/gsap\/3.15/.test(a.url)),
  ...scripts.filter((a) => /webflow.*\.js/.test(a.url)),
  ...scripts.filter((a) => /lenis/.test(a.url)),
  ...scripts.filter((a) => /gsap@3.13/.test(a.url)),
];
await fs.writeFile(
  "src/lib/vendor-scripts.json",
  JSON.stringify(
    order.map((a) => a.destination),
    null,
    2,
  ),
);
await fs.writeFile(
  "evidence/asset-manifest.json",
  JSON.stringify(
    {
      source: "https://www.suiball.com/",
      assets: assets.map(({ url, destination, localBytes }) => ({
        url,
        destination,
        bytes: localBytes,
      })),
      adaptations: [
        "Converted page markup into 16 editable React components plus the page composition.",
        "Local asset names normalize encoded spaces/slashes.",
        "Two invalid your.cdn media placeholders omitted; functional WebM retained.",
        "Hidden zero-size Spline embed omitted; confirmed display:none on desktop and mobile.",
        "Webflow/GSAP visual runtime retained and initialized after hydration.",
        "External preorder, claim and social links preserved.",
      ],
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify(
    {
      components: components.length + 2,
      assets: assets.length,
      bytes: assets.reduce((sum, a) => sum + a.localBytes, 0),
      scripts: order.length,
    },
    null,
    2,
  ),
);
