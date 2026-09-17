import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const root=fileURLToPath(new URL('../',import.meta.url));
const dir=path.join(root,'dist');
const manifest=JSON.parse(await readFile(path.join(dir,'.site-manifest.json'),'utf8'));
const files=new Set(manifest.files);
const actual=[];
async function inspectOutput(at, prefix='') {
  for (const entry of await readdir(at,{withFileTypes:true})) {
    const name=path.posix.join(prefix,entry.name);
    assert.ok(!entry.isSymbolicLink(),'no publish-directory symlinks');
    if(entry.isDirectory()) await inspectOutput(path.join(at,entry.name),name);
    else if(name!=='.site-manifest.json') actual.push(name);
  }
}
await inspectOutput(dir);
assert.deepEqual(actual.sort(),[...files].sort(),'publish directory matches the manifest exactly');
const errors=[];
let pages=0, links=0;
function resolveLocal(raw, from, base) {
  if (!raw || raw.startsWith('#') || /^(data:|blob:|mailto:|tel:)/.test(raw)) return;
  const url=new URL(raw.replaceAll('&amp;','&'),base || 'https://secureintent.ai/'+from);
  if(url.origin!=='https://secureintent.ai') return;
  const name=decodeURIComponent(url.pathname).slice(1);
  if(!files.has(name) && !files.has(name+'index.html') && !files.has(name+'/index.html') && !files.has(name+'.html')) errors.push(`${from}: missing ${raw} → ${url.pathname}`);
  links++;
}
for(const name of files){
  assert.ok(!/(^|\/)(\.env|node_modules|test|scripts|CLAUDE|README|INTEGRATIONS|netlify\.toml)/.test(name),'only public assets: '+name);
  if(!/\.(html|js|css)$/.test(name)) continue;
  const s=await readFile(path.join(dir,name),'utf8');
  assert.ok(!s.includes('/designs/secureintent-site-v1'),'no preview route: '+name);
  assert.ok(!s.includes('$12'),'no $12 price: '+name);
  assert.ok(!/\bsk_(live|test)_[A-Za-z0-9]{16,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(s),'no secret keys: '+name);
  if(name.endsWith('.html')) {
    pages++;
    const base=s.match(/<base[^>]+href="([^"]+)"/)?.[1];
    const baseURL=base?new URL(base,'https://secureintent.ai/'+name).href:undefined;
    for(const match of s.matchAll(/\b(?:href|src|poster)="([^"]+)"/g)) resolveLocal(match[1],name,baseURL);
    for(const script of s.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
      if(!/\bsrc=|type="module"|application\/ld/.test(script[1])) new vm.Script(script[2],{filename:name});
    }
    if(name==='index.html') assert.equal(/name="robots" content="noindex/.test(s),manifest.mode!=='production','robots policy matches build mode');
  } else if(name.endsWith('.css')) {
    for(const match of s.matchAll(/url\(["']?([^\s)'";]+)["']?\)/g)) resolveLocal(match[1],name);
  } else if(!/^\s*(import|export)\b/m.test(s)) new vm.Script(s,{filename:name});
}
assert.deepEqual(errors,[], 'local routes and assets resolve');
assert.equal(await readFile(path.join(dir,'install-links.js'),'utf8'),await readFile(path.join(root,'install-links.js'),'utf8'),'installer stays byte-identical to main');
const homepage=await readFile(path.join(dir,'index.html'),'utf8');
for(const href of ['/account.html','/account.html?mode=signup','/team.html','https://chromewebstore.google.com/detail/secureintent/ejdhcakapnkbmfihgoamdnajgimhemof']) assert.ok(homepage.includes('href="'+href+'"'),'main destination '+href);
assert.ok(homepage.includes('<strong>$9</strong>'));
const config=await readFile(path.join(dir,'integrations/config.js'),'utf8');
const sandbox={window:{}}; vm.runInNewContext(config,sandbox);
const liveConfig=sandbox.window.SI_CONFIG.production;
const account=await readFile(path.join(root,'account.html'),'utf8');
if(manifest.mode==='production') {
  assert.equal(liveConfig.apiBase,'https://api.secureintent.ai');
  assert.equal(liveConfig.jwtTemplate,'secureintent');
  for(const value of ['clerkPublishableKey','paddleToken','priceId']) assert.ok(account.includes(liveConfig[value]),value+' matches main');
  assert.equal(sandbox.window.SI_CONFIG.preview,null);
} else {
  assert.equal(liveConfig,null,'preview artifact has no usable live configuration');
  assert.ok(!config.includes('pk_live_')&&!config.includes('live_7ce4'),'preview artifact has no live provider identifiers');
  if(manifest.mode==='visual-preview') assert.equal(sandbox.window.SI_CONFIG.preview,null);
  else {
    assert.equal(manifest.mode,'staging');
    assert.equal(sandbox.window.SI_CONFIG.preview.paddleEnv,'sandbox');
    assert.ok(sandbox.window.SI_CONFIG.preview.clerkPublishableKey.startsWith('pk_test_'));
  }
}
const headers=await readFile(path.join(dir,'_headers'),'utf8');
for(const expected of ['X-Content-Type-Options: nosniff','X-Frame-Options: DENY','Cache-Control: no-store',"frame-ancestors 'none'"]) assert.ok(headers.includes(expected));
console.log(`Release checks passed: ${pages} HTML pages, ${links} local link/asset references, main integration identifiers, public-file whitelist and security headers.`);
