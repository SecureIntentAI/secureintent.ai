/* Shared production links and main's first-touch creator attribution. */
(() => {
  'use strict';
  const KEY = 'si_creator', maxAge = 7776000;
  function get(name) {
    try { const value = localStorage.getItem(name); if (value) return value; } catch {}
    try { return decodeURIComponent(document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))?.[1] || ''); } catch { return ''; }
  }
  function set(name, value) {
    try { localStorage.setItem(name, value); } catch {}
    const domain = /(^|\.)secureintent\.ai$/.test(location.hostname) ? ';domain=.secureintent.ai' : '';
    document.cookie = name + '=' + encodeURIComponent(value) + domain + ';path=/;max-age=' + maxAge + ';SameSite=Lax' + (location.protocol === 'https:' ? ';Secure' : '');
  }
  const query = new URLSearchParams(location.search);
  const creator = (query.get('ref') || query.get('utm_source') || '').trim();
  if (creator && !get(KEY)) {
    set(KEY, creator); set(KEY + '_medium', (query.get('utm_medium') || 'creator').trim());
    set(KEY + '_campaign', (query.get('utm_campaign') || '').trim());
  }
  window.SI_ATTR = {creator: get(KEY) || null, medium: get(KEY + '_medium') || null, campaign: get(KEY + '_campaign') || null};

  function links() {
    document.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (/^https:\/\/github\.com\/(Secureintent-Admin|SecureIntentAI)\/Secureintent-Extension\/?$/i.test(href)) link.href = 'https://github.com/Secureintent-Admin/Secureintent-Extension';
      if (window.SI_INSTALL_URL && href.includes('chromewebstore.google.com/detail/secureintent') && !href.includes('/reviews')) {
        if (link.href !== window.SI_INSTALL_URL) link.href = window.SI_INSTALL_URL;
        link.dataset.store = window.SI_INSTALL_STORE;
        if (window.SI_INSTALL_STORE === 'firefox') {
          const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
          while (walker.nextNode()) walker.currentNode.textContent = walker.currentNode.textContent.replace(/Add to Chrome|Install for Chrome/g, 'Add to Firefox');
        }
      }
      if (link.target === '_blank') link.rel = 'noopener noreferrer';
    });
  }
  links();
  // Headers/footers can insert links after main's unchanged installer script ran.
  new MutationObserver(links).observe(document.body, {childList: true, subtree: true});
  if (!window.SI_IS_PROD || window.SI_DISABLE_ANALYTICS) return;
  window.dataLayer = window.dataLayer || [];
  const gtag = function () { window.dataLayer.push(arguments); };
  window.gtag = gtag;
  const script = document.createElement('script'); script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=G-PSSL40SRTR'; document.head.append(script);
  gtag('js', new Date());
  gtag('config', 'G-PSSL40SRTR', {user_properties: {creator: window.SI_ATTR.creator || '(none)'}});
  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link || /\/reviews/.test(link.href) || !/chromewebstore\.google\.com\/detail\/secureintent|addons\.mozilla\.org/.test(link.href)) return;
    gtag('event', 'install_click', {link_url: link.href, link_text: link.textContent.trim().slice(0, 40), store: link.dataset.store || 'chrome', creator: window.SI_ATTR.creator || '(none)', creator_campaign: window.SI_ATTR.campaign || '(none)'});
  });
})();
