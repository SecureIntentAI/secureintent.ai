/* Approve a desktop sign-in (link.html#code=XXXX-XXXX).
 *
 * The desktop app cannot run Clerk, so it opens this page with a short code and
 * waits. The person signs in here as usual, checks the code matches the one the
 * app shows, and approves; the app then collects a sign-in of its own from the
 * API. The code travels in the fragment, so it never reaches server logs.
 */
(async () => {
  const SI = window.SI;
  const $ = (id) => document.getElementById(id);
  const OS_NAMES = { macos: 'macOS', windows: 'Windows', linux: 'Linux' };
  const CODE = /^[A-HJKMNP-TV-Z2-9]{4}-?[A-HJKMNP-TV-Z2-9]{4}$/;

  const raw = new URLSearchParams(location.hash.slice(1)).get('code') || '';
  const code = CODE.test(raw.toUpperCase())
    ? raw.toUpperCase().replace(/^(.{4})-?(.{4})$/, '$1-$2')
    : null;

  function show(id) {
    for (const panel of ['loading', 'auth', 'approve', 'result']) $(panel).hidden = panel !== id;
  }
  function finish(title, body) {
    $('result-title').textContent = title;
    $('result-body').textContent = body;
    show('result');
  }
  const ENDINGS = {
    code_expired: ['This code has expired', 'Codes last ten minutes. Press Sign in again in the desktop app to get a new one.'],
    code_used: ['This code was already used', 'Press Sign in again in the desktop app if it is not signed in.'],
    code_invalid: ['Code not recognised', 'Press Sign in again in the desktop app and open the new link it gives you.'],
    email_unverified: ['Verify your email first', 'Confirm your email address in your account, then press Sign in again in the desktop app.'],
  };
  function ended(error) {
    const [title, body] = ENDINGS[error] || ['Something went wrong', 'Please try again in a moment.'];
    finish(title, body);
  }

  if (!code) {
    finish('Open this page from the desktop app', 'In SecureIntent desktop, go to Settings and press Sign in. It opens this page with your code.');
    return;
  }

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

  async function signedIn() {
    show('loading');
    let inspected;
    try {
      inspected = await call('inspect');
    } catch {
      ended('unavailable');
      return;
    }
    if (!inspected.ok) {
      ended(inspected.error);
      return;
    }
    const device = inspected.body.device || {};
    $('link-code').textContent = code;
    $('link-device').textContent = `${device.name || 'Unknown device'} (${OS_NAMES[device.os] || device.os || 'unknown system'}), app ${device.appVersion || ''}`.trim();
    $('link-email').textContent = inspected.body.email || window.Clerk.user.primaryEmailAddress?.emailAddress || 'Your account';
    show('approve');
  }

  async function answer(step) {
    $('link-error').hidden = true;
    for (const id of ['link-approve', 'link-deny']) $(id).disabled = true;
    try {
      const result = await call(step);
      if (result.ok) {
        if (step === 'approve') finish('Desktop app connected', 'You can close this tab and go back to the desktop app. It signs in by itself in a few seconds.');
        else finish('Sign-in refused', 'The desktop app will not be signed in. If you did not press Sign in yourself, you can ignore this.');
        // The code is done with; keep it out of history.
        history.replaceState(null, '', location.pathname);
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

  let mounted = false;
  let started = false;
  function render() {
    if (window.Clerk.user) {
      if (mounted) window.Clerk.unmountSignIn?.($('clerk-auth'));
      mounted = false;
      // Clerk calls back on every session change; look the code up once.
      if (!started) {
        started = true;
        signedIn();
      }
      return;
    }
    show('auth');
    if (mounted) return;
    mounted = true;
    // Back to this page with the same code after signing in.
    const back = SI.authReturn('link.html');
    window.Clerk.mountSignIn($('clerk-auth'), {
      appearance: SI.appearance(),
      afterSignInUrl: back,
      forceRedirectUrl: back,
      signInForceRedirectUrl: back,
      signUpUrl: SI.authReturn('account.html?mode=signup'),
    });
  }
  window.Clerk.addListener(render);
  render();
})();
