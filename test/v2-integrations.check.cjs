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
      if (path === '/v1/team') return route.fulfill({json: options.teamBody || team()});
      if (path === '/v1/team/settings') {
        if (req.method() === 'PUT') savedSettings = {settings: {...savedSettings.settings, ...body}};
        return route.fulfill({json: savedSettings});
      }
      if (path === '/v1/team/metrics') return route.fulfill({json: metrics});
      if (path === '/v1/usage') return route.fulfill({json: {remaining:8, limit:10}});
      if (path === '/v1/promo') return route.fulfill({json: {enabled:true}});
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
    assert.equal(args.signInUrl,DESIGN+'account.html'); assert.equal(args.forceRedirectUrl,DESIGN+'account.html?_ptxn=txn_fixture');
  });
  await test('free account, profile, JWT, checkout identity and sign out', {}, async ({page,requests}) => {
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Free');
    await expect(page.locator('#clerk-profile')).toContainText('Test profile'); await page.click('#upgrade');
    const checkout=await page.evaluate(()=>calls.find(c=>c[0]==='checkout')[1]);
    assert.deepEqual(checkout.customData,{clerk_user_id:'user_fixture'}); assert.equal(checkout.items[0].priceId,'pri_fixture');
    assert.ok(requests.find(r=>r.path==='/v1/entitlement'&&r.authorization==='Bearer fixture_token'));
    assert.ok(await page.evaluate(()=>calls.some(c=>c[0]==='token'&&c[1].template==='secureintent')));
    await page.click('#signout-top'); await expect(page.locator('#account')).toBeHidden(); await expect(page.locator('#auth')).toBeVisible();
  });
  await test('billing failure never presents a paid user as Free', {respond:p=>p==='/v1/entitlement'?{status:503,body:{}}:null}, async ({page}) => {
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Unavailable'); await expect(page.locator('#upgrade')).toBeHidden(); await expect(page.locator('#plan-retry')).toBeVisible();
  });
  for (const source of ['lifetime','org_seat','business_email']) await test(source+' account has no personal checkout or billing', {respond:p=>p==='/v1/entitlement'?{body:{entitlement:{plan:'business_pro',source}}}:null}, async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Business Pro'); await expect(page.locator('#upgrade')).toBeHidden(); await expect(page.locator('#manage')).toBeHidden();
  });
  await test('payment SDK failure does not block account and reports checkout error', {paddleFailed:true}, async ({page})=>{
    await page.goto(BASE+DESIGN+'account.html'); await expect(page.locator('#plan-name')).toHaveText('Free'); await page.click('#upgrade'); await expect(page.locator('#plan-notice-title')).toHaveText('Checkout unavailable');
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
  await test('team admin invites, saves policy, and tests alerts', {}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'team.html'); await expect(page.locator('#console')).toBeVisible(); await expect(page.locator('#nav-seats')).toHaveText('2/5');
    await page.click('[data-view="people"]'); await page.fill('#invite-email','colleague@example.test'); await page.click('#invite');
    await expect.poll(()=>requests.filter(r=>r.path==='/v1/team/invite').length).toBe(1);
    assert.deepEqual(requests.find(r=>r.path==='/v1/team/invite').body,{email:'colleague@example.test',role:'org:member'});
    await page.click('[data-view="policy"]'); await page.check('#pol-lock'); await expect(page.locator('#nav-policy-dot')).toBeVisible();
    await page.click('#policy-save'); await expect.poll(()=>requests.filter(r=>r.path==='/v1/team/settings'&&r.method==='PUT').length).toBe(1);
    assert.equal(requests.find(r=>r.path==='/v1/team/settings'&&r.method==='PUT').body.policy.requireSessionLock,true);
    await page.click('[data-view="alerts"]'); await page.fill('#alert-webhook','https://example.test/webhook'); await page.click('#alerts-save'); await expect(page.locator('#alerts-status')).toContainText('Saved.'); await page.click('#alerts-test');
    await expect.poll(()=>requests.filter(r=>r.path==='/v1/team/settings/test-alert').length).toBe(1);
  });
  await test('team members cannot access the admin console', {teamBody:team({role:'org:member'})}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'team.html'); await expect(page.locator('#member-actions')).toBeVisible(); await expect(page.locator('#console')).toBeHidden(); assert.ok(!requests.some(r=>r.path==='/v1/team/settings'));
  });
  await test('pending team cannot invite or edit policies', {teamBody:team({seats:0,seatsUsed:0})}, async ({page})=>{
    await page.goto(BASE+DESIGN+'team.html#/policy'); await expect(page.locator('#pending')).toBeVisible(); await expect(page.locator('#invite')).toBeDisabled(); await expect(page.locator('[data-view="policy"]')).toHaveAttribute('aria-disabled','true');
  });
  await test('team checkout request and return URL', {teamBody:{team:null},respond:p=>p==='/v1/team/checkout'?{body:{transactionId:'txn_team'}}:null}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'team.html'); await expect(page.locator('#company')).toBeVisible(); await page.fill('#company','New Company'); await page.click('#buy');
    await expect.poll(()=>page.evaluate(()=>calls.filter(c=>c[0]==='checkout').length)).toBe(1);
    const args=await page.evaluate(()=>calls.find(c=>c[0]==='checkout')[1]); assert.equal(args.settings.successUrl,BASE+DESIGN+'team.html?welcome=1&claim=txn_team');
    assert.deepEqual(requests.find(r=>r.path==='/v1/team/checkout').body,{companyName:'New Company',seats:5});
  });
  await test('team SDK failure does not create a transaction', {paddleFailed:true,teamBody:{team:null}}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'team.html'); await expect(page.locator('#company')).toBeVisible(); await page.fill('#company','New Company'); await page.click('#buy'); await expect(page.locator('#gate-err')).toContainText('payment service'); assert.ok(!requests.some(r=>r.path==='/v1/team/checkout'));
  });
  await test('team sign-up preserves a pending transaction', {signedIn:false}, async ({page})=>{
    await page.goto(BASE+DESIGN+'team.html?mode=signup&_ptxn=txn_team'); await expect(page.locator('#clerk-auth')).toContainText('Test sign-up');
    const args=await page.evaluate(()=>calls.find(c=>c[0]==='signup')[1]); assert.equal(args.forceRedirectUrl,DESIGN+'team.html?_ptxn=txn_team');
  });
  await test('seat changes and invitation revocation send the expected payloads', {}, async ({page,requests})=>{
    await page.goto(BASE+DESIGN+'team.html#/people'); await expect(page.locator('#view-people')).toBeVisible(); await page.click('#seats-btn'); await page.fill('#seats-input','6'); await page.click('#seats-save');
    await expect.poll(()=>requests.filter(r=>r.path==='/v1/team/seats').length).toBe(1); assert.deepEqual(requests.find(r=>r.path==='/v1/team/seats').body,{seats:6});
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
  await test('creator attribution survives landing-to-account navigation', {}, async ({page,requests})=>{
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
      for(const theme of ['dark','light']) {
        await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' has no horizontal overflow');
        await page.screenshot({path:require('os').tmpdir()+'/si-v2-'+name+'-'+theme+'.png',fullPage:true});
      }
    }
  });
  console.log(`${passed} integration scenarios passed.`);
 } finally { await browser.close(); }
}
run().catch(error=>{console.error(error); process.exitCode=1;});
