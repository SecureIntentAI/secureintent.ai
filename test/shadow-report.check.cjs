/**
 * CTO "last bugs" (lastbug.docx), fixture API:
 * 1. "Higher-risk destinations" is named for what it counts: AI tools needing review.
 * 2. Activity is one bar per day with labelled axes and outcome colours (screen and PDF).
 * 3. The DLP ledger shows the member's name only, no seat number.
 * Run: NODE_PATH=../Secureintent-Extension/node_modules node test/shadow-report.check.cjs
 */
const { chromium, expect } = require('@playwright/test');
const { spawn } = require('node:child_process');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

(async () => {
  const port = Number(process.env.BUSINESS_PREVIEW_PORT || 3009);
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
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    await context.route('**/*', (r) => (new URL(r.request().url()).origin === origin ? r.continue() : r.abort()));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${origin}/team.html#/overview`);
    await page.locator('#console-nav [data-view="shadow"]').click();
    await expect(page.locator('#chart svg')).toBeVisible({ timeout: 15000 });

    await expect(page.locator('.attention-strip p > span')).toContainText('of 5 AI tools need review');
    await expect(page.locator('.attention-strip')).not.toContainText('higher-risk');
    console.log('PASS: 1. review count is named for what it counts');

    await expect(page.locator('#chart .chart-day')).toHaveCount(30);
    await expect(page.locator('#chart')).toContainText('Day (UTC)');
    await expect(page.locator('#chart')).toContainText('Visits');
    await page.click('[data-chart="pastes"]');
    await expect(page.locator('#chart')).toContainText('Paste attempts');
    await expect(page.locator('.chart-topline .legend')).toContainText('Blocked 3');
    await expect(page.locator('.chart-topline .legend')).toContainText('Pasted anyway 1');
    await expect(page.locator('#chart .chart-segment').first()).toBeVisible();
    await expect(page.locator('#chart-caption')).toContainText('Busiest day');
    console.log('PASS: 2. one bar per day, labelled axes, outcome colours and legend on screen');

    await expect(page.locator('.ledger-table thead')).toContainText('Member');
    await expect(page.locator('.ledger-table thead')).not.toContainText('Seat');
    expect(await page.locator('#ledger-body').innerText()).not.toMatch(/Seat \d/);
    expect((await page.locator('#report-seat option').allInnerTexts()).join(' ')).not.toMatch(/Seat \d/);
    console.log('PASS: 3. ledger and member filter show names only');

    await page.locator('#export-button').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-pdf').click();
    const pdf = await readFile(await (await downloadPromise).path(), 'latin1');
    for (const text of ['AI tools needing review', 'Activity per day', 'Paste attempts per day', 'Day \\(UTC\\)', 'Blocked 3', 'Member']) {
      if (!pdf.includes(text)) throw Error(`PDF is missing: ${text}`);
    }
    for (const text of ['Higher-risk destinations', '(Seat)', 'Warning bypassed']) {
      if (pdf.includes(text)) throw Error(`PDF still contains: ${text}`);
    }
    console.log('PASS: PDF carries the renamed card, daily charts with axes and the Member column');

    // A member who joins while the admin's page is open: the first seat list
    // lacks them, then their activity arrives. They must show by name, not
    // as "Former member".
    const late = await context.newPage();
    let seatCalls = 0;
    await late.route('**/mock-api/v1/shadow/admin/seats', (route) => {
      seatCalls++;
      const seats = [{ seatNumber: 1, name: 'Julian Marton', email: 'julian.m@northstar.example' }];
      if (seatCalls > 1) seats.push({ seatNumber: 2, name: 'Kaushik Raj', email: 'kaushik.raj@northstar.example' });
      return route.fulfill({ json: { seats } });
    });
    await late.route('**/mock-api/v1/shadow/admin/ledger', (route) => route.fulfill({ json: {
      total: 1, nextOffset: null,
      events: [{ eventId: 'e1', timestamp: Date.now(), seatNumber: 2, seat: 'Seat 2', hostname: 'chatgpt.com',
        serviceId: 'chatgpt', reason: 'OpenAI API key', action: 'blocked', findingCount: 1 }],
    } }));
    await late.goto(`${origin}/team.html#/overview`);
    await late.locator('#console-nav [data-view="shadow"]').click();
    await expect(late.locator('#ledger-body')).toContainText('kaushik.raj', { timeout: 15000 });
    await expect(late.locator('#ledger-body')).not.toContainText('Former member');
    expect(seatCalls).toBe(2);
    console.log('PASS: a member who joined after the page opened shows by name, not "Former member"');
    if (errors.length) throw Error(errors.join('\n'));
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
