import { icon } from "../icons.js";

const preview = (text) =>
  `<div class="preview-note">${icon("info")}<p><strong>SecureIntent.</strong> ${text}</p></div>`;
export const pages = [
  {
    slug: "start",
    title: "A safer paste starts here.",
    label: "GET STARTED",
    description:
      "Meet your new browser companion. A small setup, a more thoughtful way to work.",
    body: `
    <div class="onboarding-grid"><div><div class="setup-steps"><article><span>1</span><div><h2>Start with your desktop browser</h2><p>SecureIntent’s browser extension is the starting point for supported web workflows. On a phone? You can still explore the demo and documentation.</p></div></article><article><span>2</span><div><h2>Know what you’re installing</h2><p>Review the publisher, permissions, and current browser support before adding the extension.</p></div></article><article><span>3</span><div><h2>Try a safer paste</h2><p>Use fictitious example data to get comfortable with detection and anonymization. Always review the final result before sharing.</p></div></article></div><a class="button button-mint" href="/designs/secureintent-site-v1/docs/quickstart/">Read the quickstart ${icon("arrow")}</a></div><div class="install-preview-card"><div class="install-app-icon">${icon("shield")}</div><span class="status-pill">Browser extension</span><h2>SecureIntent</h2><p>Your best ideas.<br>Your secrets, protected.</p><div class="install-benefits"><span>${icon("check")}On-device detection</span><span>${icon("check")}No account needed for Free</span><span>${icon("check")}A moment to review before sharing</span></div><a href="/designs/secureintent-site-v1/docs/demo.html#playground" class="button button-outline">Try the product example ${icon("arrow")}</a><a class="button button-mint" href="https://chromewebstore.google.com/detail/secureintent/ejdhcakapnkbmfihgoamdnajgimhemof" target="_blank" rel="noopener noreferrer">Install SecureIntent ${icon("arrow")}</a><small>No installation required for the demo.</small></div></div>${preview("Install from the official browser store. Free protection does not require an account.")}`,
  },
  {
    slug: "account",
    title: "Welcome to a safer workflow.",
    label: "YOUR SECUREINTENT ACCOUNT",
    description: "A little more peace of mind, every time you paste.",
    compact: true,
    body: `
    <div class="account-grid"><div class="account-story"><div class="account-orbit"><div>${icon("shield")}</div><span class="orbit-label label-one">Your device</span><span class="orbit-label label-two">Your control</span></div><h2>Good ideas travel.<br><span>Secrets shouldn’t.</span></h2><p>Keep your momentum. Bring protection into the tools you already use.</p><a class="text-link" href="/designs/secureintent-site-v1/docs/overview/what-is-secureintent/">Get to know SecureIntent ${icon("arrow")}</a></div><div class="account-card"><span class="status-pill">Your account</span><h1>Welcome back</h1><p class="form-intro">Sign in to manage your plan, billing and team.</p><p class="selected-plan" hidden></p><a class="button button-mint" href="/designs/secureintent-site-v1/account.html">Sign in ${icon("arrow")}</a><div class="form-divider"><span>No account? No problem.</span></div><a class="button button-outline" href="/designs/secureintent-site-v1/docs/demo.html#playground">Try the product example ${icon("arrow")}</a><p class="form-fineprint">Sign-in is handled securely by Clerk. New users can create an account on the sign-in page.</p></div></div>`,
  },
  {
    slug: "contact",
    title: "Let’s make work a little safer.",
    label: "TALK TO SECUREINTENT",
    description:
      "A question about your workflow, your team, or the product? Start here.",
    body: `
    <div class="contact-grid"><div class="contact-options"><article>${icon("book")}<h2>Find your answer</h2><p>Setup guides, product concepts, and the details behind local processing.</p><a class="text-link" href="/designs/secureintent-site-v1/docs.html">Explore the documentation ${icon("arrow")}</a></article><article>${icon("help")}<h2>Need a hand?</h2><p>Check the common questions and learn how to prepare a safe support report.</p><a class="text-link" href="/designs/secureintent-site-v1/docs/resources/troubleshooting/">Troubleshooting ${icon("arrow")}</a></article></div><div class="contact-card"><h2>How can we help?</h2><p class="form-intro">Send a message to our support team</p><form data-support-form><div class="form-row"><div><label for="contact-name">Your name</label><input id="contact-name" name="name" placeholder="Alex Morgan" autocomplete="off" required></div><div><label for="contact-email">Work email</label><input id="contact-email" name="email" type="email" placeholder="alex@company.com" autocomplete="off" required></div></div><label for="contact-topic">What’s on your mind?</label><select id="contact-topic" name="topic"><option value="product">A product question</option><option value="teams">SecureIntent for my team</option><option value="support">Help with a workflow</option><option value="feedback">Product feedback</option></select><label for="contact-message">A little context</label><textarea id="contact-message" name="message" rows="4" placeholder="Tell us about your workflow. Please don’t include secrets or sensitive information." required></textarea><button class="button button-mint" type="submit" disabled>Open email draft ${icon("arrow")}</button><p class="form-status" role="status"></p></form><p class="form-fineprint">Opens your email app with a draft to info@secureintent.ai. Review it and press Send there.</p></div></div>`,
  },
  {
    slug: "about",
    title: "Good work deserves peace of mind.",
    label: "ABOUT SECUREINTENT",
    description:
      "We’re building a quieter way to protect the sensitive information that travels through everyday work.",
    body: `
    <div class="about-grid"><article><h2>A small pause.<br>A meaningful difference.</h2><p>AI tools make it easier to move from a question to an answer. They also make it easier to move a credential, a token, or sensitive context into the wrong place.</p><p>SecureIntent adds a checkpoint to that moment. Detect locally. Review the finding. Keep the useful context, without the unnecessary secret.</p><a class="text-link" href="/designs/secureintent-site-v1/docs/overview/what-is-secureintent/">Understand the product ${icon("arrow")}</a></article><div class="about-principles"><article>${icon("lock")}<h3>Keep detection close</h3><p>Evaluate supported patterns on your device.</p></article><article>${icon("terminal")}<h3>Keep the workflow familiar</h3><p>Bring protection to the tools you already use.</p></article><article>${icon("code")}<h3>Keep the boundaries clear</h3><p>Be explicit about capabilities, limitations, and what is still in progress.</p></article></div></div><section class="community-card" id="community"><span class="eyebrow">FROM THE COMMUNITY</span><blockquote>“Finally. A tool that actually protects my secrets without selling them.”</blockquote><p><strong>Lev Ichansky</strong><span>Review displayed on the original SecureIntent website.</span></p><small>The source website showed a 4.9 Chrome Web Store rating when this redesign’s content was checked on September 8, 2026. No external review page is linked in this preview.</small></section>`,
  },
  {
    slug: "terms",
    title: "Terms of service",
    label: "PREVIEW INFORMATION",
    description:
      "A local destination for the legal link—not a replacement for reviewed product terms.",
    body: `
    <div class="legal-preview"><h2>This is a design preview</h2><p>This standalone website does not create accounts, process payments, install software, or enter you into a product subscription. Forms run locally and do not submit information to a server.</p><h2>Before publishing</h2><p>The approved product terms and privacy policy need to be supplied and reviewed before launch. This page deliberately does not invent legal terms or copy policies from another company.</p><h2>Understand the product</h2><p>For the product’s processing boundary, read the <a href="/designs/secureintent-site-v1/docs/security/local-processing/">local processing guide</a>. For the limits of the demonstration, see <a href="/designs/secureintent-site-v1/docs/overview/what-is-secureintent/">What is SecureIntent?</a></p><a class="button button-outline" href="/designs/secureintent-site-v1/index.html">Back to the website ${icon("arrow")}</a></div>`,
  },
];
