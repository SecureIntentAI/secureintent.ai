// Run after preparing dist. All service responses are synthetic; no emails are sent.
const { chromium, expect } = require(process.env.PLAYWRIGHT_MODULE || '../../Secureintent-Extension/node_modules/@playwright/test');
const { spawn } = require('node:child_process');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const port = Number(process.env.BUSINESS_PREVIEW_PORT || 3004);
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.join(__dirname, 'helpers/business-preview.mjs')], {
    env: { ...process.env, BUSINESS_PREVIEW_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let browser;
  try {
    await new Promise((resolve, reject) => {
      server.stdout.once('data', resolve);
      server.once('error', reject);
      server.once('exit', code => reject(Error(`Fixture server exited: ${code}`)));
    });
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(`${origin}/business_promo.html#invite=${'a'.repeat(64)}`);
    await expect(page.locator('#business-activate')).toBeVisible();
    await expect(page).toHaveURL(`${origin}/business_promo.html`);
    await expect(page.locator('#business-description')).toContainText('Northstar Engineering');
    await page.route('**/business-promo/redeem', route => route.fulfill({ status: 403, json: { error: 'invitation_email_mismatch' } }));
    await page.locator('#business-activate').click();
    await expect(page.locator('#business-message')).toContainText('verified business email');
    await page.unroute('**/business-promo/redeem');
    await page.locator('#business-activate').click();
    await expect(page).toHaveURL(`${origin}/team.html#/overview`);
    await expect(page.locator('#console')).toBeVisible();
    await expect(page.locator('#shadow-nav')).toBeVisible();
    const userNav = page.locator('[data-view="people"]');
    await expect(userNav).toContainText('USER');
    await userNav.click();
    await expect(page.locator('#people')).toContainText('Not yet connected');
    await expect(page.locator('#people')).toContainText('Invited');
    await expect(page.locator('#invite-role option')).toHaveCount(1);
    console.log('PASS: email mismatch, activation, USER navigation, member-only invites and truthful connection status');

    await page.locator('#shadow-nav').click();
    await expect(page.locator('#dashboard-shell')).toBeVisible();
    await expect(page.locator('#nav-service-count')).toHaveText('5');
    await expect(page).toHaveURL(`${origin}/team.html#/shadow`);
    await expect(page.locator('iframe')).toHaveCount(0);
    await page.locator('#console-nav [data-view="alerts"]').click();
    await expect(page.locator('#view-alerts')).toBeVisible();
    await expect(page.locator('#view-shadow')).toBeHidden();
    await page.goBack();
    await expect(page.locator('#view-shadow')).toBeVisible();
    await page.reload();
    await expect(page).toHaveURL(`${origin}/team.html#/shadow`);
    await expect(page.locator('#dashboard-shell')).toBeVisible();
    await expect(page.locator('[data-team-intro]')).toHaveCount(0);

    // Scroll a long view, then switch to short views: only the content pane
    // resets, and the navigation stays at the same screen coordinates.
    for (const viewport of [{width:1440,height:1000}, {width:390,height:844}]) {
      await page.setViewportSize(viewport);
      const navY = await page.locator('#console-nav').evaluate(el => el.getBoundingClientRect().y);
      await page.locator('#console > .content').evaluate(el => { el.scrollTop = 450; });
      await expect.poll(() => page.locator('#console > .content').evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      for (const view of ['people', 'policy', 'alerts', 'shadow']) {
        await page.locator(`#console-nav [data-view="${view}"]`).click();
        await expect(page.locator(`#view-${view}`)).toBeVisible();
        await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
        await expect.poll(() => page.locator('#console > .content').evaluate(el => el.scrollTop)).toBe(0);
        const currentY = await page.locator('#console-nav').evaluate(el => el.getBoundingClientRect().y);
        if (Math.abs(currentY - navY) > 1) throw Error('Navigation moved when switching views');
      }
    }
    await page.setViewportSize({width:1440,height:1000});
    console.log('PASS: stable navigation and content-only scrolling on desktop and mobile');

    await page.locator('#export-button').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-pdf').click();
    const download = await downloadPromise;
    const pdf = await readFile(await download.path(), 'latin1');
    for (const text of ['%PDF-', 'Maya Chen', 'maya@northstar.example', 'Northstar Engineering']) {
      if (!pdf.includes(text)) throw Error(`Missing PDF field: ${text}`);
    }
    await page.screenshot({ path: '/tmp/business-shadow-onboarding.png', fullPage: true });
    console.log('PASS: existing Shadow AI dashboard and PDF organization/admin identity');

    await page.route('**/v1/shadow/admin/**', route => route.fulfill({ status: 403, json: { error: 'business_promo_required' } }));
    await page.goto(`${origin}/shadow.html?preview=policy`);
    await expect(page).toHaveURL(`${origin}/team.html#/shadow`);
    await expect(page.locator('#shadow-root #gate-title')).toHaveText('Business admin access required');
    await expect(page.locator('#dashboard-shell')).toBeHidden();
    await page.route('**/v1/team', route => route.fulfill({ json: { team: { role: 'org:member', name: 'Northstar', seats: 150 } } }));
    await page.goto(`${origin}/team.html`);
    await expect(page.locator('#gate-sub')).toContainText('Developer Pro');
    await expect(page.locator('#console')).toBeHidden();
    await expect(page.locator('#shadow-nav')).toBeHidden();
    await page.route('**/v1/team', route => route.fulfill({ json: { team: null, grantSeats: 0 } }));
    await page.reload();
    await expect(page.locator('#gate-title')).toHaveText('Business invitation required');
    await expect(page.locator('#console')).toBeHidden();
    console.log('PASS: members and uninvited accounts cannot view the console; preview query cannot bypass access');

    await page.goto(`${origin}/lifetime_promo.html?offer=business`);
    await expect(page).toHaveURL(`${origin}/business_promo.html`);
    await expect(page.locator('#business-description')).toContainText('Open the Business invitation');
    await page.route('**/mock-clerk.js', route => route.fulfill({ contentType: 'text/javascript', body:
      'window.Clerk={user:null,session:null,load:async()=>{},addListener:()=>{},mountSignIn:el=>{el.textContent="Sign in fixture"},mountSignUp:el=>{el.textContent="Invitation sign up fixture"}};' }));
    await page.goto(`${origin}/account.html?joined=1&__clerk_status=sign_up&__clerk_ticket=synthetic-fixture`);
    await expect(page.locator('#clerk-auth')).toHaveText('Invitation sign up fixture');
    await page.evaluate(() => { window.SI_IS_PROD = true; });
    await page.addScriptTag({ url: `${origin}/integrations/site.js?privacy-check=1` });
    await expect(page.locator('script[src*="googletagmanager"]')).toHaveCount(0);
    console.log('PASS: invitation signup component and private-page analytics exclusion');
    if (errors.length) throw Error(errors.join('\n'));
    console.log('PASS: public Business offer redirects to invitation-only onboarding; no browser errors');
  } finally {
    await browser?.close();
    server.kill('SIGTERM');
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
