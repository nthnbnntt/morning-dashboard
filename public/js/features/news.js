import { empty, esc, getJson, hydrateCommonStatus, qs, qsa, safeUrl, shorten } from "./utils.js";

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

export async function renderNews(view) {
  const payload = await getJson(`/api/news?refresh=1&t=${Date.now()}`);
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
