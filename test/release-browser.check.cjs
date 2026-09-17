const path=require('node:path');
const {chromium}=require(process.env.PW?path.resolve(process.cwd(),process.env.PW):'@playwright/test');
const BASE=process.env.BASE||'http://127.0.0.1:3002';
const origin=new URL(BASE).origin;
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext();
 await ctx.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.fulfill({body:'',contentType:'text/plain'}));
 const page=await ctx.newPage(),errors=[],failed=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.url().startsWith(BASE)&&r.status()>=400)failed.push(r.url());});
 const files=JSON.parse(fs.readFileSync(path.join(__dirname,'../dist/.site-manifest.json'))).files.filter(f=>f.endsWith('.html'));
 for(const file of files){await page.goto(BASE+'/'+file,{waitUntil:'networkidle'});}
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 console.log('PASS: '+files.length+' pages without browser script errors or missing local resources');
 await ctx.close();
 const firefox=await browser.newContext({userAgent:'Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0'});
 await firefox.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.fulfill({body:''}));
 const fp=await firefox.newPage();
 for(const url of ['/','/docs/start/','/lifetime_promo.html']){
  await fp.goto(BASE+url,{waitUntil:'networkidle'});
  const links=await fp.locator('a[href*="addons.mozilla.org"]').count();
  assert(links>0,'Firefox store missing on '+url);
  const wrong=await fp.locator('a[href*="chromewebstore.google.com"]').evaluateAll(aa=>aa.filter(a=>!a.href.includes('/reviews')&&!/review/i.test(a.textContent)).map(a=>a.href));
  assert.deepEqual(wrong,[],'Chrome install leaked for Firefox on '+url);
 }
 console.log('PASS: Firefox UA receives main Firefox installer links on marketing, docs and promo');
 const nojs=await browser.newContext({javaScriptEnabled:false});const np=await nojs.newPage();
 for(const url of ['/','/solutions.html','/business.html','/lifetime_promo.html','/docs/contact/']){
  await np.goto(BASE+url);
  const enabled=await np.locator('button[type=submit]:enabled').count();assert.equal(enabled,0,'Uninitialized form submits on '+url);
 }
 console.log('PASS: no-script forms cannot falsely submit');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
