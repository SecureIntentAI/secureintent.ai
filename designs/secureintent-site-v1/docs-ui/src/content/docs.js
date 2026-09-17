import { icon, escapeHtml } from "../icons.js";

export const docLink = (slug) => `/designs/secureintent-site-v1/${slug ? `docs/${slug}/` : "docs.html"}`;
const link = (slug, text) => `<a href="${docLink(slug)}">${text}</a>`;
const callout = (title, text, kind = "info") =>
  `<aside class="doc-callout ${kind}">${icon(kind === "tip" ? "spark" : "info")}<div><strong>${title}</strong><p>${text}</p></div></aside>`;
const code = (title, text) =>
  `<div class="doc-code"><div class="code-top"><span>${title}</span><button data-copy-code aria-label="Copy ${title}">${icon("copy")}<span>Copy</span></button></div><pre><code>${escapeHtml(text)}</code></pre></div>`;
const cards = (entries) =>
  `<div class="doc-cards">${entries.map(([slug, title, description, symbol]) => `<a class="doc-card" href="${docLink(slug)}"><span class="doc-card-icon">${icon(symbol)}</span><h3>${title}${icon("arrow")}</h3><p>${description}</p></a>`).join("")}</div>`;
const flow = () =>
  `<div class="doc-flow" role="group" aria-label="Sensitive prompt is detected on the device, anonymized, then ready to paste"><div>${icon("terminal")}<span>Your prompt</span><small>Context + a secret</small></div>${icon("arrow")}<div class="flow-focus">${icon("shield")}<span>SecureIntent</span><small>Detect & anonymize locally</small></div>${icon("arrow")}<div>${icon("check")}<span>A safer paste</span><small>Context + a placeholder</small></div></div>`;

export const docs = [
  {
    slug: "",
    title: "SecureIntent documentation",
    navTitle: "Introduction",
    group: "Getting started",
    icon: "book",
    description:
      "Everything you need for a safer paste. Learn the basics, protect your first prompt, and understand what stays on your device.",
    landing: true,
    sections: [
      {
        id: "start-here",
        title: "A good place to start",
        body: cards([
          [
            "overview/what-is-secureintent",
            "What is SecureIntent?",
            "Meet the quiet layer between your secrets and your next paste.",
            "shield",
          ],
          [
            "quickstart",
            "Your first safer paste",
            "Walk through detection and anonymization with safe example data.",
            "spark",
          ],
          [
            "security/local-processing",
            "Privacy by design",
            "Understand local processing, metadata, and the limits of protection.",
            "lock",
          ],
          [
            "guides/browser-support",
            "Browser support",
            "Find the right starting point for your browser and device.",
            "globe",
          ],
        ]),
      },
      {
        id: "the-workflow",
        title: "One workflow. Three simple steps.",
        body:
          flow() +
          `<p>You keep the useful context. SecureIntent helps you catch sensitive values, replace them with placeholders, and continue your work.</p>`,
      },
      {
        id: "go-deeper",
        title: "Get to know your protection",
        body: `<div class="doc-link-list">${[
          [
            "concepts/detection",
            "Secret detection",
            "What SecureIntent looks for",
          ],
          [
            "guides/anonymization",
            "Anonymize a prompt",
            "Keep the context, remove the sensitive value",
          ],
          [
            "guides/restore",
            "Restore locally",
            "Understand the Developer Pro workflow",
          ],
          [
            "resources/troubleshooting",
            "Troubleshooting",
            "Resolve common setup and detection questions",
          ],
        ]
          .map(
            ([s, t, d]) =>
              `<a href="${docLink(s)}"><span><strong>${t}</strong><small>${d}</small></span>${icon("arrow")}</a>`,
          )
          .join("")}</div>`,
      },
    ],
  },
  {
    slug: "overview/what-is-secureintent",
    title: "What is SecureIntent?",
    group: "Getting started",
    icon: "shield",
    description:
      "A small layer of protection between your sensitive information and the places you paste it.",
    intro: `<p>SecureIntent helps you use AI tools and everyday web apps without accidentally including secrets in a prompt, message, or code snippet. It identifies supported sensitive values and gives you a way to replace them before sharing.</p><p>Think of it as a <strong>checkpoint for your clipboard workflow</strong>. You keep the context that makes a conversation useful. Your credentials and other sensitive values can stay out of it.</p>`,
    sections: [
      {
        id: "how-it-works",
        title: "How it works",
        body:
          flow() +
          `<ol><li><strong>Detect.</strong> Supported patterns are checked on your device.</li><li><strong>Review.</strong> Inspect the match and its location in your text.</li><li><strong>Anonymize.</strong> Replace the sensitive value with a readable placeholder, then check the result before pasting.</li></ol>`,
      },
      {
        id: "what-it-protects",
        title: "What it helps you protect",
        body:
          cards([
            [
              "concepts/detection",
              "API keys & credentials",
              "Sensitive values embedded in code, logs, and configuration.",
              "key",
            ],
            [
              "guides/anonymization",
              "Prompts & messages",
              "The context your tools need, without an unnecessary secret.",
              "terminal",
            ],
          ]) +
          `<p>Supported categories include API keys, access tokens, and credit-card patterns. The exact coverage depends on the installed product and its current rules. ${link("concepts/detection", "Learn about detection and its limits.")} </p>`,
      },
      {
        id: "built-for-your-workflow",
        title: "Built for your existing workflow",
        body: `<p>The browser extension is the starting point for supported web workflows. It is designed to fit alongside the tools you already use, rather than becoming another place to write your prompts.</p><p>The desktop application is a separate product surface. Do not assume that a capability documented for the desktop agent is available in the browser extension. ${link("guides/browser-support", "Check platform guidance.")} </p>`,
      },
      {
        id: "important-boundaries",
        title: "What it does not do",
        body:
          callout(
            "A safety net, not a guarantee",
            "Detection can miss a secret or flag harmless text. Review the destination and the final content before sharing. SecureIntent cannot revoke a credential or remove information that has already been sent.",
          ) +
          `<p>This website’s interactive example uses fixed, fictitious values. It illustrates the workflow; it does not run the extension’s detection engine or inspect your clipboard.</p>`,
      },
      {
        id: "next-steps",
        title: "Try your first safer paste",
        body: cards([
          [
            "quickstart",
            "Follow the quickstart",
            "See the flow with sample data, step by step.",
            "spark",
          ],
          [
            "security/local-processing",
            "Understand the privacy model",
            "Read what is processed locally and what metadata may leave.",
            "lock",
          ],
        ]),
      },
    ],
  },
  {
    slug: "quickstart",
    title: "Your first safer paste",
    navTitle: "Quickstart",
    group: "Getting started",
    icon: "spark",
    description:
      "Get familiar with SecureIntent in a few minutes, using sample data only.",
    intro: callout(
      "You can try this without installing anything",
      "The local website includes an interactive example. No account, real credentials, or clipboard access is needed.",
      "tip",
    ),
    sections: [
      {
        id: "open-the-example",
        title: "1. Open the product example",
        body: `<p>Go to the <a href="/designs/secureintent-site-v1/docs/demo.html#playground">interactive product example</a>. Choose <strong>API key</strong>, <strong>Access token</strong>, or <strong>Card number</strong>. Each tab shows a fictitious value and the corresponding detection state.</p>${code("Sample prompt", 'Help me debug this payment request.\n\nconst stripe = new Stripe(\n  "sk_test_DEMO_NOT_A_REAL_KEY"\n);\n\nawait stripe.customers.list();')}`,
      },
      {
        id: "review-the-detection",
        title: "2. Review the detection",
        body: `<p>The SecureIntent panel identifies the sample category and line number. Review the highlighted value before continuing. The API-key example is intentionally not a usable credential.</p>`,
      },
      {
        id: "anonymize",
        title: "3. Anonymize the value",
        body: `<p>Select <strong>Anonymize & continue</strong>. The example replaces the value with <code>[API_KEY_1]</code> and shows the protected state.</p>${code("Anonymized sample", 'const stripe = new Stripe(\n  "[API_KEY_1]"\n);')}${callout("Placeholders are not credentials", "This code illustrates anonymization. It will not authenticate to Stripe or another service. Never paste a real key here to test the demo.")}`,
      },
      {
        id: "try-another-example",
        title: "4. Try another example",
        body: `<p>Select <strong>Try again</strong> to reset, or choose a different tab. You can use the left and right arrow keys to move between tabs when the tab list has keyboard focus.</p>`,
      },
      {
        id: "next-step",
        title: "Ready for the extension?",
        body: `<p>The <a href="/designs/secureintent-site-v1/docs/start/">local getting-started page</a> explains the browser setup flow. Installation and account services are intentionally disconnected in this design preview.</p>`,
      },
    ],
  },
  {
    slug: "concepts/detection",
    title: "Secret detection",
    group: "Core concepts",
    icon: "key",
    description:
      "Understand what a match means, what SecureIntent checks, and when to review the result.",
    sections: [
      {
        id: "supported-patterns",
        title: "Supported patterns",
        body: `<p>SecureIntent checks supported patterns that may represent sensitive information. The website demonstrates three familiar categories:</p><div class="doc-table-wrap"><table><thead><tr><th>Category</th><th>Example context</th><th>Safe placeholder</th></tr></thead><tbody><tr><td>API key</td><td>A service credential in code</td><td><code>[API_KEY_1]</code></td></tr><tr><td>Access token</td><td>A token in a request or log</td><td><code>[GITHUB_TOKEN_1]</code></td></tr><tr><td>Card number</td><td>Payment information in text</td><td><code>[CARD_NUMBER_1]</code></td></tr></tbody></table></div><p>These are illustrative categories, not an exhaustive detection specification. Installed rules and product versions determine actual coverage.</p>`,
      },
      {
        id: "review-a-match",
        title: "Review a match",
        body: `<p>A match means that text resembles a supported sensitive pattern. It does not prove that the credential is valid, active, or authorized. Check the highlighted value and the surrounding context.</p><p>If the value is sensitive, ${link("guides/anonymization", "anonymize it")} before sharing. Do not dismiss a finding just because the destination is a tool you use frequently.</p>`,
      },
      {
        id: "false-positives",
        title: "False positives and missed secrets",
        body: `<p>Example keys, documentation snippets, and test fixtures can resemble secrets. Unusual credential formats or sensitive prose may not match a rule. No pattern-based detector covers every possible leak.</p>${callout("Always review your final text", "Anonymization is a useful checkpoint, not proof that the entire document is safe to share. Review names, confidential context, attachments, and the intended recipient too.")}`,
      },
      {
        id: "safe-testing",
        title: "Test with fictitious values",
        body: `<p>Use the fixed examples in the <a href="/designs/secureintent-site-v1/docs/demo.html#playground">local product demo</a> when reviewing this website. Do not use active credentials, customer records, or private documents to test a design preview.</p>`,
      },
    ],
  },
  {
    slug: "guides/anonymization",
    title: "Anonymize a prompt",
    group: "Using SecureIntent",
    icon: "terminal",
    description: "Keep the useful context. Replace the sensitive value.",
    sections: [
      {
        id: "before-and-after",
        title: "Before and after",
        body: `<p>Anonymization replaces a detected value with a named placeholder. The surrounding explanation and code remain readable.</p>${code("Before · fictitious example", "Authorization: Bearer ghp_DEMO_NOT_A_REAL_TOKEN\nQuestion: Why is this request returning an error?")}${code("After · sensitive value replaced", "Authorization: Bearer [GITHUB_TOKEN_1]\nQuestion: Why is this request returning an error?")}`,
      },
      {
        id: "review-and-continue",
        title: "Review, then continue",
        body: `<ol><li>Inspect the detected value and its context.</li><li>Choose the anonymization action.</li><li>Read the resulting text and check that all sensitive context has been removed.</li><li>Continue with your intended destination.</li></ol><p>When sharing code, explain that the credential is a placeholder so the recipient does not treat it as an executable example.</p>`,
      },
      {
        id: "placeholder-behavior",
        title: "About placeholders",
        body: `<p>The website’s samples use readable names such as <code>[API_KEY_1]</code>. Names and numbering in the installed product may differ. A placeholder describes a removed value; it is not an encrypted credential and cannot authenticate on its own.</p>`,
      },
      {
        id: "restore-later",
        title: "Need to restore a value later?",
        body: `<p>Developer Pro includes a restore workflow. Read ${link("guides/restore", "Restore locally")} to understand the intended use and the extra review required before reintroducing a secret.</p>`,
      },
    ],
  },
  {
    slug: "guides/restore",
    title: "Restore locally",
    group: "Using SecureIntent",
    icon: "layers",
    description:
      "Bring a value back into your own workflow when you genuinely need it.",
    intro: callout(
      "Developer Pro feature",
      "Restoration is presented as a Developer Pro capability in the product plans. This local website illustrates it but does not store or restore real secrets.",
    ),
    sections: [
      {
        id: "when-to-restore",
        title: "When restoration makes sense",
        body: `<p>An AI tool can work with an anonymized example, but you may need the original value when adapting the result locally. Restoration is for that return step—not for sending the secret back to an external service or conversation.</p>`,
      },
      {
        id: "the-flow",
        title: "The intended workflow",
        body: `<ol><li>Anonymize the sensitive value before sharing the prompt.</li><li>Use the resulting placeholder in your external conversation.</li><li>Bring the response back into your local workflow.</li><li>Review the destination and restore only when the sensitive value is actually needed.</li></ol>`,
      },
      {
        id: "keep-the-boundary",
        title: "Keep the boundary clear",
        body:
          callout(
            "Restored text is sensitive again",
            "Once a real value is restored, treat the full result as confidential. Do not assume it is safe to paste into an AI chat, issue tracker, or shared document.",
          ) +
          `<p>Check the installed product’s controls for the current restoration interface. This guide does not promise a particular vault lifetime, storage format, or recovery mechanism.</p>`,
      },
    ],
  },
  {
    slug: "security/local-processing",
    title: "Local processing & privacy",
    navTitle: "Local processing",
    group: "Security",
    icon: "lock",
    description:
      "Understand the boundary between sensitive text, local detection, and service metadata.",
    sections: [
      {
        id: "on-device-detection",
        title: "Detection happens on your device",
        body: `<p>SecureIntent’s core product message is local detection: supported text is evaluated on the device rather than submitted to a remote AI service for inspection. Sensitive values can be replaced before you share the resulting text.</p>${flow()}`,
      },
      {
        id: "data-boundary",
        title: "Text and metadata are different",
        body: `<div class="doc-table-wrap"><table><thead><tr><th>Data</th><th>Product boundary</th></tr></thead><tbody><tr><td>Raw sensitive text</td><td>Processed locally for detection; not sent as the detection payload.</td></tr><tr><td>Anonymous fingerprints & metadata</td><td>May be transmitted for product functionality.</td></tr><tr><td>Account & billing information</td><td>Separate from clipboard detection; depends on the connected service.</td></tr></tbody></table></div><p>“Local detection” does not mean that the entire application makes no network requests. Review the installed product and its applicable privacy policy before adopting it for sensitive work.</p>`,
      },
      {
        id: "this-website",
        title: "How this local preview works",
        body: `<p>This website uses self-hosted fonts, local assets, and the locally copied product video. The interactive demo only transforms fixed sample strings. It never reads your clipboard or sends a detection request.</p><p>The theme preference is stored in your browser. Docs feedback is session-only. Copy buttons write only the visible example or page content to your clipboard when you request it.</p>${callout("No production services are connected", "Sign-in, installation, support, and plan selection stay within this local preview. Form actions do not create an account, send a message, or initiate a payment.")}`,
      },
      {
        id: "review-the-source",
        title: "Review before you rely on it",
        body: `<p>Security decisions should be based on the installed release, its configuration, and your own requirements. ${link("security/open-source", "Read the source-review guide")} for the distinction between the website demonstration and the actual products.</p>`,
      },
    ],
  },
  {
    slug: "security/open-source",
    title: "Source & transparency",
    navTitle: "Source & transparency",
    group: "Security",
    icon: "code",
    description:
      "Know which product you are evaluating, and what the website can—and cannot—demonstrate.",
    sections: [
      {
        id: "separate-products",
        title: "Separate surfaces, separate guarantees",
        body: `<p>SecureIntent includes a browser extension and a desktop application. Their architectures and operating environments differ. Review the specific release you intend to use, not just the marketing description or a demonstration.</p><p>The extension source is publicly available under the Secureintent-Admin organization. The desktop workspace contains a Rust detection core and a Tauri application. Repository links are intentionally not connected in this local website preview.</p>`,
      },
      {
        id: "review-checklist",
        title: "A useful review checklist",
        body: `<ul><li>Confirm the release and browser or operating-system compatibility.</li><li>Inspect permissions and the paths used for text processing.</li><li>Review where raw text, fingerprints, and metadata can travel.</li><li>Test supported patterns with fictitious fixtures.</li><li>Understand limitations, update behavior, and any enabled integrations.</li></ul>`,
      },
      {
        id: "website-scope",
        title: "What this website shows",
        body: `<p>The demo is an interface illustration with predetermined sample values. It is not a bundled security engine. Documentation in this preview describes the product workflow and clearly marks unconnected or in-progress features.</p>`,
      },
    ],
  },
  {
    slug: "guides/browser-support",
    title: "Browsers & devices",
    navTitle: "Browsers & devices",
    group: "Using SecureIntent",
    icon: "globe",
    description:
      "Start with the browser extension. Keep platform-specific capabilities in context.",
    sections: [
      {
        id: "desktop-browser",
        title: "Desktop browser extension",
        body: `<p>The public starting point is the SecureIntent Chrome extension. Before installation, check the supported browser version, publisher, and requested permissions on the extension listing.</p><p>This local preview provides an <a href="/designs/secureintent-site-v1/docs/start/">installation walkthrough</a> but does not open a store listing or install software.</p>`,
      },
      {
        id: "phones-and-tablets",
        title: "Phones and tablets",
        body: `<p>You can browse this website, watch the video, and use the sample demo on a phone or tablet. These activities do not install the desktop browser extension. Continue the installation workflow on a supported desktop browser.</p>`,
      },
      {
        id: "desktop-app",
        title: "Desktop application",
        body: `<p>The desktop application is a separate SecureIntent product. This workspace targets Windows and includes system-level clipboard protection. Do not treat browser-extension documentation as a complete desktop setup guide.</p>${callout("Availability can change", "macOS, Linux, and cross-application coverage should only be presented as available once the corresponding release and distribution are confirmed. See the roadmap for preview status.")}`,
      },
      {
        id: "supported-websites",
        title: "Supported web workflows",
        body: `<p>The website highlights common destinations such as AI assistants, code hosts, and messaging tools. Compatibility can vary with editor implementations, browser permissions, and product versions. Test the exact workflow you need using non-sensitive sample data.</p>`,
      },
    ],
  },
  {
    slug: "resources/troubleshooting",
    title: "Troubleshooting",
    group: "Resources",
    icon: "help",
    description:
      "A few checks for the most common questions. Never include a real secret in a bug report.",
    sections: [
      {
        id: "no-detection",
        title: "A value was not detected",
        body: `<p>First, confirm you are testing the installed product—not the website’s fixed sample demo. Check the extension is enabled, the browser and destination are supported, and the relevant permissions are available.</p><p>A value may not match a supported pattern. Review the content manually and remove the secret before sharing. See ${link("concepts/detection", "Secret detection")} for limitations.</p>`,
      },
      {
        id: "false-positive",
        title: "A harmless value was flagged",
        body: `<p>Test fixtures and example strings can resemble active credentials. Inspect the context before deciding whether to continue. For reports, create a fictitious reproduction with the same structure instead of sharing the original value.</p>`,
      },
      {
        id: "copy-does-not-work",
        title: "A documentation copy button does not work",
        body: `<p>Clipboard writing may be blocked by browser settings or an insecure origin. If automatic copying fails, the website shows a selectable text field so you can copy manually. The site does not request clipboard-read permission.</p>`,
      },
      {
        id: "preview-actions",
        title: "Sign-in or installation does not complete",
        body: `<p>That is intentional in this redesign. Production services are disconnected, and all navigation stays local. The preview does not create accounts, install an extension, process payments, or send support requests.</p>`,
      },
      {
        id: "get-help",
        title: "Prepare a useful support report",
        body: `<p>Include the product version, browser or OS version, destination editor, expected behavior, and a fictitious reproduction. Do not include credentials, customer data, or unredacted screenshots.</p><p>The <a href="/designs/secureintent-site-v1/docs/contact/">local support preview</a> demonstrates the support-request interface without sending a message.</p>`,
      },
    ],
  },
  {
    slug: "resources/plans",
    title: "Plans & features",
    group: "Resources",
    icon: "layers",
    description: "Choose the level of protection that fits your workflow.",
    sections: [
      {
        id: "plan-overview",
        title: "Plan overview",
        body: `<div class="doc-table-wrap"><table><thead><tr><th>Plan</th><th>Displayed price</th><th>Starting point</th></tr></thead><tbody><tr><td>Free</td><td>$0</td><td>Get familiar with detection and 10 anonymizations per month.</td></tr><tr><td>Developer Pro</td><td>$8 / month</td><td>Expanded individual workflow, including restore.</td></tr><tr><td>Business Pro</td><td>$9 / seat / month</td><td>Team plan, with a three-seat minimum.</td></tr></tbody></table></div><p>These prices mirror the source website checked for this redesign. This preview does not provide checkout, and prices must be verified before launch. <a href="/designs/secureintent-site-v1/index.html#tiers">Compare the plans on the website.</a></p>`,
      },
      {
        id: "team-availability",
        title: "Team feature availability",
        body: `<p>Team policy controls and alerts are marked as rolling out. A plan listing is not a guarantee that an in-progress capability is available in your installation.</p>`,
      },
      {
        id: "local-preview",
        title: "Plan selection in this preview",
        body: `<p>Selecting a plan opens a local account or team-contact design. No subscription is created and no payment information is collected.</p>`,
      },
    ],
  },
  {
    slug: "resources/roadmap",
    title: "Product roadmap",
    navTitle: "Roadmap",
    group: "Resources",
    icon: "clock",
    description:
      "A clear distinction between the starting point and what comes next.",
    sections: [
      {
        id: "available-starting-point",
        title: "The starting point",
        body: `<p>The browser extension and the core detect–anonymize workflow are the focus of this website. The interactive example and source product video show that workflow without installing the product.</p>`,
      },
      {
        id: "in-progress",
        title: "In progress",
        body: `<div class="roadmap-item"><span class="status-pill">Rolling out</span><h3>Team controls & alerts</h3><p>Policy controls and team alerts are identified as in-progress capabilities in the source product messaging.</p></div><div class="roadmap-item"><span class="status-pill neutral">Separate product</span><h3>Desktop protection</h3><p>The desktop app extends the protection surface. Release availability and platform support must be checked separately from the extension.</p></div>`,
      },
      {
        id: "no-promised-dates",
        title: "No unverified release promises",
        body: `<p>This preview does not assign dates to unreleased work or claim support for unconfirmed platforms. Availability should be updated with the actual release before the site is published.</p>`,
      },
    ],
  },
];

export const groups = [
  "Getting started",
  "Core concepts",
  "Using SecureIntent",
  "Security",
  "Resources",
];
export const pageText = (page) =>
  [
    page.title,
    page.description,
    page.intro || "",
    ...page.sections.map((section) => `${section.title}\n${section.body}`),
  ]
    .join("\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .trim();
