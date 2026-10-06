/**
 * One-code team join on account.html (fixture API, no live traffic):
 * invitation link -> name -> "Email me a code" -> code -> signed in.
 * Run: NODE_PATH=../Secureintent-Extension/node_modules node test/member-join.check.cjs
 * (build dist first: node scripts/prepare-site.mjs --production)
 */
const { chromium, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');

(async () => {
  const port = Number(process.env.BUSINESS_PREVIEW_PORT || 3007);
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(__dirname, 'helpers/business-preview.mjs')], {
    env: { ...process.env, BUSINESS_PREVIEW_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('exit', (code) => reject(Error(`Fixture server exited: ${code}`)));
  });
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const PASSWORD = 'Correct-Horse-42';
    const apiBodies = [];
    page.on('request', (r) => { if (r.url().includes('/mock-api/')) apiBodies.push(r.postData() || ''); });

    await page.goto(`${origin}/account.html#invite=${'d'.repeat(64)}`);
    await expect(page.locator('#auth-title')).toHaveText('Join Northstar Engineering');
    await expect(page.locator('#join-email')).toHaveValue('sam@northstar.example');
    expect(new URL(page.url()).hash).toBe(''); // the token leaves the address bar
    await page.click('button[type=submit]');
    await expect(page.locator('.join-error')).toHaveText('Enter your first name.');
    console.log('PASS: invitation opens the join card with the invited email locked and the name required');

    await page.fill('#join-first', 'Sam');
    await page.fill('#join-last', 'Rivera');
    await page.fill('#join-password', 'short');
    await page.click('button[type=submit]');
    await expect(page.locator('.join-error')).toContainText('at least 8 characters');
    await page.fill('#join-password', PASSWORD);
    await page.click('[data-join-reveal]');
    await expect(page.locator('#join-password')).toHaveAttribute('type', 'text');
    await page.click('button[type=submit]');
    await expect(page.locator('#join-code')).toBeVisible();
    await page.click('[data-join-back]');
    await expect(page.locator('#join-password')).toHaveValue(PASSWORD); // kept when changing details
    await page.click('button[type=submit]');
    await expect(page.locator('#join-code')).toBeVisible();
    await expect(page.locator('[data-join-resend]')).toBeDisabled();
    await page.fill('#join-code', '000000');
    await page.click('button[type=submit]');
    await expect(page.locator('.join-error')).toContainText("isn't right");
    console.log('PASS: one emailed code, resend throttled, wrong code explained');

    await page.fill('#join-code', '123456');
    await page.click('button[type=submit]');
    await expect(page.locator('#account')).toBeVisible();
    await expect(page.locator('#auth')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__previewPasswordSet)).toBe(PASSWORD);
    expect(apiBodies.some((b) => b.includes(PASSWORD))).toBe(false);
    console.log('PASS: the right code signs the member in; the password is saved with Clerk and never sent to our API');

    const fresh = await context.newPage(); // new tab: signed out, nothing remembered
    await fresh.goto(`${origin}/account.html?mode=signin#invite=${'e'.repeat(64)}`);
    await expect(fresh.locator('#auth-title')).toHaveText('Sign in');
    await expect(fresh.locator('#join-email')).toHaveCount(0);
    console.log('PASS: "Sign in" with an existing account skips the join card');
    if (errors.length) throw Error(errors.join('\n'));
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
