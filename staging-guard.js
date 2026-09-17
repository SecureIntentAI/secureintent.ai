/*
 * staging-guard.js — SecureIntent staging/production safety guard.
 *
 * Loaded FIRST on every page. On production hostnames it does nothing at all
 * (returns immediately), so production behaves exactly as before. On any other
 * hostname (Netlify branch deploy, deploy preview, localhost) it makes every
 * production-writing path inert, so a staging copy of the site can never touch
 * live systems:
 *   - blocks every request to api.secureintent.ai — the single write host behind
 *     entitlement, billing, promo, attribution and uninstall feedback;
 *   - neutralises Paddle so no real checkout / billing overlay can open;
 *   - flags analytics off (index.html gates the GA4 loader on this flag);
 *   - injects <meta name="robots" content="noindex"> as defence-in-depth.
 *
 * PROD_HOSTS is the ONLY thing that decides prod vs non-prod. Add a new
 * production hostname here (and nowhere else) if one is ever introduced.
 */
(function () {
  "use strict";

  var PROD_HOSTS = ["secureintent.ai", "www.secureintent.ai"];
  var isProd = PROD_HOSTS.indexOf(location.hostname) !== -1;
  window.SI_IS_PROD = isProd;

  if (isProd) return; // Production: change nothing.

  // 1) Block all calls to the production API (the single write host).
  var realFetch = (typeof window.fetch === "function") ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    var url = (typeof input === "string") ? input : (input && input.url) || "";
    if (/api\.secureintent\.ai/i.test(url)) {
      console.warn("[staging-guard] blocked production API request:", url);
      return Promise.reject(new Error("staging: production API is disabled"));
    }
    return realFetch ? realFetch(input, init) : Promise.reject(new Error("fetch unavailable"));
  };

  // 2) Neutralise Paddle — defined before the SDK loads, so no real checkout can open.
  var paddleStub = {
    Environment: { set: function () {} },
    Initialize: function () {},
    Setup: function () {},
    Checkout: { open: function () { console.warn("[staging-guard] Paddle checkout blocked on staging"); } }
  };
  try {
    Object.defineProperty(window, "Paddle", {
      configurable: true,
      get: function () { return paddleStub; },
      set: function () { /* ignore the real SDK assigning itself on staging */ }
    });
  } catch (e) { window.Paddle = paddleStub; }

  // 3) Analytics off (index.html gates the GA4 loader on this flag).
  window.SI_DISABLE_ANALYTICS = true;

  // 4) Defence-in-depth noindex — hostname-aware, so production stays indexable.
  try {
    var m = document.createElement("meta");
    m.name = "robots";
    m.content = "noindex, nofollow";
    (document.head || document.documentElement).appendChild(m);
  } catch (e) {}

  console.info("[staging-guard] non-production host (" + location.hostname +
    ") — live integrations disabled.");
})();
