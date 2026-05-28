export function config() {
  return window.MORNING_DASHBOARD_CONFIG || {};
}

export function apiBase() {
  return String(config().apiBaseUrl || "").replace(/\/$/, "");
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char] || char);
}

export function safeUrl(value) {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "#";
}

export function shorten(value, limit) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 3).replace(/\s+\S*$/, "")}...`;
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

export function mdLog(event, fields = {}) {
  console.log("[Morning Dashboard]", {
    event,
    route: location.hash || "#news",
    at: new Date().toISOString(),
    ...fields
  });
}

export async function mdFetch(path, options = {}) {
  const url = path.startsWith("http") ? path : `${apiBase()}${path}`;
  const started = performance.now();
  mdLog("api.fetch_started", { url, method: options.method || "GET" });
  try {
    const response = await fetch(url, options);
    mdLog("api.fetch_completed", {
      url,
      method: options.method || "GET",
      status: response.status,
      elapsedMs: Math.round(performance.now() - started)
    });
    return response;
  } catch (error) {
    console.error("[Morning Dashboard]", {
      event: "api.fetch_failed",
      url,
      method: options.method || "GET",
      elapsedMs: Math.round(performance.now() - started),
      error: error?.message || String(error)
    });
    throw error;
  }
}

export async function getJson(path, options = {}) {
  const response = await mdFetch(path, options);
  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }
  return response.json();
}

export function formatNumber(value) {
  return Math.round(Number(value || 0)).toLocaleString();
}

export function displayDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York"
  }).format(date);
}

export function displayTime(date = new Date()) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York"
  }).format(date);
}

export function empty(message) {
  return `<div class="empty">${esc(message)}</div>`;
}

export function error(message) {
  return `<div class="error">${esc(message)}</div>`;
}

export function routePath(route) {
  return {
    news: "/news.html",
    tickets: "/tickets.html",
    releases: "/quickbase-releases.html",
    company: "/company-news.html",
    metrics: "/metrics.html"
  }[route] || "/news.html";
}

export function statusOfRelease(record) {
  return String(record.status || "").toLowerCase().includes("released") ? "released" : "upcoming";
}

export async function hydrateCommonStatus() {
  const status = qs("#qb-status");
  if (!status) return;
  try {
    const data = await getJson("/api/quickbase-status");
    status.dataset.state = data.state || "unknown";
    qs("#qb-label").textContent = `Quickbase ${data.label || ""}`;
    qs("#qb-detail").textContent = data.detail || "";
    const link = qs("#qb-link");
    if (link && data.url) link.href = data.url;
  } catch {
    status.dataset.state = "unknown";
    qs("#qb-label").textContent = "Quickbase status unavailable";
  }
}
