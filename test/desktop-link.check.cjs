/**
 * Desktop sign-in approval on link.html (fixture API and Clerk, no live traffic):
 * the code is typed, never taken from the link; approve, refuse, wrong and expired
 * codes, admin unlock, signed out, and sign-up staying on the page.
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
    const open = async (url) => { await page.goto('about:blank'); await page.goto(url); };
    const calls = [];
    page.on('request', (r) => { if (r.url().includes('/mock-api/v1/desktop/')) calls.push(`${new URL(r.url()).pathname.split('/').pop()} ${r.postData()}`); });
    const enter = async (code) => { await page.fill('#code-input', ''); await page.type('#code-input', code); await page.click('#code-continue'); };

    // An attacker's link with their code: the code is ignored, nothing is looked up.
    await open(`${origin}/link.html#code=KQ7M-4TXP`);
    await expect(page.locator('#enter')).toBeVisible();
    await expect(page.locator('#code-input')).toHaveValue('');
    await expect(page.locator('#approve')).toBeHidden();
    expect(new URL(page.url()).hash).toBe('');
    if (calls.length) throw Error('a code from the link was looked up: ' + calls.join(' | '));
    await expect(page.locator('#code-help')).toContainText('Never enter a code someone sent you');
    console.log('PASS: a code in the link is ignored and dropped; the person must type it');

    await enter('kq7m4txp');
    await expect(page.locator('#approve')).toBeVisible();
    await expect(page.locator('#link-code')).toHaveText('KQ7M-4TXP');
    await expect(page.locator('#link-device')).toHaveText('MacBook Pro (macOS), app 0.2.12');
    await expect(page.locator('#approve .link-note')).toHaveText('(as reported by the app)');
    await expect(page.locator('#link-started')).toHaveText('2 minutes ago from Pakistan');
    await expect(page.locator('#link-email')).toHaveText('maya@northstar.example');
    await expect(page.locator('#approve-warning')).toHaveText('Only approve if you just pressed Sign in in SecureIntent desktop.');
    console.log('PASS: the typed code is formatted; device (as reported), age, place and account shown before approving');

    await page.click('#link-approve');
    await expect(page.locator('#result-title')).toHaveText('Desktop app connected');
    console.log('PASS: approving connects the app');

    await open(`${origin}/link.html`);
    await enter('KQ7M-4TXP');
    await page.click('#link-deny');
    await expect(page.locator('#result-title')).toHaveText('Sign-in refused');
    console.log('PASS: "Not me" refuses the sign-in');

    await open(`${origin}/link.html`);
    await enter('ABC');
    await expect(page.locator('#code-error')).toContainText('8-character code');
    await enter('WRNG-2345');
    await expect(page.locator('#code-error')).toContainText('That code is not right');
    await expect(page.locator('#enter')).toBeVisible();
    await enter('EXPR-ED22');
    await expect(page.locator('#code-error')).toContainText('This code has expired');
    console.log('PASS: short, wrong and expired codes are explained next to the field, to try again');

    await open(`${origin}/link.html`);
    await enter('ADMN-2345');
    await expect(page.locator('#approve-title')).toHaveText('Unlock team admin on this device?');
    await expect(page.locator('#link-approve')).toHaveText('Unlock');
    await page.click('#link-approve');
    await expect(page.locator('#result-title')).toHaveText('Team admin unlocked');
    console.log('PASS: an admin unlock is worded as one and unlocks on approval');

    await open(`${origin}/link.html`);
    await enter('AGAN-2345');
    await page.click('#link-approve');
    await expect(page.locator('#result-title')).toHaveText('Sign in again to confirm');
    await expect(page.locator('#result-again')).toBeVisible();
    console.log('PASS: an admin unlock that needs a fresh sign-in offers "Sign in again"');

    await open(`${origin}/link.html?preview_signed_out=1`);
    await expect(page.locator('#auth')).toBeVisible();
    await expect(page.locator('#enter')).toBeHidden();
    await expect(page.locator('#approve')).toBeHidden();
    console.log('PASS: signed out, the page asks to sign in and shows no code field or approve button');

    if (!calls.some((c) => c.startsWith('approve') && c.includes('"KQ7M-4TXP"'))) throw Error('approve was not sent with the typed code: ' + calls.join(' | '));
    if (errors.length) throw Error('page errors: ' + errors.join(' | '));
    console.log('PASS: no page errors; every call carried the typed, normalised code');
  } finally {
    await browser.close();
    server.kill();
  }
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
