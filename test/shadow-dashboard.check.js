const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require(
  process.env.PW ? path.resolve(process.cwd(), process.env.PW) : "@playwright/test",
);

const root = path.resolve(__dirname, "..");
const server = http.createServer((request, response) => {
  const file = request.url === "/shadow.html" ? path.join(root, "shadow.html") : null;
  if (!file) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  fs.createReadStream(file).pipe(response);
});

const dashboard = {
  days: 30,
  generatedAt: Date.now(),
  summary: {
    totalTools: 2,
    totalVisits: 24,
    unsanctionedUsagePercent: 75,
    highRiskDestinations: 1,
    pasteAttempts: 9,
    pasteBytes: 4096,
    sensitiveEvents: 3,
  },
  trends: [
    { day: "2026-09-09", visits: 10, pastes: 4, bytes: 2048, sensitiveEvents: 1 },
    { day: "2026-09-10", visits: 14, pastes: 5, bytes: 2048, sensitiveEvents: 2 },
  ],
  tools: [
    {
      serviceId: "chatgpt",
      name: "ChatGPT",
      hostname: "chatgpt.com",
      observedHostnames: ["chat.openai.com", "chatgpt.com"],
      classification: "recognized",
      pasteBlocked: false,
      visits: 18,
      pastes: 7,
      bytes: 3072,
      activeSeats: 4,
    },
    {
      serviceId: "deepseek",
      name: "DeepSeek",
      hostname: "chat.deepseek.com",
      observedHostnames: ["chat.deepseek.com"],
      classification: "review",
      pasteBlocked: true,
      visits: 6,
      pastes: 2,
      bytes: 1024,
      activeSeats: 2,
    },
  ],
};
const ledger = {
  total: 1,
  nextOffset: null,
  events: [
    {
      eventId: "e1",
      pasteEventId: "p1",
      timestamp: Date.now(),
      seatLabel: "Seat 12",
      hostname: "chatgpt.com",
      serviceId: "chatgpt",
      detectionType: "known-key",
      reason: "OpenAI API key",
      action: "cancelled",
      findingCount: 1,
    },
  ],
};

let browser;
(async () => {
  await new Promise((resolve) => server.listen(4173, "127.0.0.1", resolve));
  browser = await chromium.launch({ channel: "chromium", headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const policyUpdates = [];
  await context.route("http://127.0.0.1:8791/**", async (route) => {
    const request = route.request();
    const cors = { "Access-Control-Allow-Origin": "http://127.0.0.1:4173" };
    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    const pathname = new URL(request.url()).pathname;
    let json;
    if (pathname.endsWith("/test-session"))
      json = { token: "admin-token", localOnly: true, role: "admin" };
    else if (pathname.endsWith("/admin/dashboard")) json = dashboard;
    else if (pathname.endsWith("/admin/ledger")) json = ledger;
    else if (pathname.endsWith("/admin/policy")) {
      policyUpdates.push(request.postDataJSON());
      json = { version: policyUpdates.length, refreshAfterSeconds: 300, services: [] };
    } else json = { error: "not found" };
    await route.fulfill({ status: 200, headers: cors, json });
  });

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4173/shadow.html");
  await page.waitForFunction(() => document.getElementById("c-visits").textContent === "24");
  const check = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  check((await page.locator("#c-tools").textContent()) === "2", "summary cards did not render");
  check(await page.getByText("75.0%").isVisible(), "unsanctioned percentage is missing");
  check(await page.getByText("Seat 12").isVisible(), "pseudonymous seat is missing");
  check(await page.getByText("Attempts, not submissions").isVisible(), "paste wording is unclear");
  check(
    await page.getByRole("button", { name: "Prevent pasting", exact: true }).isVisible(),
    "paste-only policy wording is missing",
  );
  check(!(await page.locator("body").innerText()).includes("PRIVATE PASTED CONTENT"), "private content appeared");

  await page
    .locator('tr[data-service="chatgpt"]')
    .getByRole("button", { name: "Mark as sanctioned", exact: true })
    .click();
  await page.waitForTimeout(150);
  await page.locator('tr[data-service="chatgpt"] [data-paste-blocked]').click();
  await page.waitForFunction(() => document.getElementById("refresh").disabled === false);
  check(
    policyUpdates.some((value) => value.serviceId === "chatgpt" && value.classification === "sanctioned"),
    "sanctioned action did not reach the API",
  );
  check(
    policyUpdates.some((value) => value.serviceId === "chatgpt" && value.pasteBlocked === true),
    "prevent-pasting action did not reach the API",
  );
  check(errors.length === 0, `page errors: ${errors.join(", ")}`);

  await page.setViewportSize({ width: 390, height: 844 });
  check(
    (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1,
    "dashboard overflows on mobile",
  );
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  console.log("Shadow dashboard checks passed");
})().catch(async (error) => {
  console.error(error);
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
  process.exitCode = 1;
});
