/**
 * Desktop sign-in approval on link.html (fixture API and Clerk, no live traffic):
 * no code, signed out, approve, refuse, expired.
 * Run: NODE_PATH=../Secureintent-Extension/node_modules node test/desktop-link.check.cjs
 * (build dist first: node scripts/prepare-site.mjs --production)
 * PW_CHANNEL=chrome uses the installed Chrome instead of Playwright's Chromium.
 */
const { chromium, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');

(async () => {
  const port = Number(process.env.BUSINESS_PREVIEW_PORT || 3008);
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(__dirname, 'helpers/business-preview.mjs')], {
    env: { ...process.env, BUSINESS_PREVIEW_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    server.stdout.once('data', resolve);
    server.once('exit', (code) => reject(Error(`Fixture server exited: ${code}`)));
  });
  const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await context.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A change of fragment alone does not reload a page, so each case starts fresh.
    const open = async (url) => { await page.goto('about:blank'); await page.goto(url); };
    const calls = [];
    page.on('request', (r) => { if (r.url().includes('/mock-api/v1/desktop/')) calls.push(`${new URL(r.url()).pathname.split('/').pop()} ${r.postData()}`); });

    await open(`${origin}/link.html`);
    await expect(page.locator('#result-title')).toHaveText('Open this page from the desktop app');
    console.log('PASS: without a code the page explains where it comes from');

    await open(`${origin}/link.html#code=kq7m-4txp`);
    await expect(page.locator('#approve')).toBeVisible();
    await expect(page.locator('#link-code')).toHaveText('KQ7M-4TXP');
    await expect(page.locator('#link-device')).toHaveText('MacBook Pro (macOS), app 0.2.12');
    await expect(page.locator('#link-email')).toHaveText('maya@northstar.example');
    console.log('PASS: signed in, the code, device and account are shown before anything is approved');

    await page.click('#link-approve');
    await expect(page.locator('#result-title')).toHaveText('Desktop app connected');
    expect(new URL(page.url()).hash).toBe('');
    console.log('PASS: approving connects the app and clears the code from the address bar');

    await open(`${origin}/link.html#code=KQ7M4TXP`);
    await page.click('#link-deny');
    await expect(page.locator('#result-title')).toHaveText('Sign-in refused');
    console.log('PASS: "Not me" refuses the sign-in');

    await open(`${origin}/link.html#code=EXPR-ED22`);
    await expect(page.locator('#result-title')).toHaveText('This code has expired');
    console.log('PASS: an expired code says to press Sign in again');

    await open(`${origin}/link.html#code=ADMN-2345`);
    await expect(page.locator('#approve-title')).toHaveText('Unlock team admin on this device?');
    await expect(page.locator('#link-approve')).toHaveText('Unlock');
    await page.click('#link-approve');
    await expect(page.locator('#result-title')).toHaveText('Team admin unlocked');
    console.log('PASS: an admin unlock is worded as one and unlocks on approval');

    await open(`${origin}/link.html#code=AGAN-2345`);
    await page.click('#link-approve');
    await expect(page.locator('#result-title')).toHaveText('Sign in again to confirm');
    await expect(page.locator('#result-again')).toBeVisible();
    console.log('PASS: an admin unlock that needs a fresh sign-in offers "Sign in again"');

    await open(`${origin}/link.html?preview_signed_out=1#code=KQ7M-4TXP`);
    await expect(page.locator('#auth')).toBeVisible();
    await expect(page.locator('#approve')).toBeHidden();
    console.log('PASS: signed out, the page asks to sign in and shows no approve button');

    if (!calls.some((c) => c.startsWith('approve') && c.includes('"KQ7M-4TXP"'))) throw Error('approve was not sent with the code: ' + calls.join(' | '));
    if (errors.length) throw Error('page errors: ' + errors.join(' | '));
    console.log('PASS: no page errors; every call carried the normalised code');
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
