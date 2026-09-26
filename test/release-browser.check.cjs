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
 await page.goto(BASE+'/roadmap.html');
 await page.evaluate(()=>localStorage.setItem('si_site_theme','light'));
 await page.reload({waitUntil:'networkidle'});
 const roadmapTheme=await page.locator('.roadmap-reference').evaluate(el=>({
  scheme:getComputedStyle(el).colorScheme,
  background:getComputedStyle(el).backgroundColor,
  section:getComputedStyle(document.querySelector('#roadmap')).backgroundColor,
  heading:getComputedStyle(document.querySelector('#roadmap-title')).color,
 }));
 assert.equal(roadmapTheme.scheme,'light');
 assert.notEqual(roadmapTheme.background,'rgb(5, 5, 5)');
 assert.notEqual(roadmapTheme.section,'rgb(5, 5, 5)');
 assert.notEqual(roadmapTheme.heading,'rgb(255, 255, 255)');
 console.log('PASS: Roadmap content follows light mode');
 await page.goto(BASE+'/solutions.html',{waitUntil:'networkidle'});
 await page.waitForSelector('.site-footer');
 const footerTheme=await page.locator('.site-footer').evaluate(el=>({scheme:getComputedStyle(el).colorScheme,background:getComputedStyle(el).backgroundColor}));
 assert.equal(footerTheme.scheme,'light');
 assert.notEqual(footerTheme.background,'rgb(5, 5, 5)');
 console.log('PASS: shared footer follows light mode');
 await page.goto(BASE+'/business.html',{waitUntil:'networkidle'});
 const iconBoxes=await page.locator('.organisation-model svg use').evaluateAll(uses=>uses.map(use=>{
  const box=use.ownerSVGElement.getBBox(); return {href:use.getAttribute('href'),width:box.width,height:box.height};
 }));
 assert.ok(iconBoxes.length>=5);
 assert.ok(iconBoxes.every(icon=>icon.href.startsWith('#i-')&&icon.width>0&&icon.height>0),JSON.stringify(iconBoxes));
 console.log('PASS: packaged inline SVG icons render');
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
