(() => {
  'use strict';
  const isProduction = ['secureintent.ai', 'www.secureintent.ai'].includes(location.hostname);
  const config = window.SI_CONFIG?.[isProduction ? 'production' : 'preview'];
  const base = new URL('../', document.currentScript.src);
  const nativeFetch = window.fetch.bind(window);
  window.SI_IS_PROD = isProduction;
  if (!isProduction) {
    window.SI_DISABLE_ANALYTICS = true;
    if (!document.querySelector('meta[name="robots"]')) {
      const meta = document.createElement('meta');
      meta.name = 'robots'; meta.content = 'noindex,nofollow';
      document.head.append(meta);
    }
  }
  const page = name => new URL(name, base).pathname + new URL(name, base).search + new URL(name, base).hash;
  function validate() {
    if (!config?.apiBase) throw new Error('Test services are not configured for this preview.');
    const api = new URL(config.apiBase, location.origin);
    if (!['http:', 'https:'].includes(api.protocol) || api.username || api.password) throw new Error('Invalid API configuration.');
    if (!isProduction && (api.hostname === 'api.secureintent.ai' || config.paddleEnv === 'production' || config.paddleToken?.startsWith('live_') || config.clerkPublishableKey?.startsWith('pk_live_'))) {
      throw new Error('This preview needs test services; production credentials are disabled here.');
    }
    if (!isProduction && config.paddleToken && (config.paddleEnv !== 'sandbox' || !config.paddleToken.startsWith('test_'))) {
      throw new Error('Configure a Paddle sandbox client token for this preview.');
    }
    if (isProduction && api.origin !== 'https://api.secureintent.ai') throw new Error('Invalid production API configuration.');
    return config;
  }
  function loadScript(src, attributes = {}) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(() => reject(new Error('The sign-in or payment service took too long to load. Please refresh.')), 15000);
      script.src = src;
      script.crossOrigin = 'anonymous';
      for (const [key, value] of Object.entries(attributes)) script.setAttribute(key, value);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); reject(new Error('The sign-in or payment service could not load. Please refresh.')); };
      document.head.append(script);
    });
  }
  async function ready({ auth = false, billing = false } = {}) {
    validate();
    if (auth) {
      if (!config.clerkPublishableKey || !config.clerkScriptUrl) throw new Error('Sign-in is not configured for this preview.');
      if (!window.Clerk) await loadScript(config.clerkScriptUrl, { 'data-clerk-publishable-key': config.clerkPublishableKey });
      if (!window.Clerk) throw new Error('Sign-in could not load. Please refresh.');
    }
    if (billing && config.paddleToken) {
      try {
        if (!window.Paddle) await loadScript('https://cdn.paddle.com/paddle/v2/paddle.js');
      } catch (error) {
        // Account access and team management must survive a blocked payment SDK.
        console.warn('[billing] SDK unavailable');
      }
    }
    return config;
  }
  async function apiFetch(input, init = {}) {
    validate();
    const url = new URL(input, location.origin);
    const api = new URL(config.apiBase, location.origin);
    if (url.origin !== api.origin || (!isProduction && url.hostname === 'api.secureintent.ai')) {
      throw new Error('The request does not match the configured API.');
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try { return await nativeFetch(url.href, { ...init, signal: init.signal || controller.signal }); }
    finally { clearTimeout(timer); }
  }
  function appearance() {
    const css = getComputedStyle(document.documentElement);
    const color = key => css.getPropertyValue(key).trim();
    return {
      variables: {
        colorPrimary: color('--button'), colorPrimaryForeground: color('--button-text'),
        colorBackground: color('--surface'), colorText: color('--ink'),
        colorTextSecondary: color('--body'), colorInputBackground: color('--field'),
        colorInputText: color('--ink'), colorNeutral: color('--ink'),
        fontFamily: 'Inter, system-ui, sans-serif', borderRadius: '10px',
      },
      elements: {
        rootBox: { width: '100%' }, cardBox: { width: '100%', maxWidth: '100%' },
        card: { background: 'transparent', boxShadow: 'none', border: '0', width: '100%' },
        formButtonPrimary: { color: color('--button-text'), fontWeight: '600' },
      },
    };
  }
  function showError(element, error) {
    if (!element) return;
    element.hidden = false;
    element.setAttribute('role', 'alert');
    element.textContent = error.message || 'The service is unavailable. Please try again.';
  }
  function authReturn(name) {
    const url = new URL(page(name), location.origin);
    // Preserve payment recovery and invitation state across sign-in, never accept
    // a caller-supplied external return URL.
    const current = new URLSearchParams(location.search);
    for (const key of ['_ptxn', 'welcome', 'claim', 'joined']) if (current.has(key)) url.searchParams.set(key, current.get(key));
    url.hash = location.hash;
    return url.pathname + url.search + url.hash;
  }
  function openBilling(raw) {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || !/(^|\.)paddle\.com$/.test(url.hostname)) throw new Error('Invalid billing destination.');
    // Same-tab navigation after an awaited request avoids popup blockers.
    location.assign(url.href);
  }
  window.SI = Object.freeze({ config, ready, fetch: apiFetch, page, appearance, showError, authReturn, openBilling });
})();
