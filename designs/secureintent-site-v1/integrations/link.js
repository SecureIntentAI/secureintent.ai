/* Approve a desktop sign-in (link.html).
 *
 * The desktop app cannot run Clerk, so it opens this page and shows a short code.
 * The person signs in here as usual, types the code the app is showing, and
 * approves; the app then collects a sign-in of its own from the API.
 *
 * The code is typed, never taken from the link: a link someone else sends cannot
 * carry a code of theirs for the person to approve. The same page approves a
 * desktop asking to unlock the team admin pages.
 */
(async () => {
  const SI = window.SI;
  const $ = (id) => document.getElementById(id);
  const OS_NAMES = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };
  const CODE = /^[A-HJKMNP-TV-Z2-9]{4}-?[A-HJKMNP-TV-Z2-9]{4}$/;
  const signUpMode = new URLSearchParams(location.search).get('mode') === 'signup';

  // Codes are typed, so anything left in the fragment by an older app is dropped.
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);

  function show(id) {
    for (const panel of ['loading', 'auth', 'enter', 'approve', 'result']) $(panel).hidden = panel !== id;
  }
  function finish(title, body, again = false) {
    $('result-title').textContent = title;
    $('result-body').textContent = body;
    $('result-again').hidden = !again;
    show('result');
  }
  const SIGN_IN_AGAIN = ['Sign in again', 'Your sign-in on this page has ended. Sign in again, then enter the code from the desktop app.', true];
  const ADMIN_FRESH = ['Sign in again to confirm', 'Unlocking the team admin pages needs a fresh sign-in with your password, an emailed code or Google for the admin address.', true];
  const ENDINGS = {
    email_unverified: ['Verify your email first', 'Confirm your email address in your account, then press Sign in again in the desktop app.'],
    unauthenticated: SIGN_IN_AGAIN,
    session_required: SIGN_IN_AGAIN,
    origin_denied: ['Open this page on secureintent.ai', 'Desktop sign-in can only be approved on secureintent.ai. Press Sign in again in the desktop app.'],
    business_promo_required: ['This team is not active', 'The team behind this account has no active plan. Ask the team admin, or sign in with another account.', true],
    authentication_unavailable: ['Sign-in checks are unavailable', 'We could not confirm your sign-in just now. Please try again in a moment.'],
    too_many_attempts: ['Too many tries', 'Wait a few minutes, then press Sign in again in the desktop app.'],
    // Unlocking the team admin pages from the desktop.
    password_verification_required: ADMIN_FRESH,
    clerk_verification_required: ADMIN_FRESH,
    different_account: ['Signed in with another account', 'Sign in with the same account that is signed in on the desktop app.', true],
    forbidden: ['Only the team admin can unlock this', 'Sign in with the account that manages the team.', true],
    business_organisation_required: ['Only the team admin can unlock this', 'Sign in with the account that manages the team.', true],
  };
  // Problems with the typed code itself: said next to the field, to try again.
  const CODE_PROBLEMS = {
    code_invalid: 'That code is not right. Check it against the one the desktop app shows.',
    code_expired: 'This code has expired. Codes last ten minutes: press Sign in again in the desktop app for a new one.',
    code_used: 'This code was already used. Press Sign in again in the desktop app if it is not signed in.',
  };
  function ended(error) {
    const [title, body, again] = ENDINGS[error] || ['Something went wrong', 'Please try again in a moment.'];
    finish(title, body, !!again);
  }
  // A fresh sign-in, back to this page.
  $('result-again').addEventListener('click', () => void window.Clerk.signOut({ redirectUrl: SI.authReturn('link.html') }));

  let CFG;
  try {
    CFG = await SI.ready({ auth: true });
    await window.Clerk.load({ appearance: SI.appearance() });
  } catch (error) {
    show('result');
    $('result-title').textContent = 'Sign-in is unavailable';
    SI.showError($('result-body'), error);
    return;
  }

  let code = null;
  let purpose = 'sign_in';

  async function call(step) {
    const token = await window.Clerk.session.getToken();
    const res = await SI.fetch(`${CFG.apiBase}/v1/desktop/link/${step}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code }),
    });
    const body = await res.json().catch(() => ({}));
    return { ok: res.ok, error: body.error, body };
  }

  function codeError(message) {
    $('code-error').textContent = message;
    $('code-error').hidden = !message;
    $('code-continue').disabled = false;
    if (message) $('code-input').focus();
  }

  /** "2 minutes ago from Pakistan", from when the app asked and Cloudflare's country. */
  function requested(startedAt, country) {
    const minutes = Math.max(0, Math.round((Date.now() - Number(startedAt)) / 60000));
    const when = !Number.isFinite(minutes) ? 'Just now' : minutes < 1 ? 'Just now' : minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
    let where = '';
    try {
      if (country) where = ` from ${new Intl.DisplayNames(['en'], { type: 'region' }).of(country) || country}`;
    } catch {
      where = ` from ${country}`;
    }
    return when + where;
  }

  async function lookUp(event) {
    event.preventDefault();
    const typed = $('code-input').value.trim().toUpperCase();
    if (!CODE.test(typed)) {
      codeError('Enter the 8-character code from the desktop app, like ABCD-EFGH.');
      return;
    }
    code = typed.replace(/^(.{4})-?(.{4})$/, '$1-$2');
    codeError('');
    $('code-continue').disabled = true;
    let inspected;
    try {
      inspected = await call('inspect');
    } catch {
      codeError('We could not check the code just now. Please try again.');
      return;
    }
    if (!inspected.ok) {
      if (CODE_PROBLEMS[inspected.error]) codeError(CODE_PROBLEMS[inspected.error]);
      else ended(inspected.error);
      return;
    }
    const device = inspected.body.device || {};
    purpose = inspected.body.purpose === 'admin_unlock' ? 'admin_unlock' : 'sign_in';
    if (purpose === 'admin_unlock') {
      $('approve-title').textContent = 'Unlock team admin on this device?';
      $('approve-warning').textContent = 'Only unlock if you just pressed Unlock with browser in SecureIntent desktop. This opens the team admin pages there.';
      $('link-approve').textContent = 'Unlock';
    }
    $('link-code').textContent = code;
    $('link-device').textContent = `${device.name || 'Unknown device'} (${OS_NAMES[device.os] || device.os || 'unknown system'}), app ${device.appVersion || ''}`.trim();
    $('link-started').textContent = requested(inspected.body.startedAt, inspected.body.country);
    $('link-email').textContent = inspected.body.email || window.Clerk.user.primaryEmailAddress?.emailAddress || 'Your account';
    $('code-continue').disabled = false;
    show('approve');
  }
  $('code-form').addEventListener('submit', lookUp);
  // Format as it is typed: upper case, and the dash after four characters.
  $('code-input').addEventListener('input', (event) => {
    const chars = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    event.target.value = chars.length > 4 ? `${chars.slice(0, 4)}-${chars.slice(4)}` : chars;
  });

  async function answer(step) {
    $('link-error').hidden = true;
    for (const id of ['link-approve', 'link-deny']) $(id).disabled = true;
    try {
      const result = await call(step);
      if (result.ok) {
        if (step === 'approve' && purpose === 'admin_unlock') finish('Team admin unlocked', 'You can close this tab and go back to the desktop app. The admin pages open by themselves in a few seconds.');
        else if (step === 'approve') finish('Desktop app connected', 'You can close this tab and go back to the desktop app. It signs in by itself in a few seconds.');
        else if (purpose === 'admin_unlock') finish('Unlock refused', 'The admin pages stay locked in the desktop app. If you did not ask for this yourself, you can ignore it.');
        else finish('Sign-in refused', 'The desktop app will not be signed in. If you did not press Sign in yourself, you can ignore this.');
        return;
      }
      if (CODE_PROBLEMS[result.error]) {
        show('enter');
        codeError(CODE_PROBLEMS[result.error]);
        return;
      }
      ended(result.error);
    } catch (error) {
      SI.showError($('link-error'), error);
      for (const id of ['link-approve', 'link-deny']) $(id).disabled = false;
    }
  }
  $('link-approve').addEventListener('click', () => answer('approve'));
  $('link-deny').addEventListener('click', () => answer('deny'));

  let mounted = null;
  let started = false;
  function render() {
    if (window.Clerk.user) {
      if (mounted === 'signin') window.Clerk.unmountSignIn?.($('clerk-auth'));
      if (mounted === 'signup') window.Clerk.unmountSignUp?.($('clerk-auth'));
      mounted = null;
      // Clerk calls back on every session change; show the code field once.
      if (!started) {
        started = true;
        show('enter');
        $('code-input').focus();
      }
      return;
    }
    show('auth');
    if (mounted) return;
    // Signing in or creating an account both come back here, so a new user
    // never loses the flow.
    const back = SI.authReturn('link.html');
    const common = {
      appearance: SI.appearance(),
      forceRedirectUrl: back,
      signInForceRedirectUrl: back,
      signUpForceRedirectUrl: back,
    };
    if (signUpMode) {
      mounted = 'signup';
      window.Clerk.mountSignUp($('clerk-auth'), { ...common, signInUrl: back });
    } else {
      mounted = 'signin';
      window.Clerk.mountSignIn($('clerk-auth'), { ...common, afterSignInUrl: back, signUpUrl: SI.authReturn('link.html?mode=signup') });
    }
  }
  window.Clerk.addListener(render);
  render();
})();
