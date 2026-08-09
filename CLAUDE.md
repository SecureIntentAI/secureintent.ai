# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The public `secureintent.ai` website for **SecureIntent.AI** — a DLP browser extension that warns
developers before they paste secrets into AI chats and other sites. Marketing site *and* the app's
account surface: the extension has no in-extension sign-in, so `account.html` is where users sign in
(Clerk) and buy Pro (Paddle).

**No build system, no framework, no dependencies.** Every page is a hand-written, self-contained HTML
file with inline `<style>` and inline `<script>`; Tailwind, Font Awesome, Google Fonts, Clerk, and
Paddle all load from CDNs. There is no `package.json`, no bundler, no CI in this repo — you edit HTML
and the files are served as-is. Keep it that way (see `docs/superpowers/specs/` — "no
framework/bundler" is an explicit non-goal). Nothing to run: open the file in a browser, or serve the
directory statically for the API calls to work against a real origin.

### Sibling repos (separate git remotes, one product)

- `../ext` — the WXT browser extension. Links here for account/plan (`ACCOUNT_URL` =
  `secureintent.ai/account.html`) and for Terms/Privacy (`/tos`, `/privacy` — keep those paths alive).
- `../backend` — the Cloudflare Worker at `api.secureintent.ai` that every fetch on this site hits.

## Pages

| File | Role |
| --- | --- |
| `index.html` | the landing page — ~1.6k lines, single-file, all sections inline (`#tiers`, `#architecture`, `#how-it-works`, `#coverage`, `#threat-intel`, `#advisors`, `#roadmap`, plus VDP / PGP / security.txt / status / billing modals). Waitlist form → `POST api.secureintent.ai/submit`. |
| `account.html` | Clerk sign-in/sign-up + user profile, plan display, Paddle checkout, and billing portal. The extension's account destination. |
| `lifetime_promo.html` | Lifetime Pro redemption: email → 6-digit code → grant, via `/v1/promo`, `/v1/promo/start`, `/v1/promo/verify`. |
| `advisory-board.html`, `privacy.html`, `tos.html` | static content pages. |
| `todo.md` | pre-launch review findings (claim wording, fake scarcity counters, timezone-pinned countdown…). Read before touching marketing copy — several items are legal/FTC-risk claims, and some are owner-only decisions. |
| `demo.mp4`, `og-image.png`, `favicon-*.png` | assets referenced by absolute `https://secureintent.ai/...` URLs in the meta tags. |

## Backend contract

`account.html` config block (`CFG`, near the bottom) holds `apiBase: https://api.secureintent.ai`, the
Paddle **client-side** token + price id, and `jwtTemplate: "secureintent"` — the custom Clerk JWT
template that carries `email` + `public_metadata`. Tokens are minted with
`Clerk.session.getToken({ template })` and sent as `Authorization: Bearer` to:

- `GET /v1/entitlement` → `{ entitlement: { plan, pro, features, … }, signature }`; plan labels map
  `developer` → Free, `developer_pro` → Developer Pro, `business_pro` → Business Pro.
- `POST /v1/billing/portal` → Paddle customer-portal URL (manage/cancel).
- Checkout runs client-side via `Paddle.Checkout.open` with
  `customData: { clerk_user_id }` — that field is how the Paddle webhook maps the subscription back to
  a Clerk user in the Worker. Don't drop or rename it.

Clerk loads from the custom Frontend API domain `https://clerk.secureintent.ai` with the publishable
key inline (`pk_live_…` — public by design). The extension mirrors this same session: on Chrome via
Clerk's sync host, on Firefox by reading the `__session` cookie on this domain. **Changing the Clerk
domain, publishable key, or JWT template breaks extension auth** — coordinate with `../ext`
(`src/lib/clerkConfig.ts`) and the Worker's `CLERK_AUTHORIZED_PARTIES`.

The Worker's CORS allowlist for `/submit` is `https://secureintent.ai`,
`https://www.secureintent.ai`, `http://localhost:3000` — use port 3000 if you serve locally and want
the waitlist form to work.

## Creator attribution

Creator links are plain UTM links — no per-creator page, no redirect service:

```
https://secureintent.ai/?utm_source=<creator>&utm_medium=creator&utm_campaign=<campaign>
https://secureintent.ai/?ref=<creator>        # short hand-written form, same effect
```

`window.SI_ATTR` (inline in `index.html`, mirrored in `account.html`) captures the **first** creator
it ever sees into `localStorage` + a cookie on `.secureintent.ai`, 90 days. First touch wins; a later
link never overwrites it. The value is attached to GA4 as the `creator` user property and to the
`install_click` event.

The Chrome Web Store drops query params, so installs can't be attributed. The funnel that *is*
measurable: GA4 gives click-through per `utm_source`; `account.html` then POSTs the stored values to
`/v1/attribution` after sign-in (inside `loadPlan`, fire-and-forget, guarded by a `si_creator_sent`
flag), which writes `users.creator` in D1 and gives real signup → paid numbers per creator on
`/admin/users-insights`.

Keep the two capture blocks in sync — same keys (`si_creator`, `si_creator_medium`,
`si_creator_campaign`), same cookie domain. If a creator link ever points at a third page, copy the
block there too.

## Conventions

- Dark "security terminal" theme: near-black `#050608` base, card surface `#0c0e12`, hairline
  `rgba(255,255,255,.06)` borders, cyan `#72FFFF` as accent/data color, one solid white→cyan primary
  CTA. Inter (sans) + Fira Code (mono). Full rationale in `docs/superpowers/specs/`.
- Tailwind is the CDN build configured inline via `tailwind.config = {...}` in `index.html` — extend
  the theme there, not in a config file.
- Analytics: GA4 (`G-PSSL40SRTR`) plus a CloudFront-hosted script. Install buttons fire an
  `install_click` event by selecting `a[href*="chromewebstore.google.com/detail/secureintent"]`, so
  keep that href shape for attribution to work.
- Claims about privacy must match the product: raw pasted text never leaves the device, but the
  extension *does* send anonymized detection metadata (salted fingerprint + action + site). Don't
  write "zero telemetry" / "100% local" / absolute accuracy claims.
