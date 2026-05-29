import { displayDateTime, empty, esc, getJson, hydrateCommonStatus, qs, qsa, safeUrl, shorten } from "./utils.js";
import { cachedTicketsSnapshot, loadTickets, statusClass, statusCounts } from "./tickets.js";

function storyCard(story, index) {
  return `
    <article class="card story" data-source="${esc(story.source)}">
      <span class="meta">${String(index).padStart(2, "0")} / ${esc(story.source)} / ${esc(displayDateTime(story.published))}</span>
      <h3><a href="${esc(safeUrl(story.url))}" target="_blank" rel="noreferrer">${esc(story.title)}</a></h3>
      <p>${esc(shorten(story.summary, 190))}</p>
    </article>
  `;
}

function sourceButtons(stories) {
  const counts = new Map();
  stories.forEach((story) => counts.set(story.source, (counts.get(story.source) || 0) + 1));
  return Array.from(counts.entries()).map(([source, count]) => `
    <button type="button" data-source="${esc(source)}">${esc(source)} <strong>${count}</strong></button>
  `).join("");
}

function enableSourceFilters(root) {
  const active = new Set();
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

function newsContent(stories) {
  const [lead, ...rest] = stories;
  if (!stories.length) return empty("No stories are available yet.");
  return `
    ${lead ? `
      <section class="lead story" data-source="${esc(lead.source)}">
        <span class="meta">${esc(lead.source)} / ${esc(displayDateTime(lead.published))}</span>
        <h2><a href="${esc(safeUrl(lead.url))}" target="_blank" rel="noreferrer">${esc(lead.title)}</a></h2>
        <p>${esc(shorten(lead.summary, 300))}</p>
      </section>
    ` : ""}
    <section>
      <div class="section-title"><h2 id="news-start">Priority Scan</h2><span class="meta">${stories.length} stories</span></div>
      <div class="source-list source-filter-row">${sourceButtons(stories)}</div>
      <div class="grid">${rest.map((story, index) => storyCard(story, index + 2)).join("")}</div>
    </section>
  `;
}

function ticketStatusSummary(tickets) {
  const counts = Array.from(statusCounts(tickets).entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return `
    <span class="meta">Tickets</span>
    <div class="ticket-summary compact" aria-label="Tickets by status">
      ${counts.map(([status, count]) => `
        <a class="ticket-summary-item" href="#tickets?status=${encodeURIComponent(status)}">
          <strong>${count.toLocaleString()}</strong>
          <span class="ticket-status-label ${esc(statusClass(status))}">${esc(status)}</span>
        </a>
      `).join("")}
    </div>
  `;
}

async function hydrateTicketSummary() {
  const card = qs("#news-ticket-summary");
  if (!card) return;
  try {
    const tickets = await loadTickets();
    card.innerHTML = ticketStatusSummary(tickets);
  } catch (err) {
    card.innerHTML = '<span class="meta">Tickets</span><h2>Unavailable</h2>';
  }
}

export async function renderNews(view) {
  const cachedTickets = cachedTicketsSnapshot();
  view.innerHTML = `
    <section class="panel">
      <div class="status" id="qb-status" data-state="unknown">
        <span class="status-dot"></span>
        <strong id="qb-label">Quickbase</strong>
        <span class="meta" id="qb-detail">Checking status...</span>
        <a id="qb-link" class="text-link" href="https://quickbasestatus.status.page/#!/" target="_blank" rel="noreferrer">Open</a>
      </div>
      <div class="card ticket-news-card" id="news-ticket-summary">${cachedTickets ? ticketStatusSummary(cachedTickets) : '<span class="meta">Tickets</span><h2>Loading...</h2>'}</div>
    </section>
    <div id="news-content">${empty("Refreshing news...")}</div>
  `;
  const summaryTasks = Promise.all([hydrateCommonStatus(), hydrateTicketSummary()]);
  try {
    const payload = await getJson(`/api/news?refresh=1&t=${Date.now()}`);
    const content = qs("#news-content", view);
    if (content) {
      content.innerHTML = newsContent(payload.stories || []);
      enableSourceFilters(content);
    }
  } catch (err) {
    const content = qs("#news-content", view);
    if (content) content.innerHTML = `<section>${empty(err?.message || "News is unavailable.")}</section>`;
  }
  await summaryTasks;
}
