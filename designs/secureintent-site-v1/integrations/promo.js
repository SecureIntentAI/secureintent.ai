(() => {
  'use strict';
  const SI = window.SI;
  const $ = id => document.getElementById(id);
  let email = '', newUser = true, busy = false;
  const note = $('promo-review-note');
  function message(text, error = false) {
    note.textContent = text;
    note.setAttribute('role', error ? 'alert' : 'status');
  }
  function screen(name) {
    for (const state of ['start', 'code', 'done', 'closed']) $('promo-' + state).hidden = state !== name;
  }
  function setBusy(value) {
    busy = value;
    document.querySelectorAll('[data-lifetime-promo] button').forEach(button => button.disabled = value);
  }
  async function post(path, body) {
    await SI.ready();
    const response = await SI.fetch(SI.config.apiBase + path, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  }
  function setNewUser(value) {
    newUser = value;
    $('promo-new-fields').hidden = !value;
    ['promo-first-name', 'promo-last-name', 'promo-password'].forEach(id => {
      $(id).required = value; $(id).disabled = !value;
    });
  }
  async function send(resend = false) {
    if (busy) return;
    const field = $('promo-email');
    if (!resend && !field.reportValidity()) return;
    const value = resend ? email : field.value.trim();
    setBusy(true); message('Sending your code…');
    try {
      const result = await post('/v1/promo/start', { email: value });
      if (result.ok && result.data.ok === true) {
        email = value;
        setNewUser(result.data.newUser !== false);
        $('promo-email-value').textContent = email;
        $('promo-code-input').value = '';
        screen('code'); $('promo-code-input').focus();
        message(resend ? 'A new code is on its way.' : 'Check your email for your verification code.');
      } else if (result.status === 403) {
        screen('closed'); message('');
      } else {
        message(result.status === 429 ? 'Please wait before requesting another code.' : 'Could not send a code. Please try again.', true);
      }
    } catch (error) {
      message(SI.config ? 'Could not reach the service. Please try again.' : error.message, true);
    } finally { setBusy(false); }
  }
  $('promo-email-form').addEventListener('submit', event => { event.preventDefault(); send(); });
  $('promo-code-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !event.currentTarget.reportValidity()) return;
    const code = $('promo-code-input').value.trim();
    if (!/^\d{6}$/.test(code)) { message('Enter the six-digit code we emailed you.', true); return; }
    const body = { email, code };
    if (newUser) {
      body.firstName = $('promo-first-name').value.trim(); body.lastName = $('promo-last-name').value.trim();
      body.password = $('promo-password').value;
      if (!body.firstName || !body.lastName || body.password.length < 8) { message('Enter your name and a password with at least eight characters.', true); return; }
    }
    setBusy(true); message('Verifying your code…');
    try {
      const result = await post('/v1/promo/verify', body);
      if (result.ok && result.data.ok === true) {
        $('promo-done-email').textContent = email;
        $('promo-password').value = ''; $('promo-code-input').value = '';
        screen('done'); message('');
      } else if (result.status === 403) {
        screen('closed'); message('');
      } else {
        const errors = { weak_password: 'Choose a stronger password with at least eight characters.', expired: 'That code expired. Request a new one.' };
        message(result.status === 429 ? 'Too many attempts. Request a new code.' : errors[result.data.error] || 'That code did not work. Check it and try again.', true);
      }
    } catch (error) {
      message(SI.config ? 'Could not reach the service. Please try again.' : error.message, true);
    } finally { setBusy(false); }
  });
  document.querySelector('[data-promo-back]').addEventListener('click', () => {
    if (busy) return;
    $('promo-password').value = ''; $('promo-code-input').value = '';
    screen('start'); message(''); $('promo-email').focus();
  });
  document.querySelector('[data-promo-resend]').addEventListener('click', () => send(true));
  (async () => {
    setBusy(true); message('Checking offer availability…');
    try {
      await SI.ready();
      const response = await SI.fetch(SI.config.apiBase + '/v1/promo', { cache: 'no-store' });
      if (!response.ok) throw new Error('Offer unavailable');
      const data = await response.json();
      if (typeof data.enabled !== 'boolean') throw new Error('Offer unavailable');
      screen(data.enabled ? 'start' : 'closed'); message('');
    } catch (error) {
      // Server checks again on start/verify. Never grant on a network error.
      screen('start'); message(SI.config ? 'Could not check availability. You can try requesting a code.' : error.message, true);
    } finally { setBusy(false); }
  })();
})();
