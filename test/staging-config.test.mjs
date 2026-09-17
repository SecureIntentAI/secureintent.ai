import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {buildMode, publicConfig, resourcePolicy, serializeConfig, stagingVariables} from '../scripts/site-config.mjs';

const source = {window: {}};
vm.runInNewContext(readFileSync(new URL('../designs/secureintent-site-v1/integrations/config.js', import.meta.url), 'utf8'), source);
const production = source.window.SI_CONFIG.production;
const settings = {
  SI_DEPLOY_ENV: 'staging',
  SI_STAGING_SITE_ORIGIN: 'https://staging.example.test',
  SI_STAGING_API_BASE: 'https://api-staging.example.test',
  SI_STAGING_CLERK_PUBLISHABLE_KEY: 'pk_test_' + Buffer.from('fixture.clerk.accounts.dev$').toString('base64'),
  SI_STAGING_PADDLE_CLIENT_TOKEN: 'test_fixture',
  SI_STAGING_PADDLE_PRICE_ID: 'pri_' + 'a'.repeat(26),
};
const config = env => publicConfig(production, {...settings, ...env}, 'staging');

test('local default is visual-only with no live or test services', () => {
  assert.equal(buildMode(), 'visual-preview');
  assert.deepEqual(publicConfig(production), {production: null, preview: null});
});
test('production retains exactly the existing public identifiers', () => {
  const result = publicConfig({...production, secret: 'private-marker'}, {}, 'production');
  assert.equal(result.production.apiBase, production.apiBase);
  assert.equal(result.production.priceId, production.priceId);
  assert.equal(Object.keys(result.production).length, 7);
  assert.equal(result.preview, null);
  assert.ok(!serializeConfig(result).includes('private-marker'));
});
test('Netlify main production context is accepted', () => {
  assert.equal(buildMode({NETLIFY: 'true', CONTEXT: 'production', BRANCH: 'main'}), 'production');
});
test('only the approved Netlify branch can use connected staging', () => {
  assert.equal(buildMode({NETLIFY: 'true', CONTEXT: 'branch-deploy', BRANCH: 'SecureintnentV2', SI_DEPLOY_ENV: 'staging'}), 'staging');
});
for (const [name, env, args] of [
  ['production flag in a preview', {CONTEXT: 'deploy-preview'}, ['--production']],
  ['staging in production context', {CONTEXT: 'production', SI_DEPLOY_ENV: 'staging'}, []],
  ['production on the wrong branch', {NETLIFY: 'true', CONTEXT: 'production', BRANCH: 'SecureintnentV2'}, []],
  ['staging on an unapproved branch', {NETLIFY: 'true', CONTEXT: 'branch-deploy', BRANCH: 'untrusted', SI_DEPLOY_ENV: 'staging'}, []],
  ['connected PR previews', {NETLIFY: 'true', CONTEXT: 'deploy-preview', BRANCH: 'SecureintnentV2', SI_DEPLOY_ENV: 'staging'}, []],
  ['hosted production without context', {NETLIFY: 'true'}, ['--production']],
  ['conflicting CLI flags', {}, ['--production', '--staging']],
  ['conflicting CLI and environment', {SI_DEPLOY_ENV: 'staging'}, ['--production']],
  ['unknown mode', {SI_DEPLOY_ENV: 'typo'}, []],
  ['unknown flag', {}, ['--prod']],
]) test(`rejects ${name}`, () => assert.throws(() => buildMode(env, args)));

test('public staging output excludes unrelated secrets and production identifiers', () => {
  const result = config({BREVO_API_KEY: 'private-marker', CLERK_SECRET_KEY: 'private-marker', PADDLE_API_KEY: 'private-marker'});
  const js = serializeConfig(result);
  assert.equal(result.production, null);
  assert.equal(result.preview.paddleEnv, 'sandbox');
  assert.equal(result.preview.clerkScriptUrl, 'https://fixture.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js');
  assert.deepEqual(result.preview.allowedOrigins, ['https://staging.example.test']);
  assert.ok(!js.includes('private-marker') && !js.includes('pk_live_') && !js.includes(production.paddleToken));
});
for (const key of Object.values(stagingVariables)) test(`missing ${key} fails closed without printing settings`, () => {
  assert.throws(() => config({[key]: ''}), error => error.message.includes(key) && !error.message.includes(settings.SI_STAGING_PADDLE_CLIENT_TOKEN));
});
for (const value of ['https://api.secureintent.ai', 'https://api.secureintent.ai.', 'https://secureintent.ai', 'https://clerk.secureintent.ai', 'http://api-staging.example.test', 'https://user:password@api-staging.example.test', 'https://api-staging.example.test/path', 'https://api-staging.example.test/?token=private-marker', '//api-staging.example.test']) {
  test(`rejects unsafe staging API origin: ${value.split('?')[0]}`, () => assert.throws(() => config({SI_STAGING_API_BASE: value})));
}
test('rejects production site origin', () => assert.throws(() => config({SI_STAGING_SITE_ORIGIN: 'https://secureintent.ai'})));
test('local-only loopback staging is supported', () => {
  assert.equal(config({SI_STAGING_API_BASE: 'http://127.0.0.1:8787', SI_STAGING_SITE_ORIGIN: 'http://127.0.0.1:3002'}).preview.apiBase, 'http://127.0.0.1:8787');
});
test('hosted staging refuses loopback', () => assert.throws(() => config({NETLIFY: 'true', SI_STAGING_API_BASE: 'http://127.0.0.1:8787'})));
test('visual-only mode rejects accidentally supplied staging values', () => assert.throws(() => publicConfig(production, settings, 'visual-preview')));
test('production mode rejects accidentally supplied staging values', () => assert.throws(() => publicConfig(production, settings, 'production')));
test('rejects live Clerk key', () => assert.throws(() => config({SI_STAGING_CLERK_PUBLISHABLE_KEY: production.clerkPublishableKey})));
test('rejects forged test key for a production Clerk domain', () => assert.throws(() => config({SI_STAGING_CLERK_PUBLISHABLE_KEY: 'pk_test_' + Buffer.from('clerk.secureintent.ai$').toString('base64')})));
test('rejects live Paddle token', () => assert.throws(() => config({SI_STAGING_PADDLE_CLIENT_TOKEN: production.paddleToken})));
test('rejects backend secret instead of client token', () => assert.throws(() => config({SI_STAGING_PADDLE_CLIENT_TOKEN: 'pdl_sdbx_apikey_fixture'})));
test('rejects production personal price', () => assert.throws(() => config({SI_STAGING_PADDLE_PRICE_ID: production.priceId})));
test('rejects malformed price', () => assert.throws(() => config({SI_STAGING_PADDLE_PRICE_ID: 'pri_REPLACE'})));
test('CSP tracks staging origins and omits live analytics origins', () => {
  const csp = resourcePolicy(config(), new Set(["'sha256-fixture'"]), false);
  for (const expected of ['https://api-staging.example.test', 'https://fixture.clerk.accounts.dev', "'sha256-fixture'"]) assert.ok(csp.includes(expected));
  for (const forbidden of ['api.secureintent.ai', 'clerk.secureintent.ai', 'google-analytics.com', 'googletagmanager.com']) assert.ok(!csp.includes(forbidden));
});

const runtime = readFileSync(new URL('../designs/secureintent-site-v1/integrations/runtime.js', import.meta.url), 'utf8');
function browser(configValue, pageOrigin = 'https://staging.example.test') {
  const calls = [];
  const location = new URL(pageOrigin + '/account.html');
  const context = {
    window: {SI_CONFIG: configValue, fetch: async (url, init) => {calls.push({url, init}); return {ok: true};}},
    location, URL, URLSearchParams, AbortController, setTimeout, clearTimeout,
    document: {currentScript: {src: pageOrigin + '/integrations/runtime.js'}, querySelector: () => ({}), head: {append() {}}},
  };
  vm.runInNewContext(runtime, context);
  return {window: context.window, calls};
}
test('runtime rejects staging configuration on an unapproved origin', async () => {
  const {window, calls} = browser(config(), 'https://unknown.example.test');
  await assert.rejects(window.SI.ready(), /origin is not approved/);
  assert.equal(calls.length, 0);
});
test('staging artifact on the live domain cannot enable live services or analytics', async () => {
  const {window, calls} = browser(config(), 'https://secureintent.ai');
  await assert.rejects(window.SI.ready(), /not configured/);
  assert.equal(window.SI_DISABLE_ANALYTICS, true);
  assert.equal(calls.length, 0);
});
test('production artifact on a preview domain cannot enable live services', async () => {
  const {window} = browser(publicConfig(production, {}, 'production'));
  await assert.rejects(window.SI.ready(), /not configured/);
});
test('runtime rejects mismatched API destination before making a request', async () => {
  const {window, calls} = browser(config());
  await assert.rejects(window.SI.fetch('https://api.secureintent.ai/v1/entitlement'), /does not match/);
  assert.equal(calls.length, 0);
});
test('API requests reject redirects and omit cookies even if a caller overrides defaults', async () => {
  const {window, calls} = browser(config());
  await window.SI.fetch('https://api-staging.example.test/v1/entitlement', {redirect: 'follow', credentials: 'include'});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.credentials, 'omit');
});
test('runtime rejects a production Clerk script before SDK load', async () => {
  const unsafe = config();
  unsafe.preview.clerkScriptUrl = production.clerkScriptUrl;
  const {window, calls} = browser(unsafe);
  await assert.rejects(window.SI.ready({auth: true}), /development-instance/);
  assert.equal(calls.length, 0);
});
