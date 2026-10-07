/**
 * One-code admin setup on business_promo.html (fixture API, fake Clerk):
 * invitation -> name, password, confirm -> one emailed code -> signed in ->
 * Overview dashboard, with no Clerk screen. Google: one click, back, activated.
 * Run: NODE_PATH=../Secureintent-Extension/node_modules node test/admin-setup.check.cjs
 */
const { chromium, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');

// Signed out until the page signs in (ticket or "Google"); remembered per tab so
// the console page that follows sees the same session.
const FAKE_CLERK = `(() => {
  const calls = JSON.parse(sessionStorage.getItem('fake-clerk-calls') || '[]');
  const log = (c) => { calls.push(c); sessionStorage.setItem('fake-clerk-calls', JSON.stringify(calls)); };
  const signedIn = () => sessionStorage.getItem('fake-signed-in') === '1';
  const listeners = [];
  const user = { id: 'user_demo_admin', fullName: 'Maya Chen', passwordEnabled: false,
    primaryEmailAddress: { emailAddress: 'maya@northstar.example' },
    updatePassword: async (o) => { log('updatePassword:' + o.newPassword); } };
  const session = { id: 'session_fixture', createdAt: new Date(), getToken: async () => 'synthetic-preview-token' };
  window.Clerk = {
    get user() { return signedIn() ? user : null; }, get session() { return signedIn() ? session : null; },
    organization: { id: 'org_demo_northstar', name: 'Northstar Engineering' },
    client: { signIn: {
      create: async (o) => { log('signIn.create:' + o.strategy); return { status: 'complete', createdSessionId: 'session_fixture' }; },
      authenticateWithRedirect: async (o) => { log('google'); sessionStorage.setItem('fake-signed-in', '1'); location.assign(o.redirectUrl); },
    } },
    setActive: async () => { sessionStorage.setItem('fake-signed-in', '1'); listeners.forEach((f) => f()); },
    handleRedirectCallback: async () => { log('handleRedirectCallback'); },
    load: async () => {}, addListener: (f) => listeners.push(f), signOut: async () => {},
    mountSignIn: () => log('mountSignIn'), mountSignUp: () => log('mountSignUp'),
    unmountSignIn: () => {}, unmountSignUp: () => {}, mountUserProfile: () => {}, unmountUserProfile: () => {},
  };
})();`;

(async () => {
  const port = Number(process.env.BUSINESS_PREVIEW_PORT || 3010);
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(__dirname, 'helpers/business-preview.mjs')], {
    env: { ...process.env, BUSINESS_PREVIEW_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('exit', (code) => reject(Error(`Fixture server exited: ${code}`)));
  });
  const browser = await chromium.launch();
  const newPage = async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    await context.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
    await context.route('**/mock-clerk.js', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_CLERK }));
    const page = await context.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    return page;
  };
  const calls = (page) => page.evaluate(() => JSON.parse(sessionStorage.getItem('fake-clerk-calls') || '[]'));
  try {
    const page = await newPage();
    const PASSWORD = 'Correct-Horse-42';
    const apiBodies = [];
    page.on('request', (r) => { if (r.url().includes('/mock-api/')) apiBodies.push(r.postData() || ''); });
    await page.goto(`${origin}/business_promo.html#invite=${'a'.repeat(64)}`);
    await expect(page.locator('#bp-welcome h1')).toContainText('Northstar Engineering');
    await expect(page.locator('#bp-email')).toHaveValue('maya@northstar.example');
    await expect(page.locator('#bp-email')).toHaveAttribute('readonly', '');
    await page.click('#bp-send');
    await expect(page.locator('#bp-setup-error')).toHaveText('Enter your first name.');
    await page.fill('#bp-first', 'Maya');
    await page.fill('#bp-last', 'Chen');
    await page.fill('#bp-password', 'short');
    await page.click('#bp-send');
    await expect(page.locator('#bp-setup-error')).toContainText('at least 8 characters');
    await page.fill('#bp-password', PASSWORD);
    await page.fill('#bp-password2', PASSWORD + 'x');
    await page.click('#bp-send');
    await expect(page.locator('#bp-setup-error')).toHaveText("The passwords don't match.");
    await page.fill('#bp-password2', PASSWORD);
    await page.click('#bp-send');
    await expect(page.locator('#bp-code-step')).toBeVisible();
    await expect(page.locator('#bp-resend')).toBeDisabled();
    console.log('PASS: invitation form: email locked, name required, 8+ character password, confirm must match');

    await page.fill('#bp-code', '000000');
    await page.click('#bp-verify');
    await expect(page.locator('#bp-code-error')).toContainText("isn't right");
    await page.click('#bp-change');
    await expect(page.locator('#bp-password')).toHaveValue(PASSWORD);
    await page.click('#bp-send');
    await page.fill('#bp-code', '123456');
    await page.click('#bp-verify');
    await expect(page).toHaveURL(`${origin}/team.html#/overview`, { timeout: 10000 });
    await expect(page.locator('#console')).toBeVisible();
    const log = await calls(page);
    expect(log).toContain('signIn.create:ticket');
    expect(log).toContain(`updatePassword:${PASSWORD}`);
    expect(log.filter((c) => c.startsWith('mount'))).toEqual([]);
    expect(apiBodies.some((b) => b.includes(PASSWORD))).toBe(false);
    if (page.errors.length) throw Error(page.errors.join('\n'));
    console.log('PASS: one code -> signed in -> Overview dashboard; no Clerk screen; password only to Clerk');

    const google = await newPage();
    await google.goto(`${origin}/business_promo.html#invite=${'a'.repeat(64)}`);
    await expect(google.locator('#bp-google')).toBeVisible();
    await google.click('#bp-google');
    await expect(google).toHaveURL(`${origin}/team.html#/overview`, { timeout: 10000 });
    await expect(google.locator('#console')).toBeVisible();
    const glog = await calls(google);
    expect(glog).toContain('google');
    expect(glog).toContain('handleRedirectCallback');
    expect(glog.filter((c) => c.startsWith('mount'))).toEqual([]);
    if (google.errors.length) throw Error(google.errors.join('\n'));
    console.log('PASS: Continue with Google -> back -> activated -> Overview, without a second click');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
