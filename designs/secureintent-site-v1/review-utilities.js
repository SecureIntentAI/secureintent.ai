(() => {
  'use strict';
  const uninstall = document.querySelector('[data-uninstall]');
  if (uninstall) {
    const ask = document.getElementById('uninstall-ask'); const done = document.getElementById('uninstall-done'); const form = document.getElementById('uninstall-form');
    uninstall.querySelectorAll('[data-uninstall-reason]').forEach(button => button.addEventListener('click', () => { uninstall.querySelectorAll('[data-uninstall-reason]').forEach(item => item.setAttribute('aria-pressed', String(item === button))); form.hidden = false; document.getElementById('uninstall-comment').focus(); }));
    form.addEventListener('submit', event => { event.preventDefault(); ask.hidden = true; done.hidden = false; });
  }
})();
