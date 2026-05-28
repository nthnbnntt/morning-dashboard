import { config, displayDate, displayTime, esc, mdFetch, mdLog, routePath, qs } from "./utils.js";

export const pages = [
  { id: "news", label: "News", title: "Morning Briefing", mark: "M" },
  { id: "tickets", label: "Tickets", title: "Quickbase Tickets", mark: "T" },
  { id: "releases", label: "Releases", title: "Quickbase Releases", mark: "R" },
  { id: "company", label: "Company", title: "Company News", mark: "C" },
  { id: "metrics", label: "Metrics", title: "Dashboard Metrics", mark: "M" }
];

export function currentRoute() {
  const route = (location.hash.replace(/^#\/?/, "").split("?")[0] || "news");
  return pages.some((page) => page.id === route) ? route : "news";
}

export function renderShell(route) {
  const page = pages.find((item) => item.id === route) || pages[0];
  document.title = `${page.title} - ${config().appName || "Morning Dashboard"}`;
  qs("#dashboard-root").innerHTML = `
    <main class="shell">
      <header class="topbar">
        <div class="brand">
          <div class="mark">${esc(page.mark)}</div>
          <div>
            <h1>${esc(page.title)}</h1>
            <div class="subtle">${esc(displayDate())}</div>
          </div>
        </div>
        <nav class="nav" aria-label="Dashboard pages">
          ${pages.map((item) => `<a href="#${item.id}"${item.id === route ? ' aria-current="page"' : ""}>${esc(item.label)}</a>`).join("")}
        </nav>
        <div class="clock"><strong id="clock">${esc(displayTime())}</strong><span>ET</span></div>
      </header>
      <div class="scroll-area" id="view" tabindex="-1"></div>
    </main>
  `;
  tick();
  enablePullToRefresh();
  enableSwipeNavigation();
}

export function tick() {
  const clock = qs("#clock");
  if (clock) clock.textContent = displayTime();
}

export async function trackRouteLoad(route) {
  try {
    await mdFetch("/api/page-load", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: routePath(route) })
    });
  } catch {
    mdLog("page.track_failed", { route });
  }
}

export function enablePullToRefresh() {
  const area = qs(".scroll-area");
  if (!area || !("ontouchstart" in window)) return;
  let startY = null;
  let shouldRefresh = false;
  area.addEventListener("touchstart", (event) => {
    if (area.scrollTop <= 0) {
      startY = event.touches[0].clientY;
      shouldRefresh = false;
    } else {
      startY = null;
    }
  }, { passive: true });
  area.addEventListener("touchmove", (event) => {
    if (startY === null || area.scrollTop > 0) return;
    shouldRefresh = event.touches[0].clientY - startY > 90;
  }, { passive: true });
  area.addEventListener("touchend", () => {
    if (shouldRefresh) location.reload();
    startY = null;
    shouldRefresh = false;
  }, { passive: true });
}

export function enableSwipeNavigation() {
  const area = qs(".scroll-area");
  if (!area || !("ontouchstart" in window)) return;
  let x0 = null;
  let y0 = null;
  area.addEventListener("touchstart", (event) => {
    x0 = event.touches[0].clientX;
    y0 = event.touches[0].clientY;
  }, { passive: true });
  area.addEventListener("touchend", (event) => {
    if (x0 === null || y0 === null) return;
    const dx = event.changedTouches[0].clientX - x0;
    const dy = event.changedTouches[0].clientY - y0;
    x0 = null;
    y0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const index = pages.findIndex((page) => page.id === currentRoute());
    if (dx < 0 && index < pages.length - 1) location.hash = pages[index + 1].id;
    if (dx > 0 && index > 0) location.hash = pages[index - 1].id;
  }, { passive: true });
}
