(() => {
  'use strict';
  const SI = window.SI;
  const params = new URLSearchParams(location.search);
  const installId = params.get('id') || '';
  const $ = id => document.getElementById(id);
  const status = $('uninstall-status');
  const form = $('uninstall-form');
  let reason = '', pending = null;
  const key = 'si_uninstall_sent:' + installId;
  const usable = /^[A-Za-z0-9-]{8,64}$/.test(installId);
  function message(text, error = false) {
    status.textContent = text; status.setAttribute('role', error ? 'alert' : 'status');
  }
  if (!usable) {
    $('uninstall-ask').hidden = true;
    $('uninstall-noid').hidden = false;
    return;
  }
  async function report(comment) {
    const body = JSON.stringify({ installId, token: params.get('t') || '', reason,
      comment, version: params.get('v') || '', browser: params.get('b') || '', os: params.get('os') || '' });
    try { if (sessionStorage.getItem(key) === body) return; } catch {}
    await SI.ready();
    const response = await SI.fetch(SI.config.apiBase + '/v1/uninstall/feedback', {
      method: 'POST', headers: {'content-type': 'application/json'}, body, keepalive: true,
    });
    if (!response.ok) throw new Error('Could not save your feedback. Please try again.');
    try { sessionStorage.setItem(key, body); } catch {}
  }
  const buttons = [...document.querySelectorAll('[data-uninstall-reason]')];
  buttons.forEach(button => {
    button.disabled = false;
    button.addEventListener('click', () => {
      if (pending) return;
      reason = button.dataset.uninstallReason;
      buttons.forEach(item => { item.setAttribute('aria-pressed', String(item === button)); item.disabled = true; });
      form.hidden = false;
      message('Saving your feedback…');
      // Preserve main's one-tap behavior; the optional comment is a second update.
      pending = report($('uninstall-comment').value.trim())
        .then(() => message('Your reason has been saved. You can add a note below.'))
        .catch(error => message(error.message, true))
        .finally(() => { pending = null; buttons.forEach(item => item.disabled = false); });
    });
  });
  form.querySelector('button').disabled = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!reason) return;
    const button = form.querySelector('button'); button.disabled = true;
    try {
      if (pending) await pending;
      await report($('uninstall-comment').value.trim());
      $('uninstall-ask').hidden = true; $('uninstall-done').hidden = false; message('');
    } catch (error) { message(error.message, true); }
    finally { button.disabled = false; }
  });
})();
