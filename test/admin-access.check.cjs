/**
 * Admin console access for an admin who is already signed in (fixture API):
 * no pass yet -> a silent check opens the console; no sign-out, no prompt.
 * If the server says a new sign-in is needed (over 12 hours), a button is
 * shown and nothing signs the admin out on its own.
 * Run: NODE_PATH=../Secureintent-Extension/node_modules node test/admin-access.check.cjs
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
  const browser = await chromium.launch();
  try {
    for (const unlockAnswer of ['granted', 'sign-in-again']) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      await context.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      // Signed in two hours ago; record any sign-out.
      await page.addInitScript(() => {
        // Counted in sessionStorage so a sign-out followed by a reload still shows.
        const bump = () => sessionStorage.setItem('test-signouts', String(Number(sessionStorage.getItem('test-signouts') || 0) + 1));
        const created = new Date(Date.now() - 2 * 60 * 60_000);
        const watch = setInterval(() => {
          if (!window.Clerk?.session || window.Clerk.__patched) return;
          window.Clerk.__patched = true;
          window.Clerk.session.createdAt = created;
          window.Clerk.signOut = async () => { bump(); };
          clearInterval(watch);
        }, 0);
      });
      let unlocks = 0;
      const navigations = [];
      page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations.push(frame.url()); });
      // Like the server: admin requests need the pass header.
      await page.route('**/mock-api/v1/team**', async (route) => {
        if (route.request().headers()['x-si-admin-access']) return route.fallback();
        return route.fulfill({ status: 401, json: { error: 'admin_reauthentication_required' } });
      });
      await page.route('**/mock-api/v1/business-access/unlock/clerk', (route) => {
        unlocks++;
        return unlockAnswer === 'granted'
          ? route.fulfill({ json: { accessToken: 'b'.repeat(64), expiresAt: Date.now() + 30 * 60_000, orgId: 'org_demo_northstar' } })
          : route.fulfill({ status: 401, json: { error: 'clerk_verification_required' } });
      });
      await page.goto(`${origin}/team.html#/overview`);
      if (unlockAnswer === 'granted') {
        await expect(page.locator('#console')).toBeVisible({ timeout: 10000 });
        expect(await page.evaluate(() => Number(sessionStorage.getItem('test-signouts') || 0))).toBe(0);
        expect(navigations.some((u) => u.includes('admin_verify'))).toBe(false);
        console.log(`PASS: signed in 2 h ago, no pass: console opens silently (${unlocks} check), no sign-out`);
      } else {
        await expect(page.locator('#admin-clerk-verify')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#admin-clerk-status')).toContainText('once every 12 hours');
        await page.waitForTimeout(1500);
        expect(await page.evaluate(() => Number(sessionStorage.getItem('test-signouts') || 0))).toBe(0);
        expect(navigations.some((u) => u.includes('admin_verify'))).toBe(false);
        console.log('PASS: server asks for a new sign-in: a button and the 12-hour reason, nobody signed out automatically');
      }
      if (errors.length) throw Error(errors.join('\n'));
      await context.close();
    }
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
