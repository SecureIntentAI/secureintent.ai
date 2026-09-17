# SecureIntent site v1

Connected page-by-page design work on `staging-v2.1`. The original
`staging-v2` pages remain the source for product content and feature claims.

Final review pages (21 total):

- `index.html` — approved homepage visual direction, copied from
  `soft-homepage-v1` for the connected-site review route.
- `solutions.html` — redesigned Solutions page. It carries forward the browser
  extension, team controls, desktop application, MCP/agent security, and team
  enquiry content from `staging-v2/solutions.html`.
- `how-it-works.html` — the dedicated workflow page requested in CTO review.
  It carries forward the on-device detection, anonymise/block choice,
  Dehydrate & Rehydrate context, and team-policy model from `staging-v2`.
- `business.html` — redesign of the prior Business scaffold. It makes the
  available Business Pro plan explicit and keeps reporting, Shadow AI discovery,
  governance and MCP visibility distinct as future work.
- `architecture.html` — browser, desktop and MCP protection architecture.
- `about.html` and `advisory-board.html` — the original company, leadership,
  engineering and customer-advisory content.
- `roadmap.html` — the original roadmap timeline, icons, styling and copy,
  embedded in the connected site's shared header and footer. Its source styles
  are scoped in `roadmap.css`.
- `customers.html` — Chrome Web Store review content.
- `team.html` — a design preview of the original authenticated team console;
  no organisation data or API calls are connected in review.
- `account.html`, `lifetime_promo.html` and `uninstall.html` — local-only
  review surfaces for the source account, promo and feedback flows.
- `privacy.html` and `tos.html` — the source legal wording in the shared site
  system.
- `docs.html` and `docs/` — a searchable documentation hub and five focused
  guides: getting started, browser protection, Developer Pro tools, Business
  Pro controls, and architecture, privacy and availability. The reference
  pages retain links to the source legal wording.

Both pages share the same Dark/Light direction: original SecureIntent navy and
cyan, open surfaces, minimal decorative borders, and restrained ambient light.
The local theme preference is stored as `si_site_theme`.

The shared desktop navbar now keeps six primary destinations in one clear
row: Solutions, How it works, Architecture, Business, Roadmap and About. Roadmap
and About open their respective pages within `/designs/secureintent-site-v1/`. Documentation is
available under Product in the shared footer. Mobile navigation follows the
same primary destinations, with additional company and account links.

The shared footer restores the original staging-v2 design: centered logo,
four link columns, contact details, company information and social icons.
Documentation remains under Product. The former large CTA is removed.
Security/support links use accessible dialogs; source demo status figures and
the placeholder PGP key are not represented as live data or a usable key.

Serve the repository root and visit:
`http://127.0.0.1:3001/designs/secureintent-site-v1/solutions.html`.

All review-only forms are intentionally local-only. They do not send, retain,
authenticate, issue entitlement, or connect to billing/team services.
`staging-guard.js` is loaded first, keeping preview pages isolated from
production services.

Solutions refinement (September 2026):

- `solutions.css` refines the type scale, section spacing, surfaces and mobile layout.
- `solutions.js` adds pointer-following cyan light to relevant surfaces, with
  reduced-motion support and no dependency on hover for content or navigation.
- The original HTML/CSS/SVG protection diagram shows paste, on-device review,
  and an anonymised prompt. Each step is a native button usable by touch or
  keyboard; its explanation appears below. The team-policy connection links
  to the separate team capabilities. This is an illustration, not a live scan.
- Product areas retain their source capabilities and availability distinctions.
  The undated Desktop beta label replaces the source's ambiguous September date.
- Public review: https://secureintent-homepage-review.vercel.app/designs/secureintent-site-v1/solutions.html

- Business Pro review: https://secureintent-homepage-review.vercel.app/designs/secureintent-site-v1/business.html

How It Works uses an original, interactive product diagram. Its four controls
are keyboard and touch accessible, and the mobile view shows the active stage
without requiring hover. It illustrates the browser workflow; it is not a live
credential scan.
