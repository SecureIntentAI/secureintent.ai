/**
 * Send Firefox users to the Mozilla listing.
 *
 * Every Install button across the site is written with the Chrome Web Store URL,
 * because that is where most visitors are going. On Firefox that link is a dead
 * end — the visitor lands on a store their browser cannot install from — so this
 * rewrites those buttons to the Mozilla add-on listing instead.
 *
 * Done here, in one file every page loads, rather than in each page's markup:
 * the buttons appear in five pages and eleven places, and a rule that lives in
 * eleven places is a rule that will be wrong in one of them within a month.
 *
 * Review links are deliberately left alone. They point at the Chrome listing's
 * reviews, which are worth reading whatever browser you are in, and Mozilla has
 * its own separate reviews page.
 */
(function () {
  var CHROME = 'chromewebstore.google.com/detail/secureintent';
  var FIREFOX = 'https://addons.mozilla.org/en-US/firefox/addon/secureintent/';

  // Seamonkey and a few forks carry "Firefox/" in their user agent without
  // being able to install from addons.mozilla.org the same way.
  var ua = navigator.userAgent || '';
  var isFirefox = /\bFirefox\/\d+/.test(ua) && !/Seamonkey|Waterfox|PaleMoon/i.test(ua);

  // Published for pages that set an install href from their own script — team.html
  // fills one in after its data loads, which is long after this file has run.
  window.SI_INSTALL_URL = isFirefox
    ? FIREFOX
    : 'https://chromewebstore.google.com/detail/secureintent/ejdhcakapnkbmfihgoamdnajgimhemof';
  window.SI_INSTALL_STORE = isFirefox ? 'firefox' : 'chrome';

  function apply() {
    var links = document.querySelectorAll('a[href*="' + CHROME + '"]');
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      // Leave the reviews link pointing where it points.
      if (a.href.indexOf('/reviews') !== -1) continue;
      // Recorded either way, so the analytics event can say which store a click
      // was headed for rather than assuming Chrome.
      a.setAttribute('data-store', isFirefox ? 'firefox' : 'chrome');
      if (isFirefox) a.href = FIREFOX;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', apply);
  } else {
    apply();
  }
})();
