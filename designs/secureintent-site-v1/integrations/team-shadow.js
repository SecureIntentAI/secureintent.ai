// Mount the existing dashboard in the team document. A shadow root isolates
// its chart styles and IDs; Clerk and navigation remain owned by the console.
export async function mountShadow(host) {
  const base = new URL('../', import.meta.url);
  const paths = ['shadow.html', 'assets/shadow/styles.css', 'assets/shadow/dashboard.css'];
  const [html, styles, dashboardStyles] = await Promise.all(paths.map(async path => {
    const response = await fetch(new URL(path, base), {cache: 'no-store'});
    if (!response.ok) throw new Error('Dashboard assets unavailable');
    return response.text();
  }));
  const module = await import('../assets/shadow/dashboard.js');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  parsed.querySelectorAll('script, noscript').forEach(el => el.remove());
  const root = host.shadowRoot || host.attachShadow({mode: 'open'});
  const style = document.createElement('style');
  style.textContent = (styles + '\n' + dashboardStyles)
    .replaceAll(':root', ':host')
    .replaceAll('[data-theme="white"]', ':host([data-theme="white"])')
    .replace(/url\('inter-latin.woff2'\)/g, `url('${new URL('assets/shadow/inter-latin.woff2', base)}')`)
    + `\n:host { display:block; font:14px/1.5 var(--font); color:var(--text); }
      .sidebar,.topbar,.skip-link { display:none!important; }
      .app { margin:0!important; } main { padding:0 0 32px; }
      .auth-gate { margin:24px 0; }
      .symbol-library { display:none; }
      .page-heading { margin-top:0; }
      dialog { max-height:85vh; }
    `;
  root.replaceChildren(style, ...parsed.body.childNodes);
  host.replaceChildren();
  host.dataset.theme = document.documentElement.dataset.theme === 'light' ? 'white' : 'secureintent';
  // Fragment links are internal dashboard scroll targets, not team routes.
  root.addEventListener('click', event => {
    const anchor = event.target.closest?.('a[href^="#"]');
    if (!anchor) return;
    event.preventDefault();
    root.getElementById(anchor.getAttribute('href').slice(1))?.scrollIntoView({block:'start'});
  });
  await module.mountDashboard(root, true);
}
