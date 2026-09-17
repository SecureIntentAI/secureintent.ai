/* Real packaging tests using synthetic public settings. No provider calls. */
import {execFileSync, spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const cwd = fileURLToPath(new URL('../', import.meta.url));
const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('SI_') && !['NETLIFY', 'CONTEXT', 'BRANCH'].includes(key)));
const staged = {
  ...clean, NETLIFY: 'true', CONTEXT: 'branch-deploy', BRANCH: 'SecureintnentV2', SI_DEPLOY_ENV: 'staging',
  SI_STAGING_SITE_ORIGIN: 'https://staging.example.test', SI_STAGING_API_BASE: 'https://api-staging.example.test',
  SI_STAGING_CLERK_PUBLISHABLE_KEY: 'pk_test_' + Buffer.from('fixture.clerk.accounts.dev$').toString('base64'),
  SI_STAGING_PADDLE_CLIENT_TOKEN: 'test_fixture', SI_STAGING_PADDLE_PRICE_ID: 'pri_' + 'a'.repeat(26),
  BREVO_API_KEY: 'server-secret-fixture-never-publish',
};
function run(args, env = clean) {
  return execFileSync(process.execPath, args, {cwd, env, encoding: 'utf8'});
}
const read = name => readFileSync(new URL('../dist/' + name, import.meta.url), 'utf8');
try {
  console.log(run(['scripts/prepare-site.mjs', '--production']).trim());
  console.log(run(['test/release.check.mjs']).trim());
  console.log(run(['scripts/prepare-site.mjs'], staged).trim());
  console.log(run(['test/release.check.mjs']).trim());
  const scope = {window: {}};
  vm.runInNewContext(read('integrations/config.js'), scope);
  assert.equal(scope.window.SI_CONFIG.production, null);
  assert.equal(scope.window.SI_CONFIG.preview.apiBase, staged.SI_STAGING_API_BASE);
  assert.ok(read('_headers').includes('https://fixture.clerk.accounts.dev'));
  const manifest = JSON.parse(read('.site-manifest.json'));
  for (const name of manifest.files.filter(name => /\.(js|html|txt)$/.test(name))) {
    assert.ok(!read(name).includes(staged.BREVO_API_KEY), 'server secret was not copied: ' + name);
  }
  const before = read('integrations/config.js');
  for (const bad of [
    {...staged, SI_STAGING_API_BASE: 'https://api.secureintent.ai'},
    {...staged, SI_STAGING_PADDLE_CLIENT_TOKEN: ''},
    {...staged, CONTEXT: 'production'},
    {...staged, CONTEXT: 'deploy-preview'},
    {...staged, BRANCH: 'untrusted'},
  ]) {
    const result = spawnSync(process.execPath, ['scripts/prepare-site.mjs'], {cwd, env: bad, encoding: 'utf8'});
    assert.equal(result.status, 1, 'misconfigured builds must fail');
    assert.equal(read('integrations/config.js'), before, 'failed validation must not modify the last artifact');
    assert.ok(!result.stderr.includes(staged.BREVO_API_KEY));
  }
  console.log('PASS: generated staging artifact, secret exclusion and five fail-closed packaging cases.');
} finally {
  // Leave the local review artifact disconnected from all provider services.
  console.log(run(['scripts/prepare-site.mjs', '--visual-preview']).trim());
}
console.log(run(['test/release.check.mjs']).trim());
