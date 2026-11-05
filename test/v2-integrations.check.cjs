/* Browser contract tests. Every service request is intercepted; no live writes.
 * Serve repo on :3000, then PW=../Secureintent-Extension/node_modules/@playwright/test
 * node test/v2-integrations.check.cjs
 */
const { chromium, expect } = require(process.env.PW ? require('path').resolve(process.env.PW) : '@playwright/test');
const assert = require('node:assert/strict');
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const DESIGN = process.env.DESIGN_PATH || '/designs/secureintent-site-v1/';
const config = {
  apiBase: BASE + '/__test/api', clerkPublishableKey: 'pk_test_fixture',
  clerkScriptUrl: BASE + '/__test/clerk.browser.js', jwtTemplate: 'secureintent',
  paddleToken: 'test_fixture', paddleEnv: 'sandbox', priceId: 'pri_fixture',
};
const team = (over = {}) => ({ team: {
  orgId: 'org_fixture', name: 'Test Company', role: 'org:admin', status: 'active',
  seats: 5, seatsUsed: 2, seatsAvailable: 3,
  members: [{ userId: 'u1', email: 'admin@example.test', name: 'Test Admin', role: 'org:admin' }],
  invitations: [{ id: 'inv_fixture', email: 'invite@example.test' }], ...over,
} });
const settings = { settings: { alertWebhook: '', alertMinType: 'known-key', policyVersion: 1,
  policy: { blockInsteadOfWarn: false, requireSessionLock: false, extraPatterns: [], blockedSites: [], replaceDefaultPatterns: false },
} };
const metrics = { metrics: { days: 30, total: 0, activeActors: 0, byDay: [], byType: [], bySite: [], byAction: [] } };
function sdk(signedIn) {
 return `window.calls = []; let listeners = [];
 window.Clerk = {
 user: ${signedIn ? JSON.stringify({id: 'user_fixture', primaryEmailAddress: {emailAddress: 'admin@example.test'}}) : 'null'},
 session: {getToken: async opts => { window.calls.push(['token',opts]); return 'fixture_token'; }},
 load: async () => {}, addListener: fn => listeners.push(fn),
 mountSignIn: (el,opts) => { window.calls.push(['signin',opts]); el.textContent = 'Test sign-in component'; },
 mountSignUp: (el,opts) => { window.calls.push(['signup',opts]); el.textContent = 'Test sign-up component'; },
 mountUserProfile: el => { el.textContent = 'Test profile component'; },
 signOut: async () => { window.Clerk.user = null; listeners.forEach(fn => fn()); },
 };`;
}
const paddle = `window.Paddle = {Environment: {set: env => window.calls.push(['environment',env])},
 Initialize: opts => {window.paddleCallback = opts.eventCallback; window.calls.push(['initialize',opts.token]);},
 Checkout: {open: opts => window.calls.push(['checkout',opts])}};`;
async function context(browser, options = {}) {
  const ctx = await browser.newContext({ viewport: options.mobile ? {width: 390, height: 844} : {width: 1280, height: 900} });
  const requests = [], errors = [], unexpected = [];
  let savedSettings = structuredClone(settings);
  await ctx.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    if (url.pathname === DESIGN + 'integrations/config.js') {
      if (options.unconfigured) return route.continue();
      return route.fulfill({contentType: 'text/javascript', body: 'window.SI_CONFIG = ' + JSON.stringify({preview: {...config, ...options.config}})});
    }
    if (url.pathname === '/__test/clerk.browser.js') return route.fulfill({contentType:'text/javascript', body:sdk(options.signedIn !== false)});
    if (url.hostname === 'cdn.paddle.com') {
      if (options.paddleFailed) return route.abort();
      return route.fulfill({contentType:'text/javascript', body:paddle});
    }
    if (url.pathname.startsWith('/__test/api')) {
      const path = url.pathname.slice('/__test/api'.length);
      const body = req.postDataJSON();
      requests.push({path, body, method: req.method(), authorization:req.headers().authorization});
      const response = await options.respond?.(path, req.method(), body);
      if (response) return route.fulfill({status: response.status || 200, json:response.body});
      if (path === '/v1/entitlement') return route.fulfill({json: {entitlement: {plan:'developer', source:'free', features:[]}}});
      // The admin console opens only after this unlock (live since 6 Oct, admin-access.js).
      if (path === '/v1/business-access/unlock/clerk') return route.fulfill({json: {accessToken:'a'.repeat(64), expiresAt:Date.now()+30*60000, orgId:'org_fixture'}});
      if (path === '/v1/team') return route.fulfill({json: options.teamBody || team()});
      if (path === '/v1/team/settings') {
        if (req.method() === 'PUT') savedSettings = {settings: {...savedSettings.settings, ...body}};
        return route.fulfill({json: savedSettings});
      }
      if (path === '/v1/team/metrics') return route.fulfill({json: metrics});
      if (path === '/v1/usage') return route.fulfill({json: {remaining:8, limit:10}});
      // Today's API: ignores the body and answers with Paddle's checkout link.
      if (path === '/v1/billing/checkout') return route.fulfill({json: {url:'https://secureintent.ai/account.html?_ptxn=txn_fixture'}});
      if (path === '/v1/promo') return route.fulfill({json: {enabled:true}});
      // Signed-in account page looks for invitations by verified email (live since 5 Oct).
      if (path === '/v1/business-member/pending') return route.fulfill({json: {invitations:[]}});
      // Team seats see their organisation's policy status on the account page.
      if (path === '/v1/business/connection/policy-status') return route.fulfill({json: {orgId:'org_fixture',orgName:'Fixture Co',version:0,status:'not_connected',controls:null}});
      if (path === '/v1/promo/start') return route.fulfill({json: {ok:true, newUser:true}});
      if (path === '/v1/promo/verify' || path === '/submit' || path === '/v1/uninstall/feedback' || path === '/v1/attribution' || path === '/v1/team/invite' || path === '/v1/team/seats' || path === '/v1/team/member/remove' || path === '/v1/team/invite/revoke' || path === '/v1/team/settings/test-alert') return route.fulfill({json:{ok:true}});
      unexpected.push(path); return route.fulfill({status:500,json:{error:'unexpected_test_request'}});
    }
    if (url.origin === BASE) return route.continue();
    // Keep font/analytics/assets offline. Any production service hit fails tests.
    if (url.hostname === 'api.secureintent.ai' || url.hostname === 'clerk.secureintent.ai') unexpected.push(req.url());
    return route.fulfill({body:'',contentType:'text/plain'});
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  return {ctx, page, requests, errors, unexpected, async close() {
    assert.deepEqual(errors, [], 'no uncaught page errors'); assert.deepEqual(unexpected, [], 'no unexpected service calls'); await ctx.close();
  }};
}
async function run() {
 const browser = await chromium.launch({headless:true});
 let passed = 0;
 const test = async (name, options, fn) => {
   const c = await context(browser, options);
   try { await fn(c); await c.close(); console.log('PASS ' + name); passed++; }
   catch (error) { console.error('FAIL ' + name); throw error; }
 };
 try {
  await test('preview without credentials gives an actionable error, no live traffic', {unconfigured:true}, async ({page,requests}) => {
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#loading')).toContainText('Test services are not configured'); assert.equal(requests.length,0);
  });
  await test('preview refuses production configuration', {config:{apiBase:'https://api.secureintent.ai'}}, async ({page,requests}) => {
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#loading')).toContainText('production credentials are disabled'); assert.equal(requests.length,0);
  });
  await test('sign-in/sign-up and recovery stay in redesigned routes', {signedIn:false}, async ({page}) => {
    await page.goto(BASE+DESIGN+'account.html?mode=signup&_ptxn=txn_fixture'); await expect(page.locator('#clerk-auth')).toContainText('Test sign-up');
    const args=await page.evaluate(()=>calls.find(c=>c[0]==='signup')[1]);
    assert.equal(args.signInUrl,DESIGN+'account.html?_ptxn=txn_fixture'); assert.equal(args.forceRedirectUrl,DESIGN+'account.html?_ptxn=txn_fixture');
  });
  await test('free account, profile, JWT, checkout identity and sign out', {}, async ({page,requests}) => {
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Browser Free');
    await expect(page.locator('#clerk-profile')).toContainText('Test profile'); await page.click('#upgrade'); await page.click('#checkout');
    await expect.poll(()=>page.evaluate(()=>calls.filter(c=>c[0]==='checkout').length)).toBe(1);
    // The server creates the transaction (customer + clerk_user_id); the page opens it.
    const checkout=await page.evaluate(()=>calls.find(c=>c[0]==='checkout')[1]);
    assert.equal(checkout.transactionId,'txn_fixture'); assert.equal(checkout.items,undefined);
    const sent=requests.find(r=>r.path==='/v1/billing/checkout');
    assert.equal(sent.method,'POST'); assert.equal(sent.authorization,'Bearer fixture_token'); assert.deepEqual(sent.body,{product:'browser_pro',interval:'monthly'});
    assert.ok(requests.find(r=>r.path==='/v1/entitlement'&&r.authorization==='Bearer fixture_token'));
    assert.ok(await page.evaluate(()=>calls.some(c=>c[0]==='token'&&c[1]?.template==='secureintent')));
    await page.click('#signout'); await expect(page.locator('#account')).toBeHidden(); await expect(page.locator('#auth')).toBeVisible();
  });
  await test('billing failure never presents a paid user as Free', {respond:p=>p==='/v1/entitlement'?{status:503,body:{}}:null}, async ({page}) => {
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Unavailable'); await expect(page.locator('#upgrade')).toBeHidden(); await expect(page.locator('#upgrade-panel')).toBeHidden(); await expect(page.locator('#plan-retry')).toBeVisible();
  });
  for (const [source,label] of [['lifetime','Lifetime Business'],['org_seat','Business'],['business_email','Business']]) await test(source+' account has no personal checkout or billing', {respond:p=>p==='/v1/entitlement'?{body:{entitlement:{plan:'business_pro',source,...(source==='org_seat'?{org:{id:'org_fixture',name:'Fixture Co',role:'org:admin'}}:{})}}}:null}, async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText(label); await expect(page.locator('#upgrade')).toBeHidden(); await expect(page.locator('#upgrade-panel')).toBeHidden(); await expect(page.locator('#manage')).toBeHidden();
  });
  await test('payment SDK failure does not block account and reports checkout error', {paddleFailed:true}, async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Browser Free'); await page.click('#checkout'); await expect(page.locator('#plan-notice-title')).toHaveText('Checkout unavailable'); await expect(page.locator('#checkout')).toBeEnabled();
  });
  await test('paid account opens the server-issued billing portal', {respond:p=>p==='/v1/entitlement'?{body:{entitlement:{plan:'developer_pro',source:'paddle',status:'active'}}}:p==='/v1/billing/portal'?{body:{url:'https://customer-portal.paddle.com/fixture'}}:null}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#manage')).toBeVisible(); await expect(page.locator('#upgrade')).toBeHidden();
    await page.click('#manage'); await page.waitForURL('https://customer-portal.paddle.com/fixture');
    assert.ok(requests.some(r=>r.path==='/v1/billing/portal'&&r.method==='POST'&&r.authorization==='Bearer fixture_token'));
  });
  await test('portal errors leave a retryable account screen', {respond:p=>p==='/v1/entitlement'?{body:{entitlement:{plan:'developer_pro',source:'paddle'}}}:p==='/v1/billing/portal'?{status:502,body:{}}:null}, async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#manage')).toBeVisible(); await page.click('#manage'); await expect(page.locator('#plan-notice-title')).toHaveText("Couldn't open billing"); await expect(page.locator('#manage')).toBeEnabled();
  });
  await test('overlapping subscription cancellation uses main API contract', {respond:p=>p==='/v1/entitlement'?{body:{entitlement:{plan:'business_pro',source:'org_seat'},personalSubscription:{status:'active',cancelScheduled:false,currentPeriodEnd:'2026-10-01T00:00:00Z'}}}:p==='/v1/billing/cancel'?{body:{endsAt:'2026-10-01T00:00:00Z'}}:null}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#overlap-cancel')).toBeVisible(); await page.click('#overlap-cancel'); await expect(page.locator('#overlap-cancel')).toBeHidden();
    assert.ok(requests.some(r=>r.path==='/v1/billing/cancel'&&r.method==='POST'));
  });
  // ---- Packages on the account page (facts: integrations/packages.js) ----
  const entitled = (entitlement, extra={}) => ({respond:(p)=>p==='/v1/entitlement'?{body:{entitlement,...extra}}:null});
  const now = Math.floor(Date.now()/1000);
  const featState = (page,key) => page.locator(`#feature-list .feat[data-key="${key}"] .feat-state`);
  const options = page => page.locator('#upgrade-options .upgrade-option').evaluateAll(els=>els.map(e=>e.dataset.product));
  const BANNED = /\b(dead|explosion|devastating|ultimate|illusion|pedigree|seamless|AI-driven|original|workspace|demonstrates|carry forward|Developer Pro|Business Pro|formerly)\b/i;
  const clean = async page => { const text = await page.locator('#account').innerText(); assert.ok(!BANNED.test(text), 'no banned word or old plan name: '+(text.match(BANNED)||[])[0]); };
  await test('Browser Free: what is included, Upgrade with both packages and the Monthly / Annual toggle', {}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Browser Free');
    await expect(featState(page,'anonymise')).toHaveText('8 / 10 left'); await expect(featState(page,'restore')).toHaveText('Browser Pro');
    await expect(featState(page,'terminals')).toHaveText('Desktop Pro'); await expect(featState(page,'team_policy')).toHaveText('Business'); await expect(featState(page,'alerts')).toHaveText('Coming soon');
    await expect(page.locator('#upgrade-panel')).toBeVisible(); assert.deepEqual(await options(page),['browser_pro','desktop_pro']);
    await expect(page.locator('#upgrade-title')).toHaveText('Upgrade'); await expect(page.locator('#manage')).toBeHidden();
    const bp = page.locator('.upgrade-option[data-product="browser_pro"]'), dp = page.locator('.upgrade-option[data-product="desktop_pro"]');
    await expect(page.locator('[data-interval="monthly"]')).toHaveAttribute('aria-pressed','true');
    await expect(bp).toContainText('$4.00 a month'); await expect(bp).toContainText('first 3 paid months, then $7.99 a month');
    await expect(dp).toContainText('$7.50 a month'); await expect(dp).toContainText('first 3 paid months, then $14.99 a month');
    await expect(page.locator('#upgrade-renewal')).toHaveText('Browser Pro, monthly: $4.00 a month for your first 3 paid months, then $7.99 a month. It renews each month until you cancel.');
    await expect(page.locator('#upgrade-cancel')).toContainText('Renewals stop, and you keep access until the end of the period you\'ve paid for.');
    await expect(page.locator('#upgrade-tax')).toContainText('US dollars'); await expect(page.locator('#upgrade-tax')).toContainText('shown at checkout');
    await page.click('[data-interval="annual"]'); await expect(page.locator('[data-interval="annual"]')).toHaveAttribute('aria-pressed','true'); await expect(page.locator('[data-interval="monthly"]')).toHaveAttribute('aria-pressed','false');
    await expect(bp).toContainText('$76.68 a year'); await expect(bp).toContainText('billed upfront, $6.39 a month');
    await expect(dp).toContainText('$143.88 a year'); await expect(dp).toContainText('billed upfront, $11.99 a month');
    await expect(bp).not.toContainText('first 3 paid months');
    await page.check('input[name="upgrade-product"][value="desktop_pro"]');
    await expect(page.locator('#upgrade-renewal')).toHaveText('Desktop Pro, annual: $143.88 paid upfront for the year, which comes to $11.99 a month. It renews at $143.88 each year until you cancel.');
    await page.click('#checkout'); await expect.poll(()=>requests.filter(r=>r.path==='/v1/billing/checkout').length).toBe(1);
    assert.deepEqual(requests.find(r=>r.path==='/v1/billing/checkout').body,{product:'desktop_pro',interval:'annual'});
    // Back to monthly keeps the chosen package.
    await page.click('[data-interval="monthly"]'); await expect(page.locator('input[value="desktop_pro"]')).toBeChecked();
    await expect(page.locator('#team-name')).toHaveText('Business'); await expect(page.locator('#team-cta')).toHaveText('Talk to us about a team trial');
    assert.match(await page.locator('#team-cta').getAttribute('href'), /\/business\.html#enquiry$/);
    await clean(page);
  });
  await test('an Upgrade link pre-selects its package and period, then leaves the address clean', {}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'account.html?mode=signup&plan=desktop_pro&interval=annual');
    await expect(page.locator('#upgrade-panel')).toBeVisible(); await expect(page.locator('input[value="desktop_pro"]')).toBeChecked();
    await expect(page.locator('[data-interval="annual"]')).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#upgrade-renewal')).toContainText('Desktop Pro, annual');
    await expect.poll(()=>page.evaluate(()=>location.search)).toBe('?mode=signup');
    // Nothing is bought until the person presses Continue to checkout.
    assert.equal(requests.filter(r=>r.path==='/v1/billing/checkout').length, 0);
  });
  await test('signing up from an Upgrade link comes back with the chosen package and period', {signedIn:false}, async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html?mode=signup&plan=desktop_pro&interval=annual');
    const args=await page.evaluate(()=>calls.find(c=>c[0]==='signup')[1]);
    for (const url of [args.forceRedirectUrl, args.signUpForceRedirectUrl, args.signInForceRedirectUrl]) {
      assert.match(url, /account\.html\?(.*&)?plan=desktop_pro&interval=annual/);
    }
  });
  await test('an Upgrade link for a package this account cannot buy is ignored', entitled({plan:'developer_pro',tier:'browser_pro',source:'paddle',status:'active'}), async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html?plan=browser_pro&interval=annual');
    await expect(page.locator('input[value="desktop_pro"]')).toBeChecked(); await expect(page.locator('[data-interval="monthly"]')).toHaveAttribute('aria-pressed','true');
  });
  await test('Browser Pro (signed tier): only Desktop Pro is offered, billing is managed', entitled({plan:'developer_pro',tier:'browser_pro',source:'paddle',status:'active'}), async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Browser Pro'); await expect(page.locator('#plan-sub')).toHaveText('Subscription: active');
    await expect(page.locator('#manage')).toBeVisible(); await expect(page.locator('#upgrade-title')).toHaveText('Upgrade to Desktop Pro'); assert.deepEqual(await options(page),['desktop_pro']);
    await expect(featState(page,'restore')).toHaveText('Active'); await expect(featState(page,'anonymise')).toHaveText('Unlimited'); await expect(featState(page,'clipboard')).toHaveText('Desktop Pro');
    await clean(page);
  });
  await test('Browser Pro from today\'s API (no tier): no second subscription is offered', entitled({plan:'developer_pro',source:'paddle',status:'active'}), async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Browser Pro'); await expect(page.locator('#upgrade-panel')).toBeHidden(); await expect(page.locator('#upgrade')).toBeHidden(); await expect(page.locator('#manage')).toBeVisible();
  });
  await test('Desktop Pro trial: days left from the signed end date, both packages offered', entitled({plan:'developer',tier:'desktop_pro',source:'none',trial:{state:'active',endsAt:now+12*86400-60}}), async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Desktop Pro trial');
    await expect(page.locator('#plan-sub')).toContainText('12 days left'); await expect(page.locator('#plan-sub')).toContainText('no card needed');
    await expect(page.locator('#manage')).toBeHidden(); assert.deepEqual(await options(page),['browser_pro','desktop_pro']);
    await expect(page.locator('input[value="desktop_pro"]')).toBeChecked(); await expect(page.locator('#upgrade-lead')).toContainText('nothing is charged when it ends');
    await expect(featState(page,'terminals')).toHaveText('Active');
    await clean(page);
  });
  await test('Desktop Pro trial on its last day reads 1 day left', entitled({plan:'developer',tier:'desktop_pro',trial:{state:'active',endsAt:now+3600}}), async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-sub')).toContainText('1 day left');
  });
  await test('Desktop Pro paid: nothing to upgrade, billing is managed', entitled({plan:'developer_pro',tier:'desktop_pro',source:'paddle',status:'active',trial:{state:'used',endsAt:now-86400}}), async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Desktop Pro');
    await expect(page.locator('#upgrade-panel')).toBeHidden(); await expect(page.locator('#upgrade')).toBeHidden(); await expect(page.locator('#manage')).toBeVisible();
    await expect(featState(page,'clipboard')).toHaveText('Active'); await expect(featState(page,'activity')).toHaveText('Business');
    await clean(page);
  });
  await test('lifetime keeps its access and reads Lifetime Browser Pro', entitled({plan:'developer_pro',source:'lifetime'}), async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Lifetime Browser Pro'); await expect(page.locator('#lifetime-badge')).toBeVisible();
    await expect(page.locator('#manage')).toBeHidden(); await expect(page.locator('#upgrade-panel')).toBeHidden(); await expect(featState(page,'log_cleaner')).toHaveText('Active');
    await clean(page);
  });
  await test('lifetime with a signed tier may add Desktop Pro', entitled({plan:'developer_pro',tier:'browser_pro',source:'lifetime'}), async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Lifetime Browser Pro'); assert.deepEqual(await options(page),['desktop_pro']); await expect(page.locator('#manage')).toBeHidden();
  });
  for (const [role,sub] of [['org:member','Provided by your team'],['org:admin','Administrator of Fixture Co']]) await test(`team ${role.slice(4)}: the seat reads as Business, nothing to buy`, entitled({plan:'business_pro',tier:'desktop_pro',source:'org_seat',status:'active',org:{id:'org_fixture',name:'Fixture Co',role,seats:5}}), async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Business'); await expect(page.locator('#plan-sub')).toHaveText(sub);
    await expect(page.locator('#upgrade-panel')).toBeHidden(); await expect(page.locator('#upgrade')).toBeHidden(); await expect(page.locator('#manage')).toBeHidden();
    await expect(featState(page,'team_policy')).toHaveText('Active'); await expect(featState(page,'alerts')).toHaveText('Coming soon');
    await expect(page.locator('#team-role')).toHaveText(role==='org:admin'?'Admin':'Member'); await expect(page.locator('#nav-team')).toBeVisible({visible: role==='org:admin'});
    await clean(page);
  });
  await test('an unknown tier grants no more than the plan', entitled({plan:'developer',tier:'enterprise'}), async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Browser Free');
  });
  await test('a checkout priced for another choice is refused, nothing opens', {respond:p=>p==='/v1/billing/checkout'?{body:{url:'https://secureintent.ai/account.html?_ptxn=txn_other',product:'browser_pro',interval:'monthly'}}:null}, async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await page.check('input[value="desktop_pro"]'); await page.click('#checkout');
    await expect(page.locator('#plan-notice-title')).toHaveText("Couldn't open checkout"); assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='checkout').length),0);
  });
  await test('checkout errors say nothing was charged', {respond:p=>p==='/v1/billing/checkout'?{status:502,body:{error:'checkout failed'}}:null}, async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await page.click('#checkout'); await expect(page.locator('#plan-notice-body')).toContainText('Nothing was charged'); await expect(page.locator('#checkout')).toBeEnabled();
  });
  await test('checkout conflict points to Manage subscription', {respond:p=>p==='/v1/billing/checkout'?{status:409,body:{error:'subscription_exists'}}:null}, async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await page.click('#checkout'); await expect(page.locator('#plan-notice-body')).toContainText('Manage subscription');
  });
  await test('a checkout link off Paddle and without a transaction is not followed', {respond:p=>p==='/v1/billing/checkout'?{body:{url:'https://example.test/pay'}}:null}, async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await page.click('#checkout'); await expect(page.locator('#plan-notice-title')).toHaveText("Couldn't open checkout"); assert.ok(page.url().startsWith(BASE));
  });
  await test('team admin invites, saves policy, and sees alerts as a preview', {}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'team.html'); await expect(page.locator('#console')).toBeVisible(); await expect(page.locator('#nav-seats')).toHaveText('2/5');
    await page.click('[data-view="people"]'); await page.fill('#invite-email','colleague@example.test'); await page.click('#invite');
    await expect.poll(()=>requests.filter(r=>r.path==='/v1/team/invite').length).toBe(1);
    assert.deepEqual(requests.find(r=>r.path==='/v1/team/invite').body,{email:'colleague@example.test',role:'org:member'});
    await page.click('[data-view="policy"]'); await page.check('#pol-lock'); await expect(page.locator('#policy-dirty')).toBeVisible();
    await page.click('#policy-save'); await expect.poll(()=>requests.filter(r=>r.path==='/v1/team/settings'&&r.method==='PUT').length).toBe(1);
    const put=requests.find(r=>r.path==='/v1/team/settings'&&r.method==='PUT').body;
    assert.equal(put.policy.requireSessionLock,true);
    // Policy saves send the policy only; alerts are a preview (desktop app).
    assert.ok(!('alertWebhook' in put) && !('alertMinType' in put));
    await page.click('[data-view="alerts"]'); await expect(page.locator('.preview-banner')).toContainText('desktop app');
    for (const id of ['#alert-webhook','#alert-min','#alerts-save','#alerts-test']) await expect(page.locator(id)).toBeDisabled();
    assert.ok(!requests.some(r=>r.path==='/v1/team/settings/test-alert'));
  });
  await test('team members cannot access the admin console', {teamBody:team({role:'org:member'})}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'team.html'); await expect(page.locator('#member-actions')).toBeVisible(); await expect(page.locator('#console')).toBeHidden(); assert.ok(!requests.some(r=>r.path==='/v1/team/settings'));
  });
  await test('pending team cannot invite or edit policies', {teamBody:team({seats:0,seatsUsed:0})}, async ({page})=>{
    await page.goto(BASE+DESIGN+'team.html#/policy'); await expect(page.locator('#pending')).toBeVisible(); await expect(page.locator('#invite')).toBeDisabled(); await expect(page.locator('[data-view="policy"]')).toHaveAttribute('aria-disabled','true');
  });
  // Business is invitation-only since 2 Oct: no team means no seat purchase, only the invitation note.
  await test('no team: invitation required, nothing to buy', {teamBody:{team:null}}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'team.html'); await expect(page.locator('#gate-title')).toHaveText('Business invitation required');
    await expect(page.locator('#gate-actions')).toBeHidden(); await expect(page.locator('#console')).toBeHidden();
    assert.ok(!requests.some(r=>r.path==='/v1/team/checkout'));
  });
  // Sign-in and sign-up come back to the admin unlock (admin_return=1), not a checkout.
  await test('team sign-up comes back to the admin console', {signedIn:false}, async ({page})=>{
    await page.goto(BASE+DESIGN+'team.html?mode=signup'); await expect(page.locator('#clerk-auth')).toContainText('Test sign-up');
    const args=await page.evaluate(()=>calls.find(c=>c[0]==='signup')[1]); assert.equal(args.forceRedirectUrl,DESIGN+'team.html?admin_return=1');
  });
  // Pilot teams have fixed seats since 2 Oct, so Change seats stays hidden.
  await test('invitation revocation sends the expected payload; seats are fixed', {}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'team.html#/people'); await expect(page.locator('#view-people')).toBeVisible(); await expect(page.locator('#seats-btn')).toBeHidden();
    await page.click('[data-revoke="inv_fixture"]'); await page.click('[data-revoke="inv_fixture"][data-confirmed="1"]');
    await expect.poll(()=>requests.filter(r=>r.path==='/v1/team/invite/revoke').length).toBe(1); assert.deepEqual(requests.find(r=>r.path==='/v1/team/invite/revoke').body,{invitationId:'inv_fixture'});
  });
  await test('business enquiry uses existing email-only contract', {}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'business.html'); await page.fill('#business-email','Hello@example.test'); await page.click('#business-form button[type="submit"]');
    await expect(page.locator('#business-status')).toContainText('registered'); assert.deepEqual(requests.find(r=>r.path==='/submit').body,{email:'hello@example.test',tier:'biz'});
  });
  await test('business failure retains input and permits retry', {respond:p=>p==='/submit'?{status:500,body:{error:'failed'}}:null}, async ({page})=>{
    await page.goto(BASE+DESIGN+'business.html'); await page.fill('#business-email','hello@example.test'); await page.click('#business-form button[type="submit"]');
    await expect(page.locator('#business-error')).toBeVisible(); await expect(page.locator('#business-email')).toHaveValue('hello@example.test'); await expect(page.locator('#business-status')).toHaveText('');
  });
  for (const name of ['index.html','solutions.html']) await test(name+' enquiry submits once to the existing endpoint', {}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+name); await page.fill('#contact-email','hello@example.test'); await page.click('#contact-form button[type="submit"]'); await expect(page.locator('#form-status')).toContainText('registered');
    assert.deepEqual(requests.filter(r=>r.path==='/submit').map(r=>r.body),[{email:'hello@example.test',tier:'biz'}]);
  });
  await test('uninstall records one tap with original token/build metadata', {}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'uninstall.html?id=install-123456&t=test-signed-token&v=2.0&b=chrome&os=linux'); await page.click('[data-uninstall-reason="privacy"]'); await expect(page.locator('#uninstall-status')).toContainText('saved');
    assert.deepEqual(requests.find(r=>r.path==='/v1/uninstall/feedback').body,{installId:'install-123456',token:'test-signed-token',reason:'privacy',comment:'',version:'2.0',browser:'chrome',os:'linux'});
    await page.fill('#uninstall-comment','Test feedback');await page.click('#uninstall-form button');await expect(page.locator('#uninstall-done')).toBeVisible();
    assert.equal(requests.filter(r=>r.path==='/v1/uninstall/feedback').length,2);
  });
  await test('uninstall without an install ID does not pretend to submit', {}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'uninstall.html'); await expect(page.locator('#uninstall-noid')).toBeVisible();await expect(page.locator('#uninstall-ask')).toBeHidden();assert.equal(requests.length,0);
  });
  await test('uninstall failure remains retryable', {respond:p=>p==='/v1/uninstall/feedback'?{status:500,body:{}}:null}, async ({page})=>{
    await page.goto(BASE+DESIGN+'uninstall.html?id=install-123456'); await page.click('[data-uninstall-reason="privacy"]');await expect(page.locator('#uninstall-status')).toHaveAttribute('role','alert');await page.click('#uninstall-form button');await expect(page.locator('#uninstall-done')).toBeHidden();await expect(page.locator('#uninstall-form button')).toBeEnabled();
  });
  await test('team-controlled text cannot inject script into the page', {teamBody:team({name:'<img src=x onerror="window.xss=1">',members:[{userId:'u2',name:'<img src=x onerror="window.xss=1">',email:'bad@example.test',role:'org:member'}]})}, async ({page})=>{
    await page.goto(BASE+DESIGN+'team.html#/people');await expect(page.locator('#team-name')).toContainText('<img');assert.equal(await page.evaluate(()=>window.xss),undefined);assert.equal(await page.locator('#people img').count(),0);
  });
  // Attribution is optional analytics: only after Accept (cookie consent, 19 Oct).
  await test('creator attribution is not sent before analytics are accepted', {}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'index.html?utm_source=test-creator&utm_medium=creator&utm_campaign=test-launch');await page.goto(BASE+DESIGN+'account.html');await expect(page.locator('#account')).toBeVisible();
    await page.waitForTimeout(500); assert.ok(!requests.some(r=>r.path==='/v1/attribution'));
  });
  await test('creator attribution survives landing-to-account navigation', {}, async ({page,requests})=>{
    await page.context().addCookies([{name:'si_consent', value:'v1.granted', url:BASE}]);
    await page.goto(BASE+DESIGN+'index.html?utm_source=test-creator&utm_medium=creator&utm_campaign=test-launch');await page.goto(BASE+DESIGN+'account.html');await expect(page.locator('#account')).toBeVisible();
    await expect.poll(()=>requests.filter(r=>r.path==='/v1/attribution').length).toBe(1);assert.deepEqual(requests.find(r=>r.path==='/v1/attribution').body,{creator:'test-creator',medium:'creator',campaign:'test-launch'});
  });
  await test('promo new user requires real verify response before success', {}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'lifetime_promo.html'); await page.fill('#promo-email','new@example.test'); await page.click('#promo-email-form button'); await expect(page.locator('#promo-code')).toBeVisible();
    await page.fill('#promo-code-input','123456'); await page.fill('#promo-first-name','New'); await page.fill('#promo-last-name','User'); await page.fill('#promo-password','FixturePassword123!'); await page.click('#promo-code-form button');
    await expect(page.locator('#promo-done')).toBeVisible(); assert.deepEqual(requests.find(r=>r.path==='/v1/promo/verify').body,{email:'new@example.test',code:'123456',firstName:'New',lastName:'User',password:'FixturePassword123!'});
    await expect(page.locator('#promo-password')).toHaveValue('');
  });
  await test('promo existing user does not need a name or password; wrong code fails', {respond:p=>p==='/v1/promo/start'?{body:{ok:true,newUser:false}}:p==='/v1/promo/verify'?{status:400,body:{error:'expired'}}:null}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'lifetime_promo.html'); await page.fill('#promo-email','old@example.test'); await page.click('#promo-email-form button'); await expect(page.locator('#promo-code')).toBeVisible(); await expect(page.locator('#promo-new-fields')).toBeHidden();
    await page.fill('#promo-code-input','111111'); await page.click('#promo-code-form button'); await expect(page.locator('#promo-review-note')).toContainText('expired'); await expect(page.locator('#promo-done')).toBeHidden();
    assert.deepEqual(requests.find(r=>r.path==='/v1/promo/verify').body,{email:'old@example.test',code:'111111'});
  });
  await test('closed promo cannot send a verification code', {respond:p=>p==='/v1/promo'?{body:{enabled:false}}:null}, async ({page})=>{
    await page.goto(BASE+DESIGN+'lifetime_promo.html'); await expect(page.locator('#promo-closed')).toBeVisible(); await expect(page.locator('#promo-start')).toBeHidden();
  });
  await test('failed promotion verification never shows success', {respond:p=>p==='/v1/promo/verify'?{status:503,body:{error:'unavailable'}}:null}, async ({page})=>{
    await page.goto(BASE+DESIGN+'lifetime_promo.html'); await page.fill('#promo-email','new@example.test'); await page.click('#promo-email-form button'); await expect(page.locator('#promo-code')).toBeVisible();
    await page.fill('#promo-code-input','123456'); await page.fill('#promo-first-name','New'); await page.fill('#promo-last-name','User'); await page.fill('#promo-password','FixturePassword123!'); await page.click('#promo-code-form button');
    await expect(page.locator('#promo-review-note')).toHaveAttribute('role','alert'); await expect(page.locator('#promo-done')).toBeHidden(); await expect(page.locator('#promo-code-form button')).toBeEnabled();
  });
  await test('rate-limited promo request keeps the email step and allows retry', {respond:p=>p==='/v1/promo/start'?{status:429,body:{error:'too_soon'}}:null}, async ({page})=>{
    await page.goto(BASE+DESIGN+'lifetime_promo.html'); await page.fill('#promo-email','new@example.test'); await page.click('#promo-email-form button'); await expect(page.locator('#promo-review-note')).toContainText('Please wait'); await expect(page.locator('#promo-start')).toBeVisible(); await expect(page.locator('#promo-code')).toBeHidden(); await expect(page.locator('#promo-email-form button')).toBeEnabled();
  });
  await test('account and team fit mobile in both themes', {mobile:true}, async ({page})=>{
    for(const name of ['account','team']) {
      await page.goto(BASE+DESIGN+name+'.html'); await expect(page.locator(name==='account'?'#account':'#console')).toBeVisible();
      if(name==='account') await expect(page.locator('#upgrade-panel')).toBeVisible();
      for(const theme of ['dark','light']) {
        await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' has no horizontal overflow');
        if(name==='account') { await page.click('[data-interval="annual"]'); assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'account annual has no horizontal overflow'); await page.click('[data-interval="monthly"]'); }
        await page.screenshot({path:require('os').tmpdir()+'/si-v2-'+name+'-'+theme+'.png',fullPage:true});
      }
    }
  });
  console.log(`${passed} integration scenarios passed.`);
 } finally { await browser.close(); }
}
run().catch(error=>{console.error(error); process.exitCode=1;});
