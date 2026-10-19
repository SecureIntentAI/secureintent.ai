/* Cookie consent. Nothing optional (Google Analytics, creator attribution) may
 * be stored or loaded until the visitor accepts; sign-in (Clerk), checkout
 * (Paddle) and this choice itself are strictly necessary and always allowed.
 * The choice lives in one first-party cookie for 12 months and is shared across
 * secureintent.ai. Must load before site.js and account.js, which ask it.
 */
(() => {
  'use strict';
  const NAME = 'si_consent', VERSION = 'v1', MAX_AGE = 31536000;
  const OPTIONAL = /^(si_creator(_medium|_campaign)?|_ga(_.+)?)$/;
  const policyUrl = new URL('../privacy.html#cookies', document.currentScript.src).href;
  const listeners = [];
  const onDomain = /(^|\.)secureintent\.ai$/.test(location.hostname);

  function read() {
    const value = document.cookie.match(/(?:^|; )si_consent=([^;]*)/)?.[1] || '';
    const [version, state] = decodeURIComponent(value).split('.');
    return version === VERSION && (state === 'granted' || state === 'denied') ? state : null;
  }
  let state = read();

  function writeCookie(name, value, maxAge, domain) {
    document.cookie = name + '=' + value + (domain ? ';domain=' + domain : '') + ';path=/;max-age=' + maxAge +
      ';SameSite=Lax' + (location.protocol === 'https:' ? ';Secure' : '');
  }
  // Withdrawing consent must also remove what was stored while it was given,
  // including values written before this banner existed.
  function clearOptional() {
    document.cookie.split('; ').map(pair => pair.split('=')[0]).filter(name => OPTIONAL.test(name)).forEach(name => {
      writeCookie(name, '', 0);
      if (onDomain) writeCookie(name, '', 0, '.secureintent.ai');
    });
    try { ['si_creator', 'si_creator_medium', 'si_creator_campaign'].forEach(key => localStorage.removeItem(key)); } catch {}
  }

  function choose(next) {
    state = next;
    writeCookie(NAME, VERSION + '.' + next, MAX_AGE, onDomain ? '.secureintent.ai' : '');
    if (next === 'denied') clearOptional();
    hide();
    listeners.forEach(fn => { try { fn(next); } catch (err) { console.error('[consent]', err); } });
  }

  window.SI_CONSENT = {
    get state() { return state; },
    granted: () => state === 'granted',
    onChange(fn) { listeners.push(fn); },
    open: () => show(true),
  };

  const css = `
.si-consent{position:fixed;left:16px;bottom:16px;z-index:2147483000;max-width:520px;width:calc(100% - 32px);box-sizing:border-box;
  padding:18px 20px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:#0c0e12;color:#d1d5db;
  font:14px/1.5 Inter,system-ui,-apple-system,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.45)}
.si-consent[hidden]{display:none}
.si-consent h2{margin:0 0 6px;font-size:15px;font-weight:700;color:#fff}
.si-consent p{margin:0 0 14px}
.si-consent a{color:#72FFFF;text-decoration:underline;text-underline-offset:2px}
.si-consent__actions{display:flex;gap:10px;flex-wrap:wrap}
.si-consent__actions button{flex:1 1 140px;min-height:40px;padding:8px 14px;border-radius:9px;cursor:pointer;font:600 14px Inter,system-ui,sans-serif;
  border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#fff}
.si-consent__actions button:hover{border-color:#72FFFF}
.si-consent__actions button:focus-visible,.si-consent a:focus-visible,.si-consent-link:focus-visible{outline:2px solid #72FFFF;outline-offset:2px}
.si-consent__current{margin:-6px 0 12px;font-size:12px;color:#9ca3af}
[data-theme="light"] .si-consent{background:#fff;color:#374151;border-color:rgba(0,0,0,.12);box-shadow:0 18px 50px rgba(0,0,0,.15)}
[data-theme="light"] .si-consent h2{color:#111827}
[data-theme="light"] .si-consent a{color:#0e7490}
[data-theme="light"] .si-consent__actions button{background:#f3f4f6;color:#111827;border-color:rgba(0,0,0,.18)}
[data-theme="light"] .si-consent__actions button:hover{border-color:#0e7490}
.si-consent-link{background:none;border:0;padding:0;margin:0;font:inherit;color:inherit;cursor:pointer;text-align:left}
.si-consent-link:hover{text-decoration:underline}`;

  let banner;
  function build() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.append(style);
    banner = document.createElement('section');
    banner.className = 'si-consent';
    banner.hidden = true;
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Cookie choices');
    banner.innerHTML = `<h2>Cookies on secureintent.ai</h2>
<p>We'd like to use analytics cookies to see how people use this site and which links bring them here, so we can improve it.
They are only set if you accept. Sign-in and checkout cookies are always on because the site needs them. <a href="${policyUrl}">Cookie policy</a></p>
<p class="si-consent__current" hidden></p>
<div class="si-consent__actions"><button type="button" data-choice="denied">Reject analytics</button><button type="button" data-choice="granted">Accept analytics</button></div>`;
    banner.addEventListener('click', event => {
      const button = event.target.closest('button[data-choice]');
      if (button) choose(button.dataset.choice);
    });
    document.body.append(banner);
  }
  function show(reopened) {
    if (!banner) build();
    const current = banner.querySelector('.si-consent__current');
    current.hidden = !state;
    current.textContent = state ? 'Current choice: analytics ' + (state === 'granted' ? 'accepted' : 'rejected') + '.' : '';
    banner.hidden = false;
    if (reopened) banner.querySelector('button').focus();
  }
  function hide() { if (banner) banner.hidden = true; }

  // A "Cookie settings" entry next to every footer privacy link, so the choice
  // can be changed as easily as it was made.
  function addSettingsLinks() {
    document.querySelectorAll('footer a[href*="privacy"]').forEach(link => {
      if (link.nextElementSibling?.classList.contains('si-consent-link')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'si-consent-link ' + link.className;
      button.textContent = 'Cookie settings';
      button.addEventListener('click', () => show(true));
      link.after(button);
    });
  }

  function start() {
    addSettingsLinks();
    // Some pages swap in their footer after load (site-footer.js).
    new MutationObserver(addSettingsLinks).observe(document.body, {childList: true, subtree: true});
    document.addEventListener('click', event => { if (event.target.closest('[data-cookie-settings]')) show(true); });
    // The admin console sets nothing optional; don't cover it with the banner.
    const appPage = /\/(team|shadow)(?:\.html)?\/?$/.test(location.pathname);
    if (!state && !appPage) show(false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
