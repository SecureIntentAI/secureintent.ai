(() => {
  'use strict';
  if (!document.querySelector('script[data-site-footer]')) {
    const footerScript = document.createElement('script');
    footerScript.src = new URL('site-footer.js?v=20260914-original', document.baseURI).href;
    footerScript.dataset.siteFooter = 'true';
    document.head.append(footerScript);
  }
  const root = document.documentElement;
  const designPages = new Set(['index.html', 'solutions.html', 'how-it-works.html', 'architecture.html', 'about.html', 'roadmap.html', 'business.html', 'customers.html', 'team.html', 'advisory-board.html', 'privacy.html', 'tos.html', 'account.html', 'lifetime_promo.html', 'uninstall.html', 'docs.html']);
  document.querySelectorAll('a[href]').forEach(link => {
    const raw = link.getAttribute('href');
    const match = raw && raw.match(/^\.\.\/\.\.\/([^?#]+\.html)([?#].*)?$/);
    if (match && designPages.has(match[1])) link.setAttribute('href', `${match[1]}${match[2] || ''}`);
  });
  const currentPage = location.pathname.includes('/docs/') ? 'docs.html' : (location.pathname.endsWith('/') ? 'index.html' : location.pathname.split('/').pop());
  const primaryLinks = [
    ['solutions.html', 'Solutions'],
    ['how-it-works.html', 'How it works'],
    ['architecture.html', 'Architecture'],
    ['business.html', 'Business'],
    ['roadmap.html', 'Roadmap'],
    ['about.html', 'About']
  ];
  const navLink = ([href, label]) => `<a href="${href}"${currentPage === href.split('/').pop() ? ' aria-current="page"' : ''}>${label}</a>`;
  const header = document.querySelector('.site-header');
  const desktopNav = header && header.querySelector('.desktop-nav');
  if (desktopNav) desktopNav.innerHTML = primaryLinks.map(navLink).join('');
  const mobileNav = header && header.querySelector('.mobile-nav');
  if (mobileNav) {
    const mobileLinks = [
      ['index.html', 'Home'], ...primaryLinks,
      ['customers.html', 'Customers'],
      ['account.html', 'Sign in']
    ];
    mobileNav.innerHTML = `${mobileLinks.map(navLink).join('')}<a class="button" href="https://chromewebstore.google.com/detail/secureintent/ejdhcakapnkbmfihgoamdnajgimhemof" target="_blank" rel="noopener">Install SecureIntent</a>`;
  }
  const themeToggle = document.getElementById('theme-toggle');
  const applyTheme = (theme, remember) => {
    const next = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = next;
    document.querySelectorAll('[data-set-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.setTheme === next)));
    if (themeToggle) {
      themeToggle.setAttribute('aria-label', next === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      const icon = themeToggle.querySelector('use');
      if (icon) icon.setAttribute('href', next === 'dark' ? '#i-sun' : '#i-moon');
    }
    document.getElementById('theme-color').content = next === 'dark' ? '#050608' : '#ffffff';
    if (remember) { try { localStorage.setItem('si_site_theme', next); } catch (_) {} }
  };
  applyTheme(root.dataset.theme, false);
  document.querySelectorAll('[data-set-theme]').forEach(button => button.addEventListener('click', () => applyTheme(button.dataset.setTheme, true)));
  if (themeToggle) themeToggle.addEventListener('click', () => applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true));
  window.addEventListener('storage', event => { if (event.key === 'si_site_theme' || event.key === null) applyTheme(event.newValue, false); });

  const menu = document.getElementById('mobile-nav');
  const menuToggle = document.getElementById('menu-toggle');
  const setMenu = open => {
    menu.hidden = !open;
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menuToggle.querySelector('use').setAttribute('href', open ? '#i-close' : '#i-menu');
  };
  if (menu && menuToggle) {
    menuToggle.addEventListener('click', () => setMenu(menu.hidden));
    menu.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
    document.addEventListener('click', event => { if (!event.target.closest('.site-header')) setMenu(false); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && !menu.hidden) { setMenu(false); menuToggle.focus(); } });
    matchMedia('(min-width: 1041px)').addEventListener('change', event => { if (event.matches) setMenu(false); });
  }

  const workflowCopy = {
    paste: ['01', 'Your prompt starts the same way.', 'Paste code, logs or a question into your AI workspace. SecureIntent stays out of the way until a credential or sensitive value needs attention.', 'Your prompt is still local.'],
    detect: ['02', 'Detect before paste.', 'SecureIntent checks pasted content for credentials, tokens, JWTs and sensitive values on your device before it is sent to an AI tool.', 'Your raw pasted text stays on your machine.'],
    protect: ['03', 'Choose what to protect.', 'When a credential is detected, review it at the point of paste. Anonymise the value with a placeholder or stop the paste before it reaches the model.', 'You decide what continues.'],
    continue: ['04', 'Keep the context. Replace the credential.', 'Continue your AI conversation with a placeholder instead of the detected credential, so the model receives the useful context without the original value.', 'The prompt remains useful.']
  };
  const shell = document.querySelector('.workflow-shell');
  const workflowButtons = [...document.querySelectorAll('[data-workflow-step]')];
  const detailNumber = document.querySelector('.detail-number');
  const detailTitle = document.getElementById('detail-title');
  const detailCopy = document.getElementById('detail-copy');
  const detailNote = document.querySelector('.detail-note span');
  const appState = document.getElementById('app-state');
  const sensitiveCode = document.getElementById('sensitive-code');
  const intercept = document.getElementById('protection-intercept');
  const answer = document.getElementById('answer-preview');
  const activateWorkflow = button => {
    const step = button.dataset.workflowStep;
    if (button.getAttribute('aria-pressed') === 'true') return;
    workflowButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    shell.dataset.active = step;
    const [number, title, copy, note] = workflowCopy[step];
    detailNumber.textContent = number;
    detailTitle.textContent = title;
    detailCopy.textContent = copy;
    detailNote.textContent = note;
    appState.textContent = step === 'paste' ? 'Draft prompt' : step === 'detect' ? 'Review before sending' : step === 'protect' ? 'Choose an action' : 'Prompt protected';
    sensitiveCode.hidden = step === 'continue';
    intercept.hidden = step === 'paste' || step === 'continue';
    answer.style.display = step === 'continue' ? 'block' : 'none';
  };
  workflowButtons.forEach(button => button.addEventListener('click', () => activateWorkflow(button)));

  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll('[data-glow], .workflow-tabs button, .team-overlay').forEach(surface => {
    let frame = 0;
    let x = 0;
    let y = 0;
    surface.addEventListener('pointermove', event => {
      if (!finePointer.matches || reducedMotion.matches) return;
      const rect = surface.getBoundingClientRect();
      x = event.clientX - rect.left;
      y = event.clientY - rect.top;
      if (!frame) frame = requestAnimationFrame(() => {
        surface.style.setProperty('--pointer-x', `${x}px`);
        surface.style.setProperty('--pointer-y', `${y}px`);
        frame = 0;
      });
    }, { passive: true });
    surface.addEventListener('pointerleave', () => { cancelAnimationFrame(frame); frame = 0; });
  });
})();
