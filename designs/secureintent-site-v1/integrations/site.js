/* Shared production links and main's first-touch creator attribution. */
(() => {
  'use strict';
  const KEY = 'si_creator', maxAge = 7776000;
  // Attribution is optional storage: only read or written with analytics consent.
  const consented = () => Boolean(window.SI_CONSENT?.granted());
  function get(name) {
    if (!consented()) return '';
    try { const value = localStorage.getItem(name); if (value) return value; } catch {}
    try { return decodeURIComponent(document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))?.[1] || ''); } catch { return ''; }
  }
  function set(name, value) {
    if (!consented()) return;
    try { localStorage.setItem(name, value); } catch {}
    const domain = /(^|\.)secureintent\.ai$/.test(location.hostname) ? ';domain=.secureintent.ai' : '';
    document.cookie = name + '=' + encodeURIComponent(value) + domain + ';path=/;max-age=' + maxAge + ';SameSite=Lax' + (location.protocol === 'https:' ? ';Secure' : '');
  }
  const query = new URLSearchParams(location.search);
  // Held in memory until the visitor decides, so accepting on the landing page
  // still credits the creator link they arrived through.
  const arrived = {creator: (query.get('ref') || query.get('utm_source') || '').trim(),
    medium: (query.get('utm_medium') || 'creator').trim(), campaign: (query.get('utm_campaign') || '').trim()};
  function captureCreator() {
    if (arrived.creator && !get(KEY)) {
      set(KEY, arrived.creator); set(KEY + '_medium', arrived.medium); set(KEY + '_campaign', arrived.campaign);
    }
    window.SI_ATTR = {creator: get(KEY) || null, medium: get(KEY + '_medium') || null, campaign: get(KEY + '_campaign') || null};
  }
  captureCreator();

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
  // Authentication tickets and workspace activity must never enter marketing analytics.
  const privatePage = /\/(account|team|shadow|business_promo|lifetime_promo)(?:\.html)?\/?$/.test(location.pathname);
  if (privatePage || !window.SI_IS_PROD || window.SI_DISABLE_ANALYTICS) return;
  const GA = 'G-PSSL40SRTR';
  let loaded = false;
  // Other scripts report events here; they are dropped unless analytics is on.
  window.SI_TRACK = (name, params = {}) => { if (loaded && consented()) window.gtag('event', name, params); };

  function loadAnalytics() {
    if (loaded) return;
    loaded = true;
    window['ga-disable-' + GA] = false;
    window.dataLayer = window.dataLayer || [];
    const gtag = function () { window.dataLayer.push(arguments); };
    window.gtag = gtag;
    // Analytics only: no advertising storage, ad personalisation or Google signals.
    gtag('consent', 'default', {analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});
    const script = document.createElement('script'); script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA; document.head.append(script);
    gtag('js', new Date());
    gtag('config', GA, {allow_google_signals: false, allow_ad_personalization_signals: false,
      user_properties: {creator: window.SI_ATTR.creator || '(none)'}});
    const pricing = document.getElementById('tiers');
    if (pricing && 'IntersectionObserver' in window) {
      const seen = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { seen.disconnect(); window.SI_TRACK('view_pricing', {page: location.pathname}); }
      }, {threshold: 0.3});
      seen.observe(pricing);
    }
  }

  document.addEventListener('click', event => {
    const link = event.target.closest('a[href]');
    if (!link) return;
    if (/chromewebstore\.google\.com\/detail\/secureintent|addons\.mozilla\.org/.test(link.href) && !/\/reviews/.test(link.href)) {
      window.SI_TRACK('install_click', {link_url: link.href, link_text: link.textContent.trim().slice(0, 40), store: link.dataset.store || 'chrome', creator: window.SI_ATTR.creator || '(none)', creator_campaign: window.SI_ATTR.campaign || '(none)'});
    } else if (link.protocol === 'mailto:') {
      window.SI_TRACK('contact_click', {page: location.pathname, link_text: link.textContent.trim().slice(0, 40)});
    }
  });

  if (consented()) loadAnalytics();
  window.SI_CONSENT?.onChange(state => {
    if (state === 'granted' && loaded) {
      window['ga-disable-' + GA] = false;
      window.gtag('consent', 'update', {analytics_storage: 'granted'});
      captureCreator();
    } else if (state === 'granted') { captureCreator(); loadAnalytics(); }
    else if (loaded) {
      // Stop sending for the rest of this page view; consent.js already deleted the cookies.
      window.gtag('consent', 'update', {analytics_storage: 'denied'});
      window['ga-disable-' + GA] = true;
      captureCreator();
    }
  });
})();
