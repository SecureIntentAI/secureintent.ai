# Landing Page — Pre-Launch TODO (launch: July 10, 2026)

Review date: 2026-07-07. File: `index.html` (single-file, inline CSS/JS).

## 🔴 Blockers — must fix before launch

- [ ] **Add OG image.** `og:image` / `twitter:image` point to `secureintent.ai/og-image.jpg` (index.html:21, :29) but the file doesn't exist → broken social share previews everywhere. Add `og-image.jpg` (1200×630).
- [ ] **Fix "100% Accuracy" claim** (index.html:403, :621, :622). Indefensible absolute for regex detection; false-advertising risk. Soften → "high-accuracy" / "near-zero false negatives".
- [ ] **Fix "zero remote logging / 100% local execution" (index.html:770) + "Zero retention guaranteed" (index.html:917).** Contradicts the product — extension DOES send telemetry (salted fingerprint + action + detection metadata → Worker→Queue→ClickHouse). Correct claim = "raw pasted text never leaves your device; only anonymized detection metadata is sent."
- [ ] **Verify advisor consent** — "Greg Day", "Rick Mishcka, Ph.D." (index.html:767-810). Greg Day is a real, prominent CISO. Need signed consent to list them as advisors; false-endorsement/defamation risk otherwise. Also verify "Mishcka" spelling.
- [ ] **Test waitlist endpoint** `https://api.secureintent.ai/submit` (index.html:1182). Confirm live + CORS-open from secureintent.ai origin + rows land in D1. If down on launch, every signup shows "Something went wrong."
- [ ] **Fix fake scarcity counters** — hardcoded `442/500`, `489/500` (index.html:294, :310), decrement only in submitter's own browser, never synced = fabricated inventory. FTC/consumer-protection risk. Wire to real counts or drop the "X/500 remain" framing.

## 🟡 Should-fix

- [ ] **Pin countdown timezone** (index.html:1287). `new Date('July 10, 2026 00:00:00')` uses visitor local time → launch fires at different absolute moments per zone. Pin to UTC or a single TZ.
- [ ] **Post-launch CTA swap.** At T-0 only a "SYSTEM LIVE" badge appears (index.html:232); hero stays an email form. No "Add to Chrome" / Web Store link anywhere. Plan the swap so the primary CTA becomes the store listing on launch day.
- [ ] **Make GitHub repo public** — `github.com/Secureintent-Admin/Secureintent-Extension`. "Auditable code" is a broken promise if it 404s at launch.
- [ ] **Serve real security.txt** at `/.well-known/security.txt` — currently only shown in a modal; the real path would 404 for researchers.
- [ ] **Analytics/consent** — cloudfront analytics script (index.html:38). Confirm provider + EU cookie-consent if targeting EU traffic.
- [ ] **Demo video perf** (index.html:352-360). 2.2MB mp4 — confirm `muted playsinline` for mobile autoplay + lazy-load so it doesn't tank LCP.

---
Safe mechanical fixes Claude can do now: claim wording (#2, #3), countdown UTC pin (#7), video autoplay attrs (#12).
Business/ops decisions (owner only): OG asset (#1), advisor consent (#4), endpoint test (#5), scarcity counts (#6), repo visibility (#9).
