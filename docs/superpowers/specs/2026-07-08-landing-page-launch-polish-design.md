# Landing Page Launch Polish — Design

**Date:** 2026-07-08 · **Launch:** 2026-07-10 · **File:** `index.html` (single-file, inline CSS/JS, Tailwind CDN)

## Goal
Ship a polished, launch-ready landing page: refined restyle of the existing dark/cyan/mono
"security terminal" theme + four requested additions (WhatsApp support, Web Store reviews,
conversion lifts, launch-safe claim fixes). No build system introduced.

## Non-goals
- No framework/bundler. Keep Tailwind CDN + inline styles.
- No fabricated data. Owner-only items (OG asset, advisor consent, live endpoint test,
  real scarcity counts, public repo) are listed, not faked.

## 1. Restyle — "Refined Security Terminal"
Keep brand identity, add hierarchy and depth.

- **Color:** base → blue-tinted near-black `#050608`; card surface `#0c0e12` with hairline
  `rgba(255,255,255,.06)` borders. Cyan `#72FFFF` stays the accent/data color but is demoted
  from CTA duty. Introduce a single high-contrast **primary CTA** style (solid white→cyan)
  so primary actions stand out from ambient cyan.
- **Depth:** gradient card tops, glow reserved for interactive/hero elements only (reduce
  ambient glow noise).
- **Typography/rhythm:** tighten hero scale; consistent section vertical spacing; improved
  body line-height. Keep Inter (sans) + Fira Code (mono).
- **Cards:** unify to one component look (currently drifts between sections); consistent
  spotlight hover.

Tailwind config: extend `brand` palette with `bg2`/`surface`/`line` tokens; add a
`primary` CTA utility pattern. Backwards-compatible — existing `brand-cyan` usages keep working.

## 2. WhatsApp Business support
- Number: **+44 7775 531198** → `https://wa.me/447775531198?text=<prefilled support msg>`.
- **Floating sticky button**, bottom-right, on `index.html`, `privacy.html`, `tos.html`.
  WhatsApp brand green (`#25D366`), circular, subtle entrance, accessible label,
  `rel="noopener"`, opens new tab. Non-clashing with cyan.
- **Footer** contact row: add "WhatsApp Support" link alongside existing email contacts.

## 3. Chrome Web Store reviews / testimonials
- New section **above pricing** ("Trusted by builders" / social proof).
- 3–4 testimonial cards: 5-star row, quote, name, role/company, small "Chrome Web Store"
  badge. Unified card style from §1.
- **Content = clearly-marked placeholders.** Each card wrapped with
  `<!-- PLACEHOLDER TESTIMONIAL — replace with real, consented reviews before launch -->`.
  Structure built for one-for-one swap. No real names invented that imply endorsement.
- Optional aggregate rating line ("★ 4.x — swap with real Web Store rating") also flagged.

## 4. Conversion lifts
- Reinforce a **single primary CTA** visual (from §1) at hero + repeated mid-page.
- Social proof placement: reviews section sits before pricing to warm the pricing decision.
- Tighten trust badges row; keep scarcity framing only where backed (owner to wire real
  counts per todo #6 — until then no *new* fake counters added).
- Ensure CTAs are reachable on mobile; sticky WhatsApp aids support-driven conversion.

## 5. Launch-safe fixes (from todo.md, safe subset only)
- **Claims:** soften "100% Accuracy" → "high-accuracy / near-zero false negatives"
  (index.html:403, :621, :622).
- **Logging claim:** correct "zero remote logging / 100% local execution" (:770) and
  "Zero retention guaranteed" (:917) → "raw pasted text never leaves your device; only
  anonymized detection metadata is sent."
- **Countdown:** pin to UTC (:1287) so launch fires at one absolute moment.
- **Video:** ensure `muted playsinline` + lazy attributes (:352–360) for mobile autoplay + LCP.

## Owner-only (documented, NOT done here)
OG image asset · advisor consent (Greg Day / Rick Mishcka) · waitlist endpoint live test ·
real scarcity counts · make GitHub repo public · real `/.well-known/security.txt` ·
analytics/EU consent. Surfaced in final report as a pre-launch checklist.

## Files touched
- `index.html` — restyle, reviews section, WhatsApp (float + footer), conversion, claim fixes.
- `privacy.html`, `tos.html` — WhatsApp floating button only.

## Success criteria
- Page renders, no console errors, responsive (mobile→desktop).
- WhatsApp link opens correct chat with prefilled text.
- Reviews section present with visible PLACEHOLDER markers.
- All safe claim fixes applied; countdown UTC-pinned; video mobile-autoplay attrs present.
- Owner-only items listed in handoff, none fabricated.
