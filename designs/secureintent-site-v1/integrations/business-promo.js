(async () => {
  'use strict';
  // Admin activation for an operator-issued Business invitation:
  //   loading -> setup (name, password) -> one emailed code -> done, signed in
  //   or: setup -> Continue with Google -> back here -> activated -> done
  // An admin already signed in with the invited email gets one-click confirm.
  // plus blocking cards (domain registered/suspended, link unavailable, ...).
  // Every value from the API is written with textContent.
  const SI = window.SI, $ = (id) => document.getElementById(id);
  const SESSION_KEY = 'si_business_invitation';
  const DOMAIN_KEY = 'si_business_domain_link'; // this tab only: survives the Google redirect
  const LOCAL_KEY = 'si_business_invitation_v2';
  const KEEP_MS = 7 * 86400000;
  const VIEWS = ['bp-loading', 'bp-welcome', 'bp-code-step', 'bp-auth', 'bp-confirm', 'bp-mismatch', 'bp-done', 'bp-blocked'];
  const GOOGLE_KEY = 'si_business_google';  // set before the Google redirect: activate on return
  const validToken = (t) => typeof t === 'string' && /^[a-f0-9]{64}$/.test(t);
  let token = '';
  let tokenFromLink = false;  // clicked just now, versus remembered from an earlier visit
  let invite = null;          // what /inspect or /pending returned
  let byEmail = false;        // activating without the link token (lost link)
  let busy = false;
  let mounted = '';
  let view = 'bp-loading';
  let lookedUpFor = '';
  let final = false;          // a blocking card is showing; Clerk refreshes must not replace it
  let password = '';          // kept in memory only; saved with Clerk after sign-in, never sent to our API
  let resendAt = 0;

  // ---------- link token: this tab, plus 7 days in this browser ----------
  function remember(t) {
    try { sessionStorage.setItem(SESSION_KEY, t); } catch { /* storage blocked */ }
    try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ token: t, at: Date.now() })); } catch { /* storage blocked */ }
  }
  function forget() {
    try { sessionStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(DOMAIN_KEY); } catch { /* ignore */ }
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
  // Domain link (#domain=…): one organisation and email domain, no named person.
  // Anyone on the domain can set up; the first to complete it is the admin.
  let domainToken = '';
  let domainFromLink = false;
  try {
    const hash = new URLSearchParams(location.hash.slice(1));
    const fromDomainLink = hash.get('domain') || '';
    if (validToken(fromDomainLink)) { domainToken = fromDomainLink; domainFromLink = true; sessionStorage.setItem(DOMAIN_KEY, fromDomainLink); }
    else if (!hash.get('invite')) { const kept = sessionStorage.getItem(DOMAIN_KEY); if (validToken(kept)) domainToken = kept; }
  } catch { /* the token in memory still works */ }
  const domainMode = () => !!invite?.isDomainLink;
  const onDomain = (email) => !!invite?.emailDomain && email.split('@')[1] === invite.emailDomain && /^[^@\s]+@[^@\s]+$/.test(email);
  try {
    const fromLink = new URLSearchParams(location.hash.slice(1)).get('invite') || '';
    if (validToken(fromLink)) remember(fromLink);
    tokenFromLink = validToken(fromLink);
    token = tokenFromLink ? fromLink : recall();
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
    name_required: 'Enter your first name.',
    too_soon: 'A code was just sent. You can ask for another in a moment.',
    too_many: 'Too many codes were sent. Wait an hour, then try again.',
    send_failed: "We couldn't send the email just now. Try again in a minute.",
    recipient_denied: "This address can't receive codes in this environment.",
    invalid_code: "That code isn't right. Check the email and try again.",
    too_many_attempts: 'Too many wrong codes. Ask for a new code.',
    code_expired: 'That code has expired or was already used. Ask for a new code.',
    unavailable: 'Activation is temporarily unavailable. Please try again.',
    authentication_unavailable: 'We could not confirm your sign-in just now. Please try again.',
    organization_already_claimed: 'This account already administers a Business workspace. Contact SecureIntent for help.',
    unauthenticated: 'Sign in to continue.',
    email_domain_mismatch: 'Use your work email on this organisation\'s domain.',
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
    document.querySelectorAll('[data-email]').forEach((n) => { n.textContent = invite.email || `@${invite.emailDomain}`; });
    if ($('bp-email')) {
      const email = $('bp-email');
      if (domainMode()) {
        email.readOnly = false;
        email.removeAttribute('aria-readonly');
        email.placeholder = `you@${invite.emailDomain}`;
        email.autocomplete = 'email';
        $('bp-email-note').hidden = false;
        $('bp-email-note').textContent = `Use your @${invite.emailDomain} email. We send it one code to confirm it is yours.`;
        $('bp-google-note').textContent = `Google works when your Google account is on @${invite.emailDomain}. Next time, sign in with this email and password, or with Google.`;
      } else email.value = invite.email;
    }
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
    const at = domain ? ` for @${domain}` : '';
    const cards = {
      registered: ['building', false, 'Already registered', 'Your organisation is', 'already registered.',
        `${x.companyName || 'Your organisation'} already uses SecureIntent Business${at}. To join, ask your workspace administrator${x.adminHint ? ` (${x.adminHint})` : ''} to invite you as a member.`],
      suspended: ['pause', true, 'Workspace suspended', "Your organisation's workspace", 'is suspended.',
        `${x.companyName ? `${x.companyName}'s` : 'Your organisation\'s'} SecureIntent workspace${at} is suspended, so a new one can't be activated yet. Contact SecureIntent to restore or remove it, then open your invitation link again.`],
      unavailable: ['clock', true, 'Invitation unavailable', 'This invitation link is', 'no longer valid.',
        'It has expired, been replaced by a newer link, or been revoked. Ask SecureIntent for a new invitation.'],
      used: ['user', true, 'Invitation in use', 'This invitation is', 'already in use.',
        'A different SecureIntent account has already started activating this workspace. If that was you with an earlier account, ask SecureIntent to release the invitation, then sign in again.'],
      already_member: ['user', true, 'Account already in a workspace', 'This account already', 'belongs to a workspace.',
        'Each person can belong to one SecureIntent Business workspace, and this account already does. Sign in with a different account, or contact SecureIntent.'],
      activated: ['check', false, 'Workspace active', 'This workspace is', 'already active.',
        `${invite ? invite.companyName : 'Your organisation'}'s workspace is set up. Sign in to the Business console to manage it and invite your team.`],
      nolink: ['link', false, 'Business activation', 'Open your', 'invitation link.',
        "To activate a workspace, open the link in the invitation email from SecureIntent. Already signed up? Sign in and we'll find your invitation."],
      notfound: ['link', true, 'No invitation found', 'No invitation for', 'this account.',
        `There's no pending Business invitation for ${x.email || 'this account'}. Check that you're signed in with the invited email, or open the link in your invitation email.`],
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
    alternatives(kind);
    show('bp-blocked');
  }
  $('bp-blocked-action').addEventListener('click', (e) => { if (blockedAction) { e.preventDefault(); blockedAction(); } });

  // Secondary routes under a card, so no screen is a dead end.
  const CONSOLE = ['Already activated your workspace?', 'Open the Business console', 'console'];
  const NEWER = ['Received a newer invitation?', 'Sign in to continue', 'signin'];
  const ALTERNATIVES = {
    unavailable: [CONSOLE, NEWER],
    used: [['Is this your workspace?', 'Open the Business console', 'console'], NEWER],
    registered: [['Are you its administrator?', 'Open the Business console', 'console']],
    already_member: [['Is this your workspace?', 'Open the Business console', 'console']],
    nolink: [CONSOLE],
    notfound: [CONSOLE],
  };
  function alternatives(kind) {
    const box = $('bp-blocked-alt');
    const signedIn = !!window.Clerk?.user;
    const rows = (ALTERNATIVES[kind] || []).map(([question, label, target]) => {
      // Already signed in: "sign in" means "with another account".
      if (target === 'signin' && signedIn) [question, label, target] = ['Signed in with the wrong account?', 'Use a different account', 'switch'];
      const p = document.createElement('p');
      const link = document.createElement('a');
      link.className = 'text-action';
      link.textContent = `${label} →`;
      if (target === 'console') link.href = SI.page('team.html');
      else {
        link.href = '#';
        link.addEventListener('click', (e) => { e.preventDefault(); if (target === 'switch') switchAccount(); else openAuth('signin'); });
      }
      p.append(document.createTextNode(question), link);
      return p;
    });
    box.replaceChildren(...rows);
    box.hidden = rows.length === 0;
  }

  // ---------- Clerk sign-up / sign-in inside the card ----------
  function unmountAuth() {
    const el = $('business-auth');
    if (mounted === 'signup') window.Clerk.unmountSignUp?.(el);
    if (mounted === 'signin') window.Clerk.unmountSignIn?.(el);
    mounted = '';
  }
  function openAuth(mode) {
    final = false;
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
  $('bp-tab-signup').addEventListener('click', () => openAuth('signup'));
  $('bp-tab-signin').addEventListener('click', () => openAuth('signin'));
  $('bp-back').addEventListener('click', () => { unmountAuth(); show('bp-welcome'); });
  function switchAccount() {
    final = false;
    window.Clerk.signOut({ redirectUrl: SI.page('business_promo.html?mode=signin') });
  }
  $('bp-switch').addEventListener('click', switchAccount);
  $('bp-use-invited').addEventListener('click', switchAccount);

  // ---------- one-code setup: name, password, one emailed code ----------
  function formError(id, text) {
    const el = $(id);
    el.textContent = text || '';
    el.hidden = !text;
  }
  /** Map an API refusal to the right card, or return the message to show inline. */
  function setupRefusal(error) {
    const c = error.code;
    if (c === 'organization_domain_claimed') { blocked('registered', error.data?.domain); return ''; }
    if (c === 'organization_domain_suspended') { blocked('suspended', error.data?.domain); return ''; }
    if (c === 'invitation_unavailable' || c === 'invalid_invitation') { forget(); blocked('unavailable'); return ''; }
    if (c === 'invitation_used') { blocked(invite?.activated ? 'activated' : 'used'); return ''; }
    if (c === 'already_member') { blocked('already_member'); return ''; }
    return error.message;
  }
  function tickResend() {
    const btn = $('bp-resend');
    const left = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    btn.disabled = left > 0 || busy;
    btn.textContent = left ? `Resend code in ${left}s` : 'Resend code';
    if (left && view === 'bp-code-step') setTimeout(tickResend, 1000);
  }
  async function sendCode(fromCodeStep = false) {
    if (busy) return;
    const first = $('bp-first').value.trim(), last = $('bp-last').value.trim();
    if (!fromCodeStep) {
      password = $('bp-password').value;
      if (!first) { formError('bp-setup-error', 'Enter your first name.'); $('bp-first').focus(); return; }
      if (password.length < 8) { formError('bp-setup-error', 'Choose a password of at least 8 characters.'); $('bp-password').focus(); return; }
      if (password !== $('bp-password2').value) { formError('bp-setup-error', "The passwords don't match."); $('bp-password2').focus(); return; }
      if (domainMode()) {
        const email = $('bp-email').value.trim().toLowerCase();
        if (!onDomain(email)) { formError('bp-setup-error', `Enter your work email ending in @${invite.emailDomain}.`); $('bp-email').focus(); return; }
        invite.email = email;
        $('bp-code-step').querySelectorAll('[data-email]').forEach((n) => { n.textContent = email; });
      }
    }
    busy = true;
    formError('bp-setup-error', '');
    formError('bp-code-error', '');
    const button = fromCodeStep ? $('bp-resend') : $('bp-send');
    button.disabled = true;
    try {
      const result = domainMode()
        ? await call('POST', '/v1/business-promo/domain/start', { token: domainToken, email: invite.email, firstName: first, lastName: last })
        : await call('POST', '/v1/business-promo/activate/start', { token, firstName: first, lastName: last });
      resendAt = Date.now() + (Number(result.retryAfter) || 30) * 1000;
      if (!fromCodeStep) { show('bp-code-step'); $('bp-code').value = ''; $('bp-code').focus(); }
      else formError('bp-code-error', '');
    } catch (error) {
      if (error.code === 'too_soon') {
        resendAt = Date.now() + (Number(error.data?.retryAfter) || 30) * 1000;
        if (!fromCodeStep) show('bp-code-step');
      } else {
        const text = setupRefusal(error);
        if (text) formError(fromCodeStep ? 'bp-code-error' : 'bp-setup-error', text);
      }
    } finally {
      busy = false;
      button.disabled = false;
      if (view === 'bp-code-step') tickResend();
    }
  }
  /** After the code: sign in with the one-time ticket, save the password with Clerk, open the console. */
  async function verifyCode() {
    if (busy) return;
    const code = $('bp-code').value.replace(/\D/g, '');
    if (code.length !== 6) { formError('bp-code-error', 'Enter the 6-digit code from the email.'); $('bp-code').focus(); return; }
    busy = true;
    formError('bp-code-error', '');
    $('bp-verify').disabled = true;
    $('bp-verify').firstChild.textContent = 'Activating… ';
    let result;
    try {
      result = domainMode()
        ? await call('POST', '/v1/business-promo/domain/verify', { token: domainToken, email: invite.email, code })
        : await call('POST', '/v1/business-promo/activate/verify', { token, code });
    } catch (error) {
      busy = false;
      $('bp-verify').disabled = false;
      $('bp-verify').firstChild.textContent = 'Activate workspace ';
      const text = setupRefusal(error);
      if (text) { formError('bp-code-error', text); $('bp-code').focus(); }
      return;
    }
    // The workspace exists from here on. Nothing below can undo it.
    final = true;
    forget();
    let note = '';
    try {
      if (!result.ticket) throw new Error('no ticket');
      const attempt = await window.Clerk.client.signIn.create({ strategy: 'ticket', ticket: result.ticket });
      if (attempt.status !== 'complete') throw new Error('ticket incomplete');
      await window.Clerk.setActive({ session: attempt.createdSessionId });
      note = await savePassword();
    } catch {
      note = 'Your workspace is ready. Sign in with your work email to open the console.';
    }
    busy = false;
    done(note);
  }
  /** The password goes from this browser straight to Clerk. An existing password is kept. */
  async function savePassword() {
    const value = password;
    password = '';
    const user = window.Clerk.user;
    if (!value || !user) return '';
    if (user.passwordEnabled) return 'This email already had a SecureIntent password, so we kept it. Use that password to sign in next time.';
    try {
      await user.updatePassword({ newPassword: value });
      return '';
    } catch (e) {
      const reason = e?.errors?.[0]?.longMessage || e?.errors?.[0]?.message || '';
      return `Your workspace is ready, but your password wasn't saved${reason ? `: ${reason}` : '.'} Set one in your account settings.`;
    }
  }
  function done(note = '') {
    final = true;
    show('bp-done');
    $('bp-redirect-note').textContent = note || 'Taking you to your dashboard now…';
    // A note needs reading; otherwise go straight to the Overview dashboard.
    if (!note) setTimeout(() => location.assign(SI.page('team.html') + '#/overview'), 2000);
  }
  async function continueWithGoogle() {
    if (busy) return;
    busy = true;
    formError('bp-setup-error', '');
    try {
      sessionStorage.setItem(GOOGLE_KEY, '1');
      await window.Clerk.client.signIn.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: SI.page('business_promo.html?sso-callback=1'),
        redirectUrlComplete: SI.page('business_promo.html'),
      });
    } catch {
      try { sessionStorage.removeItem(GOOGLE_KEY); } catch { /* ignore */ }
      busy = false;
      formError('bp-setup-error', "Google sign-in isn't available right now. Use Email me a code instead.");
    }
  }
  $('bp-setup').addEventListener('submit', (e) => { e.preventDefault(); void sendCode(); });
  $('bp-code-form').addEventListener('submit', (e) => { e.preventDefault(); void verifyCode(); });
  $('bp-resend').addEventListener('click', () => void sendCode(true));
  $('bp-change').addEventListener('click', () => { if (!busy) { show('bp-welcome'); $('bp-password').value = password; $('bp-password2').value = password; } });
  $('bp-google').addEventListener('click', () => void continueWithGoogle());
  document.querySelectorAll('[data-reveal]').forEach((btn) => btn.addEventListener('click', () => {
    const input = $(btn.dataset.reveal);
    const showIt = input.type === 'password';
    input.type = showIt ? 'text' : 'password';
    btn.textContent = showIt ? 'Hide' : 'Show';
    btn.setAttribute('aria-pressed', String(showIt));
  }));

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
      let fromGoogle = false;
      try { fromGoogle = sessionStorage.getItem(GOOGLE_KEY) === '1'; sessionStorage.removeItem(GOOGLE_KEY); } catch { /* ignore */ }
      const matches = domainMode() ? onDomain(email) : email === invite.email;
      if (matches && fromGoogle) { void activate(); return; }
      if (matches) { $('bp-signed-in').textContent = email; if (view !== 'bp-confirm') show('bp-confirm'); }
      else { $('bp-wrong-email').textContent = email || 'another account'; if (view !== 'bp-mismatch') show('bp-mismatch'); }
      return;
    }
    const mode = new URLSearchParams(location.search).get('mode');
    if (view === 'bp-auth' || view === 'bp-code-step') return;
    if (mode === 'signin' || mode === 'signup') openAuth(mode);
    else if (view !== 'bp-welcome') show('bp-welcome');
  }

  // ---------- activation ----------
  $('bp-activate').addEventListener('click', () => void activate());
  async function activate() {
    if (busy) return;
    busy = true;
    if (view !== 'bp-confirm') { show('bp-loading'); }
    const button = $('bp-activate');
    button.disabled = true;
    $('bp-switch').disabled = true;
    status('Creating your workspace…');
    try {
      const result = domainMode()
        ? await call('POST', '/v1/business-promo/domain/redeem', { token: domainToken }, true)
        : await call('POST', '/v1/business-promo/redeem', byEmail || !token ? { byEmail: true } : { token }, true);
      if (result.orgId && !result.orgId.startsWith('org_si_')) await window.Clerk.setActive({ organization: result.orgId });
      forget();
      busy = false;
      done();
    } catch (error) {
      busy = false;
      const c = error.code;
      if (c === 'organization_domain_claimed') return blocked('registered', error.data?.domain);
      if (c === 'organization_domain_suspended') return blocked('suspended', error.data?.domain);
      if (c === 'invitation_unavailable') { forget(); return blocked('unavailable'); }
      if (c === 'invitation_used') return blocked('used');
      if (c === 'already_member') return blocked('already_member');
      if (c === 'invitation_email_mismatch') { status('Sign in with the verified business email address named in this invitation.', true); return; }
      if (view !== 'bp-confirm') { $('bp-signed-in').textContent = primaryEmail(window.Clerk.user); show('bp-confirm'); }
      status(error.message, true);
    } finally {
      button.disabled = false;
      $('bp-switch').disabled = false;
    }
  }

  // ---------- start ----------
  try {
    await SI.ready({ auth: true });
    if (domainToken && !(token && tokenFromLink)) {
      token = '';
      try {
        const link = await call('POST', '/v1/business-promo/domain/inspect', { token: domainToken });
        invite = { ...link, email: '', isDomainLink: true, activated: false };
        fill();
      } catch (error) {
        forget(); domainToken = ''; invite = null;
        if (domainFromLink) { blocked('unavailable'); await window.Clerk.load(); window.Clerk.addListener(() => route()); return; }
      }
    }
    if (token && !invite) {
      try { invite = await call('POST', '/v1/business-promo/inspect', { token }); }
      catch (error) {
        if (error.code === 'invitation_unavailable' || error.code === 'invalid_invitation') {
          forget(); token = ''; invite = null;
          // Only a link clicked just now deserves the "no longer valid" card. A
          // code remembered from an earlier visit must not block a plain visit
          // or a sign-in: continue as if no link was opened.
          if (tokenFromLink) { blocked('unavailable'); await window.Clerk.load(); window.Clerk.addListener(() => route()); return; }
        } else { status(error.message, true); await window.Clerk.load(); return; }
      }
      if (invite) fill();
    }
    await window.Clerk.load();
    // Back from "Continue with Google": finish the sign-in, then activate.
    if (new URLSearchParams(location.search).has('sso-callback')) {
      try {
        await window.Clerk.handleRedirectCallback({
          signInForceRedirectUrl: SI.page('business_promo.html'),
          signUpForceRedirectUrl: SI.page('business_promo.html'),
        });
      } catch {
        try { sessionStorage.removeItem(GOOGLE_KEY); } catch { /* ignore */ }
        status("Google sign-in didn't complete. Try again, or use Email me a code.", true);
      }
    }
    window.Clerk.addListener(() => route());
    route();
  } catch (error) {
    status(error.message || 'This page could not load. Refresh to try again.', true);
  }
})();
