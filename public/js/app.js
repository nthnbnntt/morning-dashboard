import { renderCompany } from "./features/company.js";
import { renderMetrics } from "./features/metrics.js";
import { renderNews } from "./features/news.js";
import { currentRoute, renderShell, tick, trackRouteLoad } from "./features/navigation.js";
import { renderReleases } from "./features/releases.js";
import { prefetchTickets, renderTickets } from "./features/tickets.js";
import { error, mdLog, prefetchJson, qs } from "./features/utils.js";

const renderers = {
  news: renderNews,
  tickets: renderTickets,
  releases: renderReleases,
  company: renderCompany,
  metrics: renderMetrics
};

async function renderRoute() {
  const route = currentRoute();
  renderShell(route);
  const view = qs("#view");
  view.innerHTML = '<section class="panel"><h2>Loading</h2><p>Getting the latest dashboard data...</p></section>';
  mdLog("route.render_started", { route });
  try {
    await renderers[route](view);
    await trackRouteLoad(route);
    mdLog("route.render_completed", { route });
  } catch (err) {
    console.error(err);
    view.innerHTML = error(err?.message || "The dashboard could not render this view.");
  }
}

function prefetchDashboardData() {
  prefetchTickets();
  prefetchJson("/api/quickbase-releases");
  prefetchJson("/api/company-news");
  prefetchJson("/api/metrics", { ttlMs: 60000 });
}

window.addEventListener("hashchange", renderRoute);
setInterval(tick, 30000);
renderRoute().finally(() => {
  if ("requestIdleCallback" in window) requestIdleCallback(prefetchDashboardData, { timeout: 2500 });
  else setTimeout(prefetchDashboardData, 1000);
});
