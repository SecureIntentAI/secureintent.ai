# SecureIntent website

The production website for SecureIntent, a browser extension that helps users
identify exposed credentials before they reach AI tools. The site is a static
HTML/CSS/JavaScript application with progressive enhancement for authentication,
account, billing and team features.

Production: https://secureintent.ai

## Current release

The approved `designs/secureintent-site-v1/` experience is deployed from
`main`.

| Item | Value |
| --- | --- |
| Repository | `SecureIntentAI/secureintent.ai` |
| Production branch | `main` |
| Release commit | `232b005` |
| Hosting | Netlify |
| Production API | `https://api.secureintent.ai` |
| Business Pro price | `$9 per seat/month` |

The production website release changed the frontend only. The existing
production backend remains the service used by the website and extension.

## Features

The site contains the following public and authenticated areas:

- Marketing pages covering the product, solutions, architecture, roadmap and company.
- Documentation, examples and installation guidance.
- Clerk sign-up, sign-in, password reset, profile and sign-out.
- Account entitlements, usage, billing portal and subscription management.
- Paddle checkout using the existing production plan and pricing contracts.
- Business Pro team management, including seats, invitations, roles, policies,
  metrics and alert controls.
- Business enquiry forms. The existing backend stores the email and plan interest;
  name and company are intentionally not persisted.
- Lifetime promotion email-code verification and entitlement flow.
- Extension uninstall feedback and installation-token handling.

The existing product destinations are preserved:

- GitHub: https://github.com/Secureintent-Admin/Secureintent-Extension
- Chrome: https://chromewebstore.google.com/detail/secureintent/ejdhcakapnkbmfihgoamdnajgimhemof
- Firefox: https://addons.mozilla.org/en-US/firefox/addon/secureintent/

Install buttons are browser-aware: Chrome-based browsers use the Chrome Web
Store, while Firefox uses Mozilla Add-ons. The behavior is centralized in
`install-links.js`.

## Repository layout

```text
designs/secureintent-site-v1/  Approved website source and integration pages
scripts/                      Build and local preview utilities
test/                         Release, configuration and browser regression checks
dist/                         Generated Netlify publish directory
netlify.toml                  Netlify build and deployment-context configuration
.env.example                  Public staging configuration template
STAGING.md                    Frontend staging build and safety instructions
```

The approved design is the source of truth for the visual experience. The root
HTML files and generated `dist/` output are deployment artifacts from earlier
site versions and should not be changed casually when working on the V2 design.

## Local development

Use Node.js 22 or newer.

Create a production-shaped local artifact:

```sh
node scripts/prepare-site.mjs --production
node scripts/preview-site.mjs
```

Open http://127.0.0.1:3002/ after the preview server starts. This serves the
generated static files; authenticated actions still require the appropriate
service configuration and a permitted origin.

Create a disconnected visual preview:

```sh
node scripts/prepare-site.mjs --visual-preview
node scripts/preview-site.mjs
```

A visual preview is deliberately noindex and must not contact production
authentication, billing or API services.

## Build and configuration modes

`node scripts/prepare-site.mjs` generates the publish directory consumed by
Netlify. It:

- copies only approved static files from the design source;
- renders the documentation pages;
- normalizes the design routes to production root routes;
- generates redirects, sitemap, robots and security headers;
- writes environment-specific public integration configuration;
- rejects mixed or incomplete provider configuration before changing `dist`.

There are three supported modes:

| Mode | Command | Intended use |
| --- | --- | --- |
| Visual preview | `node scripts/prepare-site.mjs --visual-preview` | Safe disconnected review |
| Connected staging | `node --env-file=.env.staging.local scripts/prepare-site.mjs` | Isolated test services only |
| Production | `node scripts/prepare-site.mjs --production` | `main` and the live domain |

`.env.example` contains public browser settings only. Never place Clerk secret
keys, Paddle API or webhook credentials, Brevo credentials, database passwords
or other server secrets in this repository or in Netlify frontend variables.
Those credentials belong in the backend provider's secret storage.

Read [STAGING.md](STAGING.md) before configuring a connected staging build.

## Validation

Run the release checks after generating the production artifact:

```sh
node scripts/prepare-site.mjs --production
node test/release.check.mjs
```

The release check validates the generated file manifest, local links and
assets, required production identifiers, package boundaries and security
headers. The current release also passed the frontend integration, team-console
and browser checks, plus the backend regression suite maintained in the
separate backend worktree.

The production release was additionally checked in the browser at desktop and
mobile widths, including authentication, password reset, email delivery,
payment behavior and ClickHouse-backed functionality. These checks provide
release evidence; they are not a substitute for monitoring or a penetration
test, and no system can honestly promise absolute security.

## Deployment

Netlify is connected to the GitHub repository and publishes only `dist/`:

```toml
[build]
command = "node scripts/prepare-site.mjs"
publish = "dist"
```

The production branch is `main`. A reviewed push to `main` starts the Netlify
production build. Before pushing a release:

1. Confirm the working tree and branch.
2. Generate the production artifact.
3. Run `node test/release.check.mjs`.
4. Review the diff and generated package boundaries.
5. Commit with a meaningful release or fix message.
6. Push `main` and verify the resulting Netlify deployment.
7. Run live smoke checks for the homepage, account, team and API health.

Do not promote a staging-configured artifact to production. Do not run real
payments, cancellations, invitations or entitlement changes as tests without
an explicitly approved test account and scope.

## Environments

The frontend production release uses the existing live public configuration.
The separate backend staging environment is maintained outside this repository
on branch `staging/secureintent-v2`.

The staging Worker is intentionally disabled until isolated provider settings
are configured. It must not receive production secret values. See the workspace
handoff document and the backend `STAGING.md` for the full staging status and
remaining provider setup.

## Security and operations

- Public publishable/client identifiers may be present in browser configuration;
  secret credentials must never be shipped to the browser.
- Authentication is provided by Clerk and authorization is enforced by the API;
  CORS does not replace authorization.
- Billing prices and entitlement changes are controlled by the backend and
  verified through Paddle's server-side webhook flow.
- Business enquiries retain the existing email/tier-only data contract.
- Private account and team pages are marked noindex and no-store; noindex is
  not access control.
- Keep the current Netlify deployment available as the frontend rollback target.
- Coordinate any production credential rotation with the owner/CTO and verify
  dependent services after the cutover.

## Branches

- `main` — production branch.
- `SecureintnentV2` — retained V2 design/integration branch; the spelling is
  intentional.

The V2 branch was merged into `main` for the current production release. Keep
it until the release has been stable long enough for the owner to approve its
cleanup.

## Related documentation

- [Frontend staging guide](STAGING.md)
- [Approved design notes](designs/secureintent-site-v1/README.md)
- Workspace deployment handoff: maintained in the shared deployment record.
- Backend staging guide: maintained in the separate backend repository.
