(() => {
  'use strict';
  if (document.querySelector('.utility-page') || document.querySelector('.site-footer')) return;
  const addStylesheet = (href, marker) => {
    if (document.querySelector('link[' + marker + ']')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.setAttribute(marker, '');
    document.head.append(link);
  };
  addStylesheet(new URL('site-footer.css?v=20260914-original', document.baseURI).href, 'data-footer-styles');
  addStylesheet('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600&display=swap', 'data-footer-fonts');
  if (!document.querySelector('link[href*="font-awesome/6.5.1"]')) {
    addStylesheet('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css', 'data-footer-icons');
  }

  const footer = document.querySelector('footer') || document.createElement('footer');
  footer.className = 'site-footer';
  footer.dataset.footerDesign = 'original';
  footer.innerHTML = `
        <div class="flex justify-center mb-8 text-gray-400">
            <!-- FULL LOGO SVG (Icon + Text) -->
            <svg aria-label="SecureIntent Full Logo" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 250" class="h-16 w-auto text-white">
                <path d="M 60,185 L 120,65" fill="none" stroke="currentColor" stroke-width="28" stroke-linecap="round"></path>
                <path d="M 140,185 L 170,125" fill="none" stroke="#72FFFF" stroke-width="28" stroke-linecap="round"></path>
                <circle cx="200" cy="65" r="14" fill="#72FFFF"></circle>
                <text x="250" y="145" font-family="'Fira Code', monospace" font-weight="600" font-size="52" fill="currentColor" letter-spacing="-2">SecureIntent<tspan fill="#72FFFF">.ai</tspan></text>
            </svg>
        </div>
        
        <p class="mt-4 text-xs">A free, auditable tool for developers. Your pasted content never leaves your device.</p>

        <!-- Comprehensive Trust & Resource Links -->
        <div class="mt-12 grid grid-cols-2 md:grid-cols-4 gap-8 text-left max-w-4xl mx-auto px-6 border-t border-white/5 pt-12">
            <div class="flex flex-col gap-3">
                <span class="text-white font-bold text-xs uppercase tracking-wider mb-1">Product</span>
                <a href="index.html#tiers" class="text-xs hover:text-brand-cyan transition-colors">Pricing &amp; Tiers</a>
                <a href="account.html" class="text-xs hover:text-brand-cyan transition-colors">Sign in / Account</a>
                <a href="architecture.html" class="text-xs hover:text-brand-cyan transition-colors">Architecture</a>
                <a href="https://github.com/Secureintent-Admin/Secureintent-Extension" target="_blank" rel="noopener noreferrer" class="text-xs hover:text-brand-cyan transition-colors">Source Code</a>
                <a href="docs.html" class="text-xs hover:text-brand-cyan transition-colors">Documentation</a>
            </div>
            <div class="flex flex-col gap-3">
                <span class="text-white font-bold text-xs uppercase tracking-wider mb-1">Trust Center</span>
                <a href="#footer-status" data-footer-dialog="status" aria-haspopup="dialog" class="text-xs hover:text-brand-cyan transition-colors flex items-center gap-2"><span class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> System Status</a>
                <a href="architecture.html" class="text-xs hover:text-brand-cyan transition-colors">Compliance Roadmap</a>
            </div>
            <div class="flex flex-col gap-3">
                <span class="text-white font-bold text-xs uppercase tracking-wider mb-1">Researchers</span>
                <a href="#footer-vdp" data-footer-dialog="vdp" aria-haspopup="dialog" class="text-xs hover:text-brand-cyan transition-colors">Vulnerability Disclosure (VDP)</a>
                <a href="#footer-pgp" data-footer-dialog="pgp" aria-haspopup="dialog" class="text-xs hover:text-brand-cyan transition-colors">PGP Public Key</a>
                <a href="#footer-sectxt" data-footer-dialog="sectxt" aria-haspopup="dialog" class="text-xs hover:text-brand-cyan transition-colors font-mono">security.txt</a>
            </div>
            <div class="flex flex-col gap-3">
                <span class="text-white font-bold text-xs uppercase tracking-wider mb-1">Legal</span>
                <a href="privacy.html" class="text-xs hover:text-brand-cyan transition-colors">Privacy Policy</a>
                <a href="tos.html" class="text-xs hover:text-brand-cyan transition-colors">Terms of Service</a>
            </div>
        </div>

        <!-- Contact Section -->
        <div class="mt-8 max-w-4xl mx-auto px-6 border-t border-white/5 pt-8 flex flex-col md:flex-row justify-center items-center gap-6 text-sm">
            <span class="text-white font-bold text-xs uppercase tracking-wider md:mr-4">Contact</span>
            <a href="mailto:info@secureintent.ai" class="text-xs hover:text-brand-cyan transition-colors text-brand-cyan">info@secureintent.ai</a>
            <span class="hidden md:block text-white/20">|</span>
            <a href="mailto:SOC@secureintent.ai" class="text-xs hover:text-brand-cyan transition-colors text-brand-cyan">SOC@secureintent.ai</a>
            <span class="hidden md:block text-white/20">|</span>
            <a href="#footer-billing" data-footer-dialog="billing" aria-haspopup="dialog" class="text-xs hover:text-brand-cyan transition-colors text-brand-cyan">Billing Support</a>
            <span class="hidden md:block text-white/20">|</span>
            <a href="https://wa.me/447848523845?text=Hi%20SecureIntent%20support%2C%20I%20have%20a%20question%20about%20" target="_blank" rel="noopener" class="text-xs hover:text-brand-cyan transition-colors text-brand-cyan inline-flex items-center gap-1.5"><i class="fa-brands fa-whatsapp" aria-hidden="true"></i> WhatsApp Support</a>
        </div>
        
        <div class="mt-12 mb-4 text-[10px] text-gray-400 flex flex-col items-center gap-1">
            <span class="font-bold text-gray-400">SECUREINTENT.AI LTD</span>
            <span>Company Number: 17237217</span>
            <span>124-128 City Road, London, England, EC1V 2NX</span>
        </div>

        <div class="mt-6 flex flex-wrap justify-center gap-6">
            <a href="https://github.com/Secureintent-Admin/Secureintent-Extension" target="_blank" rel="noopener noreferrer" aria-label="Visit SecureIntent on GitHub" class="hover:text-brand-cyan transition-colors"><i class="fa-brands fa-github text-xl" aria-hidden="true"></i></a>
            <a href="https://x.com/Secureintent_ai" target="_blank" rel="noopener noreferrer" aria-label="Visit SecureIntent on X (Twitter)" class="hover:text-brand-cyan transition-colors"><i class="fa-brands fa-x-twitter text-xl" aria-hidden="true"></i></a>
            <a href="https://www.linkedin.com/in/julia-w-346646402/" target="_blank" rel="noopener noreferrer" aria-label="Visit Julia's LinkedIn Profile" class="hover:text-brand-cyan transition-colors"><i class="fa-brands fa-linkedin text-xl" aria-hidden="true"></i></a>
            <a href="https://www.youtube.com/@Secureintent" target="_blank" rel="noopener noreferrer" aria-label="Visit SecureIntent on YouTube" class="hover:text-brand-cyan transition-colors"><i class="fa-brands fa-youtube text-xl" aria-hidden="true"></i></a>
            <a href="https://www.tiktok.com/@secureintent.ai" target="_blank" rel="noopener noreferrer" aria-label="Visit SecureIntent on TikTok" class="hover:text-brand-cyan transition-colors"><i class="fa-brands fa-tiktok text-xl" aria-hidden="true"></i></a>
            <a href="https://www.instagram.com/secureintent.ai/" target="_blank" rel="noopener noreferrer" aria-label="Visit SecureIntent on Instagram" class="hover:text-brand-cyan transition-colors"><i class="fa-brands fa-instagram text-xl" aria-hidden="true"></i></a>
            <a href="https://www.facebook.com/profile.php?id=61590081345330" target="_blank" rel="noopener noreferrer" aria-label="Visit SecureIntent on Facebook" class="hover:text-brand-cyan transition-colors"><i class="fa-brands fa-facebook text-xl" aria-hidden="true"></i></a>
        </div>
    `;
  if (!footer.isConnected) document.body.append(footer);

  // Original footer actions, with native keyboard/focus management.
  // Demo status figures and the source placeholder key are not live service data.
  const resources = {
  "vdp": {
    "title": "Vulnerability Disclosure Policy",
    "content": "\n                <p>At SecureIntent, we consider the security of our extension and infrastructure our highest priority. We deeply value the ethical hacker and security research community.</p>\n                \n                <div>\n                    <h3>Safe Harbor Pledge</h3>\n                    <p>If you conduct your research and report vulnerabilities in accordance with this policy, we consider your actions authorized. We will not initiate any legal action or law enforcement investigation against you.</p>\n                </div>\n\n                <div>\n                    <h3>Rules of Engagement</h3>\n                    <ul>\n                        <li>Do not execute Denial of Service (DoS/DDoS) attacks against our Edge API.</li>\n                        <li>Do not engage in social engineering, phishing, or physical attacks against SecureIntent personnel or advisors.</li>\n                        <li>Do not access, modify, or delete user data. If you encounter user data, halt testing immediately and report the vulnerability.</li>\n                        <li>Provide us reasonable time to patch the issue before disclosing it publicly.</li>\n                    </ul>\n                </div>\n                \n                <div>\n                    <h3>How to Report</h3>\n                    <p>Please encrypt your findings using our PGP Public Key and email the report directly to our Security Operations Center:</p>\n                    <a href=\"mailto:SOC@secureintent.ai\">SOC@secureintent.ai</a>\n                </div>\n            "
  },
  "pgp": {
    "title": "SOC PGP Public Key",
    "content": "<p>The original review page contains a placeholder, not a usable PGP public key. Request a verified key from our Security Operations Center before sending sensitive findings.</p><p><a href=\"mailto:SOC@secureintent.ai\">Contact SOC@secureintent.ai</a></p>"
  },
  "sectxt": {
    "title": "/.well-known/security.txt",
    "content": "<p>Security contact information from the source site:</p><pre>Contact: mailto:SOC@secureintent.ai\nEncryption: https://secureintent.ai/#pgp\nPolicy: https://secureintent.ai/#vdp\nPreferred-Languages: en\nExpires: 2027-05-29T00:00:00.000Z\n</pre>"
  },
  "status": {
    "title": "System Status",
    "content": "<p>This design preview does not query live service status. The figures on the original review page are demonstration data, not a current uptime report.</p><p>For current service information, <a href=\"mailto:info@secureintent.ai\">contact info@secureintent.ai</a>.</p>"
  },
  "billing": {
    "title": "Billing & License Support",
    "content": "<h3>Need License Help?</h3><p>Encountering issues claiming your Business Pro license, or need to upgrade your team allocation? Our billing and support team is ready to assist.</p><p><a href=\"mailto:billing@secureintent.ai\">Email billing@secureintent.ai</a></p>"
  }
};
  const dialog = document.createElement('dialog');
  dialog.className = 'footer-dialog';
  dialog.setAttribute('aria-labelledby', 'footer-dialog-title');
  dialog.innerHTML = '<div class="footer-dialog-header"><h2 id="footer-dialog-title"></h2><button type="button" aria-label="Close dialog" autofocus>×</button></div><div class="footer-dialog-body"></div>';
  document.body.append(dialog);
  let trigger;
  let previousOverflow;
  footer.querySelectorAll('[data-footer-dialog]').forEach(link => {
    link.addEventListener('click', event => {
      const resource = resources[link.dataset.footerDialog];
      if (!resource) return;
      event.preventDefault();
      trigger = link;
      dialog.querySelector('h2').textContent = resource.title;
      dialog.querySelector('.footer-dialog-body').innerHTML = resource.content;
      previousOverflow = document.body.style.overflow;
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    });
  });
  dialog.querySelector('button').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.style.overflow = previousOverflow || '';
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
  });
})();
