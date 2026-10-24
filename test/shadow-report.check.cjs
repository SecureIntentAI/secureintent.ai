/**
 * CTO "last bugs" (lastbug.docx), fixture API:
 * 1. "Higher-risk destinations" is named for what it counts: AI tools needing review.
 * 2. Activity is one bar per day with labelled axes and outcome colours (screen and PDF).
 * 3. The DLP ledger shows the member's name only, no seat number.
 * 4. Desktop app data: the ledger's Source column, and "AI on members' computers"
 *    by member and by tool; hidden for a pilot (available: false) or an older API (404).
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

    await expect(page.locator('.ledger-table thead')).toContainText('Source');
    await expect(page.locator('#ledger-subtitle')).toContainText('the browser and the desktop app');
    const desktopRow = page.locator('#ledger-body tr', { hasText: 'AWS access key' });
    await expect(desktopRow.locator('td').nth(2)).toHaveText('Desktop app');
    await expect(desktopRow.locator('td').nth(3)).toHaveText('Copied in Visual Studio Code (desktop)');
    await expect(desktopRow.locator('td').nth(5)).toHaveText('Redacted on the desktop');
    await expect(desktopRow.locator('td').nth(1)).toHaveText('lee');
    // No source (older API) is the browser.
    await expect(page.locator('#ledger-body tr', { hasText: 'High-entropy token' }).locator('td').nth(2)).toHaveText('Browser');
    await expect(page.locator('#timeline')).toContainText('Copied in Visual Studio Code (desktop)');
    console.log('PASS: 4a. ledger Source column; desktop rows show the app and the desktop resolution');

    const desktop = page.locator('#desktop');
    await expect(desktop).toBeVisible();
    await expect(desktop.locator('h2')).toHaveText("AI on members' computers");
    await expect(page.locator('#desktop-summary')).toContainText('2Members with the desktop app');
    await expect(page.locator('#desktop-summary')).toContainText('4Desktop catches');
    const sam = page.locator('#desktop-table tbody tr', { hasText: 'sam' });
    await expect(sam.locator('td').nth(1)).toContainText('macOS · desktop 0.2.12');
    await expect(sam.locator('td').nth(1)).toContainText('2 computers');
    await expect(sam.locator('td').nth(2)).toHaveText('Ollama');
    await expect(sam.locator('td').nth(3)).toHaveText('GitHub Copilot');
    await expect(sam.locator('td').nth(4)).toHaveText('Cursor');
    await expect(sam.locator('td').nth(5)).toHaveText('3');
    await expect(page.locator('#desktop-table tbody tr', { hasText: 'lee' }).locator('td').nth(4)).toHaveText('None');
    await page.click('[data-desktop-view="tools"]');
    await expect(page.locator('[data-desktop-view="tools"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#desktop-table thead')).toContainText('Kind');
    await expect(page.locator('#desktop-table tbody tr')).toHaveCount(5);
    const lmStudio = page.locator('#desktop-table tbody tr', { hasText: 'LM Studio' });
    await expect(lmStudio.locator('td').nth(1)).toHaveText('Local AI model');
    await expect(lmStudio.locator('td').nth(2)).toHaveText('lee');
    console.log('PASS: 4b. AI on members\' computers renders by member and by tool');

    await page.locator('#export-button').click();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-pdf').click();
    const pdf = await readFile(await (await downloadPromise).path(), 'latin1');
    for (const text of ['AI tools needing review', 'Activity per day', 'Paste attempts per day', 'Day \\(UTC\\)', 'Blocked 3', 'Member',
      '(Source)', '(Desktop app)', '(Copied in Visual Studio', '(Redacted on the desktop)', "AI on members' computers", '(LM Studio)', '(Local AI model)']) {
      if (!pdf.includes(text)) throw Error(`PDF is missing: ${text}`);
    }
    for (const text of ['Higher-risk destinations', '(Seat)', 'Warning bypassed']) {
      if (pdf.includes(text)) throw Error(`PDF still contains: ${text}`);
    }
    console.log('PASS: PDF carries the renamed card, daily charts with axes, the Member and Source columns and the desktop table');

    await page.locator('#export-button').click();
    const jsonDownload = page.waitForEvent('download');
    await page.locator('#export-json').click();
    const exported = JSON.parse(await readFile(await (await jsonDownload).path(), 'utf8'));
    expect(exported.desktop.available).toBe(true);
    expect(exported.desktop.tools).toHaveLength(5);
    console.log('PASS: JSON export carries the desktop data');

    // The section follows "Report for" and the period, and is hidden for a
    // pilot (available: false), an older API (404) or a failure, without an error.
    const scoped = await context.newPage();
    const desktopBodies = [];
    await scoped.route('**/mock-api/v1/shadow/admin/desktop', (route) => {
      const body = route.request().postDataJSON();
      desktopBodies.push(body);
      // Team-controlled names must stay text.
      const evil = '<img src=x onerror="window.xss=1">';
      if (body.seatNumber === 3) return route.fulfill({ json: { available: false, reason: 'pilot' } });
      return route.fulfill({ json: { available: true, summary: { membersWithDesktop: 1 },
        members: [{ seatNumber: 7, name: evil, email: '', devices: [{ os: evil, appVersion: evil, lastSeen: Date.now() }], tools: [{ name: evil, kind: 'local_model' }], catches: 0, lastSeen: Date.now() }],
        tools: [{ name: evil, kind: 'local_model', seatNumbers: [7], memberCount: 1 }] } });
    });
    await scoped.goto(`${origin}/team.html#/overview`);
    await scoped.locator('#console-nav [data-view="shadow"]').click();
    await expect(scoped.locator('#desktop-table')).toContainText('<img', { timeout: 15000 });
    expect(await scoped.locator('#desktop img').count()).toBe(0);
    expect(await scoped.evaluate(() => window.xss)).toBeUndefined();
    expect(desktopBodies[0]).toEqual({ days: 30 });
    await scoped.locator('#shadow-root #period').selectOption('7');
    await expect.poll(() => desktopBodies.at(-1)).toEqual({ days: 7 });
    await scoped.locator('#shadow-root #report-seat').selectOption('3');
    await expect.poll(() => desktopBodies.at(-1)).toEqual({ days: 7, seatNumber: 3 });
    await expect(scoped.locator('#ledger-body')).toContainText('AWS access key');
    await expect(scoped.locator('#desktop')).toBeHidden();
    await expect(scoped.locator('#error')).toBeHidden();
    console.log('PASS: 4c. desktop data follows Report for and the period; hidden for available: false; names stay text');

    const empty = await context.newPage();
    await empty.route('**/mock-api/v1/shadow/admin/desktop', (route) => route.fulfill({ json: { available: true, summary: {}, members: [], tools: [] } }));
    await empty.goto(`${origin}/team.html#/overview`);
    await empty.locator('#console-nav [data-view="shadow"]').click();
    await expect(empty.locator('#desktop-empty')).toHaveText('No desktop app data yet. Members appear here once they sign in to the SecureIntent desktop app.', { timeout: 15000 });
    await expect(empty.locator('#desktop-table')).toBeHidden();
    await expect(empty.locator('#desktop-views')).toBeHidden();
    console.log('PASS: 4d. empty state when no member has desktop data');

    const old = await context.newPage();
    let desktopCalls = 0;
    await old.route('**/mock-api/v1/shadow/admin/desktop', (route) => { desktopCalls++; return route.fulfill({ status: 404, json: { error: 'not_found' } }); });
    await old.goto(`${origin}/team.html#/overview`);
    await old.locator('#console-nav [data-view="shadow"]').click();
    await expect(old.locator('#chart svg')).toBeVisible({ timeout: 15000 });
    await old.locator('#shadow-root #refresh').click();
    await expect(old.locator('#ledger-body')).toContainText('AWS access key');
    await expect(old.locator('#desktop')).toBeHidden();
    await expect(old.locator('#error')).toBeHidden();
    expect(desktopCalls).toBe(1);
    console.log('PASS: 4e. an API without the desktop endpoint (404) hides the section and is not asked again');

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
