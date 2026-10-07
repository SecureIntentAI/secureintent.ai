/**
 * Domain link on business_promo.html (#domain=…), fixture API and fake Clerk:
 * organisation fixed, any work email on the domain, one code, signed in →
 * Overview. A wrong domain is refused; Google on the domain activates directly;
 * a domain that already has a workspace shows "already registered".
 * Run: NODE_PATH=../Secureintent-Extension/node_modules node test/domain-link.check.cjs
 */
const { chromium, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');

// Same signed-out fake Clerk as the admin setup check.
const FAKE_CLERK = readFileSync(path.join(__dirname, 'admin-setup.check.cjs'), 'utf8').match(/const FAKE_CLERK = `([\s\S]*?)`;/)[1];

(async () => {
  const port = Number(process.env.BUSINESS_PREVIEW_PORT || 3011);
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(__dirname, 'helpers/business-preview.mjs')], {
    env: { ...process.env, BUSINESS_PREVIEW_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('exit', (code) => reject(Error(`Fixture server exited: ${code}`)));
  });
  const browser = await chromium.launch();
  const LINK = `${origin}/business_promo.html#domain=${'b'.repeat(64)}`;
  const newPage = async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
    await context.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
    await context.route('**/mock-clerk.js', (r) => r.fulfill({ contentType: 'text/javascript', body: FAKE_CLERK }));
    const page = await context.newPage();
    page.errors = [];
    page.on('pageerror', (e) => page.errors.push(e.message));
    return page;
  };
  try {
    const page = await newPage();
    const calls = [];
    page.on('request', (r) => { if (r.url().includes('/business-promo/')) calls.push(new URL(r.url()).pathname.split('/business-promo/')[1]); });
    await page.goto(LINK);
    await expect(page.locator('#bp-welcome h1')).toContainText('Northstar Engineering');
    await expect(page.locator('#bp-email')).not.toHaveAttribute('readonly', '');
    await expect(page.locator('#bp-email')).toHaveAttribute('placeholder', 'you@northstar.example');
    await expect(page.locator('#bp-email-note')).toContainText('@northstar.example');
    expect(new URL(page.url()).hash).toBe(''); // token out of the address bar
    await page.fill('#bp-first', 'Priya');
    await page.fill('#bp-password', 'Correct-Horse-42');
    await page.fill('#bp-password2', 'Correct-Horse-42');
    await page.fill('#bp-email', 'priya@gmail.com');
    await page.click('#bp-send');
    await expect(page.locator('#bp-setup-error')).toHaveText('Enter your work email ending in @northstar.example.');
    console.log('PASS: domain link shows the organisation, an editable work email, and refuses another domain');

    await page.fill('#bp-email', 'Priya@Northstar.example');
    await page.click('#bp-send');
    await expect(page.locator('#bp-code-step')).toBeVisible();
    await expect(page.locator('#bp-code-step')).toContainText('priya@northstar.example');
    await page.fill('#bp-code', '123456');
    await page.click('#bp-verify');
    await expect(page).toHaveURL(`${origin}/team.html#/overview`, { timeout: 10000 });
    expect(calls).toEqual(expect.arrayContaining(['domain/inspect', 'domain/start', 'domain/verify']));
    expect(calls.some((c) => c.startsWith('activate/'))).toBe(false);
    if (page.errors.length) throw Error(page.errors.join('\n'));
    console.log('PASS: any address on the domain gets one code, is signed in, and lands on Overview');

    const google = await newPage();
    const gcalls = [];
    google.on('request', (r) => { if (r.url().includes('/business-promo/')) gcalls.push(new URL(r.url()).pathname.split('/business-promo/')[1]); });
    await google.goto(LINK);
    await google.click('#bp-google');
    await expect(google).toHaveURL(`${origin}/team.html#/overview`, { timeout: 10000 });
    expect(gcalls).toContain('domain/redeem');
    console.log('PASS: Continue with Google on the domain activates through the link, no second click');

    const taken = await newPage();
    await taken.route('**/mock-api/v1/business-promo/domain/inspect', (r) => r.fulfill({ json: {
      companyName: 'Northstar Engineering', emailDomain: 'northstar.example', expiresAt: Date.now() + 86400000, seats: 150,
      domain: { status: 'registered', companyName: 'Northstar Engineering', adminHint: 's***@northstar.example' },
    } }));
    await taken.goto(LINK);
    await expect(taken.locator('#bp-blocked')).toBeVisible();
    await expect(taken.locator('#bp-blocked-text')).toContainText('ask your workspace administrator');
    console.log('PASS: once the first person has set it up, the link tells everyone else to ask their admin');
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
