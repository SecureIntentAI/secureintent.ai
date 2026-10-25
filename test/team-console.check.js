/**
 * Drives team.html against a stubbed Worker: which view is showing, what the
 * sidebar says about it, what a team with no seats can reach, and whether an
 * unsaved edit is still visible from another view. No network, no Clerk, no
 * Paddle — every call is fulfilled from the fixtures below.
 *
 * There is no build step in this repo, so this is a plain script rather than a
 * test runner. Serve the site and run it:
 *
 *   python3 -m http.server 3000     # from the repo root, in another shell
 *   PW=../ext/node_modules/@playwright/test node test/team-console.check.js
 *
 * PW points at any checkout that has Playwright installed (the extension repo
 * next door does). Screenshots land in OUT, which defaults to a temp dir.
 * To run the same checks against V2, set:
 * BASE=http://127.0.0.1:3000/designs/secureintent-site-v1
 */
// A path in PW is resolved against the shell's directory, not this file's.
const { chromium } = require(
  process.env.PW ? require("path").resolve(process.cwd(), process.env.PW) : "@playwright/test",
);
// The console lives under the design folder; the root team.html is the old page.
const BASE = process.env.BASE || "http://localhost:3000/designs/secureintent-site-v1";
const OUT = (process.env.OUT || require("os").tmpdir()) + "/";

const device = (client) => ({ ...(client ? { client } : {}), installationId: `dev-${client}`, extensionVersion: client === "desktop" ? "0.2.12" : "1.2.0",
  lastSeenAt: Date.now() - 60e3, appliedPolicyVersion: 4, rollout: "applied", policyStatus: "applied", confirmedGuards: 2, expectedPages: 2 });
const team = (over = {}) => ({
  team: {
    orgId: "org_a", name: "Acme Robotics", role: "org:admin", status: "active",
    currentPeriodEnd: null, seats: 5, seatsUsed: 2, seatsAvailable: 3,
    // Devices seen in the last 30 days: Ada has both products, Grace the
    // extension only (no client field, as from an older API).
    members: [
      { userId: "u1", email: "ada@acme.io", name: "Ada Lovelace", role: "org:admin", createdAt: 1,
        connection: { status: "recently_connected", lastSeenAt: Date.now() - 60e3, devices: [device("extension"), device("desktop")] } },
      { userId: "u2", email: "grace@acme.io", name: "Grace Hopper", role: "org:member", createdAt: 2,
        connection: { status: "recently_connected", lastSeenAt: Date.now() - 60e3, devices: [device()] } },
    ],
    invitations: [{ id: "inv1", email: "alan@acme.io" }],
    ...over,
  },
});

const settings = (over = {}) => ({
  settings: {
    alertWebhook: "https://hooks.slack.com/services/T/B/xxx",
    alertMinType: "known-key",
    policy: {
      blockInsteadOfWarn: true, requireSessionLock: false,
      extraPatterns: [{ label: "Acme internal token", regex: "ACME_[A-Z0-9]{24}", type: "known-key" }],
      blockedSites: ["pastebin.com", "chat.example.com"], replaceDefaultPatterns: false,
    },
    policyVersion: 4,
    alertDelivery: {
      lastAttemptAt: new Date(Date.now() - 16 * 60000).toISOString(), ok: true, status: 200,
      reason: "ok", consecutiveFailures: 0, suppressedSinceLastAlert: 0, suppressedEvents: 0,
      throttleWindowSeconds: 60,
    },
    ...over,
  },
});

const metrics = {
  metrics: {
    days: 30, total: 148, activeActors: 4,
    byDay: Array.from({ length: 30 }, (_, i) => ({ day: `2026-07-${String(i + 1).padStart(2, "0")}`, n: [2, 9, 4, 0, 7, 13, 5, 1, 8, 3][i % 10] })),
    byType: [{ key: "known-key", n: 71 }, { key: "env-credential", n: 44 }, { key: "private-key", n: 21 }, { key: "pii", n: 12 }],
    bySite: [{ key: "chatgpt.com", n: 63 }, { key: "claude.ai", n: 41 }, { key: "gemini.google.com", n: 26 }, { key: "perplexity.ai", n: 18 }],
    byAction: [{ key: "cancelled", n: 88 }, { key: "paste_anonymously", n: 47 }, { key: "paste_anyway", n: 13 }, { key: "auto_redacted", n: 14 }],
    byClient: [{ key: "extension", n: 134 }, { key: "desktop", n: 14 }],
    // OCSF severity: always all four, Critical first.
    // letThrough: catches whose secret went on anyway (pasted anyway, or Undo on the desktop).
    bySeverity: [{ severityId: 5, name: "Critical", n: 21, letThrough: 2 }, { severityId: 4, name: "High", n: 71, letThrough: 3 }, { severityId: 3, name: "Medium", n: 44, letThrough: 5 }, { severityId: 2, name: "Low", n: 12, letThrough: 0 }],
  },
};
// Severity from an API that predates letThrough, and one where nothing severe went on.
const metricsWith = (bySeverity) => ({ metrics: { ...metrics.metrics, bySeverity } });
const noLetThrough = metricsWith(metrics.metrics.bySeverity.map(({ letThrough, ...r }) => r));
const noneLetThrough = metricsWith(metrics.metrics.bySeverity.map((r) => ({ ...r, letThrough: r.severityId >= 4 ? 0 : r.letThrough })));
// The same metrics from an API that predates severity.
const { bySeverity: _sev, ...metricsNoSeverity } = metrics.metrics;

// POST /v1/team/member-report for Grace; `activity` is the metrics shape for one member.
const memberReport = (activity = {}) => ({
  days: 30, policyVersion: 4,
  member: { userId: "u2", name: "Grace Hopper", email: "grace@acme.io", role: "org:member", joinedAt: Date.now() - 5 * 86400e3, seatNumber: 2, lastSeenAt: Date.now() - 60e3 },
  devices: [], aiTools: [], recentSensitive: [],
  activity: {
    days: 30, total: 9, activeActors: 1, byDay: [],
    byType: [{ key: "known-key", n: 6 }, { key: "pii", n: 3 }], bySite: [{ key: "chatgpt.com", n: 9 }], byAction: [{ key: "cancelled", n: 9 }],
    bySeverity: [{ severityId: 5, name: "Critical", n: 2, letThrough: 1 }, { severityId: 4, name: "High", n: 4, letThrough: 0 }, { severityId: 3, name: "Medium", n: 3, letThrough: 0 }, { severityId: 2, name: "Low", n: 0, letThrough: 0 }],
    ...activity,
  },
});

async function ctxFor(browser, { teamBody = team(), settingsBody = settings(), metricsBody = metrics, reportBody = memberReport(), viewport = { width: 1280, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  // V2 loads service configuration before its SDKs. Keep the test backend on a
  // reserved .test hostname; every endpoint is fulfilled below.
  await ctx.route('**/integrations/config.js', r => r.fulfill({
    contentType: 'text/javascript', body: 'window.SI_CONFIG = ' + JSON.stringify({preview: {
      apiBase: 'https://api.secureintent.test', jwtTemplate: 'secureintent',
      clerkPublishableKey: 'pk_test_fixture', clerkScriptUrl: 'https://fixture.clerk.accounts.dev/clerk.browser.js',
      paddleToken: 'test_fixture', paddleEnv: 'sandbox', priceId: 'pri_fixture',
    }}),
  }));
  for (const u of ['**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**', '**/cdnjs.cloudflare.com/**']) await ctx.route(u, r => r.fulfill({body:''}));
  for (const u of ["**/clerk.browser.js", "**/paddle.js"]) await ctx.route(u, (r) => r.fulfill({ body: "", contentType: "text/javascript" }));
  // The admin pass: the real server opens it for a session started in the last 12 hours.
  await ctx.route("**/v1/business-access/unlock/clerk", (r) => r.fulfill({ json: { accessToken: "a".repeat(64), expiresAt: Date.now() + 30 * 60_000, orgId: "org_x" } }));
  await ctx.route("**/v1/team/settings*", (r) => r.fulfill({ json: settingsBody }));
  await ctx.route("**/v1/team/metrics*", (r) => r.fulfill({ json: metricsBody }));
  await ctx.route("**/v1/team/member-report", (r) => r.fulfill({ json: reportBody }));
  // Make admin / Make member: the change is applied to teamBody, so the refresh shows it.
  ctx.rolePosts = [];
  await ctx.route("**/v1/team/member/role", (r) => {
    const body = r.request().postDataJSON();
    ctx.rolePosts.push(body);
    if (ctx.roleError) return r.fulfill({ status: ctx.roleError[0], json: { error: ctx.roleError[1] } });
    const m = teamBody.team.members.find((x) => x.userId === body.userId);
    if (m) m.role = body.role === "admin" ? "org:admin" : "org:member";
    return r.fulfill({ json: { ok: true, ...body } });
  });
  ctx.ruleSeverityPosts = [];
  await ctx.route("**/v1/team/settings/rule-severity", (r) => {
    ctx.ruleSeverityPosts.push(r.request().postDataJSON());
    return ctx.failRuleSeverity ? r.fulfill({ status: 500, json: { error: "save failed" } }) : r.fulfill({ json: { ok: true } });
  });
  await ctx.route("**/v1/team*", (r) => r.fulfill({ json: teamBody }));
  await ctx.addInitScript(() => {
    window.Clerk = {
      user: { id: "user_fixture", primaryEmailAddress: { emailAddress: "ada@acme.io" } },
      session: { getToken: async () => "tok" },
      load: async () => {}, addListener: () => {}, signOut: () => {}, mountSignIn: () => {}, mountSignUp: () => {},
    };
    window.Paddle = { Environment: { set() {} }, Initialize() {}, Checkout: { open() {} } };
  });
  return ctx;
}

const state = () => ({
  view: [...document.querySelectorAll(".view")].filter((v) => !v.hidden).map((v) => v.id),
  current: document.querySelector('.navitem[aria-current="page"]')?.dataset.view ?? null,
  hash: location.hash,
  seats: document.getElementById("nav-seats").textContent,
  // Unsaved edits are named beside the Policy Save button (no sidebar dots).
  dirty: !document.getElementById("policy-dirty").hidden,
  // Alerts are a preview until they ship with the desktop app.
  alertsPreview: !!document.querySelector("#view-alerts .preview-banner") && document.getElementById("alerts-save").disabled,
  dangerColor: getComputedStyle(document.getElementById("team-err")).color,
  locked: [...document.querySelectorAll(".navitem")].filter((n) => n.getAttribute("aria-disabled") === "true").map((n) => n.dataset.view),
  topbarHidden: document.getElementById("topbar").hidden,
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
});

(async () => {
  const b = await chromium.launch({ channel: "chromium", headless: true });
  const fail = [];
  const check = (name, cond, got) => { console.log(`${cond ? "ok  " : "FAIL"} ${name}${cond ? "" : " → " + JSON.stringify(got)}`); if (!cond) fail.push(name); };

  // ---- 1. Admin with a live subscription -----------------------------------
  {
    const ctx = await ctxFor(b);
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/team.html");
    await p.waitForTimeout(900);

    let s = await p.evaluate(state);
    check("lands on Overview", s.current === "overview" && s.view.join() === "view-overview", s);
    check("hash is #/overview", s.hash === "#/overview", s);
    check("seat badge reads 2/5", s.seats === "2/5", s);
    check("alerts page is a desktop-app preview", s.alertsPreview === true, s);
    check("no unsaved note on load", s.dirty === false, s);
    check("nothing locked", s.locked.length === 0, s);
    check("topbar gives way to the sidebar", s.topbarHidden === true, s);
    check("no page errors", errs.length === 0, errs);
    const ov = await p.evaluate(() => ({
      actions: document.getElementById("p-actions").textContent,
      status: document.getElementById("metrics-status").textContent,
    }));
    check("desktop catches have a label", ov.actions.includes("Redacted on the desktop"), ov);
    check("Overview says where detections came from", ov.status.includes("Browser 134 · Desktop 14"), ov);
    check("and that a desktop copy pasted in the browser counts in both", ov.status.includes("counts in both"), ov);
    await p.screenshot({ path: OUT + "c-overview.png", fullPage: false });

    for (const [view, shot] of [["people", "c-people"], ["policy", "c-policy"], ["alerts", "c-alerts"]]) {
      await p.click(`.navitem[data-view="${view}"]`);
      await p.waitForTimeout(250);
      s = await p.evaluate(state);
      check(`${view} view shows alone`, s.current === view && s.view.join() === `view-${view}` && s.hash === `#/${view}`, s);
      await p.screenshot({ path: OUT + shot + ".png", fullPage: view !== "policy" });
    }
    // unsaved work must be visible from another view
    await p.click(".navitem[data-view=policy]");
    await p.waitForTimeout(200);
    await p.locator("#view-policy").screenshot({ path: OUT + "c-policy-full.png" });
    await p.click("#pol-lock");
    await p.waitForTimeout(120);
    s = await p.evaluate(state);
    check("toggling policy shows the unsaved note", s.dirty === true, s);
    await p.click(".navitem[data-view=overview]");
    await p.waitForTimeout(150);
    s = await p.evaluate(state);
    check("unsaved note survives leaving the view", s.dirty === true, s);
    check("Alerts stays a preview", s.alertsPreview === true, s);
    await p.screenshot({ path: OUT + "c-dirty.png" });

    // the edit itself must survive the round trip
    await p.click(".navitem[data-view=policy]");
    await p.waitForTimeout(150);
    check("the toggle kept its new value", (await p.isChecked("#pol-lock")) === true);

    // back button
    await p.goBack(); await p.waitForTimeout(250);
    s = await p.evaluate(state);
    check("back button walks the views", s.current === "overview", s);

    // deep link
    await p.goto(BASE + "/team.html#/alerts");
    await p.waitForTimeout(900);
    s = await p.evaluate(state);
    check("deep link opens Alerts", s.current === "alerts", s);
    check("no page errors after navigation", errs.length === 0, errs);
    await ctx.close();
  }

  // ---- 2. Admin whose payment has not landed -------------------------------
  {
    const ctx = await ctxFor(b, { teamBody: team({ seats: 0, seatsUsed: 0, seatsAvailable: 0, members: [], invitations: [] }) });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/team.html#/policy");
    await p.waitForTimeout(900);
    const s = await p.evaluate(state);
    check("unpaid lands on People", s.current === "people", s);
    check("unpaid locks every other view", s.locked.sort().join() === "alerts,overview,policy,shadow", s);
    check("pending panel is up", await p.isVisible("#pending"), null);
    check("invite is disabled while unpaid", await p.isDisabled("#invite"), null);
    check("no page errors (unpaid)", errs.length === 0, errs);
    await p.screenshot({ path: OUT + "c-pending.png", fullPage: true });
    await ctx.close();
  }

  // ---- 3. A member, and a failing webhook ----------------------------------
  {
    const ctx = await ctxFor(b, { teamBody: team({ role: "org:member" }) });
    const p = await ctx.newPage();
    await p.goto(BASE + "/team.html");
    await p.waitForTimeout(800);
    check("a member gets the gate, not the console", await p.isVisible("#gate") && !(await p.isVisible("#console")), null);
    check("the shared topbar is back for the gate", (await p.evaluate(() => document.getElementById("topbar").hidden)) === false, null);
    await ctx.close();
  }
  {
    const bad = settings({ alertDelivery: { lastAttemptAt: new Date(Date.now() - 3600e3).toISOString(), ok: false, status: 404, reason: "http_404", consecutiveFailures: 3, suppressedSinceLastAlert: 14, suppressedEvents: 6, throttleWindowSeconds: 60 } });
    const ctx = await ctxFor(b, { settingsBody: bad });
    const p = await ctx.newPage();
    await p.goto(BASE + "/team.html");
    await p.waitForTimeout(900);
    const s = await p.evaluate(state);
    check("alerts stay a preview whatever the stored webhook health", s.alertsPreview === true, s);
    await p.click(".navitem[data-view=alerts]"); await p.waitForTimeout(200);
    await p.screenshot({ path: OUT + "c-alerts-bad.png" });
    await ctx.close();
  }

  // ---- 4. Phone ------------------------------------------------------------
  {
    const ctx = await ctxFor(b, { viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(BASE + "/team.html");
    await p.waitForTimeout(900);
    const s = await p.evaluate(state);
    check("no sideways scroll at 390px", s.overflow <= 1, s);
    await p.screenshot({ path: OUT + "c-mobile.png" });
    await p.click(".navitem[data-view=people]"); await p.waitForTimeout(250);
    await p.screenshot({ path: OUT + "c-mobile-people.png" });
    await ctx.close();
  }

  // ---- 5. Severity: Overview, CSV, PDFs, member report; and an older API ----
  const download = async (p, click) => {
    const [d] = await Promise.all([p.waitForEvent("download"), p.click(click)]);
    return require("fs").readFileSync(await d.path(), "latin1");
  };
  {
    const ctx = await ctxFor(b);
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/team.html");
    await p.waitForTimeout(900);
    // The colours come from team.css; give a cold server a moment to deliver it.
    await p.waitForFunction(() => getComputedStyle(document.querySelector("#p-severity .fill") || document.body).backgroundColor !== "rgba(0, 0, 0, 0)", null, { timeout: 5000 }).catch(() => {});
    const sev = await p.evaluate(() => ({
      shown: !document.getElementById("severity-block").hidden,
      rows: [...document.querySelectorAll("#p-severity .row")].map((r) => `${r.querySelector(".lbl").textContent} ${r.querySelector(".n").textContent}`),
      fills: [...document.querySelectorAll("#p-severity .fill")].map((f) => f.className),
      colours: [...document.querySelectorAll("#p-severity .fill")].map((f) => getComputedStyle(f).backgroundColor),
      note: document.querySelector("#severity-block .note").textContent,
      head: document.querySelector("#p-severity .sev-head")?.textContent,
      headTone: document.querySelector("#p-severity .sev-head b")?.className,
      notes: [...document.querySelectorAll("#p-severity .row-note")].map((n) => `${n.textContent}${n.classList.contains("is-severe") ? " !" : ""}`),
    }));
    check("Critical or High let through is the headline", sev.head === "Critical or High let through: 5" && sev.headTone === "is-severe", sev);
    check("each severity says how many were let through", sev.notes.join() === "2 let through !,3 let through !,5 let through", sev);
    check("Overview shows By severity", sev.shown && sev.rows.join() === "Critical 21,High 71,Medium 44,Low 12", sev);
    check("each level has its own colour", sev.fills.join() === "fill sev-5,fill sev-4,fill sev-3,fill sev-2" && new Set(sev.colours).size === 4, sev);
    check("the severity note names the OCSF scale", sev.note.startsWith("Severity uses the OCSF scale."), sev);
    await p.locator("#severity-block").screenshot({ path: OUT + "c-severity.png" });
    const csv = await download(p, "#export");
    check("CSV has severity rows", ["severity,5,Critical,21", "severity,4,High,71", "severity,3,Medium,44", "severity,2,Low,12"].every((row) => csv.includes(row)), csv.slice(0, 400));
    check("CSV has let-through rows", ["severity_let_through,5,Critical,2", "severity_let_through,4,High,3", "severity_let_through,2,Low,0"].every((row) => csv.includes(row)), null);
    const pdf = await download(p, "#overview-export-pdf");
    check("Overview PDF has By severity with shares", ["(By severity)", "(Critical)", "(Low)", "(14%)"].every((t) => pdf.includes(t)), null);
    check("Overview PDF has let through and the severity mapping line", ["(Critical or High let through:)", "(2 let through)", "(0 let through)", "(Severity levels map to OCSF, PCI DSS"].every((t) => pdf.includes(t)) && !pdf.includes("ompliant"), null);
    await p.click('.navitem[data-view="people"]'); await p.waitForTimeout(200);
    await p.click('[data-report="u2"]'); await p.waitForTimeout(500);
    const mr = await p.evaluate(() => [...document.querySelectorAll("#mr-body .mr-severity li")].map((li) => li.textContent));
    check("member report shows By severity (non-zero levels)", mr.join() === "Critical2,High4,Medium3", mr);
    const mrPdf = await download(p, "#mr-pdf");
    check("member PDF has By severity", ["(By severity)", "(Critical | 1 let through)", "(High | 0 let through)"].every((t) => mrPdf.includes(t)), null);
    check("member PDF has let through and the mapping line", ["(Critical or High let through)", "(Severity levels map to OCSF"].every((t) => mrPdf.includes(t)), null);
    check("no page errors (severity)", errs.length === 0, errs);
    await ctx.close();
  }
  for (const [name, body, want] of [["no letThrough", noLetThrough, null], ["none let through", noneLetThrough, "Critical or High let through: none"]]) {
    const ctx = await ctxFor(b, { metricsBody: body });
    const p = await ctx.newPage();
    await p.goto(BASE + "/team.html");
    await p.waitForSelector("#p-severity .row", { timeout: 8000 }).catch(() => {});
    const r = await p.evaluate(() => ({
      head: document.querySelector("#p-severity .sev-head")?.textContent ?? null,
      tone: document.querySelector("#p-severity .sev-head b")?.className ?? null,
      notes: document.querySelectorAll("#p-severity .row-note").length,
      rows: document.querySelectorAll("#p-severity .row").length,
    }));
    check(`${name}: severity headline`, r.head === want && r.rows === 4 && (want ? r.tone === "is-none" && r.notes === 1 : r.notes === 0), r);
    if (!want) {
      const csv = await download(p, "#export");
      const pdf = await download(p, "#overview-export-pdf");
      check("no letThrough: no let-through rows in CSV or PDF", csv.includes("severity,5,Critical,21") && !csv.includes("severity_let_through") && !pdf.includes("let through"), null);
    }
    await ctx.close();
  }
  {
    const { bySeverity: _a, ...olderActivity } = memberReport().activity;
    const ctx = await ctxFor(b, { metricsBody: { metrics: metricsNoSeverity }, reportBody: { ...memberReport(), activity: olderActivity } });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/team.html");
    await p.waitForTimeout(900);
    check("an older API: no severity block", await p.evaluate(() => document.getElementById("severity-block").hidden), null);
    check("an older API: the other blocks still draw", (await p.textContent("#p-types")).includes("Known API key"), null);
    const csv = await download(p, "#export");
    check("an older API: no severity rows in the CSV", !csv.includes("severity,") && csv.includes("type,known-key"), null);
    const pdf = await download(p, "#overview-export-pdf");
    check("an older API: no By severity in the PDF", !pdf.includes("By severity") && !pdf.includes("map to OCSF") && pdf.includes("(What was caught)"), null);
    await p.click('.navitem[data-view="people"]'); await p.waitForTimeout(200);
    await p.click('[data-report="u2"]'); await p.waitForTimeout(500);
    const body = await p.textContent("#mr-body");
    check("an older API: member report without By severity", body.includes("What was caught") && !body.includes("By severity"), null);
    const mrPdf = await download(p, "#mr-pdf");
    check("an older API: member PDF without By severity", !mrPdf.includes("By severity"), null);
    check("no page errors (older API)", errs.length === 0, errs);
    await ctx.close();
  }

  // ---- 7. Users: what each member has installed, and a filter ------------
  const roster = () => ({
    bar: !document.getElementById("install-bar").hidden,
    summary: document.getElementById("install-summary").textContent,
    rows: [...document.querySelectorAll("#people tr")].filter((tr) => !tr.hidden)
      .map((tr) => tr.classList.contains("install-none") ? tr.textContent : `${tr.querySelector(".name")?.textContent}: ${tr.children[2]?.textContent}`),
    pressed: document.querySelector('[data-install-filter="missing"]').getAttribute("aria-pressed"),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  });
  {
    const ctx = await ctxFor(b);
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/team.html#/people");
    await p.waitForTimeout(900);
    let r = await p.evaluate(roster);
    check("Users counts what members installed (invitations left out)", r.bar && r.summary === "1 has both · 1 extension only · 0 desktop only · 0 none", r);
    check("each member says what is installed", r.rows.join("|") === "Ada Lovelace: Both|Grace Hopper: Extension|alan@acme.io: ", r);
    await p.locator("#view-people .panel--flush").screenshot({ path: OUT + "c-installed.png" });
    await p.click('[data-install-filter="missing"]');
    r = await p.evaluate(roster);
    check("Missing something shows only members without both", r.rows.join("|") === "Grace Hopper: Extension" && r.pressed === "true", r);
    await p.click('[data-install-filter="all"]');
    r = await p.evaluate(roster);
    check("All shows everyone again", r.rows.length === 3 && r.pressed === "false", r);
    check("no page errors (installed)", errs.length === 0, errs);
    await ctx.close();
  }
  {
    const both = [device("extension"), device("desktop")];
    const ctx = await ctxFor(b, { teamBody: team({
      members: [
        { userId: "u1", email: "ada@acme.io", name: "Ada Lovelace", role: "org:admin", createdAt: 1, connection: { status: "recently_connected", devices: both } },
        { userId: "u3", email: "lin@acme.io", name: "Lin Wei", role: "org:member", createdAt: 3, connection: { status: "recently_connected", devices: [device("desktop")] } },
        { userId: "u4", email: "sam@acme.io", name: "Sam Ortiz", role: "org:member", createdAt: 4 },
      ],
    }), viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(BASE + "/team.html#/people");
    await p.waitForTimeout(900);
    let r = await p.evaluate(roster);
    check("desktop only and none are counted", r.summary === "1 has both · 0 extension only · 1 desktop only · 1 none" && r.rows.includes("Lin Wei: Desktop app") && r.rows.includes("Sam Ortiz: None"), r);
    check("no sideways scroll on Users at 390px", r.overflow <= 1, r);
    await p.screenshot({ path: OUT + "c-installed-mobile.png" });
    await ctx.close();
  }
  {
    const both = [device("extension"), device("desktop")];
    const ctx = await ctxFor(b, { teamBody: team({ members: [
      { userId: "u1", email: "ada@acme.io", name: "Ada Lovelace", role: "org:admin", createdAt: 1, connection: { status: "recently_connected", devices: both } },
    ] }) });
    const p = await ctx.newPage();
    await p.goto(BASE + "/team.html#/people");
    await p.waitForTimeout(900);
    await p.click('[data-install-filter="missing"]');
    const r = await p.evaluate(roster);
    check("Missing something with nobody missing says so", r.rows.join() === "Everyone has both the extension and the desktop app.", r);
    await ctx.close();
  }

  // ---- 8. Several admins: Owner / Admin / Member, role changes, billing ----
  const admins = (over = {}) => team({
    ownerUserId: "u1", isOwner: true, seats: 6, seatsUsed: 4,
    members: [
      { userId: "u1", email: "ada@acme.io", name: "Ada Lovelace", role: "org:admin", createdAt: 1 },
      { userId: "u2", email: "grace@acme.io", name: "Grace Hopper", role: "org:member", createdAt: 2 },
      { userId: "u3", email: "noah@acme.io", name: "Noah Brooks", role: "org:admin", createdAt: 3 },
    ],
    ...over,
  });
  const rolesOf = () => [...document.querySelectorAll("#people tr")].filter((tr) => tr.querySelector(".name") && tr.dataset.install)
    .map((tr) => `${tr.querySelector(".name").textContent}: ${tr.children[1].textContent} [${[...tr.children[4].querySelectorAll("button")].map((x) => x.textContent).join("/")}]`);
  {
    const body = admins();
    const ctx = await ctxFor(b, { teamBody: body });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/team.html#/people");
    await p.waitForTimeout(900);
    let r = await p.evaluate(rolesOf);
    check("roles read Owner, Member and Admin, with one action each", r.join("|") === "Ada Lovelace: Owner []|Grace Hopper: Member [Make admin/Remove]|Noah Brooks: Admin [Make member]", r);
    await p.locator("#view-people .panel--flush").screenshot({ path: OUT + "c-admins.png" });
    await p.click('[data-make-admin="u2"]');
    const q = await p.textContent("#people .confirm .q");
    check("Make admin asks first, naming them", q === "Make Grace Hopper an admin? Admins have full access to this console, except billing.", q);
    await p.click('[data-make-admin="u2"][data-confirmed]');
    await p.waitForTimeout(600);
    r = await p.evaluate(rolesOf);
    check("Make admin posts the role and the list refreshes", JSON.stringify(ctx.rolePosts) === '[{"userId":"u2","role":"admin"}]' && r[1] === "Grace Hopper: Admin [Make member]", { posts: ctx.rolePosts, r });
    ctx.roleError = [409, "team_busy"];
    await p.click('[data-make-member="u3"]');
    await p.click('[data-make-member="u3"][data-confirmed]');
    await p.waitForTimeout(500);
    const err = await p.textContent("#team-err");
    r = await p.evaluate(rolesOf);
    check("a refused role change says why and leaves the row as it was", err === "Another user change is in progress. Please retry shortly." && r[2] === "Noah Brooks: Admin [Make member]", { err, r });
    ctx.roleError = [400, "owner_role_fixed"];
    await p.click('[data-make-member="u3"]');
    await p.click('[data-make-member="u3"][data-confirmed]');
    await p.waitForTimeout(500);
    check("owner_role_fixed has a plain message", (await p.textContent("#team-err")) === "The team owner is always an admin. Their role can't be changed.", null);
    check("the owner sees no billing note", await p.evaluate(() => document.getElementById("users-owner-note").hidden), null);
    check("no page errors (admins)", errs.length === 0, errs);
    await ctx.close();
  }
  {
    // Noah, an admin who is not the owner: billing is hidden, and his own row has no action.
    const ctx = await ctxFor(b, { teamBody: admins({ isOwner: false, seats: 0, seatsUsed: 0, seatsAvailable: 0 }) });
    await ctx.addInitScript(() => { window.Clerk.user.id = "u3"; });
    const p = await ctx.newPage();
    await p.goto(BASE + "/team.html#/people");
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => ({
      buy: ["pending-company", "pending-seats", "pending-buy"].map((id) => document.getElementById(id).hidden),
      recheck: !document.getElementById("recheck").hidden,
      note: document.getElementById("pending-owner-note").hidden ? null : document.getElementById("pending-owner-note").textContent,
      usersNote: !document.getElementById("users-owner-note").hidden,
    }));
    const rows = await p.evaluate(rolesOf);
    check("not the owner: buy controls hidden, Check again kept, a note says who handles billing", r.buy.every(Boolean) && r.recheck && r.note === "Billing is managed by the team owner." && r.usersNote, r);
    check("not the owner: no action on the owner or on yourself", rows[0] === "Ada Lovelace: Owner []" && rows[2] === "Noah Brooks: Admin []", rows);
    await ctx.close();
  }
  {
    // An older API (no ownerUserId or isOwner): today's roster and billing.
    const ctx = await ctxFor(b, { teamBody: admins({ ownerUserId: undefined, isOwner: undefined, seats: 0, seatsUsed: 0, seatsAvailable: 0 }) });
    const p = await ctx.newPage();
    await p.goto(BASE + "/team.html#/people");
    await p.waitForTimeout(900);
    const rows = await p.evaluate(rolesOf);
    const buy = await p.evaluate(() => !document.getElementById("pending-buy").hidden && document.getElementById("pending-owner-note").hidden && document.getElementById("users-owner-note").hidden);
    check("an older API: Admin and Member only, Remove for members, no role buttons", rows.join("|") === "Ada Lovelace: Admin []|Grace Hopper: Member [Remove]|Noah Brooks: Admin []", rows);
    check("an older API: billing controls as today", buy, null);
    await ctx.close();
  }

  // ---- 6. Policy: severity of saved custom rules -------------------------
  {
    const rated = settings({ ruleSeverities: [{ label: "Acme internal token", severityId: 4 }] });
    rated.settings.policy.extraPatterns.push({ label: "Acme staff ID", regex: "ACS-[0-9]{6}", type: "pii" });
    const ctx = await ctxFor(b, { settingsBody: rated });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(BASE + "/team.html#/policy");
    await p.waitForTimeout(900);
    const rules = () => p.evaluate(() => ({
      head: [...document.querySelectorAll("#pat-list th")].map((th) => th.textContent),
      selects: [...document.querySelectorAll("#pat-list select[data-rule-sev]")].map((s) => [s.dataset.ruleSev, s.value]),
      options: [...document.querySelectorAll("#pat-list select[data-rule-sev] option")].slice(0, 4).map((o) => o.textContent),
      note: !document.getElementById("rule-sev-note").hidden,
      status: document.getElementById("rule-sev-status").textContent,
      statusClass: document.getElementById("rule-sev-status").className,
      dirty: !document.getElementById("policy-dirty").hidden,
    }));
    let r = await rules();
    check("saved rules get a severity select", r.head.includes("Severity") && JSON.stringify(r.selects) === '[["Acme internal token","4"],["Acme staff ID","3"]]', r);
    check("severity options read Low to Critical", r.options.join() === "Low,Medium,High,Critical", r);
    check("the severity note shows", r.note, r);
    await p.selectOption('select[data-rule-sev="Acme internal token"]', "5");
    await p.waitForTimeout(300);
    r = await rules();
    check("changing a severity posts label and id", JSON.stringify(ctx.ruleSeverityPosts) === '[{"label":"Acme internal token","severityId":5}]', ctx.ruleSeverityPosts);
    check("and says it saved", r.statusClass.includes("ok") && r.status.includes("Critical"), r);
    check("a severity change is not an unsaved policy edit", r.dirty === false, r);
    await p.locator("#view-policy .subsec").nth(1).screenshot({ path: OUT + "c-rule-severity.png" });
    ctx.failRuleSeverity = true;
    await p.selectOption('select[data-rule-sev="Acme staff ID"]', "2");
    await p.waitForTimeout(300);
    r = await rules();
    check("a failed save says so and puts the old level back", r.statusClass.includes("err") && JSON.stringify(r.selects[1]) === '["Acme staff ID","3"]', r);
    await p.fill("#pat-label", "Draft rule");
    await p.fill("#pat-regex", "DRAFT_[0-9]+");
    await p.click("#pat-add");
    await p.waitForTimeout(150);
    r = await rules();
    check("an unsaved rule gets no select", r.selects.length === 2 && !r.selects.some(([l]) => l === "Draft rule"), r);
    check("no page errors (rule severity)", errs.length === 0, errs);
    await ctx.close();
  }
  {
    // settings() has no ruleSeverities: an older API.
    const ctx = await ctxFor(b);
    const p = await ctx.newPage();
    await p.goto(BASE + "/team.html#/policy");
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => ({
      head: [...document.querySelectorAll("#pat-list th")].map((th) => th.textContent).join(),
      selects: document.querySelectorAll("#pat-list select").length,
      note: !document.getElementById("rule-sev-note").hidden,
    }));
    check("an older API: custom rules as before, no severity", r.head === "Label,Pattern,Treated as," && r.selects === 0 && !r.note, r);
    await ctx.close();
  }

  await b.close();
  console.log(fail.length ? `\n${fail.length} FAILED: ${fail.join(", ")}` : "\nall checks passed");
  process.exit(fail.length ? 1 : 0);
})();
