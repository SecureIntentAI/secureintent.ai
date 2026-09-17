(function () {
  var theme = "dark";
  try { theme = (localStorage.getItem("si_site_theme") || localStorage.getItem("si_soft_homepage_theme")) === "light" ? "light" : "dark"; } catch (_) {}
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
