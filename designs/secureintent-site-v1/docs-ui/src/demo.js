import "./shared.js";
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

// Example values are intentionally fictitious. The playground never reads the
// clipboard, accepts real secrets, or makes a detection/network request.
const examples = {
  api: {
    name: "Stripe API key",
    description: "an API key",
    line: 4,
    raw: '"sk_test_DEMO_NOT_A_REAL_KEY"',
    safe: '"[API_KEY_1]"',
    lines: [
      "Help me debug this payment request.",
      "",
      "const stripe = new Stripe(",
      "  {{secret}}",
      ");",
      "",
      "await stripe.customers.list();",
    ],
  },
  token: {
    name: "GitHub access token",
    description: "an access token",
    line: 5,
    raw: '"ghp_DEMO_NOT_A_REAL_TOKEN"',
    safe: '"[GITHUB_TOKEN_1]"',
    lines: [
      "Why does this API call fail?",
      "",
      "const github = new Octokit({",
      "  auth:",
      "    {{secret}}",
      "});",
      "await github.rest.repos.listForUser();",
    ],
  },
  card: {
    name: "Credit card number",
    description: "a card number",
    line: 4,
    raw: "4242 4242 4242 4242",
    safe: "[CARD_NUMBER_1]",
    lines: [
      "Help me understand this payment log.",
      "",
      "customer: Example Customer",
      "card: {{secret}}",
      "status: payment_declined",
      "",
      "What should I check next?",
    ],
  },
};

const playground = $(".playground");
const tabs = $$('.example-tabs [role="tab"]');
const promptPanel = $("#prompt-panel");
const protectButton = $(".protect-button");
let activeExample = "api";
let protectedState = false;
let protectionTimer;

function appendCode(parent, text) {
  // Highlight a small set of keywords using text nodes, not HTML injection.
  for (const part of text.split(/\b(const|new|await)\b/g)) {
    if (/^(const|new|await)$/.test(part)) {
      const span = document.createElement("span");
      span.className = "code-purple";
      span.textContent = part;
      parent.append(span);
    } else parent.append(document.createTextNode(part));
  }
}

function renderExample() {
  const example = examples[activeExample];
  promptPanel.replaceChildren();
  example.lines.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = "code-line";
    const number = document.createElement("span");
    number.className = "line-number";
    number.setAttribute("aria-hidden", "true");
    number.textContent = index + 1;
    const code = document.createElement("code");
    const [before, after] = line.split("{{secret}}");
    appendCode(code, before || " ");
    if (after !== undefined) {
      const value = document.createElement("mark");
      value.className = `secret-value${protectedState ? " protected" : ""}`;
      value.textContent = protectedState ? example.safe : example.raw;
      code.append(value);
      appendCode(code, after);
    }
    row.append(number, code);
    promptPanel.append(row);
  });
  promptPanel.setAttribute("aria-labelledby", `tab-${activeExample}`);
  playground.dataset.state = protectedState ? "protected" : "detected";
  $(".guard-eyebrow").textContent = protectedState
    ? "ANONYMIZED ON YOUR DEVICE"
    : "CAUGHT BEFORE THE PASTE";
  $(".guard-title").textContent = protectedState
    ? "Your secret stays yours."
    : "A secret. Not a setback.";
  $(".guard-description").textContent = protectedState
    ? "The sensitive value is replaced. Your AI gets the context, without the credential."
    : `There’s ${example.description} in your prompt. Let’s keep it between you and your device.`;
  $(".detected-name").textContent = protectedState
    ? "Sensitive value anonymized"
    : example.name;
  $(".detected-line").textContent = protectedState
    ? "Protected"
    : `Line ${example.line}`;
  $(".detected-item use").setAttribute(
    "href",
    protectedState ? "#i-check" : "#i-lock",
  );
  $(".verdict-icon use").setAttribute(
    "href",
    protectedState ? "#i-check" : "#i-shield",
  );
  $(".guard-note").textContent = protectedState
    ? "Example complete. Try another type of secret."
    : "The context stays. The secret doesn’t.";
  $(".prompt-foot-state").firstChild.textContent = protectedState
    ? "Ready to paste"
    : "Waiting to paste";
  protectButton.firstChild.textContent = protectedState
    ? "Try again"
    : "Anonymize & continue";
  $("use", protectButton).setAttribute(
    "href",
    protectedState ? "#i-reset" : "#i-arrow",
  );
  protectButton.disabled = false;
  protectButton.removeAttribute("aria-busy");
  tabs.forEach((tab) => {
    const selected = tab.dataset.example === activeExample;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
}

function resetExample() {
  clearTimeout(protectionTimer);
  protectedState = false;
  renderExample();
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => {
    activeExample = tab.dataset.example;
    resetExample();
  });
  tab.addEventListener("keydown", (event) => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft")
      next = (index + tabs.length - 1) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    tabs[next].focus();
    tabs[next].click();
  });
});
protectButton.addEventListener("click", () => {
  if (protectedState) {
    resetExample();
    return;
  }
  protectButton.disabled = true;
  protectButton.setAttribute("aria-busy", "true");
  protectButton.firstChild.textContent = "Anonymizing locally…";
  protectionTimer = setTimeout(() => {
    protectedState = true;
    renderExample();
  }, 420);
});
$(".reset-demo").addEventListener("click", resetExample);
renderExample();
$("[data-try-demo]").addEventListener("click", () => {
  const tab = tabs.find(
    (item) => item.getAttribute("aria-selected") === "true",
  );
  tab?.focus({ preventScroll: true });
  window.scrollTo({
    top: playground.getBoundingClientRect().top + scrollY - 92,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
});
