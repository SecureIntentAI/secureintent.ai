/* Build-time public configuration only. Never serialize process.env wholesale. */
export const stagingBranch = 'SecureintnentV2';
const fields = ['apiBase', 'clerkPublishableKey', 'clerkScriptUrl', 'jwtTemplate', 'paddleToken', 'paddleEnv', 'priceId'];
export const stagingVariables = {
  siteOrigin: 'SI_STAGING_SITE_ORIGIN',
  apiBase: 'SI_STAGING_API_BASE',
  clerkPublishableKey: 'SI_STAGING_CLERK_PUBLISHABLE_KEY',
  paddleToken: 'SI_STAGING_PADDLE_CLIENT_TOKEN',
  priceId: 'SI_STAGING_PADDLE_PRICE_ID',
};

export function buildMode(env = {}, args = []) {
  const flags = args.filter(arg => ['--production', '--staging', '--visual-preview'].includes(arg));
  if (flags.length > 1 || args.some(arg => !flags.includes(arg))) throw new Error('Use one build mode: --production, --staging or --visual-preview.');
  const explicit = flags[0]?.slice(2);
  const configured = env.SI_DEPLOY_ENV;
  if (explicit && configured && explicit !== configured) throw new Error('Conflicting build modes.');
  const mode = explicit || configured || (env.CONTEXT === 'production' ? 'production' : 'visual-preview');
  if (!['production', 'staging', 'visual-preview'].includes(mode)) throw new Error('Invalid SI_DEPLOY_ENV.');
  if (env.CONTEXT === 'production' && mode !== 'production') throw new Error('Production context requires production configuration.');
  if (env.CONTEXT && env.CONTEXT !== 'production' && mode === 'production') throw new Error('Non-production context cannot build production configuration.');
  if (env.NETLIFY === 'true') {
    if (mode === 'production' && (env.CONTEXT !== 'production' || env.BRANCH !== 'main')) throw new Error('Production build must use main in the production context.');
    if (mode === 'staging' && (env.CONTEXT !== 'branch-deploy' || env.BRANCH !== stagingBranch)) throw new Error('Connected staging is restricted to the approved branch deploy.');
  }
  return mode;
}

function origin(value, name, hosted) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute origin.`); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback && !hosted)) ||
      (hosted && loopback) || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      /^(?:www\.|api\.|clerk\.)?secureintent\.ai\.?$/i.test(url.hostname)) {
    throw new Error(`${name} must be a staging HTTPS origin (local HTTP loopback is allowed only locally).`);
  }
  return url.origin;
}

export function publicConfig(production, env = {}, mode = buildMode(env)) {
  if (!['production', 'staging', 'visual-preview'].includes(mode)) throw new Error('Invalid build mode.');
  const live = Object.fromEntries(fields.map(key => [key, production[key]]));
  const present = Object.values(stagingVariables).filter(key => env[key]);
  // A staging artifact carries no usable production configuration, even if
  // accidentally served on the live domain. Production must be rebuilt.
  if (mode === 'production') {
    if (present.length) throw new Error('Staging settings must not be supplied to production builds.');
    return {production: live, preview: null};
  }
  if (mode === 'visual-preview') {
    if (present.length) throw new Error('Staging values require SI_DEPLOY_ENV=staging; refusing an ambiguous visual-only build.');
    return {production: null, preview: null};
  }
  const missing = Object.values(stagingVariables).filter(key => !env[key]?.trim());
  if (missing.length) throw new Error(`Missing public staging settings: ${missing.join(', ')}`);
  const hosted = env.NETLIFY === 'true';
  const settings = Object.fromEntries(Object.entries(stagingVariables).map(([key, name]) => [key, env[name].trim()]));
  const siteOrigin = origin(settings.siteOrigin, stagingVariables.siteOrigin, hosted);
  const apiBase = origin(settings.apiBase, stagingVariables.apiBase, hosted);
  if (!/^pk_test_[A-Za-z0-9+/=_-]+$/.test(settings.clerkPublishableKey)) throw new Error('Staging requires a Clerk test publishable key.');
  const encoded = settings.clerkPublishableKey.slice('pk_test_'.length);
  const clerkHost = Buffer.from(encoded, 'base64').toString('utf8');
  if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.clerk\.accounts\.dev\$$/.test(clerkHost)) throw new Error('Clerk test key must identify a development instance.');
  if (!/^test_[A-Za-z0-9_]+$/.test(settings.paddleToken)) throw new Error('Staging requires a Paddle sandbox client-side token.');
  if (!/^pri_[a-z0-9]{26}$/.test(settings.priceId) || settings.priceId === live.priceId) throw new Error('Staging requires a separate sandbox price ID.');
  return {production: null, preview: {
    apiBase, clerkPublishableKey: settings.clerkPublishableKey,
    clerkScriptUrl: `https://${clerkHost.slice(0, -1)}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`,
    jwtTemplate: 'secureintent', paddleToken: settings.paddleToken,
    paddleEnv: 'sandbox', priceId: settings.priceId, allowedOrigins: [siteOrigin],
  }};
}

export function serializeConfig(config) {
  return '/* Generated public configuration; never add server credentials. */\nwindow.SI_CONFIG = ' +
    JSON.stringify(config, null, 2).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029') + ';\n';
}

export function resourcePolicy(config, hashes, production) {
  const active = production ? config.production : config.preview;
  const clerk = active ? new URL(active.clerkScriptUrl).origin : '';
  const api = active ? new URL(active.apiBase).origin : '';
  const analyticsScript = production ? 'https://www.googletagmanager.com' : '';
  const analyticsConnect = production ? 'https://*.google-analytics.com https://www.googletagmanager.com' : '';
  return `default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; script-src 'self' ${[...hashes].join(' ')} ${clerk} https://cdn.paddle.com ${analyticsScript} https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; img-src 'self' data: blob: https://img.clerk.com https://*.paddle.com${production ? ' https://www.google-analytics.com' : ''}; media-src 'self' blob:; connect-src 'self' ${api} ${clerk} https://*.paddle.com ${analyticsConnect}; frame-src 'self' ${clerk} https://*.paddle.com https://challenges.cloudflare.com; form-action 'self'`.replace(/ +/g, ' ');
}
