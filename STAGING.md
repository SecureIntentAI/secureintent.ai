# V2 staging build and safety gates

The approved UI, main's prices, GitHub destination and extension-store links are
unchanged. This change prepares the frontend; it does not provision an API,
Clerk instance, Paddle sandbox, database, or email recipient restrictions.

## Build modes

| Mode | Local command | Published configuration |
| --- | --- | --- |
| Visual preview | `node scripts/prepare-site.mjs --visual-preview` | No live or test services; noindex |
| Connected staging | `node --env-file=.env.staging.local scripts/prepare-site.mjs` | Test-only public settings; noindex |
| Production artifact check | `node scripts/prepare-site.mjs --production` | Existing main public settings; usable only on live domains |

The default local mode is visual preview. None of these commands deploys anything.
Do not publish the repository root; Netlify publishes only `dist`.

## Public settings

Use Node 22 or newer. Copy `.env.example` to `.env.staging.local` and replace
all placeholders. The latter is gitignored and is not copied to `dist`.

- `SI_DEPLOY_ENV=staging`
- `SI_STAGING_SITE_ORIGIN`: exact stable staging site origin; for local review,
  `http://127.0.0.1:3002`. An artifact supports this one configured origin.
- `SI_STAGING_API_BASE`: isolated backend origin. HTTPS is required on Netlify;
  local builds also accept HTTP loopback, e.g. `http://127.0.0.1:8787`.
- `SI_STAGING_CLERK_PUBLISHABLE_KEY`: development-instance `pk_test_` public key.
  The SDK URL is derived from the encoded `*.clerk.accounts.dev` instance host.
  The backend must use matching Clerk test configuration and JWT template
  `secureintent`, including the necessary claims and authorized parties.
- `SI_STAGING_PADDLE_CLIENT_TOKEN`: sandbox `test_` client-side token, never an API key.
- `SI_STAGING_PADDLE_PRICE_ID`: the sandbox personal price ID, distinct from live.
  Configure the separate sandbox team price in the backend, matching $9/seat/month.

Sandbox price IDs cannot be proven to belong to a sandbox from syntax alone.
Verify their catalog ownership in Paddle before enabling connected staging.
Likewise, an API hostname check cannot prove database/secret isolation: audit
Worker bindings and provider configuration before allowing any test writes.

Clerk secret keys, Paddle API/webhook secrets and Brevo credentials belong only
in backend secret storage. Do not put them in Netlify frontend build settings.
The generator exports only known public fields, never all environment variables.

## Netlify setup, after the backend release baseline is verified

1. Keep the production branch `main`. Permit only the approved V2 branch for
   branch deployments; this change does not modify dashboard branch settings.
2. Record Netlify's stable branch URL and use it as `SI_STAGING_SITE_ORIGIN`.
   Confirm Clerk callbacks, backend CORS/authorized parties and Paddle return
   URLs against that exact origin.
3. Set the five public `SI_STAGING_*` values with build scope for this branch
   only, not production or untrusted PR previews. `netlify.toml` selects staging
   for branch deploys; the build additionally requires `BRANCH=SecureintnentV2`.
4. PR deploy previews select visual-only mode. Supplying staging values to a
   visual-only or production build is an error, catching accidental broad scoping.
5. A missing setting fails before `dist` is changed. Do not bypass the check;
   complete provisioning or use an explicit disconnected local visual preview.

Immutable deploy URLs differ from the stable branch origin and deliberately
cannot invoke staged services with this artifact. Use the stable URL for auth
and checkout testing. A preview remains publicly reachable unless separately
access-protected; `noindex` is not authentication.

Before production release, rebuild in production context on `main`. Never
promote a staging-configured artifact directly. Review the diff and rollout
with the owner; this work does not approve a production merge or deployment.

## Validation

```sh
node test/staging-config.test.mjs
node test/staging-build.check.mjs
node scripts/preview-site.mjs
```

The build test packages all three modes, validates their artifacts and checks
that invalid settings fail without replacing the last artifact. It finishes
with visual-only output and uses synthetic public settings, not real services.
Do not run it concurrently with a real deployment packaging job in this worktree.

Browser fixture checks, with the preview server running:

```sh
PW=../Secureintent-Extension/node_modules/@playwright/test \
BASE=http://127.0.0.1:3002 DESIGN_PATH=/ node test/v2-integrations.check.cjs
PW=../Secureintent-Extension/node_modules/@playwright/test \
BASE=http://127.0.0.1:3002 node test/team-console.check.js
PW=../Secureintent-Extension/node_modules/@playwright/test \
BASE=http://127.0.0.1:3002 node test/release-browser.check.cjs
```

These tests do not prove real authentication, paid entitlements, webhook delivery,
email delivery, or extension synchronization. Complete those journeys on the
isolated services before release. The expanded resource CSP remains report-only
until real Clerk/Paddle behavior has been reviewed; its origins now follow the
selected environment and staging omits production analytics origins.
