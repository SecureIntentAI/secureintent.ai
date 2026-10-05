(async () => {
  'use strict';
  // Admin activation for an operator-issued Business invitation:
  //   loading -> welcome -> account (Clerk) -> confirm -> done
  // plus blocking cards (domain registered/suspended, link unavailable, ...).
  // Every value from the API is written with textContent.
  const SI = window.SI, $ = (id) => document.getElementById(id);
  const SESSION_KEY = 'si_business_invitation';
  const LOCAL_KEY = 'si_business_invitation_v2';
  const KEEP_MS = 7 * 86400000;
  const VIEWS = ['bp-loading', 'bp-welcome', 'bp-auth', 'bp-confirm', 'bp-mismatch', 'bp-done', 'bp-blocked'];
  const validToken = (t) => typeof t === 'string' && /^[a-f0-9]{64}$/.test(t);
  let token = '';
  let invite = null;          // what /inspect or /pending returned
  let byEmail = false;        // activating without the link token (lost link)
  let busy = false;
  let mounted = '';
  let view = 'bp-loading';
  let lookedUpFor = '';
  let final = false;          // a blocking card is showing; Clerk refreshes must not replace it

  // ---------- link token: this tab, plus 7 days in this browser ----------
  function remember(t) {
    try { sessionStorage.setItem(SESSION_KEY, t); } catch { /* storage blocked */ }
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ token: t, at: Date.now() })); } catch { /* storage blocked */ }
  }
  function forget() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
    try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
  }
  function recall() {
    try { const t = sessionStorage.getItem(SESSION_KEY); if (validToken(t)) return t; } catch { /* ignore */ }
    try {
      const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || 'null');
      if (saved && validToken(saved.token) && Date.now() - saved.at < KEEP_MS) return saved.token;
    } catch { /* ignore */ }
    return '';
  }
  try {
    const fromLink = new URLSearchParams(location.hash.slice(1)).get('invite') || '';
    if (validToken(fromLink)) remember(fromLink);
    token = validToken(fromLink) ? fromLink : recall();
    // Keep the token out of history, bookmarks and shared screenshots.
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  } catch { /* the token in memory still works */ }

  // ---------- API ----------
  async function call(method, path, body, authed) {
    const headers = { 'content-type': 'application/json' };
    if (authed) {
      const jwt = await window.Clerk.session?.getToken({ template: SI.config.jwtTemplate });
      if (!jwt) throw Object.assign(Error('Sign in to continue.'), { code: 'unauthenticated' });
      headers.Authorization = `Bearer ${jwt}`;
    }
    let response;
    try {
      response = await SI.fetch(SI.config.apiBase + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch {
      throw Object.assign(Error("We couldn't reach SecureIntent. Check your connection and try again."), { code: 'network' });
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(Error(MESSAGES[data.error] || 'Something went wrong. Please try again.'), { code: data.error, data, status: response.status });
    return data;
  }
  const MESSAGES = {
    activation_in_progress: 'Activation is already in progress. Wait a moment and try again.',
    activation_unavailable: 'Activation is temporarily unavailable. Your invitation is safe; please try again.',
    authentication_unavailable: 'We could not confirm your sign-in just now. Please try again.',
    organization_already_claimed: 'This account already administers a Business workspace. Contact SecureIntent for help.',
    unauthenticated: 'Sign in to continue.',
  };

  // ---------- rendering helpers ----------
  function status(text, alert) {
    const s = $('business-status');
    s.textContent = text || '';
    s.setAttribute('role', alert ? 'alert' : 'status');
  }
  function show(id) {
    VIEWS.forEach((v) => { $(v).hidden = v !== id; });
    view = id;
    status('');
    const step = id === 'bp-auth' ? 1 : id === 'bp-confirm' ? 2 : 0;
    document.querySelectorAll('.bp-steps li').forEach((li) => {
      const n = Number(li.dataset.step);
      li.classList.toggle('is-current', n === step);
      li.classList.toggle('is-done', n < step);
      if (n === step) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    const heading = $(id).querySelector('h1');
    if (heading && id !== 'bp-loading') { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  }
  function title(h1, first, accent) {
    const span = document.createElement('span');
    span.className = 'accent';
    span.textContent = accent;
    h1.replaceChildren(document.createTextNode(first), document.createElement('br'), span);
  }
  function fill() {
    document.querySelectorAll('[data-company]').forEach((n) => { n.textContent = invite.companyName; });
    document.querySelectorAll('[data-email]').forEach((n) => { n.textContent = invite.email; });
    document.querySelectorAll('[data-expires]').forEach((n) => {
      n.textContent = new Date(invite.expiresAt).toLocaleDateString(undefined, { dateStyle: 'medium' });
    });
  }
  const ICONS = {
    building: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V5l8-3 8 3v16M9 21v-5h6v5M8 8h2m4 0h2M8 12h2m4 0h2"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M10 9v6m4-6v6"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5L20 7"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  };
  let blockedAction = null;
  /** A card that replaces the whole flow: nothing can be activated from here. */
  function blocked(kind, x = {}) {
    unmountAuth();
    final = kind !== 'nolink';
    const domain = invite ? invite.email.split('@')[1] : '';
    const cards = {
      registered: ['building', false, 'Already registered', 'Your organisation is', 'already registered.',
        `${x.companyName || 'Your organisation'} already uses SecureIntent Business${domain ? ` for @${domain}` : ''}. Ask your workspace administrator${x.adminHint ? ` (${x.adminHint})` : ''} to invite you as a member.`],
      suspended: ['pause', true, 'Workspace suspended', "Your organisation's workspace", 'is suspended.',
        `${x.companyName || 'A previous workspace'}${domain ? ` for @${domain}` : ''} is suspended. Contact SecureIntent to restore or remove it, then open this link again.`],
      unavailable: ['clock', true, 'Invitation unavailable', 'This invitation is', 'no longer valid.',
        'It may have expired, been replaced by a newer link, or been revoked. Ask SecureIntent for a new invitation.'],
      used: ['user', true, 'Invitation in use', 'This invitation is', 'already in use.',
        'Another account has already started activating this workspace. If that was not you, contact SecureIntent.'],
      already_member: ['user', true, 'Account already in use', 'This account already', 'belongs to a workspace.',
        'A person can belong to one SecureIntent Business workspace. Sign in with a different account, or contact SecureIntent.'],
      activated: ['check', false, 'Workspace active', 'This workspace is', 'already active.',
        `${invite ? invite.companyName : 'Your organisation'}'s workspace is set up. Open the Business console to manage it.`],
      nolink: ['link', false, 'Business activation', 'Open your', 'invitation link.',
        'Use the activation link SecureIntent sent to your work email. Already started signing up? Sign in to continue.'],
      notfound: ['link', true, 'No invitation found', 'No invitation for', 'this account.',
        `We couldn't find a pending invitation for ${x.email || 'this account'}. Open the link from your invitation email, or contact SecureIntent.`],
    };
    const [icon, warn, eyebrow, first, accent, text] = cards[kind];
    const iconBox = $('bp-blocked-icon');
    iconBox.innerHTML = ICONS[icon]; // static markup only
    iconBox.classList.toggle('is-warn', warn);
    $('bp-blocked-eyebrow').textContent = eyebrow;
    $('bp-blocked-eyebrow').classList.toggle('bp-warn', warn);
    title($('bp-blocked-title'), first, accent);
    $('bp-blocked-text').textContent = text;
    const action = $('bp-blocked-action');
    blockedAction = null;
    if (kind === 'activated') { action.textContent = 'Open Business console →'; action.href = SI.page('team.html'); }
    else if (kind === 'nolink') { action.textContent = 'Sign in to continue →'; action.href = '#'; blockedAction = () => openAuth('signin'); }
    else if (kind === 'already_member' || kind === 'notfound') { action.textContent = 'Use a different account →'; action.href = '#'; blockedAction = switchAccount; }
    else { action.textContent = 'Contact SecureIntent →'; action.href = 'mailto:info@secureintent.ai?subject=Business%20invitation'; }
    show('bp-blocked');
  }
  $('bp-blocked-action').addEventListener('click', (e) => { if (blockedAction) { e.preventDefault(); blockedAction(); } });

  // ---------- Clerk sign-up / sign-in inside the card ----------
  function unmountAuth() {
    const el = $('business-auth');
    if (mounted === 'signup') window.Clerk.unmountSignUp?.(el);
    if (mounted === 'signin') window.Clerk.unmountSignIn?.(el);
    mounted = '';
  }
  function openAuth(mode) {
    show('bp-auth');
    const signin = mode === 'signin';
    $('bp-tab-signup').setAttribute('aria-selected', String(!signin));
    $('bp-tab-signin').setAttribute('aria-selected', String(signin));
    $('bp-auth-eyebrow').textContent = signin ? 'Step 1 · Sign in' : 'Step 1 · Your admin account';
    title($('bp-auth-title'), signin ? 'Sign in to' : 'Create your', signin ? 'continue.' : 'admin account.');
    $('bp-back').hidden = !invite;
    if (mounted === mode) return;
    unmountAuth();
    const back = SI.page('business_promo.html');
    const common = {
      appearance: SI.appearance(),
      forceRedirectUrl: back, signInForceRedirectUrl: back, signUpForceRedirectUrl: back,
      initialValues: invite ? { emailAddress: invite.email } : undefined,
    };
    const el = $('business-auth');
    if (signin) window.Clerk.mountSignIn(el, { ...common, signUpUrl: SI.page('business_promo.html?mode=signup') });
    else window.Clerk.mountSignUp(el, { ...common, signInUrl: SI.page('business_promo.html?mode=signin') });
    mounted = mode;
  }
  $('bp-start').addEventListener('click', () => openAuth('signup'));
  $('bp-tab-signup').addEventListener('click', () => openAuth('signup'));
  $('bp-tab-signin').addEventListener('click', () => openAuth('signin'));
  $('bp-back').addEventListener('click', () => { unmountAuth(); show('bp-welcome'); });
  function switchAccount() {
    final = false;
    window.Clerk.signOut({ redirectUrl: SI.page('business_promo.html?mode=signin') });
  }
  $('bp-switch').addEventListener('click', switchAccount);
  $('bp-use-invited').addEventListener('click', switchAccount);

  // ---------- routing ----------
  const primaryEmail = (user) => (user?.primaryEmailAddress?.emailAddress || '').toLowerCase();
  async function lookupPending(user) {
    if (lookedUpFor === user.id) return;
    lookedUpFor = user.id;
    show('bp-loading');
    try {
      const data = await call('GET', '/v1/business-promo/pending', null, true);
      if (!data.invitation) { blocked('notfound', { email: primaryEmail(user) }); return; }
      invite = data.invitation;
      byEmail = true;
      fill();
      route();
    } catch (error) { blocked('notfound', { email: primaryEmail(user) }); status(error.message, true); }
  }
  function route() {
    // Clerk calls back on every session refresh; only real changes move the page.
    if (busy || final || view === 'bp-done') return;
    const user = window.Clerk.user;
    if (!invite) { if (user) void lookupPending(user); else if (view !== 'bp-auth') blocked('nolink'); return; }
    if (invite.domain?.status === 'registered') return blocked('registered', invite.domain);
    if (invite.domain?.status === 'suspended') return blocked('suspended', invite.domain);
    if (invite.activated) return blocked('activated');
    if (user) {
      unmountAuth();
      const email = primaryEmail(user);
      if (email === invite.email) { $('bp-signed-in').textContent = email; if (view !== 'bp-confirm') show('bp-confirm'); }
      else { $('bp-wrong-email').textContent = email || 'another account'; if (view !== 'bp-mismatch') show('bp-mismatch'); }
      return;
    }
    const mode = new URLSearchParams(location.search).get('mode');
    if (view === 'bp-auth') return;
    if (mode === 'signin' || mode === 'signup') openAuth(mode);
    else if (view !== 'bp-welcome') show('bp-welcome');
  }

  // ---------- activation ----------
  $('bp-activate').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    const button = $('bp-activate');
    button.disabled = true;
    $('bp-switch').disabled = true;
    status('Creating your workspace…');
    try {
      const result = await call('POST', '/v1/business-promo/redeem', byEmail || !token ? { byEmail: true } : { token }, true);
      if (result.orgId && !result.orgId.startsWith('org_si_')) await window.Clerk.setActive({ organization: result.orgId });
      forget();
      busy = false;
      show('bp-done');
      setTimeout(() => location.assign(SI.page('team.html')), 2500);
    } catch (error) {
      busy = false;
      const c = error.code;
      if (c === 'organization_domain_claimed') return blocked('registered', error.data?.domain);
      if (c === 'organization_domain_suspended') return blocked('suspended', error.data?.domain);
      if (c === 'invitation_unavailable') { forget(); return blocked('unavailable'); }
      if (c === 'invitation_used') return blocked('used');
      if (c === 'already_member') return blocked('already_member');
      if (c === 'invitation_email_mismatch') { status('Sign in with the verified business email address named in this invitation.', true); return; }
      status(error.message, true);
    } finally {
      button.disabled = false;
      $('bp-switch').disabled = false;
    }
  });

  // ---------- start ----------
  try {
    await SI.ready({ auth: true });
    if (token) {
      try { invite = await call('POST', '/v1/business-promo/inspect', { token }); }
      catch (error) {
        if (error.code === 'invitation_unavailable' || error.code === 'invalid_invitation') { forget(); token = ''; invite = null; blocked('unavailable'); }
        else { status(error.message, true); }
        await window.Clerk.load();
        return;
      }
      fill();
    }
    await window.Clerk.load();
    window.Clerk.addListener(() => route());
    route();
  } catch (error) {
    status(error.message || 'This page could not load. Refresh to try again.', true);
  }
})();
