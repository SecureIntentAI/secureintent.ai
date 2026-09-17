(() => {
  'use strict';
  document.querySelectorAll('#business-form, #contact-form').forEach(form => {
  const error = form.querySelector('.form-error');
  const status = form.querySelector('.form-status');
  const button = form.querySelector('button[type="submit"]');
  const buttonContent = button.innerHTML;
  button.disabled = false;
  let pending = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending) return;
    status.textContent = '';
    const email = form.elements.email;
    email.value = email.value.trim();
    email.setAttribute('aria-invalid', String(!email.checkValidity()));
    if (!email.reportValidity()) return;
    error.hidden = true;
    pending = true; button.disabled = true; button.textContent = 'Sending…';
    try {
      await window.SI.ready();
      const response = await window.SI.fetch(window.SI.config.apiBase + '/submit', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        // Existing main contract deliberately stores email and tier only.
        body: JSON.stringify({ email: email.value.toLowerCase(), tier: 'biz' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok !== true) throw new Error(response.status === 429 ? 'Please wait a moment before trying again.' : 'Your request could not be sent. Please try again.');
      status.textContent = 'Thank you. Your interest in Business Pro has been registered. Check your email for our welcome message.';
      form.reset();
    } catch (err) {
      error.hidden = false;
      error.textContent = window.SI.config ? (err.message === 'Failed to fetch' ? 'Could not reach the service. Please try again.' : err.message) : 'Test services are not configured for this preview.';
    } finally {
      pending = false; button.disabled = false;
      button.innerHTML = buttonContent;
    }
  });
  form.addEventListener('input', event => {
    event.target.removeAttribute('aria-invalid'); error.hidden = true; status.textContent = '';
  });
  });
})();
