(() => {
  'use strict';
  if (!document.querySelector('script[data-site-footer]')) {
    const footerScript = document.createElement('script');
    footerScript.src = new URL('site-footer.js?v=20260914-original', document.baseURI).href;
    footerScript.dataset.siteFooter = 'true';
    document.head.append(footerScript);
  }
  const pages = new Set(['index.html', 'solutions.html', 'how-it-works.html', 'architecture.html', 'about.html', 'roadmap.html', 'business.html', 'customers.html', 'team.html', 'advisory-board.html', 'privacy.html', 'tos.html', 'account.html', 'lifetime_promo.html', 'uninstall.html', 'docs.html']);
  document.querySelectorAll('a[href]').forEach(link => {
    const raw = link.getAttribute('href');
    const match = raw && raw.match(/^\.\.\/\.\.\/([^?#]+\.html)([?#].*)?$/);
    if (match && pages.has(match[1])) link.setAttribute('href', `${match[1]}${match[2] || ''}`);
  });
  const current = location.pathname.includes('/docs/') ? 'docs.html' : (location.pathname.endsWith('/') ? 'index.html' : location.pathname.split('/').pop());
  const primary = [
    ['solutions.html', 'Solutions'],
    ['how-it-works.html', 'How it works'],
    ['architecture.html', 'Architecture'],
    ['business.html', 'Business'],
    ['roadmap.html', 'Roadmap'],
    ['about.html', 'About']
  ];
  const link = ([href, label]) => `<a href="${href}"${current === href.split('/').pop() ? ' aria-current="page"' : ''}>${label}</a>`;
  const header = document.querySelector('.site-header');
  const desktop = header && header.querySelector('.desktop-nav');
  if (desktop) desktop.innerHTML = primary.map(link).join('');
  const mobile = header && header.querySelector('.mobile-nav');
  if (mobile) {
    const mobileLinks = [
      ['index.html', 'Home'], ...primary,
      ['customers.html', 'Customers'],
      ['account.html', 'Sign in']
    ];
    mobile.innerHTML = `${mobileLinks.map(link).join('')}<a class="button" href="https://chromewebstore.google.com/detail/secureintent/ejdhcakapnkbmfihgoamdnajgimhemof" target="_blank" rel="noopener">Install SecureIntent</a>`;
    mobile.querySelectorAll('a').forEach(item => item.addEventListener('click', () => {
      mobile.hidden = true;
      const toggle = document.getElementById('menu-toggle');
      if (toggle) { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open menu'); }
    }));
  }
})();
