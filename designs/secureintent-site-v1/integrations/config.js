/* Public browser configuration only. Never put Clerk/Paddle secret keys here.
 * Production values are the existing main-branch integration identifiers.
 * For a preview, configure a separate test Worker, Clerk test instance and
 * Paddle sandbox here. See INTEGRATIONS.md; production is never a local fallback.
 */
window.SI_CONFIG = {
  production: {
    apiBase: 'https://api.secureintent.ai',
    clerkPublishableKey: 'pk_live_Y2xlcmsuc2VjdXJlaW50ZW50LmFpJA',
    clerkScriptUrl: 'https://clerk.secureintent.ai/npm/@clerk/clerk-js@5/dist/clerk.browser.js',
    jwtTemplate: 'secureintent',
    paddleToken: 'live_7ce4fc6784b4e1614713a5b29ee',
    paddleEnv: 'production',
    priceId: 'pri_01kvtk87ebyb41gyzm8ydne0hp',
  },
  preview: null,
};
