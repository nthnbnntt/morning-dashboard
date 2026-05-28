import { config, empty, error, esc, mdFetch, mdLog, qs, qsa, safeUrl } from "./utils.js";

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
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function statusClass(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (normalized === "open") return "normal";
  if (normalized === "assigned") return "low";
  if (normalized === "hold") return "high";
  if (normalized === "review board") return "review";
  if (normalized.includes("urgent") || normalized.includes("late") || normalized.includes("blocked")) return "high";
  if (normalized.includes("new") || normalized.includes("open")) return "normal";
  if (normalized.includes("progress") || normalized.includes("pending")) return "low";
  return "released";
}

export function statusCounts(tickets) {
  return tickets.reduce((counts, ticket) => {
    const status = String(ticket.status || "No status").trim() || "No status";
    counts.set(status, (counts.get(status) || 0) + 1);
    return counts;
  }, new Map());
}

function ticketStatusFilters(tickets) {
  const order = ["OPEN", "ASSIGNED", "HOLD", "REVIEW BOARD"];
  const statuses = Array.from(statusCounts(tickets).keys()).sort((a, b) => {
    const ai = order.indexOf(a.toUpperCase());
    const bi = order.indexOf(b.toUpperCase());
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.localeCompare(b);
  });
  return `
    <div class="filters ticket-filters" aria-label="Filter tickets by status">
      ${statuses.map((status) => `
        <button class="pill filter-pill ${esc(statusClass(status))}" type="button" data-filter="${esc(status)}">${esc(status)}</button>
      `).join("")}
    </div>
  `;
}

function initialStatusFilter(tickets) {
  const query = location.hash.split("?")[1] || "";
  const status = new URLSearchParams(query).get("status") || "";
  return tickets.some((ticket) => ticket.status === status) ? status : "";
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

export async function loadTickets() {
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

export async function renderTickets(view) {
  const cfg = config();
  const tableUrl = `https://${cfg.quickbaseRealm}/nav/app/${cfg.quickbaseTicketsApp}/table/${cfg.quickbaseTicketsTable}/action/td`;
  view.innerHTML = `
    <section class="panel">
      <h2>Quickbase Tickets</h2>
      <p id="ticket-status">Connecting to Quickbase with your browser session...</p>
      <div id="ticket-filters"></div>
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
    qs("#ticket-filters").innerHTML = ticketStatusFilters(tickets);
    let filter = initialStatusFilter(tickets);

    function shown(ticket) {
      return !filter || ticket.status === filter;
    }

    function renderList() {
      const visibleTickets = tickets.filter(shown);
      qs("#ticket-list").innerHTML = visibleTickets.map(ticketCard).join("") || empty("No tickets match this filter.");
    }

    qsa(".ticket-filters button", view).forEach((button) => {
      button.classList.toggle("active", button.dataset.filter === filter);
      button.addEventListener("click", () => {
        filter = filter === button.dataset.filter ? "" : button.dataset.filter;
        qsa(".ticket-filters button", view).forEach((item) => item.classList.toggle("active", item.dataset.filter === filter));
        renderList();
      });
    });

    renderList();
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
