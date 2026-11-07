/* The packages, their prices and what each one includes: the one place the
 * account page reads them from. Change a name or a price here and nowhere else.
 *
 * Names and the included list match the desktop app (src/lib/packages.ts);
 * prices are the KAU-80 decisions and must match Paddle exactly. Amounts are US
 * cents, so nothing is ever rounded on the way to the page.
 */
(() => {
  "use strict";

  const ORDER = ["free", "browser_pro", "desktop_pro", "business"];

  const PACKAGES = {
    free: {
      label: "Browser Free",
      summary: "Detection and warnings, no sign-in needed. Sign in to anonymise, up to 10 times a month.",
    },
    browser_pro: {
      label: "Browser Pro",
      summary: "Unlimited swap and restore, plus the log cleaner and the other browser tools.",
      // intro: each of the first INTRO_MONTHS paid months, monthly billing only.
      price: { monthly: 799, intro: 400, annual: 7668, annualPerMonth: 639 },
    },
    desktop_pro: {
      label: "Desktop Pro",
      summary: "Adds terminals, code editors and the clipboard, and includes Browser Pro.",
      price: { monthly: 1499, intro: 750, annual: 14388, annualPerMonth: 1199 },
    },
    business: {
      label: "Business",
      summary: "One seat per person, with Desktop Pro and Browser Pro included, plus team policies and activity visibility.",
      // No public price until KAU-82 sets one.
      contact: { label: "Talk to us about a team trial", href: "business.html#enquiry" },
    },
  };

  const INTRO_MONTHS = 3;
  const TRIAL_DAYS = 30;
  const CURRENCY = "USD";
  const FREE_ANONYMISE_LIMIT = 10;
  // A paid team has 3 to 20 seats in total, the owner's seat included (Julian,
  // 6 Nov 2026). More than 20 is Enterprise: contact us. Must match
  // MIN_PAID_SEATS and MAX_PAID_SEATS in the backend (src/lib/teamSeats.ts).
  // A complimentary or pilot team has no subscription, so neither applies there.
  const BUSINESS_MIN_SEATS = 3;
  const BUSINESS_MAX_SEATS = 20;

  /** Packages someone can buy here, in the order they are offered. */
  const PURCHASABLE = ["browser_pro", "desktop_pro"];
  // On from the launch deploy, with the backend that prices each package.
  const ON_SALE = true;
  const INTERVALS = ["monthly", "annual"];

  /** The older `plan` names, for an entitlement that has no `tier` yet. */
  const FROM_PLAN = { developer: "free", developer_pro: "browser_pro", business_pro: "business" };

  /** Each package is the one before it plus more. */
  const RANK = { free: 0, browser_pro: 1, desktop_pro: 2, business: 3 };

  // Same rows, order and first package as the desktop app's FEATURES.
  const FEATURES = [
    { key: "detection", label: "Detection and warnings", from: "free",
      note: "Scans every paste on-device and warns before secrets reach the page. No sign-in needed." },
    { key: "anonymise", label: "Anonymise", from: "free",
      note: "Swap a key for a placeholder so you can keep working. Free needs a sign-in.",
      detail: { free: `${FREE_ANONYMISE_LIMIT} a month`, browser_pro: "Unlimited", desktop_pro: "Unlimited", business: "Unlimited" } },
    { key: "restore", label: "Put the key back", from: "browser_pro",
      note: "Put the key back in place of its placeholder later in the same session." },
    { key: "log_cleaner", label: "Log cleaner", from: "browser_pro",
      note: "Strips keys, IPs and emails from a log in one click." },
    { key: "session_lock", label: "Session Lock", from: "browser_pro",
      note: "PIN-lock high-risk cloud consoles after inactivity or tab-away." },
    { key: "clipboard", label: "Clipboard", from: "desktop_pro",
      note: "Checks what you copy in any app, not just the browser." },
    { key: "terminals", label: "Terminals", from: "desktop_pro",
      note: "Covers what goes through a terminal, including git commits." },
    { key: "editors", label: "Code editors", from: "desktop_pro",
      note: "Covers code editors and the AI tools connected to them." },
    { key: "team_policy", label: "Team policies", from: "business",
      note: "One paste policy for every seat." },
    { key: "activity", label: "Activity visibility", from: "business",
      note: "See what was caught, what kind it was and where it was headed, never what was pasted." },
    { key: "alerts", label: "Alerts", from: "business", soon: true,
      note: "Tell your security team when a secret is caught." },
  ];

  const isOrgAdmin = (role) => role === "org:admin" || role === "admin";

  /**
   * The package a signed entitlement grants. `tier` decides when it is one this
   * page knows; otherwise the older `plan`, which can only ever mean less. A
   * team seat is always Business, for members and admins alike.
   */
  function packageOf(entitlement) {
    const e = entitlement || {};
    if (e.source === "org_seat") return "business";
    if (typeof e.tier === "string" && Object.hasOwn(PACKAGES, e.tier)) return e.tier;
    return FROM_PLAN[e.plan] || "free";
  }

  /** True when the entitlement names its package itself (the API that sells both Pro packages). */
  const hasTier = (entitlement) =>
    typeof entitlement?.tier === "string" && Object.hasOwn(PACKAGES, entitlement.tier);

  const trialActive = (trial) => trial?.state === "active";

  /** Whole days left, rounded up, so the last day reads 1. Null without an active, dated trial. */
  function trialDaysLeft(trial, nowMs) {
    if (!trialActive(trial) || !Number.isFinite(trial.endsAt)) return null;
    return Math.max(0, Math.ceil((trial.endsAt * 1000 - nowMs) / 86400000));
  }

  /** The name shown for an account, as the desktop app shows it. */
  function displayName(pkg, { lifetime = false, trial = null } = {}) {
    const label = PACKAGES[pkg].label;
    if (lifetime) return `Lifetime ${label}`;
    return trialActive(trial) ? `${label} trial` : label;
  }

  /** Below Desktop Pro, or on its trial: same rule as the desktop app's Upgrade. */
  function canUpgrade(pkg, trial) {
    if (pkg === "business") return false;
    return pkg !== "desktop_pro" || trialActive(trial);
  }

  /** What to offer someone on `pkg`: on a trial both, otherwise only what adds something. */
  function upgradeChoices(pkg, trial) {
    if (!canUpgrade(pkg, trial)) return [];
    if (trialActive(trial)) return PURCHASABLE.slice();
    return PURCHASABLE.filter((id) => RANK[id] > RANK[pkg]);
  }

  /** What a package includes, and for the rest, the package that adds it. */
  function includedRows(pkg) {
    return FEATURES.map(({ key, label, note, from, detail, soon }) => {
      if (soon) return { key, label, note, state: "soon", detail: "Coming soon" };
      if (RANK[pkg] < RANK[from]) return { key, label, note, state: "locked", detail: PACKAGES[from].label };
      return { key, label, note, state: "active", detail: detail?.[pkg] ?? "Active" };
    });
  }

  const money = (cents) => `$${(cents / 100).toFixed(2)}`;

  /**
   * A subscription status in words, or null for one shown as it is. A refund
   * is never a paid plan: an approved full refund ends paid access at once.
   * After a failed renewal, paid access stays for a limited time (7 days on
   * the backend) while the payment is retried.
   */
  function statusText(status) {
    if (status === "refunded") return "Refunded";
    if (status === "past_due") return "Payment failed · paid access for a limited time · update your card in Manage subscription";
    return null;
  }

  window.SI_PACKAGES = Object.freeze({
    ORDER, PACKAGES, FEATURES, PURCHASABLE, ON_SALE, INTERVALS, INTRO_MONTHS, TRIAL_DAYS, CURRENCY, FREE_ANONYMISE_LIMIT,
    BUSINESS_MIN_SEATS, BUSINESS_MAX_SEATS,
    packageOf, hasTier, trialActive, trialDaysLeft, displayName, canUpgrade, upgradeChoices, includedRows,
    isOrgAdmin, money, statusText,
  });
})();
