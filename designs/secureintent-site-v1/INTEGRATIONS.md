# V2 functional integration and release checklist

Branch: `SecureintnentV2`. Business contracts and public provider identifiers
come from website `main` at `3612483c392b3c9d9122f8e6c5459605e27d0e52`;
the remote main reference was checked during this work and matches.
No merge into main or production deployment has been performed. Publishing this
branch does not mean the remaining launch gates have passed.

## Design and business behavior

The approved static HTML/CSS design remains the source of the new site. No
frontend framework or bundler was introduced. A dependency-free Node packaging
step creates the root-route Netlify publish directory.

- Business Pro: **$9 per seat/month**, matching main's team checkout.
  Developer Pro keeps main's existing price and Paddle price identifier.
- Clerk sign-in, sign-up, profile, sign-out and JWT template `secureintent`.
- Account entitlements/usage, personal checkout, billing portal and cancellation
  of overlapping personal subscriptions.
- Team membership, invitations, seats, payments/recovery, policy, metrics/CSV
  and webhook-alert controls, with main's admin/member and paid/pending gates.
- Homepage, Solutions and Business enquiry forms submit only
  `{email, tier: "biz"}` to the existing `POST /submit`.
  Name/company are deliberately not submitted or saved.
- Lifetime promotion checks availability, sends/resends email codes and verifies
  claims server-side. No successful claim is displayed on a failed response.
- Uninstall reasons use main's installation ID/token contract and one-tap
  submission; optional comments update feedback. No installation ID means no
  fabricated submission.
- Docs account links open the real account page. Docs support opens a prefilled
  email draft to `info@secureintent.ai`; the user must press Send in their email
  client. It is not a newly invented backend support endpoint.
- Main's first-touch creator attribution and production-only GA4 install events
  are retained. Preview analytics and live-service calls are disabled.

Shared marketing styling stays intact. Account/team controls use scoped theme
styles; Clerk renders its real authentication components, not fake HTML forms.

## Exact destinations retained from main

- GitHub: https://github.com/Secureintent-Admin/Secureintent-Extension
- Chrome: https://chromewebstore.google.com/detail/secureintent/ejdhcakapnkbmfihgoamdnajgimhemof
- Firefox: https://addons.mozilla.org/en-US/firefox/addon/secureintent/
- Sign-in: `/account.html`; sign-up: `/account.html?mode=signup`.
- Team: `/team.html`.

The published `install-links.js` is byte-identical to main. The shared V2
adapter also handles dynamically inserted links and Firefox button labels.
All three external destinations returned HTTP 200 during the live checks.

## Configuration and local review

`integrations/config.js` contains only public browser identifiers. Main's
production Clerk domain/key, Paddle token/price and API are selected only on
`secureintent.ai` and `www.secureintent.ai`.

No isolated Clerk test instance, Paddle sandbox configuration or test backend
was found in the inspected local environment files. `preview` therefore stays
`null`. Localhost renders an explicit configuration message for protected
services and never silently falls back to production.

For provider-backed staging, supply public test configuration:

```js
preview: {
  apiBase: 'http://localhost:8787',
  clerkPublishableKey: 'pk_test_REPLACE',
  clerkScriptUrl: 'https://YOUR-TEST-INSTANCE.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js',
  jwtTemplate: 'secureintent',
  paddleToken: 'test_REPLACE',
  paddleEnv: 'sandbox',
  priceId: 'pri_REPLACE_WITH_SANDBOX_PRICE',
},
```

Keep provider secrets, signing keys, database access and email credentials in
the backend. Its CORS origins and Clerk authorized parties must include the
chosen staging origin. Do not remove the preview/live separation to get tests
passing. Clerk also restricts production instances on development origins.

From the worktree root:

```sh
node scripts/prepare-site.mjs --production
node scripts/preview-site.mjs
```

Open **http://127.0.0.1:3002/**. The packaging flag controls SEO/publish metadata,
not permission to use production services on localhost. The original source
review path remains available when serving the repository on port 3000:
`/designs/secureintent-site-v1/index.html`.

Without `--production`, local builds default to non-indexable preview output.
Netlify's `CONTEXT=production` selects production metadata automatically.
`netlify.toml` publishes only `dist`. Do not publish the repository root:
the original root HTML remains as the unchanged main reference, while the
package maps the approved design onto root URLs.

## Verification

```sh
node test/release.check.mjs

PW=../Secureintent-Extension/node_modules/@playwright/test \
BASE=http://127.0.0.1:3002 DESIGN_PATH=/ node test/v2-integrations.check.cjs

PW=../Secureintent-Extension/node_modules/@playwright/test \
BASE=http://127.0.0.1:3002 node test/team-console.check.js

PW=../Secureintent-Extension/node_modules/@playwright/test \
BASE=http://127.0.0.1:3002 node test/release-browser.check.cjs
```

Automated integration tests use intercepted Clerk/Paddle/API fixtures. They
check request contracts and failure behavior, not real payment settlement or
email delivery. Coverage includes auth return paths, checkout identity, plan
failures, included access, pending payments, role gates, seats/invitations,
settings, enquiry forms, promotions, feedback, attribution, safe server text
rendering, and mobile light/dark layouts.

The static release check covers all 38 published HTML documents (including
404), 1,757 local route/asset references, main identifiers, and the public
artifact allowlist. A browser crawl separately checks script errors and missing
local assets. The source documentation HTML was regenerated as well, so local
source review and packaged docs use the same updated content.

Live checks performed without deploying:
- Production health and promo availability returned 200; unauthenticated
  entitlement access returned 401.
- Real Clerk sign-in/sign-up mounted on locally intercepted V2 files under the
  production origin. Both components passed 390px/1280px light/dark layout
  checks after fixing inherited heading styles. This tests the components, not
  a completed user session.
- With the owner's dedicated email authorization, one redesigned business form
  submitted to production: 201, `ok:true`.
- One redesigned promo-code request returned 200, `ok:true`. No code was
  redeemed, account created, entitlement granted or payment made.
- The owner confirmed both welcome and promotion-code emails arrived. A
  successful enquiry API response alone would not prove mail delivery: main
  sends that welcome email asynchronously and does not fail the enquiry on mail errors.

The supplied email is not embedded in site code or published configuration.

## Security boundaries

Production previews fail closed on live provider identifiers. API origin checks,
request timeouts, safe text rendering, Paddle-only HTTPS portal URLs, restricted
auth return parameters and no-script disabled submit buttons protect the new
frontend paths. Backend authorization remains authoritative.

Published headers include no-sniff, anti-framing, restricted browser permissions
and no-store/no-referrer for account, team, promo and uninstall routes. The
enforced CSP restricts base URLs, objects and framing. The fuller SDK/resource
CSP is **report-only**, pending real Clerk/Paddle validation; it must not be
described as a fully enforced script policy. Public pages get canonical URLs,
a sitemap and production robots policy; private/preview pages stay noindex.

These are specific checks and defenses, not an absolute security guarantee,
a backend penetration test or a complete dependency/security audit.

## Remaining launch gates

1. Complete real sign-in in the owner's browser (Google or password; do not
   share a password in chat), verify profile/session, and verify extension sync.
2. Configure isolated provider staging; complete Paddle sandbox checkout,
   webhooks, entitlement updates, seat purchase and billing portal/return flows.
   No real charge or subscription change is authorized by these tests.
3. Welcome/promo mail inbox delivery is confirmed by the owner. Main's existing
   business email still uses waitlist wording; it was intentionally not
   rewritten in this frontend-only change. Review that wording before launch.
4. Validate a Netlify deploy preview with provider staging configuration and
   actual response headers; check mobile/accessibility and CSP reports.
5. Only after approval, deploy the verified commit via the existing Netlify
   main-branch workflow. Keep the prior production deploy available for rollback.

References:
[Clerk production keys in development](https://clerk.com/docs/guides/development/troubleshooting/using-production-keys-in-development),
[Paddle checkout](https://developer.paddle.com/build/checkout/build-overlay-checkout/),
[Netlify build configuration](https://docs.netlify.com/build/configure-builds/overview/),
[Netlify headers](https://docs.netlify.com/manage/routing/headers/).
