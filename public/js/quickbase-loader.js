(function loadMorningDashboard() {
  var assetBase = window.MORNING_DASHBOARD_ASSET_BASE || "https://nthnbnntt.github.io/morning-dashboard";
  var cacheKey = Date.now();

  function withCache(path) {
    return assetBase + path + "?v=" + cacheKey;
  }

  window.MORNING_DASHBOARD_CONFIG = window.MORNING_DASHBOARD_CONFIG || {};

  var css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = withCache("/css/dashboard.css");
  document.head.appendChild(css);

  var config = document.createElement("script");
  config.src = withCache("/js/config.js");
  config.onload = function () {
    var app = document.createElement("script");
    app.src = withCache("/js/dashboard.bundle.js");
    document.body.appendChild(app);
  };
  document.body.appendChild(config);
})();
