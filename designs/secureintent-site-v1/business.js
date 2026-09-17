(() => {
  'use strict';
  const form = document.getElementById('business-form');
  const error = document.getElementById('business-error');
  const status = document.getElementById('business-status');
  form.addEventListener('submit', event => {
    event.preventDefault();
    status.textContent = '';
    let firstInvalid;
    form.querySelectorAll('input').forEach(input => {
      const valid = input.checkValidity() && (!input.required || input.value.trim().length > 0);
      input.setAttribute('aria-invalid', String(!valid));
      if (!valid && !firstInvalid) firstInvalid = input;
    });
    error.hidden = !firstInvalid;
    if (firstInvalid) {
      error.textContent = 'Please add your name and a valid work email address.';
      firstInvalid.focus();
      return;
    }
    status.textContent = 'Your details look good. This is a design preview, so nothing has been sent or stored.';
  });
  form.addEventListener('input', event => {
    event.target.removeAttribute('aria-invalid');
    error.hidden = true;
    status.textContent = '';
  });
})();
