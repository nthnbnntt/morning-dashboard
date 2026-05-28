import { config, empty, error, esc, mdFetch, mdLog, qs, safeUrl } from "./utils.js";

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
    app: cellValue(row[String(fields.app)]),
    submitter: cellValue(row[String(fields.submitter)]),
    issue: cellValue(row[String(fields.issue)]),
    url: recordUrl({ rid })
  };
}

async function getTemporaryToken() {
  const cfg = config();
  mdLog("tickets.temp_token_started", {
    realm: cfg.quickbaseRealm,
    appId: cfg.quickbaseTicketsApp,
    tableId: cfg.quickbaseTicketsTable
  });
  const response = await mdFetch(`https://api.quickbase.com/v1/auth/temporary/${cfg.quickbaseTicketsApp}`, {
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
      select: [fields.rid, fields.app, fields.submitter, fields.issue],
      options: {
        top: 100,
        sortBy: [{ fieldId: fields.rid, order: "DESC" }]
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
      <span class="pill normal">Record ${esc(ticket.rid)}</span>
      <h3>${esc(ticket.issue || "No issue text")}</h3>
      <div class="ticket-fields">
        <div class="ticket-field"><span class="meta">App</span>${esc(ticket.app || "")}</div>
        <div class="ticket-field"><span class="meta">Submitter</span>${esc(ticket.submitter || "")}</div>
      </div>
    </article>
  `;
}

function openTicket(ticket) {
  qs("#ticket-title").textContent = `Ticket ${ticket.rid}`;
  qs("#ticket-detail").innerHTML = `
    <div><span class="meta">Issue</span><p>${esc(ticket.issue || "")}</p></div>
    <div class="row">
      <div><span class="meta">App</span><p>${esc(ticket.app || "")}</p></div>
      <div><span class="meta">Submitter</span><p>${esc(ticket.submitter || "")}</p></div>
    </div>
    <a class="refresh" href="${esc(safeUrl(ticket.url))}" target="_blank" rel="noreferrer">Open record in Quickbase</a>
  `;
  qs("#ticket-modal").classList.add("open");
}

export async function renderTickets(view) {
  const cfg = config();
  const tableUrl = `https://${cfg.quickbaseRealm}/nav/app/${cfg.quickbaseTicketsApp}/table/${cfg.quickbaseTicketsTable}/action/td`;
  view.innerHTML = `
    <section class="panel">
      <h2>Quickbase Tickets</h2>
      <p id="ticket-status">Connecting to Quickbase with your browser session...</p>
      <a href="${esc(tableUrl)}" target="_blank" rel="noreferrer">Open ticket table</a>
    </section>
    <section class="grid two ticket-list" id="ticket-list"></section>
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
