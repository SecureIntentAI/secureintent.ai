/* Monthly / Annual switch on the homepage plans. Without script the monthly
 * prices and links stay, which is also what the page starts with. */
(() => {
  const box = document.querySelector('.billing-toggle');
  if (!box) return;
  const set = (interval) => {
    box.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.interval === interval)));
    document.querySelectorAll('#tiers [data-monthly]').forEach((el) => { el.textContent = el.dataset[interval]; });
    document.querySelectorAll('#tiers [data-plan-link]').forEach((a) => {
      a.href = `account.html?mode=signup&plan=${a.dataset.planLink}&interval=${interval}`;
    });
  };
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-interval]');
    if (b) set(b.dataset.interval);
  });
})();
