# Documentation imported from the redesign

The public entry point is `../docs.html`. The existing marketing footer links to it.
The twelve documentation articles, their layout and interactions come from
`redisgn of the website`. They run as static HTML and browser modules without
Vite or a server on port 4173.

- `src/content/docs.js`: complete article content, sidebar groups and search data.
- `src/templates.js`: shared documentation HTML templates.
- `src/docs.js`: search, copy, feedback and mobile navigation.
- `site-colors.css`: v2.1 palette, layered over the original redesign styles.
- `theme-init.js` and `src/shared.js`: the shared `si_site_theme` preference.
- `assets/`: local fonts and licenses, product video, and artwork.
- `demo-body.html` and `src/demo.js`: the fictitious example used by the quickstart.
- `render.mjs`: emits generated HTML; run without arguments to list outputs, or
  pass an output path such as `docs/quickstart/index.html` to print that page.

The generated pages are checked in beside the marketing pages. Update both source
and generated HTML when changing content or templates. Legacy documentation URLs
redirect to corresponding new guides, including the old feature-card anchors.
Installation, account and contact pages used by these guides retain the source
redesign's local preview behavior.

Article wording is preserved from the redesign, including its pricing and release
descriptions. Only route destinations and the colour/theme integration were adapted.
