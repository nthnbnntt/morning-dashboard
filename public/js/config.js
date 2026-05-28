(function () {
  const existing = window.MORNING_DASHBOARD_CONFIG || {};
  const isLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const defaultApiBaseUrl = isLocal
    ? "http://localhost:8787"
    : "https://morning-dashboard.n8visions.workers.dev";
  const defaults = {
    appName: "Morning Dashboard",
    assetBaseUrl: "https://nthnbnntt.github.io/morning-dashboard",
    apiBaseUrl: defaultApiBaseUrl,
    quickbaseRealm: "vtg.quickbase.com",
    quickbaseTicketsApp: "br35mavda",
    quickbaseTicketsTable: "bsmpv3zg4",
    quickbaseTicketTokenDbid: "bsmpv3zg4",
    quickbaseTicketFields: {
      rid: 3,
      app: 11,
      submitter: 20,
      issue: 6
    }
  };

  window.MORNING_DASHBOARD_CONFIG = {
    ...defaults,
    ...existing,
    quickbaseTicketFields: {
      ...defaults.quickbaseTicketFields,
      ...(existing.quickbaseTicketFields || {})
    }
  };
})();
