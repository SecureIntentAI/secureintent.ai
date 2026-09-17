/* Deployment packaging only: copies the approved static site to dist, normalizes
 * public routes and renders its existing docs templates. No frontend framework,
 * dependency install, bundler, secrets, network access or deployment is involved.
 */
import { readFile, writeFile, mkdir, readdir, lstat, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { buildMode, publicConfig, serializeConfig, resourcePolicy } from './site-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'designs/secureintent-site-v1');
const output = path.join(root, 'dist');
const mode = buildMode(process.env, process.argv.slice(2));
const production = mode === 'production';
const configScope = {window: {}};
vm.runInNewContext(await readFile(path.join(source, 'integrations/config.js'), 'utf8'), configScope, {timeout: 1000});
// Validate before touching dist. Only the seven known public production fields
// and the explicit public staging allowlist may reach the published artifact.
const config = publicConfig(configScope.window.SI_CONFIG.production, process.env, mode);
const prefix = '/designs/secureintent-site-v1';
const files = new Map();
const allowed = /\.(html|css|js|svg|png|jpg|jpeg|webp|mp4|woff2|ico|txt)$/;
const skip = new Set(['docs-ui/demo-body.html', 'docs-ui/src/templates.js', 'docs-ui/src/content/pages.js', 'review-utilities.js']);
async function collect(dir, relative = '') {
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Symlinks are not publishable: ' + name);
    if (entry.isDirectory()) await collect(path.join(dir, entry.name), name);
    else if (allowed.test(name) && !skip.has(name)) files.set(name, await readFile(path.join(dir, entry.name)));
  }
}
await collect(source);
files.set('integrations/config.js', Buffer.from(serializeConfig(config)));
// Regenerate docs so their searchable content and visible HTML cannot drift.
const renderer = path.join(source, 'docs-ui/render.mjs');
const docPaths = JSON.parse(execFileSync(process.execPath, [renderer], {encoding:'utf8'}));
for (const name of docPaths) files.set(name, execFileSync(process.execPath, [renderer, name]));
// These artifacts are identical to main; never invent new store destinations.
for (const name of ['install-links.js','favicon-16x16.png','favicon-32x32.png','demo.mp4','og-image.png']) files.set(name, await readFile(path.join(root,name)));

const privatePages = /^(account|team|lifetime_promo|uninstall)\.html$/;
const hashes = new Set();
for (const [name, buffer] of files) {
  if (!/\.(html|css|js|svg)$/.test(name)) continue;
  let text = buffer.toString('utf8').replaceAll(prefix + '/', '/').replaceAll(prefix, '');
  text = text.replace(/(["'])(?:\.\.\/)+(favicon-[^"']+|install-links\.js|demo\.mp4|og-image\.png)\1/g, '$1/$2$1');
  if (name.endsWith('.html')) {
    text = text.replace(/<script\b[^>]*src=["'][^"']*staging-guard\.js["'][^>]*><\/script>/g, '');
    text = text.replace(/<meta\b[^>]*name=["']robots["'][^>]*>/gi, '');
    const own = '/' + name;
    // A document-level <base> would otherwise send hash links to the homepage.
    text = text.replace(/href="#([^"]*)"/g, `href="${own}#$1"`);
    text = text.replace(/href="(?!\/|#|https?:|mailto:|tel:)([^"?#]+\.html)([?#][^"]*)?"/g, (all, file, rest = '') => {
      if (file.includes('/')) return all;
      return `href="/${file}${rest}"`;
    });
    if (!text.includes('integrations/config.js')) text = text.replace('</head>','<script src="/integrations/config.js"></script><script src="/integrations/runtime.js"></script></head>');
    if (!text.includes('install-links.js')) text = text.replace('</head>','<script src="/install-links.js" defer></script></head>');
    if (!text.includes('integrations/site.js')) text = text.replace('</head>','<script src="/integrations/site.js" defer></script></head>');
    if (!production || privatePages.test(name)) text = text.replace('</head>','<meta name="robots" content="noindex,nofollow"></head>');
    const canonical = 'https://secureintent.ai' + (name === 'index.html' ? '/' : name.endsWith('/index.html') ? '/' + name.slice(0,-10) : own);
    if (!privatePages.test(name) && !/<link[^>]+rel=["']canonical/.test(text)) text = text.replace('</head>',`<link rel="canonical" href="${canonical}"></head>`);
    if (!/<meta[^>]+property=["']og:image/.test(text)) text = text.replace('</head>','<meta property="og:image" content="https://secureintent.ai/og-image.png"></head>');
    text = text.replace(/target="_blank"(?!\s+rel=)/g, 'target="_blank" rel="noopener noreferrer"');
    for (const script of text.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (!/\bsrc=/.test(script[1] || '') && script[2].trim()) hashes.add("'sha256-" + createHash('sha256').update(script[2]).digest('base64') + "'");
    }
  }
  if (text.includes(prefix)) throw new Error('Unresolved design path: ' + name);
  files.set(name, Buffer.from(text));
}
files.set('404.html', Buffer.from('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Page not found — SecureIntent</title><link rel="stylesheet" href="/how-it-works.css"><main class="container" style="padding:80px 24px"><h1>Page not found.</h1><p><a href="/">Return to SecureIntent</a> or <a href="/docs.html">browse the documentation</a>.</p></main></html>'));
const aliases = [...files.keys()].filter(name => name.endsWith('.html') && !name.includes('/') && name !== 'index.html' && name !== '404.html');
files.set('_redirects', Buffer.from(aliases.map(name => `/${name.slice(0,-5)} /${name} 200`).join('\n') + '\n/index.html / 301\n'));
const csp = resourcePolicy(config, hashes, production);
let headers = `/*\n  X-Content-Type-Options: nosniff\n  X-Frame-Options: DENY\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: base-uri 'self'; object-src 'none'; frame-ancestors 'none'\n  Content-Security-Policy-Report-Only: ${csp}\n  Cache-Control: public, max-age=0, must-revalidate\n`;
if (!production) headers += '  X-Robots-Tag: noindex, nofollow\n';
for (const name of ['account','team','lifetime_promo','uninstall']) headers += `\n/${name}*\n  Cache-Control: no-store\n  X-Robots-Tag: noindex, nofollow\n  Referrer-Policy: no-referrer\n`;
files.set('_headers', Buffer.from(headers));
files.set('robots.txt', Buffer.from(production ? 'User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /team\nDisallow: /lifetime_promo\nDisallow: /uninstall\nSitemap: https://secureintent.ai/sitemap.xml\n' : 'User-agent: *\nDisallow: /\n'));
const publicPaths = [...files.keys()].filter(name => name.endsWith('.html') && !privatePages.test(name) && name !== '404.html' && !/^docs\/(getting-started|browser-protection|developer-pro|business-pro|architecture-privacy)\.html$/.test(name));
files.set('sitemap.xml', Buffer.from('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + publicPaths.map(name => '<url><loc>https://secureintent.ai' + (name==='index.html'?'/':name.endsWith('/index.html')?'/'+name.slice(0,-10):'/'+name) + '</loc></url>').join('') + '</urlset>\n'));
files.set('.well-known/security.txt', Buffer.from('Contact: mailto:SOC@secureintent.ai\nPolicy: https://secureintent.ai/#footer-vdp\nCanonical: https://secureintent.ai/.well-known/security.txt\nPreferred-Languages: en\nExpires: 2027-05-29T00:00:00.000Z\n'));

// Only previously generated files may be replaced/removed. Never empty an
// arbitrary directory or follow symlinks while preparing a release.
await mkdir(output, {recursive:true});
if ((await lstat(output)).isSymbolicLink()) throw new Error('dist must not be a symlink');
let previous = [];
try { previous = JSON.parse(await readFile(path.join(output,'.site-manifest.json'),'utf8')).files; }
catch (error) { if ((await readdir(output)).length) throw new Error('Refusing to overwrite a dist directory without a build manifest'); }
function destination(name) {
  if (typeof name !== 'string' || !name || name.startsWith('/') || name.includes('\\') || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid output path');
  return path.join(output,name);
}
if (!Array.isArray(previous)) throw new Error('Invalid build manifest');
for (const name of previous) destination(name);
const previousSet = new Set(previous);
async function checkOutput(dir, relative = '') {
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    const name = path.posix.join(relative, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Refusing to write through a dist symlink: ' + name);
    if (entry.isDirectory()) await checkOutput(path.join(dir,entry.name),name);
    else if (name !== '.site-manifest.json' && !previousSet.has(name)) throw new Error('Unrecognized file in dist; move it outside the publish directory: ' + name);
  }
}
// Do not leave an accidentally copied secret or unrelated file publishable,
// and never follow a nested symlink when replacing generated assets.
await checkOutput(output);
for (const old of previous) if (!files.has(old)) await unlink(destination(old)).catch(error => {if(error.code!=='ENOENT')throw error;});
for (const [name, data] of files) {
  const dest = destination(name); await mkdir(path.dirname(dest), {recursive:true});
  await writeFile(dest, data);
}
await writeFile(path.join(output,'.site-manifest.json'), JSON.stringify({mode,files:[...files.keys()]},null,2));
console.log(`Prepared ${files.size} static files in dist (${mode}). No deployment performed.`);
