// The packages facts file and the account page that reads it. No browser, no network.
//   node test/packages.test.mjs
// With the desktop app checked out beside this repo, its package list is compared
// too; SI_DESKTOP_PACKAGES points at another copy of src/lib/packages.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const design = path.join(root, 'designs/secureintent-site-v1');
const factsFile = path.join(design, 'integrations/packages.js');
const scope = { window: {} };
vm.runInNewContext(await readFile(factsFile, 'utf8'), scope, { filename: factsFile });
const P = scope.window.SI_PACKAGES;

test('nothing is on sale until the launch deploy turns it on', () => {
  assert.equal(P.ON_SALE, false);
});

test('names are the four packages, and nothing older', () => {
  assert.deepEqual([...P.ORDER].map(id => P.PACKAGES[id].label), ['Browser Free', 'Browser Pro', 'Desktop Pro', 'Business']);
});

test('prices are the KAU-80 decisions, in US cents', () => {
  assert.equal(P.CURRENCY, 'USD');
  assert.equal(P.INTRO_MONTHS, 3);
  assert.equal(P.TRIAL_DAYS, 30);
  assert.deepEqual({ ...P.PACKAGES.browser_pro.price }, { monthly: 799, intro: 400, annual: 7668, annualPerMonth: 639 });
  assert.deepEqual({ ...P.PACKAGES.desktop_pro.price }, { monthly: 1499, intro: 750, annual: 14388, annualPerMonth: 1199 });
  assert.equal(P.PACKAGES.business.price, undefined, 'Business has no public price until KAU-82');
  assert.equal(P.PACKAGES.business.contact.label, 'Talk to us about a team trial');
  for (const id of P.PURCHASABLE) {
    const price = P.PACKAGES[id].price;
    assert.equal(price.annual, price.annualPerMonth * 12, id + ': the annual total is twelve monthly equivalents');
    assert.equal(price.intro, Math.round(price.monthly / 2), id + ': the intro price is 50% off, to the cent');
  }
  assert.equal(P.money(400), '$4.00');
  assert.equal(P.money(14388), '$143.88');
});

test('a signed tier names the package; without one, the older plan does', () => {
  assert.equal(P.packageOf({ plan: 'developer_pro', tier: 'desktop_pro' }), 'desktop_pro');
  assert.equal(P.packageOf({ plan: 'developer', tier: 'browser_pro' }), 'browser_pro');
  assert.equal(P.packageOf({ plan: 'developer' }), 'free');
  assert.equal(P.packageOf({ plan: 'developer_pro' }), 'browser_pro');
  assert.equal(P.packageOf({ plan: 'business_pro' }), 'business');
  assert.equal(P.packageOf({}), 'free');
  assert.equal(P.packageOf(null), 'free');
  // A word this page does not know must not read as more than the plan.
  assert.equal(P.packageOf({ plan: 'developer', tier: 'enterprise' }), 'free');
  assert.equal(P.packageOf({ plan: 'developer_pro', tier: 7 }), 'browser_pro');
  assert.equal(P.packageOf({ plan: 'developer', tier: 'constructor' }), 'free');
  // Team seats read as Business, member or admin.
  for (const role of ['org:member', 'org:admin']) {
    assert.equal(P.packageOf({ plan: 'developer_pro', source: 'org_seat', org: { role } }), 'business');
  }
  assert.equal(P.hasTier({ tier: 'desktop_pro' }), true);
  assert.equal(P.hasTier({ plan: 'developer_pro' }), false);
  assert.equal(P.hasTier({ tier: 'enterprise' }), false);
});

test('names on the page', () => {
  assert.equal(P.displayName('browser_pro', { lifetime: true }), 'Lifetime Browser Pro');
  assert.equal(P.displayName('desktop_pro', { trial: { state: 'active', endsAt: 1 } }), 'Desktop Pro trial');
  assert.equal(P.displayName('desktop_pro', { trial: { state: 'used', endsAt: 1 } }), 'Desktop Pro');
  assert.equal(P.displayName('free'), 'Browser Free');
});

test('trial days are whole days rounded up, from the API end date', () => {
  const now = Date.UTC(2026, 10, 3, 12);
  const endsAt = s => ({ state: 'active', endsAt: Math.floor(now / 1000) + s });
  assert.equal(P.trialDaysLeft(endsAt(12 * 86400), now), 12);
  assert.equal(P.trialDaysLeft(endsAt(3600), now), 1);
  assert.equal(P.trialDaysLeft(endsAt(-3600), now), 0);
  assert.equal(P.trialDaysLeft({ state: 'used', endsAt: 2e9 }, now), null);
  assert.equal(P.trialDaysLeft({ state: 'active', endsAt: null }, now), null);
});

test('Upgrade is offered below Desktop Pro and on its trial, never to Business', () => {
  const trial = { state: 'active', endsAt: 2e9 };
  assert.deepEqual([...P.upgradeChoices('free', null)], ['browser_pro', 'desktop_pro']);
  assert.deepEqual([...P.upgradeChoices('browser_pro', null)], ['desktop_pro']);
  assert.deepEqual([...P.upgradeChoices('desktop_pro', trial)], ['browser_pro', 'desktop_pro']);
  assert.deepEqual([...P.upgradeChoices('desktop_pro', null)], []);
  assert.deepEqual([...P.upgradeChoices('business', trial)], []);
});

test('what each package includes', () => {
  const row = (pkg, key) => P.includedRows(pkg).find(r => r.key === key);
  assert.equal(row('free', 'anonymise').detail, '10 a month');
  assert.equal(row('browser_pro', 'anonymise').detail, 'Unlimited');
  assert.deepEqual([row('free', 'log_cleaner').state, row('free', 'log_cleaner').detail], ['locked', 'Browser Pro']);
  assert.deepEqual([row('browser_pro', 'terminals').state, row('browser_pro', 'terminals').detail], ['locked', 'Desktop Pro']);
  assert.equal(row('desktop_pro', 'terminals').state, 'active');
  assert.deepEqual([row('desktop_pro', 'team_policy').state, row('desktop_pro', 'team_policy').detail], ['locked', 'Business']);
  assert.equal(row('business', 'activity').state, 'active');
  for (const pkg of P.ORDER) assert.equal(row(pkg, 'alerts').state, 'soon');
});

const desktopPath = process.env.SI_DESKTOP_PACKAGES || path.join(root, '../secureintent-desktop/src/lib/packages.ts');
test('the included list matches the desktop app', { skip: !existsSync(desktopPath) && 'desktop app not checked out beside this repo' }, async () => {
  const source = await readFile(desktopPath, 'utf8');
  const labels = Object.fromEntries([...source.matchAll(/^\s+(\w+): "([^"]+)",$/gm)].map(m => [m[1], m[2]]));
  for (const id of P.ORDER) assert.equal(P.PACKAGES[id].label, labels[id], 'label ' + id);
  const block = source.slice(source.indexOf('export const FEATURES'), source.indexOf('];', source.indexOf('export const FEATURES')));
  const desktop = [...block.matchAll(/key: "(\w+)",\s*label: "([^"]+)",[\s\S]*?from: "(\w+)"(,\s*detail: \{([^}]*)\})?(,\s*soon: true)?/g)]
    .map(m => ({ key: m[1], label: m[2], from: m[3], soon: Boolean(m[6]) }));
  assert.deepEqual([...P.FEATURES].map(({ key, label, from, soon }) => ({ key, label, from, soon: Boolean(soon) })), desktop);
});

// Blueprint, Phase 2 "Words to replace", and the old plan names.
const BANNED = ['dead', 'explosion', 'devastating', 'ultimate', 'illusion', 'pedigree', 'seamless', 'AI-driven',
  'original', 'workspace', 'source product messaging', 'demonstrates', 'carry forward',
  'Developer Pro', 'Business Pro', 'formerly'];
const PAGE = ['account.html', 'integrations/account.js', 'integrations/account.css', 'integrations/packages.js'];

test('the account page never uses a banned word or an old plan name', async () => {
  for (const name of PAGE) {
    const text = await readFile(path.join(design, name), 'utf8');
    for (const word of BANNED) {
      assert.ok(!new RegExp(`\\b${word.replace(/[-\s]/g, m => (m === '-' ? '-' : '\\s+'))}\\b`, 'i').test(text), `${name} says "${word}"`);
    }
  }
});

test('prices are written in the facts file only', async () => {
  for (const name of PAGE.filter(n => !n.endsWith('packages.js'))) {
    const text = await readFile(path.join(design, name), 'utf8');
    assert.ok(!/\$\d/.test(text), name + ' writes a price');
    for (const cents of ['799', '7668', '1499', '14388', '639', '1199']) assert.ok(!new RegExp(`\\b${cents}\\b`).test(text), `${name} writes ${cents}`);
    if (name !== 'integrations/account.css') {
      for (const id of P.ORDER) assert.ok(!text.includes(`"${P.PACKAGES[id].label}"`), `${name} writes the name ${P.PACKAGES[id].label}`);
    }
  }
});

test('the account page loads the facts file before its own script', async () => {
  const html = await readFile(path.join(design, 'account.html'), 'utf8');
  const facts = html.indexOf('integrations/packages.js');
  assert.ok(facts > 0 && facts < html.indexOf('integrations/account.js'));
});
