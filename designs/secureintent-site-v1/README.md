# SecureIntent site v1

Approved design and functional integration on `SecureintnentV2`. Business
behavior, service identifiers and extension destinations are retained from main.

Final design pages (37 public HTML pages including the documentation routes):

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
- `team.html` — the approved public design with the authenticated console from
  `main`: overview, people, seat purchases, policy settings and alerts.
- `account.html` — Clerk authentication/profile, entitlements, Paddle checkout,
  subscription management and the route into team management.
- `lifetime_promo.html` — server-verified email codes and lifetime claims.
- `uninstall.html` — real installation-token feedback with one-tap reasons and
  optional comments; no fabricated submission without an installation ID.
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

For a local review of the Netlify root-site package, run
`node scripts/prepare-site.mjs --production` followed by
`node scripts/preview-site.mjs` from the worktree root. Open
`http://127.0.0.1:3002/`. This is local review only; the live site is deployed
from the repository's `main` branch.

Account, team, business enquiry and lifetime promotion now use the service
contracts from `main`. See [INTEGRATIONS.md](INTEGRATIONS.md) for configuration,
testing and remaining launch requirements. Business enquiries use the existing
email-and-tier endpoint; name/company are deliberately not submitted or saved.
Their new runtime requires explicit test services on non-production hosts.
The Netlify configuration publishes only generated `dist` with root routes,
security headers and SEO metadata. It excludes internal docs, tests and legacy
root HTML. Production is deployed from `main`; see the repository root
`README.md` for the current release record and the integration checklist for
environment-specific staging requirements.

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
