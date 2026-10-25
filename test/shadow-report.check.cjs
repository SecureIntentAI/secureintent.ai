/**
 * CTO "last bugs" (lastbug.docx), fixture API:
 * 1. "Higher-risk destinations" is named for what it counts: AI tools needing review.
 * 2. Activity is one bar per day with labelled axes and outcome colours (screen and PDF).
 * 3. The DLP ledger shows the member's name only, no seat number.
 * 4. Desktop app data: the ledger's Source column, and "AI on members' computers"
 *    by member and by tool; hidden for a pilot (available: false) or an older API (404).
 * 5. Desktop AI tools in the existing sections: inventory cards, the Desktop filter,
 *    the Discovered services subtitle, review progress and queue, the service dialog
 *    (classification only for a desktop-only tool), the Desktop catches chart, the
 *    member report and both exports. Without the new fields the page is unchanged.
 * 6. Severity (OCSF severityId on ledger events): a badge in the ledger and Recent
 *    activity, a Severity column and a count line in the PDF; none without it.
 * 7. Destination status (Approved / Recognised / Not approved) beside a ledger
 *    event's destination, on screen and as a second line in the PDF; the severity
 *    mapping line; inventory cells wrap instead of being cut.
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

    await expect(page.locator('.attention-strip p > span')).toContainText('of 7 AI tools need review');
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

    // 5a. Inventory: desktop-only cards, the "Web + desktop app" badge, the Desktop filter and search.
    await expect(page.locator('#service-grid .service-card')).toHaveCount(7);
    const ollamaCard = page.locator('#service-grid .service-card', { hasText: 'Ollama' });
    await expect(ollamaCard.locator('.service-domain')).toHaveText('Local AI model');
    await expect(ollamaCard.locator('.service-meta')).toContainText('1 member · last seen');
    await expect(ollamaCard.locator('.badge')).toHaveText(['Needs review', 'Desktop']);
    await expect(ollamaCard).not.toContainText('visits');
    const claudeCard = page.locator('#service-grid .service-card', { hasText: 'Claude' });
    await expect(claudeCard.locator('.service-meta')).toContainText('2 on desktop');
    await expect(claudeCard.locator('.badge')).toHaveText(['Recognised', 'Web + desktop app']);
    await expect(page.locator('#service-grid .service-card', { hasText: 'ChatGPT' }).locator('.service-badges')).toHaveCount(0);
    await expect(page.locator('#desktop-filter')).toBeVisible();
    await expect(page.locator('#desktop-filter-count')).toHaveText('3');
    await page.click('[data-service-filter="desktop"]');
    await expect(page.locator('#service-grid .service-card strong')).toHaveText(['Claude', 'Ollama', 'LM Studio']);
    await page.click('[data-service-filter="all"]');
    await page.locator('#service-search').fill('local ai model');
    await expect(page.locator('#service-grid .service-card strong')).toHaveText(['Ollama', 'LM Studio']);
    await page.locator('#service-search').fill('');
    await expect(page.locator('#service-grid .service-card')).toHaveCount(7);
    console.log('PASS: 5a. inventory shows desktop-only cards, the web + desktop badge, a Desktop filter and searches them');

    // 5b. Discovered services: the desktop-only count; the other cards are unchanged.
    const discovered = page.locator('#metrics .metric').first();
    await expect(discovered.locator('strong')).toHaveText('7');
    await expect(discovered.locator('.metric-note')).toHaveText('2 sanctioned · 3 unsanctioned · 2 desktop only');
    await expect(page.locator('#metrics .metric').nth(2).locator('strong')).toHaveText('61.1%');
    // Review progress: desktop-only tools count, with "desktop" in place of a visits share.
    await expect(page.locator('#progress-headline')).toHaveText('4 of 7 AI services reviewed.');
    await expect(page.locator('#review-legend li', { hasText: 'Needs review' }).locator('small')).toHaveText(/^\d+% of visits · 1 desktop$/);
    await expect(page.locator('#review-legend li', { hasText: 'Recognised' }).locator('small')).toHaveText(/^\d+% of visits · 1 desktop$/);
    await expect(page.locator('#review-rules')).toContainText('5 normal');
    console.log('PASS: 5b. Discovered services subtitle and review progress count desktop-only tools accurately');

    // 5c. Review queue, List and Board.
    const ollamaRow = page.locator('#review-list tbody tr', { hasText: 'Ollama' });
    await expect(ollamaRow.locator('small')).toHaveText('Local AI model · Desktop');
    await expect(ollamaRow.locator('td').nth(1)).toHaveText('Not applied on desktop');
    await expect(ollamaRow.locator('td').nth(2)).toHaveText('1 member');
    const chatRow = page.locator('#review-list tbody tr', { hasText: 'ChatGPT' });
    await expect(chatRow.locator('td').nth(1)).toHaveText('Normal protection');
    await expect(chatRow.locator('td').nth(2)).toHaveText('189 visits');
    await expect(page.locator('#queue-summary')).toHaveText('Showing 7 of 7 service reviews');
    await page.click('[data-view="board"]');
    const ollamaTask = page.locator('#review-board .board-task', { hasText: 'Ollama' });
    await expect(ollamaTask).toContainText('Not applied on desktop');
    await expect(ollamaTask).toContainText('1 member');
    await page.click('[data-view="list"]');
    console.log('PASS: 5c. review queue lists desktop-only tools with member counts and no paste rule');

    // 5d. Desktop catches chart.
    await expect(page.locator('[data-chart="desktop"]')).toBeVisible();
    await page.click('[data-chart="desktop"]');
    await expect(page.locator('#chart-total')).toHaveText('4');
    await expect(page.locator('#chart-unit')).toHaveText('desktop catches');
    await expect(page.locator('#chart')).toContainText('Desktop catches');
    await expect(page.locator('#chart-caption')).toContainText('the desktop app caught when it was copied');
    await page.click('[data-chart="visits"]');
    await expect(page.locator('#chart-unit')).toHaveText('observed visits');
    console.log('PASS: 5d. Desktop catches chart toggle');

    // 5e. A web service also on desktop: one line in its dialog; desktop rows in its seats list.
    await claudeCard.click();
    await expect(page.locator('#detail-content .dialog-desktop-note')).toHaveText('Also on desktop: 2 members (AI desktop app / AI editor extension)');
    await expect(page.locator('#detail-content input[name="pasteMode"]')).toHaveCount(3);
    await page.click('#detail-content [data-drill="seats"]');
    await expect(page.locator('#detail-content .drill-row', { hasText: 'sam' })).toContainText('On their computer (desktop app)');
    await page.click('#detail-content [data-close-dialog]');
    console.log('PASS: 5e. web service dialog notes desktop members; seats list shows desktop rows');

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
      '(Source)', '(Desktop app)', '(Copied in Visual Studio', '(Redacted on the desktop)', "AI on members' computers", '(LM Studio)', '(Local AI model)',
      '(Desktop: local AI model)', '(Not applied on desktop)', '(Desktop catches per day)', 'found only by the desktop app']) {
      if (!pdf.includes(text)) throw Error(`PDF is missing: ${text}`);
    }
    for (const text of ['Higher-risk destinations', '(Seat)', 'Warning bypassed']) {
      if (pdf.includes(text)) throw Error(`PDF still contains: ${text}`);
    }
    console.log('PASS: PDF carries the renamed card, daily charts with axes, the Member and Source columns and the desktop table');

    // 6. Severity: a badge per rated row on screen; a column and a count line in the PDF.
    await expect(desktopRow.locator('td').nth(4)).toHaveText('CriticalAWS access key');
    await expect(desktopRow.locator('.badge.sev')).toHaveClass(/sev-5/);
    await expect(page.locator('#ledger-body tr', { hasText: 'OpenAI API key' }).locator('.badge.sev')).toHaveText('High');
    await expect(page.locator('#ledger-body tr', { hasText: 'Email address' }).locator('.badge.sev')).toHaveText('Medium');
    await expect(page.locator('#ledger-body tr', { hasText: 'High-entropy token' }).locator('.badge.sev')).toHaveCount(0);
    await expect(page.locator('#timeline .badge.sev')).toHaveText(['High', 'Critical', 'Medium']);
    for (const text of ['(Severity)', '(By severity: Critical 1 | High 1 | Medium 1 | Low 0)', '(Critical)', '(Medium)']) {
      if (!pdf.includes(text)) throw Error(`PDF is missing: ${text}`);
    }
    console.log('PASS: 6. severity badges in the ledger and Recent activity; Severity column and count line in the PDF');

    // 7. Destination status: beside the destination; nothing for a desktop catch or an older row.
    await expect(page.locator('#ledger-body tr', { hasText: 'OpenAI API key' }).locator('.dest-status')).toHaveText('Recognised');
    await expect(page.locator('#ledger-body tr', { hasText: 'Email address' }).locator('td').nth(3)).toContainText('chat.deepseek.com Not approved');
    await expect(desktopRow.locator('.dest-status')).toHaveCount(0);
    await expect(page.locator('#ledger-body tr', { hasText: 'High-entropy token' }).locator('.dest-status')).toHaveCount(0);
    await expect(page.locator('#timeline .dest-status')).toHaveText(['Recognised', 'Not approved']);
    for (const text of ['(chat.deepseek.com)', '(Not approved)', '(Severity levels map to OCSF, PCI DSS', '(claude.ai)', '(+ desktop app)']) {
      if (!pdf.includes(text)) throw Error(`PDF is missing: ${text}`);
    }
    for (const text of ['ompliant', 'deskto...', '(claude.ai + desktop']) if (pdf.includes(text)) throw Error(`PDF contains: ${text}`);
    console.log('PASS: 7. destination status on screen and in the PDF; the mapping line; the hostname wraps instead of being cut');

    await page.locator('#export-button').click();
    const jsonDownload = page.waitForEvent('download');
    await page.locator('#export-json').click();
    const exported = JSON.parse(await readFile(await (await jsonDownload).path(), 'utf8'));
    expect(exported.desktop.available).toBe(true);
    expect(exported.desktop.tools).toHaveLength(5);
    expect(exported.desktopTrends).toHaveLength(30);
    expect(exported.summary.desktopOnlyTools).toBe(2);
    expect(exported.tools.find((tool) => tool.serviceId === 'desktop-ollama')).toMatchObject({ source: 'desktop', kind: 'local_model' });
    console.log('PASS: JSON export carries the desktop data, desktop-only tools and desktop trends');

    // 5f. A desktop-only tool's dialog: kind, members, first and last seen, and a
    // classification saved without a paste mode.
    await ollamaCard.click();
    const dialog = page.locator('#detail-content');
    await expect(dialog.locator('.dialog-subtitle')).toHaveText('Local AI model · Desktop · Team classification');
    await expect(dialog.locator('.dialog-meta')).toContainText('Members who have it1 membersam');
    await expect(dialog.locator('.dialog-meta div', { hasText: 'First seen' }).locator('dd')).not.toHaveText('Not available');
    await expect(dialog.locator('input[name="pasteMode"]')).toHaveCount(0);
    await expect(dialog).toContainText('Paste rules apply in the browser');
    await dialog.locator('select[name="classification"]').selectOption('sanctioned');
    const policyRequest = page.waitForRequest((request) => request.url().endsWith('/v1/shadow/admin/policy'));
    await dialog.locator('#save-policy').click();
    const sent = (await policyRequest).postDataJSON();
    expect(Object.keys(sent).sort()).toEqual(['classification', 'expectedVersion', 'serviceId']);
    expect(sent).toMatchObject({ serviceId: 'desktop-ollama', classification: 'sanctioned' });
    await expect(page.locator('#policy-message')).toContainText('Saved: Sanctioned');
    await page.click('#detail-content [data-close-dialog]');
    await expect(ollamaCard.locator('.badge')).toHaveText(['Sanctioned', 'Desktop']);
    console.log('PASS: 5f. desktop-only dialog shows kind, members and dates; saves the classification only');

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

    // 5g. An older API (no source, desktop, desktopOnlyTools or desktopTrends): unchanged page.
    const older = await context.newPage();
    // ...and ledger events without severityId.
    await older.route('**/mock-api/v1/shadow/admin/ledger', async (route) => {
      const data = await (await route.fetch()).json();
      data.events = data.events.map(({ severityId, destinationStatus, ...event }) => event);
      return route.fulfill({ json: data });
    });
    await older.route('**/mock-api/v1/shadow/admin/dashboard', async (route) => {
      const data = await (await route.fetch()).json();
      data.tools = data.tools.filter((tool) => tool.source !== 'desktop').map(({ source, desktop, ...tool }) => tool);
      delete data.summary.desktopOnlyTools; delete data.desktopTrends;
      data.summary.totalTools = data.tools.length;
      return route.fulfill({ json: data });
    });
    await older.goto(`${origin}/team.html#/overview`);
    await older.locator('#console-nav [data-view="shadow"]').click();
    await expect(older.locator('#chart svg')).toBeVisible({ timeout: 15000 });
    await expect(older.locator('#metrics .metric').first().locator('.metric-note')).toHaveText('2 sanctioned · 3 unsanctioned');
    await expect(older.locator('#service-grid .service-card')).toHaveCount(5);
    await expect(older.locator('#service-grid .service-badges')).toHaveCount(0);
    await expect(older.locator('#desktop-filter')).toBeHidden();
    await expect(older.locator('[data-chart="desktop"]')).toBeHidden();
    await expect(older.locator('#review-legend small')).toHaveText([/^\d+% of visits$/, /^\d+% of visits$/, /^\d+% of visits$/]);
    await expect(older.locator('#review-rules')).toContainText('5 normal');
    for (const section of ['#service-grid', '#review-list', '#review-legend', '#review-next']) {
      expect((await older.locator(section).innerText()).toLowerCase()).not.toContain('desktop');
    }
    await older.click('[data-view="board"]');
    expect((await older.locator('#review-board').innerText()).toLowerCase()).not.toContain('desktop');
    await older.locator('#service-grid .service-card', { hasText: 'Claude' }).click();
    await expect(older.locator('#detail-content .dialog-desktop-note')).toHaveCount(0);
    await expect(older.locator('#detail-content input[name="pasteMode"]')).toHaveCount(3);
    await older.click('#detail-content [data-close-dialog]');
    await expect(older.locator('#ledger-body .badge.sev')).toHaveCount(0);
    await expect(older.locator('#timeline .badge.sev')).toHaveCount(0);
    await expect(older.locator('.dest-status')).toHaveCount(0);
    await older.locator('#export-button').click();
    const olderDownload = older.waitForEvent('download');
    await older.locator('#export-pdf').click();
    const olderShadowPdf = await readFile(await (await olderDownload).path(), 'latin1');
    for (const text of ['(Severity)', 'By severity', 'map to OCSF', '(Not approved)']) if (olderShadowPdf.includes(text)) throw Error(`PDF without severity still contains: ${text}`);
    if (!olderShadowPdf.includes("(Findings)")) throw Error('PDF without severity lost the ledger table');
    console.log('PASS: 5g. without the new fields the inventory, metrics, review and chart are as before');

    // 5h. Team-controlled desktop tool names stay text everywhere they appear.
    const named = await context.newPage();
    const evil = '<img src=x onerror="window.xss=1">';
    await named.route('**/mock-api/v1/shadow/admin/dashboard', async (route) => {
      const data = await (await route.fetch()).json();
      data.tools.push({ serviceId: 'desktop-evil', name: evil, hostname: '', source: 'desktop', kind: evil, classification: 'review', pasteMode: null, visits: 0, pastes: 0, sensitiveEvents: 0, activeSeats: 1, seatNumbers: [2], lastSeen: evil, observedHostnames: [] });
      data.tools.find((tool) => tool.serviceId === 'claude').desktop.kinds = [evil];
      return route.fulfill({ json: data });
    });
    await named.goto(`${origin}/team.html#/overview`);
    await named.locator('#console-nav [data-view="shadow"]').click();
    await expect(named.locator('#service-grid')).toContainText('<img', { timeout: 15000 });
    await named.locator('#service-grid .service-card', { hasText: '<img' }).click();
    await expect(named.locator('#detail-content h2')).toHaveText(evil);
    await named.click('#detail-content [data-close-dialog]');
    await named.locator('#service-grid .service-card', { hasText: 'Claude' }).click();
    await expect(named.locator('#detail-content .dialog-desktop-note')).toHaveText('Also on desktop: 2 members (AI tool)');
    expect(await named.locator('#shadow-root img').count()).toBe(0);
    expect(await named.evaluate(() => window.xss)).toBeUndefined();
    console.log('PASS: 5h. desktop tool names stay text');

    // 5i. Member report: the desktop AI tools found on the person's computer, on screen and in its PDF.
    const people = await context.newPage();
    await people.goto(`${origin}/team.html#/people`);
    await people.locator('[data-report="user_demo_1"]').click();
    const desk = people.locator('#mr-body .mr-desktop-tools');
    await expect(desk.locator('h3')).toHaveText('Desktop AI tools', { timeout: 15000 });
    await expect(desk.locator('li')).toHaveCount(2);
    await expect(desk.locator('li', { hasText: 'Ollama' }).locator('small')).toContainText('Local AI model · last seen');
    await expect(desk.locator('li', { hasText: 'Cursor' }).locator('small')).toContainText('AI desktop app');
    const memberPdf = people.waitForEvent('download');
    await people.locator('#mr-pdf').click();
    const memberPdfText = await readFile(await (await memberPdf).path(), 'latin1');
    for (const text of ['(Desktop AI tools)', '(Ollama | Local AI model)', '(Cursor | AI desktop app)']) {
      if (!memberPdfText.includes(text)) throw Error(`Member PDF is missing: ${text}`);
    }
    await people.locator('[data-mr-close]').click();
    await people.locator('[data-report="user_demo_2"]').click();
    await expect(people.locator('#mr-body .mr-desktop-tools')).toContainText("No AI tools found on this person's computer in this period.", { timeout: 15000 });
    await people.locator('[data-mr-close]').click();
    // An older API sends no desktopTools: no section, on screen or in the PDF.
    await people.route('**/mock-api/v1/team/member-report', async (route) => {
      const data = await (await route.fetch()).json();
      delete data.desktopTools;
      return route.fulfill({ json: data });
    });
    await people.locator('[data-report="user_demo_1"]').click();
    await expect(people.locator('#mr-body')).toContainText('AI tools used', { timeout: 15000 });
    await expect(people.locator('#mr-body')).not.toContainText('Desktop AI tools');
    const olderPdf = people.waitForEvent('download');
    await people.locator('#mr-pdf').click();
    if ((await readFile(await (await olderPdf).path(), 'latin1')).includes('Desktop AI tools')) throw Error('Member PDF shows desktop tools without data');
    await people.locator('[data-mr-close]').click();
    await people.unroute('**/mock-api/v1/team/member-report');
    await people.route('**/mock-api/v1/team/member-report', async (route) => {
      const data = await (await route.fetch()).json();
      data.desktopTools = [{ name: evil, kind: evil, lastSeen: evil }];
      return route.fulfill({ json: data });
    });
    await people.locator('[data-report="user_demo_1"]').click();
    await expect(people.locator('#mr-body .mr-desktop-tools')).toContainText('<img', { timeout: 15000 });
    expect(await people.locator('#mr-body img').count()).toBe(0);
    expect(await people.evaluate(() => window.xss)).toBeUndefined();
    console.log('PASS: 5i. member report lists desktop AI tools (screen and PDF); absent for older APIs; names stay text');

    // 7b. Long inventory values wrap onto more lines instead of being cut with "...".
    const long = await context.newPage();
    await long.route('**/mock-api/v1/shadow/admin/dashboard', async (route) => {
      const data = await (await route.fetch()).json();
      data.tools.push({ serviceId: 'copilot-365', name: 'Microsoft Copilot for Microsoft 365 Enterprise', hostname: 'copilot.cloud.microsoft.example-enterprise.com', source: 'web',
        classification: 'review', pasteMode: 'block_sensitive', visits: 12, pastes: 3, sensitiveEvents: 0, activeSeats: 2, seatNumbers: [1, 2], lastSeen: Date.now(),
        desktop: { memberCount: 1, seatNumbers: [2], lastSeen: Date.now(), kinds: ['desktop_app'] } });
      return route.fulfill({ json: data });
    });
    await long.goto(`${origin}/team.html#/overview`);
    await long.locator('#console-nav [data-view="shadow"]').click();
    await expect(long.locator('#chart svg')).toBeVisible({ timeout: 15000 });
    await long.locator('#export-button').click();
    const longDownload = long.waitForEvent('download');
    await long.locator('#export-pdf').click();
    const longPdf = await readFile(await (await longDownload).path(), 'latin1');
    const inventory = longPdf.slice(longPdf.indexOf('(AI service inventory)'), longPdf.indexOf('(Sensitive paste activity'));
    for (const text of ['(Microsoft Copilot for)', '(Microsoft 365)', '(Enterprise)', '(copilot.cloud.microsoft.exam)', '(ple-enterprise.com)', '(+ desktop app)', '(Block sensitive)']) {
      if (!inventory.includes(text)) throw Error(`Inventory is missing: ${text}`);
    }
    if (inventory.includes('...')) throw Error('Inventory still cuts a value short');
    console.log('PASS: 7b. long service names and hostnames wrap in the PDF inventory, nothing cut');

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
