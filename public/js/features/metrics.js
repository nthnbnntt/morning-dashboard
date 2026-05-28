import { cachedJson, esc, formatNumber } from "./utils.js";

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

async function loadMetrics(view, force = false) {
  const data = await cachedJson("/api/metrics", { ttlMs: 60000, force });
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

export async function renderMetrics(view) {
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
  view.querySelector("#refresh").addEventListener("click", () => loadMetrics(view, true));
  await loadMetrics(view);
}
