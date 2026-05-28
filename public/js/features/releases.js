import { empty, esc, getJson, qsa, safeUrl, statusOfRelease } from "./utils.js";

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

export async function renderReleases(view) {
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
