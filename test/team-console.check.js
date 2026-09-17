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
const BASE = process.env.BASE || "http://localhost:3000";
const OUT = (process.env.OUT || require("os").tmpdir()) + "/";

const team = (over = {}) => ({
  team: {
    orgId: "org_a", name: "Acme Robotics", role: "org:admin", status: "active",
    currentPeriodEnd: null, seats: 5, seatsUsed: 2, seatsAvailable: 3,
    members: [
      { userId: "u1", email: "ada@acme.io", name: "Ada Lovelace", role: "org:admin", createdAt: 1 },
      { userId: "u2", email: "grace@acme.io", name: "Grace Hopper", role: "org:member", createdAt: 2 },
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
    byAction: [{ key: "cancelled", n: 88 }, { key: "paste_anonymously", n: 47 }, { key: "paste_anyway", n: 13 }],
  },
};

async function ctxFor(browser, { teamBody = team(), settingsBody = settings(), viewport = { width: 1280, height: 900 } } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  // V2 loads service configuration before its SDKs. Keep the test backend on a
  // reserved .test hostname; every endpoint is fulfilled below.
  await ctx.route('**/integrations/config.js', r => r.fulfill({
    contentType: 'text/javascript', body: 'window.SI_CONFIG = ' + JSON.stringify({preview: {
      apiBase: 'https://api.secureintent.test', jwtTemplate: 'secureintent',
      clerkPublishableKey: 'pk_test_fixture', clerkScriptUrl: 'https://clerk.secureintent.test/clerk.browser.js',
      paddleToken: 'test_fixture', paddleEnv: 'sandbox', priceId: 'pri_fixture',
    }}),
  }));
  for (const u of ['**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**', '**/cdnjs.cloudflare.com/**']) await ctx.route(u, r => r.fulfill({body:''}));
  for (const u of ["**/clerk.browser.js", "**/paddle.js"]) await ctx.route(u, (r) => r.fulfill({ body: "", contentType: "text/javascript" }));
  await ctx.route("**/v1/team/settings*", (r) => r.fulfill({ json: settingsBody }));
  await ctx.route("**/v1/team/metrics*", (r) => r.fulfill({ json: metrics }));
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
  policyDot: document.getElementById("nav-policy-dot").hidden ? null : document.getElementById("nav-policy-dot").className,
  alertsDot: document.getElementById("nav-alerts-dot").hidden ? null : document.getElementById("nav-alerts-dot").className,
  policyDotColor: getComputedStyle(document.getElementById("nav-policy-dot")).backgroundColor,
  alertsDotColor: getComputedStyle(document.getElementById("nav-alerts-dot")).backgroundColor,
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
    check("alerts dot is green", s.alertsDot === "sdot sdot--ok" && s.alertsDotColor === "rgb(52, 211, 153)", s);
    check("no unsaved dot on load", s.policyDot === null, s);
    check("nothing locked", s.locked.length === 0, s);
    check("topbar gives way to the sidebar", s.topbarHidden === true, s);
    check("no page errors", errs.length === 0, errs);
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
    check("toggling policy raises the unsaved dot", s.policyDot === "sdot sdot--dirty" && s.policyDotColor === "rgb(251, 191, 36)", s);
    await p.click(".navitem[data-view=overview]");
    await p.waitForTimeout(150);
    s = await p.evaluate(state);
    check("unsaved dot survives leaving the view", s.policyDot === "sdot sdot--dirty", s);
    check("delivery health still outranks it on Alerts", s.alertsDot === "sdot sdot--ok", s);
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
    check("unpaid locks the other three", s.locked.sort().join() === "alerts,overview,policy", s);
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
    check("a failing webhook shows the theme's danger color from Overview", s.alertsDot === "sdot sdot--bad" && s.alertsDotColor === s.dangerColor, s);
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

  await b.close();
  console.log(fail.length ? `\n${fail.length} FAILED: ${fail.join(", ")}` : "\nall checks passed");
  process.exit(fail.length ? 1 : 0);
})();
