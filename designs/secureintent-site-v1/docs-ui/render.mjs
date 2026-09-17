import { readFileSync } from "node:fs";
import { docs } from "./src/content/docs.js";
import { pages } from "./src/content/pages.js";
import { renderDoc, renderPage } from "./src/templates.js";

// Emit static HTML for the existing plain-file server and Vercel deployment.
// No build step, source-site server or client-side fetch is needed to read a page.
const base = "/designs/secureintent-site-v1";
const outputs = new Map(docs.map(page => [
  page.slug ? `docs/${page.slug}/index.html` : "docs.html",
  renderDoc(page)
]));
outputs.set("docs/index.html", renderDoc(docs[0]));
for (const page of pages.filter(page => ["start", "account", "contact"].includes(page.slug))) {
  outputs.set(`docs/${page.slug}/index.html`, renderPage(page));
}
const demo = renderPage({
  slug: "demo",
  title: "Your next paste, protected.",
  label: "INTERACTIVE EXAMPLE",
  description: "Explore detection and anonymization using fictitious sample data.",
  body: readFileSync(new URL("./demo-body.html", import.meta.url), "utf8")
}).replace("</body>", `<script type="module" src="${base}/docs-ui/src/demo.js"></script></body>`);
outputs.set("docs/demo.html", demo);

// Retain old URLs used by bookmarks and existing feature links.
const aliases = {
  "getting-started.html": ["quickstart/", {}],
  "browser-protection.html": ["concepts/detection/", {
    "#what-detects": "concepts/detection/#supported-patterns",
    "#paste-time": "overview/what-is-secureintent/#how-it-works",
    "#actions": "guides/anonymization/#review-and-continue",
    "#coverage": "guides/browser-support/#supported-websites"
  }],
  "developer-pro.html": ["guides/restore/", {
    "#dehydrate": "guides/restore/#the-flow",
    "#ghost-log": "resources/plans/",
    "#session-lock": "resources/plans/"
  }],
  "business-pro.html": ["resources/plans/", {}],
  "architecture-privacy.html": ["security/local-processing/", {
    "#availability": "resources/roadmap/"
  }]
};
for (const [filename, [fallback, anchors]] of Object.entries(aliases)) {
  const url = `${base}/docs/${fallback}`;
  const script = `const map=${JSON.stringify(anchors)};location.replace(${JSON.stringify(base + "/docs/")}+(map[location.hash]||${JSON.stringify(fallback)}));`;
  outputs.set(`docs/${filename}`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><script src="/staging-guard.js"></script><title>SecureIntent documentation</title><script>${script}</script><noscript><meta http-equiv="refresh" content="0;url=${url}"></noscript></head><body><a href="${url}">Open SecureIntent documentation</a></body></html>`);
}
const requested = process.argv[2];
if (!requested) console.log(JSON.stringify([...outputs.keys()]));
else if (outputs.has(requested)) process.stdout.write(outputs.get(requested));
else throw new Error(`Unknown documentation output: ${requested}`);
