"use strict";
var MorningDashboard = (() => {
  // public/js/features/utils.js
  function config() {
    return window.MORNING_DASHBOARD_CONFIG || {};
  }
  function apiBase() {
    return String(config().apiBaseUrl || "").replace(/\/$/, "");
  }
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char] || char);
  }
  function safeUrl(value) {
    const url = String(value || "").trim();
    return /^https?:\/\//i.test(url) ? url : "#";
  }
  function shorten(value, limit) {
    const text = String(value || "");
    if (text.length <= limit) return text;
    return `${text.slice(0, limit - 3).replace(/\s+\S*$/, "")}...`;
  }
  function qs(selector, root = document) {
    return root.querySelector(selector);
  }
  function qsa(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  }
  function mdLog(event, fields = {}) {
    console.log("[Morning Dashboard]", {
      event,
      route: location.hash || "#news",
      at: (/* @__PURE__ */ new Date()).toISOString(),
      ...fields
    });
  }
  async function mdFetch(path, options = {}) {
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
    } catch (error2) {
      console.error("[Morning Dashboard]", {
        event: "api.fetch_failed",
        url,
        method: options.method || "GET",
        elapsedMs: Math.round(performance.now() - started),
        error: error2?.message || String(error2)
      });
      throw error2;
    }
  }
  async function getJson(path, options = {}) {
    const response = await mdFetch(path, options);
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return response.json();
  }
  function formatNumber(value) {
    return Math.round(Number(value || 0)).toLocaleString();
  }
  function displayDate(date = /* @__PURE__ */ new Date()) {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York"
    }).format(date);
  }
  function displayTime(date = /* @__PURE__ */ new Date()) {
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York"
    }).format(date);
  }
  function empty(message) {
    return `<div class="empty">${esc(message)}</div>`;
  }
  function error(message) {
    return `<div class="error">${esc(message)}</div>`;
  }
  function routePath(route) {
    return {
      news: "/news.html",
      tickets: "/tickets.html",
      releases: "/quickbase-releases.html",
      company: "/company-news.html",
      metrics: "/metrics.html"
    }[route] || "/news.html";
  }
  function statusOfRelease(record) {
    return String(record.status || "").toLowerCase().includes("released") ? "released" : "upcoming";
  }
  async function hydrateCommonStatus() {
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

  // public/js/features/company.js
  function companyCard(record) {
    return `
    <article class="card company-card">
      ${record.isNew ? '<span class="pill new">New</span>' : ""}
      <div class="meta">${esc(record.date)}</div>
      <h3>${esc(record.title)}</h3>
      <p>${esc(record.summary)}</p>
      <a href="${esc(safeUrl(record.url))}" target="_blank" rel="noreferrer">Read more</a>
    </article>
  `;
  }
  async function renderCompany(view) {
    view.innerHTML = `
    <section class="panel">
      <h2>Company News</h2>
      <p id="company-status">Loading company news...</p>
      <a href="https://vtgdefense.com/our-company/news/" target="_blank" rel="noreferrer">Open source page</a>
    </section>
    <section class="grid two company-list" id="company-list"></section>
  `;
    const payload = await getJson("/api/company-news");
    const records = payload.records || [];
    view.querySelector("#company-status").textContent = `${records.length} company stories loaded. Updated ${payload.generated}.`;
    view.querySelector("#company-list").innerHTML = records.map(companyCard).join("") || empty("No company stories are available.");
  }

  // public/js/features/metrics.js
  function gauge(label, value, max) {
    const pct = max ? Math.max(0, Math.min(100, Number(value || 0) / max * 100)) : 0;
    return `
    <article class="card">
      <div class="gauge" style="--pct:${pct.toFixed(1)}"><strong>${formatNumber(value)}</strong></div>
      <p class="meta" style="text-align:center;margin-top:8px">${esc(label)}</p>
    </article>
  `;
  }
  function stat(label, value, unit = "") {
    return `
    <article class="card">
      <p class="meta">${esc(label)}</p>
      <h2>${formatNumber(value)}${unit ? `<span style="font-size:1rem;font-weight:500"> ${esc(unit)}</span>` : ""}</h2>
    </article>
  `;
  }
  function bars(title, rows) {
    const max = Math.max(1, ...rows.map((row) => row[1] || 0));
    return `
    <article class="card">
      <p class="meta">${esc(title)}</p>
      <div class="bars">
        ${rows.map(([label, value]) => `
          <div class="bar-row">
            <span>${esc(label)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${Math.round((value || 0) / max * 100)}%"></div></div>
            <span class="bar-val">${formatNumber(value)}</span>
          </div>
        `).join("")}
      </div>
    </article>
  `;
  }
  async function loadMetrics(view) {
    const data = await getJson("/api/metrics");
    const gmax = Math.max(
      100,
      data.page_loads || 0,
      data.unique_stories_served || 0,
      data.unique_release_notes_loaded || 0,
      data.unique_company_news_loaded || 0
    );
    view.querySelector("#gauges").innerHTML = [
      gauge("Page Loads", data.page_loads, gmax),
      gauge("Unique Stories", data.unique_stories_served, gmax),
      gauge("Unique Releases", data.unique_release_notes_loaded, gmax),
      gauge("Unique Company News", data.unique_company_news_loaded, gmax)
    ].join("");
    view.querySelector("#stats").innerHTML = [
      stat("Last Load", data.last_load_ms, "ms"),
      stat("API Samples", data.response_samples),
      stat("News Refreshes", data.news_refreshes),
      stat("Unique Stories", data.unique_stories_served),
      stat("Unique Releases", data.unique_release_notes_loaded),
      stat("Unique Company News", data.unique_company_news_loaded),
      stat("Page Loads", data.page_loads)
    ].join("");
    view.querySelector("#bars").innerHTML = [
      bars("Page Loads", [["News", data["page:News"]], ["Tickets", data["page:Tickets"]], ["Releases", data["page:Releases"]], ["Company", data["page:Company"]], ["Metrics", data["page:Metrics"]]]),
      bars("API Calls", [["News", data["api:news"]], ["QB Status", data["api:quickbase-status"]], ["Company", data["api:company-news"]], ["Releases", data["api:quickbase-releases"]], ["Metrics", data["api:metrics"]]])
    ].join("");
    view.querySelector("#events").innerHTML = (data.events || []).map((event) => `
    <p><strong>${esc(event.label)}</strong> <span class="meta">${formatNumber(event.amount)} / ${esc(event.created_at)}</span></p>
  `).join("") || '<p class="meta">No events yet.</p>';
    view.querySelector("#metrics-status").textContent = `Updated ${data.generated}.`;
  }
  async function renderMetrics(view) {
    view.innerHTML = `
    <section class="panel">
      <h2>Live Instrumentation</h2>
      <p id="metrics-status">Loading...</p>
      <button class="refresh" id="refresh" type="button">Refresh</button>
    </section>
    <section class="grid" id="gauges"></section>
    <section class="grid two" id="stats"></section>
    <section class="grid two" id="bars"></section>
    <section class="grid two"><div class="card"><p class="meta">Recent Events</p><div id="events"></div></div></section>
  `;
    view.querySelector("#refresh").addEventListener("click", () => loadMetrics(view));
    await loadMetrics(view);
  }

  // public/js/features/news.js
  function storyCard(story, index) {
    return `
    <article class="card story" data-source="${esc(story.source)}">
      <span class="meta">${String(index).padStart(2, "0")} / ${esc(story.source)}</span>
      <h3><a href="${esc(safeUrl(story.url))}" target="_blank" rel="noreferrer">${esc(story.title)}</a></h3>
      <p>${esc(shorten(story.summary, 190))}</p>
    </article>
  `;
  }
  function sourceButtons(stories) {
    const counts = /* @__PURE__ */ new Map();
    stories.forEach((story) => counts.set(story.source, (counts.get(story.source) || 0) + 1));
    return Array.from(counts.entries()).map(([source, count]) => `
    <button type="button" data-source="${esc(source)}">${esc(source)} <strong>${count}</strong></button>
  `).join("");
  }
  function enableSourceFilters(root) {
    const active = /* @__PURE__ */ new Set();
    function apply() {
      const has = active.size > 0;
      qsa(".story[data-source]", root).forEach((card) => {
        card.classList.toggle("hidden", has && !active.has(card.dataset.source));
      });
      qsa(".source-list button", root).forEach((button) => {
        button.classList.toggle("active", active.has(button.dataset.source));
      });
    }
    qsa(".source-list button", root).forEach((button) => {
      button.addEventListener("click", () => {
        const source = button.dataset.source;
        if (active.has(source)) active.delete(source);
        else active.add(source);
        apply();
        qs("#news-start", root)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }
  async function renderNews(view) {
    const payload = await getJson("/api/news");
    const stories = payload.stories || [];
    const [lead, ...rest] = stories;
    if (!stories.length) {
      view.innerHTML = empty("No stories are available yet.");
      return;
    }
    view.innerHTML = `
    <section class="panel">
      <div class="status" id="qb-status" data-state="unknown">
        <span class="status-dot"></span>
        <strong id="qb-label">Quickbase</strong>
        <span class="meta" id="qb-detail">Checking status...</span>
        <a id="qb-link" class="text-link" href="https://quickbasestatus.status.page/#!/" target="_blank" rel="noreferrer">Open</a>
      </div>
      <a class="card" href="#tickets"><span class="meta">Tickets</span><h2>Live</h2></a>
      <div class="source-list">${sourceButtons(stories)}</div>
    </section>
    ${lead ? `
      <section class="lead story" data-source="${esc(lead.source)}">
        <span class="meta">${esc(lead.source)} / ${esc(lead.published || "date unavailable")}</span>
        <h2><a href="${esc(safeUrl(lead.url))}" target="_blank" rel="noreferrer">${esc(lead.title)}</a></h2>
        <p>${esc(shorten(lead.summary, 300))}</p>
      </section>
    ` : ""}
    <section>
      <div class="section-title"><h2 id="news-start">Priority Scan</h2><span class="meta">${stories.length} stories</span></div>
      <div class="grid">${rest.map((story, index) => storyCard(story, index + 2)).join("")}</div>
    </section>
  `;
    enableSourceFilters(view);
    await hydrateCommonStatus();
  }

  // public/js/features/navigation.js
  var pages = [
    { id: "news", label: "News", title: "Morning Briefing", mark: "M" },
    { id: "tickets", label: "Tickets", title: "Quickbase Tickets", mark: "T" },
    { id: "releases", label: "Releases", title: "Quickbase Releases", mark: "R" },
    { id: "company", label: "Company", title: "Company News", mark: "C" },
    { id: "metrics", label: "Metrics", title: "Dashboard Metrics", mark: "M" }
  ];
  function currentRoute() {
    const route = location.hash.replace(/^#\/?/, "") || "news";
    return pages.some((page) => page.id === route) ? route : "news";
  }
  function renderShell(route) {
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
  function tick() {
    const clock = qs("#clock");
    if (clock) clock.textContent = displayTime();
  }
  async function trackRouteLoad(route) {
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
  function enablePullToRefresh() {
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
  function enableSwipeNavigation() {
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

  // public/js/features/releases.js
  function releaseCard(record) {
    const status = statusOfRelease(record);
    return `
    <article class="card release-card">
      <span class="pill ${status}">${esc(status)}</span>
      ${record.isNew ? '<span class="pill new">New</span>' : ""}
      <h3>${esc(record.feature || record.summary || "Quickbase release")}</h3>
      <div class="meta">${esc(record.area || "")}</div>
      <p>${esc(record.summary || "")}</p>
      <a href="${esc(safeUrl(record.url))}" target="_blank" rel="noreferrer">View note</a>
    </article>
  `;
  }
  async function renderReleases(view) {
    view.innerHTML = `
    <section class="panel">
      <h2>Release Notes</h2>
      <p id="release-status">Loading Quickbase release records...</p>
      <div class="filters">
        <button class="pill filter-pill active" type="button" data-filter="all">All</button>
        <button class="pill filter-pill new" type="button" data-filter="new">New</button>
        <button class="pill filter-pill upcoming" type="button" data-filter="upcoming">Upcoming</button>
        <button class="pill filter-pill released" type="button" data-filter="released">Released</button>
      </div>
    </section>
    <section class="grid two" id="release-list"></section>
  `;
    const payload = await getJson("/api/quickbase-releases");
    const records = payload.records || [];
    let filter = "all";
    function show(record) {
      if (filter === "all") return true;
      if (filter === "new") return record.isNew;
      return statusOfRelease(record) === filter;
    }
    function renderList() {
      const shown = records.filter(show);
      view.querySelector("#release-list").innerHTML = shown.map(releaseCard).join("") || empty("No release notes match this filter.");
    }
    const newCount = records.filter((record) => record.isNew).length;
    view.querySelector("#release-status").textContent = `${records.length} release notes loaded / ${newCount} new. Updated ${payload.generated}.`;
    qsa(".filters button", view).forEach((button) => {
      button.addEventListener("click", () => {
        filter = button.dataset.filter;
        qsa(".filters button", view).forEach((item) => item.classList.toggle("active", item === button));
        renderList();
      });
    });
    renderList();
  }

  // public/js/features/tickets.js
  function cellValue(cell) {
    const value = cell && Object.prototype.hasOwnProperty.call(cell, "value") ? cell.value : cell;
    if (Array.isArray(value)) return value.map(cellValue).filter(Boolean).join(", ");
    if (value && typeof value === "object") {
      return value.fullName || value.name || value.email || value.label || value.id || JSON.stringify(value);
    }
    return value == null ? "" : String(value);
  }
  function recordUrl(ticket) {
    const cfg = config();
    return `https://${cfg.quickbaseRealm}/nav/app/${cfg.quickbaseTicketsApp}/table/${cfg.quickbaseTicketsTable}/action/dr?rid=${encodeURIComponent(ticket.rid)}`;
  }
  function normalizeTicket(row) {
    const fields = config().quickbaseTicketFields || {};
    const rid = cellValue(row[String(fields.rid)]);
    return {
      rid,
      date: cellValue(row[String(fields.date)]),
      app: cellValue(row[String(fields.app)]),
      type: cellValue(row[String(fields.type)]),
      status: cellValue(row[String(fields.status)]),
      submitter: cellValue(row[String(fields.submitter)]),
      issue: cellValue(row[String(fields.issue)]),
      url: recordUrl({ rid })
    };
  }
  function formatTicketDate(value) {
    if (!value) return "No date";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(void 0, { month: "short", day: "numeric", year: "numeric" });
  }
  function statusClass(status) {
    const normalized = String(status || "").trim().toLowerCase();
    if (normalized.includes("urgent") || normalized.includes("late") || normalized.includes("blocked")) return "high";
    if (normalized.includes("new") || normalized.includes("open")) return "normal";
    if (normalized.includes("progress") || normalized.includes("pending")) return "low";
    return "released";
  }
  async function getTemporaryToken() {
    const cfg = config();
    mdLog("tickets.temp_token_started", {
      realm: cfg.quickbaseRealm,
      appId: cfg.quickbaseTicketsApp,
      tableId: cfg.quickbaseTicketsTable,
      tokenDbid: cfg.quickbaseTicketTokenDbid || cfg.quickbaseTicketsTable
    });
    const response = await mdFetch(`https://api.quickbase.com/v1/auth/temporary/${cfg.quickbaseTicketTokenDbid || cfg.quickbaseTicketsTable}`, {
      method: "GET",
      credentials: "include",
      headers: { "QB-Realm-Hostname": cfg.quickbaseRealm }
    });
    if (!response.ok) throw new Error(`Quickbase temporary token request failed with status ${response.status}`);
    const data = await response.json();
    const token = data.temporaryAuthorization || data.token;
    if (!token) throw new Error("Quickbase did not return a temporary token");
    return token;
  }
  async function loadTickets() {
    const cfg = config();
    const fields = cfg.quickbaseTicketFields || {};
    const token = await getTemporaryToken();
    const response = await mdFetch("https://api.quickbase.com/v1/records/query", {
      method: "POST",
      headers: {
        "Authorization": `QB-TEMP-TOKEN ${token}`,
        "QB-Realm-Hostname": cfg.quickbaseRealm,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: cfg.quickbaseTicketsTable,
        select: [fields.rid, fields.date, fields.app, fields.type, fields.status, fields.submitter, fields.issue],
        where: `{${fields.status}.XEX.'CLOSED'}`,
        sortBy: [{ fieldId: fields.date, order: "DESC" }],
        options: {
          top: 100
        }
      })
    });
    if (!response.ok) throw new Error(`Quickbase record query failed with status ${response.status}`);
    const data = await response.json();
    return (data.data || []).map(normalizeTicket).filter((ticket) => ticket.rid);
  }
  function ticketCard(ticket) {
    return `
    <article class="card ticket-card" data-rid="${esc(ticket.rid)}">
      <div class="ticket-card-head">
        <span class="ticket-id">Ticket #${esc(ticket.rid)}</span>
        <span class="pill ${esc(statusClass(ticket.status))}">${esc(ticket.status || "No status")}</span>
      </div>
      <h3>${esc(ticket.app || "Unassigned app")}</h3>
      <p class="ticket-issue">${esc(ticket.issue || "No issue text")}</p>
      <div class="ticket-meta-grid">
        <div><span class="meta">Date</span>${esc(formatTicketDate(ticket.date))}</div>
        <div><span class="meta">Type</span>${esc(ticket.type || "Unspecified")}</div>
        <div><span class="meta">Submitter</span>${esc(ticket.submitter || "Unknown")}</div>
        <div><span class="meta">Ticket</span>#${esc(ticket.rid)}</div>
      </div>
    </article>
  `;
  }
  function openTicket(ticket) {
    qs("#ticket-title").textContent = ticket.app || "Unassigned app";
    qs("#ticket-detail").innerHTML = `
    <div class="ticket-detail-summary">
      <span class="pill ${esc(statusClass(ticket.status))}">${esc(ticket.status || "No status")}</span>
      <span class="ticket-id">Ticket #${esc(ticket.rid)}</span>
      <p class="ticket-issue">${esc(ticket.issue || "No issue text")}</p>
    </div>
    <div class="ticket-meta-grid">
      <div><span class="meta">Date</span>${esc(formatTicketDate(ticket.date))}</div>
      <div><span class="meta">Type</span>${esc(ticket.type || "Unspecified")}</div>
      <div><span class="meta">Ticket</span>#${esc(ticket.rid)}</div>
      <div><span class="meta">Submitter</span>${esc(ticket.submitter || "Unknown")}</div>
    </div>
    <a class="refresh" href="${esc(safeUrl(ticket.url))}" target="_blank" rel="noreferrer">Open record in Quickbase</a>
  `;
    qs("#ticket-modal").classList.add("open");
  }
  async function renderTickets(view) {
    const cfg = config();
    const tableUrl = `https://${cfg.quickbaseRealm}/nav/app/${cfg.quickbaseTicketsApp}/table/${cfg.quickbaseTicketsTable}/action/td`;
    view.innerHTML = `
    <section class="panel">
      <h2>Quickbase Tickets</h2>
      <p id="ticket-status">Connecting to Quickbase with your browser session...</p>
      <a href="${esc(tableUrl)}" target="_blank" rel="noreferrer">Open ticket table</a>
    </section>
    <section class="ticket-list" id="ticket-list"></section>
    <div class="modal" id="ticket-modal">
      <div class="modal-panel">
        <div class="modal-head"><h2 id="ticket-title">Ticket</h2><button id="ticket-close" type="button">Close</button></div>
        <div id="ticket-detail" class="ticket-detail"></div>
      </div>
    </div>
  `;
    try {
      const tickets = await loadTickets();
      qs("#ticket-status").textContent = `${tickets.length} tickets loaded from Quickbase.`;
      qs("#ticket-list").innerHTML = tickets.map(ticketCard).join("") || empty("No tickets found.");
      qs("#ticket-list").addEventListener("click", (event) => {
        const card = event.target.closest(".ticket-card");
        const ticket = tickets.find((item) => item.rid === card?.dataset.rid);
        if (ticket) openTicket(ticket);
      });
    } catch (err) {
      qs("#ticket-status").textContent = "Could not load tickets from this browser session.";
      qs("#ticket-list").innerHTML = error(err?.message || "Quickbase ticket access is unavailable.");
    }
    qs("#ticket-close").addEventListener("click", () => qs("#ticket-modal").classList.remove("open"));
    qs("#ticket-modal").addEventListener("click", (event) => {
      if (event.target === qs("#ticket-modal")) qs("#ticket-modal").classList.remove("open");
    });
  }

  // public/js/app.js
  var renderers = {
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
  window.addEventListener("hashchange", renderRoute);
  setInterval(tick, 3e4);
  renderRoute();
})();
