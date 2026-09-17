(() => {
  'use strict';
  const sidebar = document.getElementById('docs-sidebar');
  const toggle = document.getElementById('docs-menu-toggle');
  const search = [document.getElementById('docs-search'), document.getElementById('docs-search-mobile')].filter(Boolean);
  const links = [...document.querySelectorAll('[data-doc-link]')];
  const filter = value => {
    const term = value.trim().toLowerCase();
    links.forEach(link => { link.hidden = Boolean(term) && !link.textContent.toLowerCase().includes(term); });
  };
  search.forEach(input => input.addEventListener('input', event => { filter(event.target.value); search.forEach(other => { if (other !== event.target) other.value = event.target.value; }); }));
  const setSidebar = open => { sidebar.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); toggle.lastElementChild?.querySelector('use')?.setAttribute('href', open ? '#i-close' : '#i-menu'); };
  toggle.addEventListener('click', () => setSidebar(!sidebar.classList.contains('is-open')));
  sidebar.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setSidebar(false)));
  document.addEventListener('keydown', event => { if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); document.getElementById('docs-search').focus(); } if (event.key === 'Escape') setSidebar(false); });
  const toc = [...document.querySelectorAll('.docs-toc a')];
  const sections = toc.map(link => document.querySelector(link.getAttribute('href'))).filter(Boolean);
  if ('IntersectionObserver' in window) { const observer = new IntersectionObserver(entries => { const visible = entries.filter(entry => entry.isIntersecting)[0]; if (!visible) return; toc.forEach(link => { if (link.getAttribute('href') === `#${visible.target.id}`) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current'); }); }, { rootMargin: '-20% 0px -68%', threshold: .01 }); sections.forEach(section => observer.observe(section)); }
})();
