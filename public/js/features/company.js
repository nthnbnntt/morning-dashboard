import { empty, esc, getJson, safeUrl } from "./utils.js";

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

export async function renderCompany(view) {
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
