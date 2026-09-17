(() => {
  'use strict';
  const promo = document.querySelector('[data-lifetime-promo]');
  if (promo) {
    const start = document.getElementById('promo-start');
    const code = document.getElementById('promo-code');
    const done = document.getElementById('promo-done');
    const email = document.getElementById('promo-email');
    const setScreen = screen => { start.hidden = screen !== 'start'; code.hidden = screen !== 'code'; done.hidden = screen !== 'done'; };
    document.getElementById('promo-email-form').addEventListener('submit', event => { event.preventDefault(); if (!email.checkValidity()) return; document.getElementById('promo-email-value').textContent = email.value; setScreen('code'); document.getElementById('promo-code-input').focus(); });
    document.getElementById('promo-code-form').addEventListener('submit', event => { event.preventDefault(); const value = document.getElementById('promo-code-input').value.trim(); if (!/^\d{6}$/.test(value)) { document.getElementById('promo-review-note').textContent = 'Enter any six digits to preview the claimed state. No verification is performed here.'; return; } document.getElementById('promo-done-email').textContent = email.value; setScreen('done'); document.getElementById('promo-review-note').textContent = 'Design review only — no email is sent and no entitlement can be granted from this staging preview.'; });
    promo.querySelector('[data-promo-back]').addEventListener('click', () => setScreen('start'));
    promo.querySelector('[data-promo-resend]').addEventListener('click', () => { document.getElementById('promo-review-note').textContent = 'Design review only — a code has not been sent.'; });
  }
  const uninstall = document.querySelector('[data-uninstall]');
  if (uninstall) {
    const ask = document.getElementById('uninstall-ask'); const done = document.getElementById('uninstall-done'); const form = document.getElementById('uninstall-form');
    uninstall.querySelectorAll('[data-uninstall-reason]').forEach(button => button.addEventListener('click', () => { uninstall.querySelectorAll('[data-uninstall-reason]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); form.hidden = false; document.getElementById('uninstall-comment').focus(); }));
    form.addEventListener('submit', event => { event.preventDefault(); ask.hidden = true; done.hidden = false; });
  }
  const account = document.querySelector('[data-account]');
  if (account) document.getElementById('account-form').addEventListener('submit', event => { event.preventDefault(); if (document.getElementById('account-email').checkValidity()) document.getElementById('account-preview').classList.add('is-visible'); });
})();
