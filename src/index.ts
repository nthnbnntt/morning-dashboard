export interface Env {
  DB: D1Database;
  APP_NAME: string;
  TASK_WRITE_TOKEN: string;
}

type Task = {
  id: string;
  title: string;
  notes: string;
  due: string;
  priority: "low" | "normal" | "high";
  done: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type Story = {
  source: string;
  title: string;
  summary: string;
  url: string;
  published: string;
};

type ReleaseNote = {
  id: string;
  type: string;
  status: string;
  area: string;
  feature: string;
  summary: string;
  expected: string;
  released: string;
  date: string;
  dateSort: string;
  url: string;
  isNew: boolean;
};

type CompanyStory = {
  title: string;
  date: string;
  dateSort: string;
  summary: string;
  url: string;
  isNew: boolean;
};

const FEEDS: Array<[string, string]> = [
  ["NPR", "https://feeds.npr.org/1001/rss.xml"],
  ["BBC News", "https://feeds.bbci.co.uk/news/world/rss.xml"],
  ["The Guardian US", "https://www.theguardian.com/us-news/rss"],
  ["NYTimes", "https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml"],
  ["Hacker News", "https://news.ycombinator.com/rss"]
];

const QUICKBASE_STATUS_URL = "https://quickbasestatus.status.page/";
const QUICKBASE_RELEASES_URL = "https://resources.quickbase.com/db/bu9ax9c5r/4bade523-f7d9-4419-b904-2ce64770b431?from=myqb&a=appoverview";
const QUICKBASE_RELEASES_TABLE = "bu9a2h65e";
const VTG_NEWS_URL = "https://vtgdefense.com/our-company/news/";

const pageNames: Record<string, string> = {
  "/news.html": "News",
  "/tasks.html": "Tasks",
  "/quickbase-releases.html": "Releases",
  "/company-news.html": "Company",
  "/metrics.html": "Metrics"
};

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char] ?? char);
}

function safeUrl(value: unknown): string {
  const s = String(value ?? "").trim();
  return /^https?:\/\//i.test(s) ? s : "#";
}

function cleanText(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shorten(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return value.slice(0, limit - 3).replace(/\s+\S*$/, "") + "...";
}

function json(payload: unknown, status = 200, maxAge = 0): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge > 0 ? `public, max-age=${maxAge}, stale-while-revalidate=60` : "no-store"
    }
  });
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function nowIso(): string {
  return new Date().toISOString();
}

function displayDate(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York"
  }).format(date);
}

function displayTime(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York"
  }).format(date);
}

function displayStamp(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: "America/New_York"
  }).format(date);
}

async function metric(env: Env, key: string, amount = 1): Promise<void> {
  await env.DB.prepare(
    "INSERT INTO metrics(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = value + excluded.value"
  ).bind(key, amount).run();
}

async function event(env: Env, label: string, amount = 1): Promise<void> {
  await env.DB.prepare("INSERT INTO metric_events(label, amount, created_at) VALUES(?, ?, ?)")
    .bind(label, amount, nowIso())
    .run();
}

async function trackUnique(env: Env, type: string, keys: string[]): Promise<number> {
  let added = 0;
  const unique = [...new Set(keys.filter(Boolean))];
  for (const key of unique) {
    const result = await env.DB.prepare(
      "INSERT OR IGNORE INTO unique_items(type, item_key, first_seen) VALUES(?, ?, ?)"
    ).bind(type, key, nowIso()).run();
    added += result.meta.changes ?? 0;
  }
  return added;
}

async function trackPage(env: Env, path: string, elapsed: number): Promise<void> {
  const label = pageNames[path] ?? "Unknown";
  const ms = Math.round(elapsed);
  await Promise.all([
    metric(env, "page_loads"),
    metric(env, `page:${label}`),
    metric(env, "response_samples"),
    metric(env, "last_response_ms", ms),
    env.DB.prepare("INSERT INTO metrics(key,value) VALUES('last_load_ms',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(ms).run(),
    event(env, `${label} page loaded`)
  ]);
}

function requireWriteToken(request: Request, env: Env): Response | null {
  const token = env.TASK_WRITE_TOKEN?.trim();
  if (!token) return null;
  if (request.headers.get("x-task-token") === token) return null;
  return json({ ok: false, error: "Missing or invalid task token" }, 401);
}

async function tasks(env: Env): Promise<Task[]> {
  const { results } = await env.DB.prepare(
    "SELECT id, title, notes, due, priority, done, created_at, updated_at, completed_at FROM tasks ORDER BY done, due, created_at"
  ).all<{
    id: string;
    title: string;
    notes: string;
    due: string;
    priority: "low" | "normal" | "high";
    done: number;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
  }>();
  return results.map((row) => ({
    id: row.id,
    title: row.title,
    notes: row.notes,
    due: row.due,
    priority: row.priority,
    done: Boolean(row.done),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  }));
}

async function upsertTask(env: Env, input: Partial<Task>): Promise<Task[]> {
  const id = String(input.id || crypto.randomUUID());
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Task title is required");
  const existing = await env.DB.prepare("SELECT done FROM tasks WHERE id = ?").bind(id).first<{ done: number }>();
  const done = input.done !== undefined ? Boolean(input.done) : Boolean(existing?.done);
  const completedAt = done ? (input.completedAt || nowIso()) : null;
  await env.DB.prepare(
    `INSERT INTO tasks(id, title, notes, due, priority, done, created_at, updated_at, completed_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       notes = excluded.notes,
       due = excluded.due,
       priority = excluded.priority,
       done = excluded.done,
       updated_at = excluded.updated_at,
       completed_at = excluded.completed_at`
  ).bind(
    id,
    title,
    String(input.notes || "").trim(),
    String(input.due || ""),
    input.priority === "high" || input.priority === "low" ? input.priority : "normal",
    done ? 1 : 0,
    input.createdAt || nowIso(),
    nowIso(),
    completedAt
  ).run();
  if (!existing) {
    await metric(env, "tasks_created");
    await event(env, "Tasks created");
  } else if (!existing.done && done) {
    await metric(env, "tasks_completed");
    await event(env, "Tasks completed");
  } else if (existing.done && !done) {
    await metric(env, "tasks_reopened");
    await event(env, "Tasks reopened");
  }
  return tasks(env);
}

async function deleteTask(env: Env, id: string): Promise<Task[]> {
  const result = await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
  if ((result.meta.changes ?? 0) > 0) {
    await metric(env, "tasks_deleted");
    await event(env, "Tasks deleted");
  }
  return tasks(env);
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return cleanText(match?.[1] ?? "");
}

async function fetchFeed(source: string, url: string): Promise<Story[]> {
  try {
    const response = await fetch(url, { headers: { "user-agent": "morning-dashboard/2.0" } });
    const body = await response.text();
    return [...body.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, 6).map((match) => {
      const block = match[0];
      return {
        source,
        title: extractTag(block, "title"),
        summary: extractTag(block, "description"),
        url: extractTag(block, "link"),
        published: extractTag(block, "pubDate")
      };
    }).filter((story) => story.title);
  } catch {
    return [{
      source,
      title: `Could not fetch ${source}`,
      summary: "The source did not respond.",
      url,
      published: ""
    }];
  }
}

async function refreshNews(env: Env): Promise<Story[]> {
  const groups = await Promise.all(FEEDS.map(([source, url]) => fetchFeed(source, url)));
  const stories = groups.flat().sort((a, b) =>
    Date.parse(b.published || "0") - Date.parse(a.published || "0")
  ).slice(0, 24);
  await env.DB.prepare(
    "INSERT INTO news_cache(id, payload, refreshed_at) VALUES(1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, refreshed_at = excluded.refreshed_at"
  ).bind(JSON.stringify(stories), nowIso()).run();
  const added = await trackUnique(env, "story", stories.map((story) => story.url || story.title));
  await metric(env, "news_refreshes");
  if (added) await event(env, "New stories served", added);
  return stories;
}

async function cachedStories(env: Env): Promise<Story[]> {
  const row = await env.DB.prepare("SELECT payload FROM news_cache WHERE id = 1").first<{ payload: string }>();
  if (!row) return refreshNews(env);
  try {
    return JSON.parse(row.payload) as Story[];
  } catch {
    return refreshNews(env);
  }
}

async function quickbaseStatus(): Promise<Record<string, string>> {
  try {
    const body = await (await fetch(QUICKBASE_STATUS_URL, { headers: { "user-agent": "morning-dashboard/2.0" } })).text();
    const plain = cleanText(body);
    const label = plain.match(/Login\s+(Normal|Performance issues|Service disruption|Scheduled maintenance)/i)?.[1] ?? "Normal";
    const uptime = plain.match(/TOTAL UPTIME FOR THE LAST 90 DAYS\s+([0-9.]+%)/i)?.[1];
    const lower = label.toLowerCase();
    const state = lower.includes("disruption") ? "disruption" : lower.includes("performance") || lower.includes("maintenance") ? "warning" : "normal";
    return { state, label, detail: uptime ? `${uptime} uptime` : "Live status", url: QUICKBASE_STATUS_URL + "#!/" };
  } catch {
    return { state: "unknown", label: "Status unavailable", detail: "Open Quickbase", url: QUICKBASE_STATUS_URL + "#!/" };
  }
}

function qbDate(value: string): Date | null {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? new Date(num) : null;
}

function qbDateLabel(value: string): string {
  const parsed = qbDate(value);
  return parsed ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(parsed) : "";
}

async function quickbaseReleases(env: Env): Promise<{ records: ReleaseNote[]; generated: string; sourceUrl: string }> {
  const params = new URLSearchParams({
    a: "API_DoQuery",
    qid: "21",
    clist: "3.12.29.7.22.8.9.10.16.17.25",
    fmt: "structured",
    options: "num-40"
  });
  const body = await (await fetch(`https://resources.quickbase.com/db/${QUICKBASE_RELEASES_TABLE}?${params}`)).text();
  const records = [...body.matchAll(/<record\b[\s\S]*?<\/record>/gi)].map((record) => {
    const fields = new Map<string, string>();
    for (const field of record[0].matchAll(/<f id="([^"]*)">([\s\S]*?)<\/f>/gi)) {
      fields.set(field[1], cleanText(field[2]));
    }
    const released = qbDate(fields.get("10") ?? "");
    const expected = qbDate(fields.get("9") ?? "");
    const display = released ?? expected;
    return {
      id: fields.get("3") ?? "",
      type: fields.get("12") ?? "",
      status: fields.get("29") ?? "",
      area: fields.get("7") ?? "",
      feature: fields.get("22") ?? "",
      summary: fields.get("17") || fields.get("8") || "",
      expected: qbDateLabel(fields.get("9") ?? ""),
      released: qbDateLabel(fields.get("10") ?? ""),
      date: display ? qbDateLabel(String(display.getTime())) : "",
      dateSort: display ? display.toISOString() : "",
      url: fields.get("25") || QUICKBASE_RELEASES_URL,
      isNew: Boolean(released && released.getTime() >= Date.now() - 30 * 86400000)
    };
  }).sort((a, b) => b.dateSort.localeCompare(a.dateSort));
  const added = await trackUnique(env, "release", records.map((item) => item.id || item.url));
  if (added) await event(env, "Unique Releases", added);
  return { records, generated: displayStamp(), sourceUrl: QUICKBASE_RELEASES_URL };
}

async function companyNews(env: Env): Promise<{ records: CompanyStory[]; generated: string; sourceUrl: string }> {
  const body = await (await fetch(VTG_NEWS_URL, { headers: { "user-agent": "Mozilla/5.0 morning-dashboard/2.0" } })).text();
  const records = [...body.matchAll(/<article\b([\s\S]*?)<\/article>/gi)].map((article) => {
    const block = article[1];
    const link = block.match(/elementor-post__title[\s\S]*?<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    const dateText = cleanText(block.match(/elementor-post-date[^>]*>([\s\S]*?)<\/span>/i)?.[1] ?? "");
    const summary = cleanText(block.match(/elementor-post__excerpt[\s\S]*?<p>([\s\S]*?)<\/p>/i)?.[1] ?? "");
    const parsed = Date.parse(dateText);
    return {
      title: cleanText(link?.[2] ?? ""),
      date: dateText,
      dateSort: Number.isFinite(parsed) ? new Date(parsed).toISOString() : "",
      summary,
      url: link?.[1] ?? VTG_NEWS_URL,
      isNew: Number.isFinite(parsed) && parsed >= Date.now() - 45 * 86400000
    };
  }).filter((item) => item.title).sort((a, b) => b.dateSort.localeCompare(a.dateSort)).slice(0, 30);
  const added = await trackUnique(env, "company", records.map((item) => item.url || item.title));
  if (added) await event(env, "Unique Company News", added);
  return { records, generated: displayStamp(), sourceUrl: VTG_NEWS_URL };
}

async function metrics(env: Env): Promise<Record<string, unknown>> {
  const [{ results: rows }, open, complete, stories, releases, company, { results: events }] = await Promise.all([
    env.DB.prepare("SELECT key, value FROM metrics").all<{ key: string; value: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE done = 0").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM tasks WHERE done = 1").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM unique_items WHERE type = 'story'").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM unique_items WHERE type = 'release'").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM unique_items WHERE type = 'company'").first<{ count: number }>(),
    env.DB.prepare("SELECT label, amount, created_at FROM metric_events ORDER BY id DESC LIMIT 12").all()
  ]);
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    ...values,
    current_open_tasks: open?.count ?? 0,
    current_completed_tasks: complete?.count ?? 0,
    unique_stories_served: stories?.count ?? 0,
    unique_release_notes_loaded: releases?.count ?? 0,
    unique_company_news_loaded: company?.count ?? 0,
    events,
    generated: displayStamp()
  };
}

function layout(title: string, mark: string, active: string, body: string, script = ""): string {
  const nav = [
    ["News", "news.html"],
    ["Tasks", "tasks.html"],
    ["Releases", "quickbase-releases.html"],
    ["Company", "company-news.html"],
    ["Metrics", "metrics.html"]
  ].map(([label, href]) => `<a href="${href}"${label === active ? ' aria-current="page"' : ""}>${label}</a>`).join("");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>${baseCss()}</style>
</head>
<body>
  <main class="shell">
    <header class="topbar">
      <div class="brand"><div class="mark">${mark}</div><div><h1>${escapeHtml(title)}</h1><div class="subtle">${displayDate()}</div></div></div>
      <nav class="nav" aria-label="Dashboard pages">${nav}</nav>
      <div class="clock"><strong id="clock">${displayTime()}</strong><span>ET</span></div>
    </header>
    <div class="scroll-area">${body}</div>
  </main>
  <script>${sharedJs()}${script}</script>
</body>
</html>`;
}

function baseCss(): string {
  return `
:root{color-scheme:light;--ink:#161713;--muted:#60645b;--line:#dcdfd2;--paper:#fbfbf6;--panel:#fff;--accent:#c73c2d;--teal:#0f766e;--gold:#c18b20;--shadow:0 18px 50px rgba(22,23,19,.08)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%;text-size-adjust:100%}body{margin:0;height:100dvh;overflow:hidden;background:linear-gradient(90deg,rgba(22,23,19,.04) 1px,transparent 1px),linear-gradient(180deg,rgba(22,23,19,.035) 1px,transparent 1px),var(--paper);background-size:44px 44px;color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;letter-spacing:0}a{color:inherit;text-decoration:none}button,input,select,textarea{font:inherit;font-size:16px}.shell{width:min(1180px,calc(100vw - 32px));height:100dvh;margin:0 auto;padding:28px 0 0;display:flex;flex-direction:column}.topbar{flex:0 0 auto;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:18px 16px;padding-bottom:22px;border-bottom:1px solid var(--line)}.brand{display:flex;align-items:center;gap:12px;min-width:0;grid-column:1;grid-row:1}.mark{width:38px;height:38px;display:grid;place-items:center;border-radius:8px;background:var(--ink);color:var(--paper);font-weight:800;font-size:18px}h1{margin:0;font-size:clamp(1.35rem,2vw,2rem);line-height:1}.subtle{margin-top:5px;color:var(--muted);font-size:.92rem}.clock{grid-column:2;grid-row:1;text-align:right;color:var(--muted);font-size:.92rem;white-space:nowrap}.clock strong{display:block;color:var(--ink);font-size:1.35rem;line-height:1.1;margin-bottom:3px}.nav{display:flex;gap:8px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;grid-column:1/-1;grid-row:2}.nav::-webkit-scrollbar{display:none}.nav a{display:inline-flex;align-items:center;white-space:nowrap;min-height:36px;padding:0 12px;border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.7);color:var(--muted);font-size:.9rem;font-weight:700}.nav a[aria-current=page]{border-color:var(--ink);color:var(--ink);background:var(--panel)}.scroll-area{flex:1 1 auto;min-height:0;overflow-y:auto;padding-bottom:42px}.panel,.card{border:1px solid var(--line);border-radius:8px;background:rgba(255,255,255,.9);box-shadow:none}.panel{margin-top:24px;padding:20px;display:grid;gap:14px}.panel>h2{margin:0;font-size:.82rem;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}.panel>p{margin:0}.panel>a:not(.card){color:var(--teal);font-weight:700;font-size:.92rem}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}.grid.two{grid-template-columns:repeat(2,minmax(0,1fr))}.bars{display:grid;gap:9px;margin-top:10px}.bar-row{display:grid;grid-template-columns:minmax(72px,max-content) 1fr auto;align-items:center;gap:10px}.bar-track{height:7px;background:#ecefe4;border-radius:999px;overflow:hidden}.bar-fill{height:100%;background:var(--teal);border-radius:999px}.bar-val{font-size:.82rem;font-weight:700;min-width:24px;text-align:right;color:var(--ink)}.card{padding:18px}.meta,.pill{color:var(--muted);font-size:.78rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.pill{display:inline-flex;align-items:center;min-height:25px;border:1px solid var(--line);border-radius:999px;padding:4px 9px;background:var(--panel);margin:0 5px 5px 0}.pill.new,.pill.high{color:var(--accent);border-color:rgba(199,60,45,.35)}.pill.upcoming,.pill.low{color:var(--gold);border-color:rgba(193,139,32,.35)}.pill.released,.pill.normal{color:var(--teal);border-color:rgba(15,118,110,.35)}.lead{min-height:320px;margin-top:24px;padding:clamp(24px,4vw,44px);display:flex;flex-direction:column;justify-content:flex-end;border:1px solid var(--ink);border-radius:8px;background:linear-gradient(145deg,rgba(199,60,45,.12),transparent 40%),linear-gradient(315deg,rgba(15,118,110,.14),transparent 38%),var(--panel);box-shadow:var(--shadow)}.lead h2{max-width:780px;margin:12px 0 0;font-family:Georgia,"Times New Roman",serif;font-size:clamp(2.1rem,3.8vw,4.15rem);line-height:1;font-weight:600}.lead p,.card p{color:var(--muted);line-height:1.45}.source-list,.filters{display:flex;gap:6px;flex-wrap:wrap}.source-list button,.refresh{min-height:36px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--muted);padding:0 11px;font-size:.85rem;font-weight:700;white-space:nowrap;cursor:pointer}.source-list button.active{border-color:var(--ink);background:var(--ink);color:var(--paper)}.filter-pill{cursor:pointer;text-transform:uppercase}.filter-pill.active{background:#f7f8f1;border-color:currentColor}.story.hidden{display:none}.section-title{display:flex;justify-content:space-between;align-items:center;margin:34px 0 14px}.section-title h2{margin:0;font-size:.9rem;text-transform:uppercase;letter-spacing:.12em}.status{display:flex;align-items:center;gap:12px}.status-dot{width:13px;height:13px;border-radius:50%;background:var(--muted)}.status[data-state=normal] .status-dot{background:var(--teal)}.status[data-state=warning] .status-dot{background:var(--gold)}.status[data-state=disruption] .status-dot{background:var(--accent)}.task-card{display:grid;grid-template-columns:28px minmax(0,1fr) 40px;gap:12px;align-items:start}.task-card.done{opacity:.62}.task-card input[type=checkbox]{width:20px;height:20px;accent-color:var(--teal)}.task-card h3{text-decoration:none;margin:.1rem 0}.task-card.done h3{text-decoration:line-through}.delete{width:34px;height:34px;min-height:34px;border:1px solid var(--line);border-radius:8px;background:transparent;color:var(--muted)}.company-list{gap:16px;align-items:start}.company-card{display:flex;flex-direction:column;min-height:245px;padding:20px}.company-card h3{margin:12px 0 0;font-size:1.08rem;line-height:1.22}.company-card p{margin:12px 0 0;line-height:1.42}.company-card a{margin-top:auto;padding-top:14px;color:var(--teal);font-weight:800}.release-card h3{margin:12px 0 0;font-size:1.08rem;line-height:1.22}.release-card p{margin:12px 0 0}.release-card a{display:inline-flex;margin-top:12px;color:var(--teal);font-weight:800}.fab{position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));width:48px;height:48px;min-height:48px;border-radius:50%;border:1px solid var(--ink);background:var(--ink);color:var(--paper);font-size:1.7rem;box-shadow:var(--shadow);z-index:80}.modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(22,23,19,.34);z-index:90}.modal.open{display:flex}.modal-panel{width:min(520px,100%);max-height:calc(100dvh - 40px);overflow:auto;border:1px solid var(--line);border-radius:8px;background:var(--panel);box-shadow:0 24px 70px rgba(22,23,19,.22);padding:20px}.modal-head{display:flex;justify-content:space-between;align-items:center}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}label{display:grid;gap:7px;color:var(--muted);font-size:.78rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;margin-top:12px}input,select,textarea{width:100%;min-height:52px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--ink);padding:0 14px}textarea{min-height:132px;padding-top:14px;line-height:1.45}.button-row{display:flex;gap:10px;margin-top:14px}.button-row button,.modal-head button{min-height:44px;border:1px solid var(--ink);border-radius:8px;background:var(--ink);color:var(--paper);padding:0 14px;font-weight:800}.button-row .secondary,.modal-head button{border-color:var(--line);background:var(--panel);color:var(--muted)}.section-toggle{width:100%;min-height:44px;border:0;border-bottom:1px solid var(--line);background:transparent;color:var(--ink);display:flex;justify-content:space-between;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.section-body{display:grid;gap:12px;margin:12px 0}.collapsed .section-body{display:none}.empty{padding:24px;border:1px dashed var(--line);border-radius:8px;color:var(--muted);background:rgba(255,255,255,.55)}.gauge{--pct:0;width:132px;height:132px;border-radius:50%;display:grid;place-items:center;margin:auto;background:conic-gradient(var(--teal) calc(var(--pct)*1%),#ecefe4 0)}.gauge strong{width:96px;height:96px;border-radius:50%;display:grid;place-items:center;background:var(--panel);font-size:1.4rem}@media(max-width:900px){.grid,.grid.two{grid-template-columns:1fr}.row{grid-template-columns:1fr}.company-card{min-height:0}}@media(max-width:560px){.shell{width:min(calc(100% - 22px),1180px);padding-top:18px}.clock{align-self:start;padding-top:3px}.lead h2{font-size:2.15rem}}@view-transition{navigation:auto}@keyframes _stl{to{transform:translateX(-100%)}}@keyframes _sfr{from{transform:translateX(100%)}}@keyframes _str{to{transform:translateX(100%)}}@keyframes _sfl{from{transform:translateX(-100%)}}html[data-swipe=left]::view-transition-old(root){animation:_stl 280ms ease;z-index:1}html[data-swipe=left]::view-transition-new(root){animation:_sfr 280ms ease;z-index:2}html[data-swipe=right]::view-transition-old(root){animation:_str 280ms ease;z-index:1}html[data-swipe=right]::view-transition-new(root){animation:_sfl 280ms ease;z-index:2}
`;
}

function sharedJs(): string {
  return `
(function(){const d=sessionStorage.getItem("swipe-dir");if(d){document.documentElement.dataset.swipe=d;sessionStorage.removeItem("swipe-dir")}})();function esc(v){return String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}function safeUrl(v){const s=String(v||"").trim();return /^https?:\\/\\//i.test(s)?s:"#"}const clock=document.getElementById("clock");function tick(){if(clock)clock.textContent=new Intl.DateTimeFormat([], {hour:"numeric",minute:"2-digit",timeZone:"America/New_York"}).format(new Date())}function pull(){const area=document.querySelector(".scroll-area");if(!area||!("ontouchstart"in window))return;let y=null,ok=false;area.addEventListener("touchstart",e=>{if(area.scrollTop<=0){y=e.touches[0].clientY;ok=false}else y=null},{passive:true});area.addEventListener("touchmove",e=>{if(y===null||area.scrollTop>0)return;ok=e.touches[0].clientY-y>90},{passive:true});area.addEventListener("touchend",()=>{if(ok)location.reload();y=null;ok=false},{passive:true})}function swipe(){const pages=["/news.html","/tasks.html","/quickbase-releases.html","/company-news.html","/metrics.html"];const cur=pages.indexOf(location.pathname);if(cur===-1)return;const area=document.querySelector(".scroll-area");if(!area)return;let x0=null,y0=null;area.addEventListener("touchstart",function(e){x0=e.touches[0].clientX;y0=e.touches[0].clientY},{passive:true});area.addEventListener("touchend",function(e){if(x0===null)return;const dx=e.changedTouches[0].clientX-x0,dy=e.changedTouches[0].clientY-y0;x0=null;if(Math.abs(dx)<60||Math.abs(dx)<Math.abs(dy)*1.5)return;if(dx<0&&cur<pages.length-1){sessionStorage.setItem("swipe-dir","left");location.href=pages[cur+1]}else if(dx>0&&cur>0){sessionStorage.setItem("swipe-dir","right");location.href=pages[cur-1]}},{passive:true})}tick();pull();swipe();setInterval(tick,30000);window.addEventListener("load",function(){setTimeout(function(){["/api/quickbase-status","/api/quickbase-releases","/api/company-news","/api/metrics","/api/tasks"].forEach(function(u){fetch(u).catch(function(){})})},800)});
`;
}

async function newsPage(env: Env): Promise<string> {
  const [stories, allTasks] = await Promise.all([cachedStories(env), tasks(env)]);
  const openTasks = allTasks.filter((task) => !task.done).length;
  const counts = new Map<string, number>();
  stories.forEach((story) => counts.set(story.source, (counts.get(story.source) ?? 0) + 1));
  const [lead, ...rest] = stories;
  const sources = [...counts.entries()].map(([source, count]) => `<button type="button" data-source="${escapeHtml(source)}">${escapeHtml(source)} <strong>${count}</strong></button>`).join("");
  const cards = rest.map((story, index) => storyCard(story, index + 2)).join("");
  const body = `
    <section class="panel">
      <div class="status" id="qb-status" data-state="unknown"><span class="status-dot"></span><strong id="qb-label">Quickbase</strong><span class="meta" id="qb-detail">Checking status…</span><a id="qb-link" href="${escapeHtml(safeUrl(QUICKBASE_STATUS_URL))}" target="_blank" rel="noreferrer">Open</a></div>
      <a class="card" href="tasks.html"><span class="meta">Tasks</span><h2>${openTasks}</h2></a>
      <div class="source-list">${sources}</div>
    </section>
    ${lead ? `<section class="lead story" data-source="${escapeHtml(lead.source)}"><span class="meta">${escapeHtml(lead.source)} / ${escapeHtml(lead.published)}</span><h2><a href="${escapeHtml(safeUrl(lead.url))}" target="_blank" rel="noreferrer">${escapeHtml(lead.title)}</a></h2><p>${escapeHtml(shorten(lead.summary, 300))}</p></section>` : ""}
    <section><div class="section-title"><h2 id="news-start">Priority Scan</h2><span class="meta">${stories.length} stories</span></div><div class="grid">${cards}</div></section>`;
  const script = `
fetch("/api/quickbase-status").then(r=>r.json()).then(d=>{const el=document.getElementById("qb-status");if(!el)return;el.dataset.state=d.state||"unknown";document.getElementById("qb-label").textContent="Quickbase "+(d.label||"");document.getElementById("qb-detail").textContent=d.detail||"";const lnk=document.getElementById("qb-link");if(lnk&&d.url)lnk.href=safeUrl(d.url)}).catch(()=>{});const active=new Set();function apply(){const has=active.size>0;document.querySelectorAll(".story[data-source]").forEach(card=>card.classList.toggle("hidden",has&&!active.has(card.dataset.source)));document.querySelectorAll(".source-list button").forEach(btn=>btn.classList.toggle("active",active.has(btn.dataset.source)))}document.querySelectorAll(".source-list button").forEach(btn=>btn.addEventListener("click",()=>{const source=btn.dataset.source;if(active.has(source))active.delete(source);else active.add(source);apply();document.getElementById("news-start")?.scrollIntoView({behavior:"smooth",block:"start"})}));
`;
  return layout("Morning Briefing", "M", "News", body, script);
}

function storyCard(story: Story, index: number): string {
  return `<article class="card story" data-source="${escapeHtml(story.source)}"><span class="meta">${String(index).padStart(2, "0")} / ${escapeHtml(story.source)}</span><h3><a href="${escapeHtml(safeUrl(story.url))}" target="_blank" rel="noreferrer">${escapeHtml(story.title)}</a></h3><p>${escapeHtml(shorten(story.summary, 190))}</p></article>`;
}

async function tasksPage(env: Env): Promise<string> {
  const body = `<section class="panel"><div id="tasks"></div></section><button class="fab" id="open">+</button><div class="modal" id="modal"><div class="modal-panel"><div class="modal-head"><h2 id="modal-title">Add Task</h2><button id="close">x</button></div><label>Task<input id="title" required></label><div class="row"><label>Due<input id="due" type="date"></label><label>Priority<select id="priority"><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option></select></label></div><label>Notes<textarea id="notes"></textarea></label><div class="button-row"><button id="save">Add task</button><button class="secondary" id="clear">Clear form</button></div><p class="meta" id="status"></p></div></div>`;
  const script = `
let list=[],editing=null;const modal=document.getElementById("modal"),title=document.getElementById("title"),due=document.getElementById("due"),priority=document.getElementById("priority"),notes=document.getElementById("notes"),status=document.getElementById("status");const sections=[["today","Today"],["this-week","This Week"],["next-week","Next Week"],["next-month","Next Month"],["completed","Complete"]];const collapsed=new Set(["completed"]);function day(v=new Date()){const d=new Date(v);d.setHours(0,0,0,0);return d}function add(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}function endWeek(d){const x=day(d);x.setDate(x.getDate()+7-x.getDay());return x}function bucket(t){if(t.done)return"completed";const today=day(),due=t.due?day(t.due+"T00:00:00"):null;if(!due||due<=today)return"today";const end=endWeek(today);if(due<=end)return"this-week";if(due<=add(end,7))return"next-week";return"next-month"}function card(t){return '<article class="card task-card '+(t.done?"done":"")+'" data-id="'+t.id+'"><input type="checkbox" '+(t.done?"checked":"")+'><div><h3>'+esc(t.title)+'</h3><div><span class="pill '+esc(t.priority)+'">'+esc(t.priority)+'</span>'+(t.due?'<span class="pill">Due '+esc(t.due)+'</span>':"")+'</div>'+(t.notes?'<p>'+esc(t.notes)+'</p>':"")+'</div><button class="delete">x</button></article>'}function render(){const groups=Object.fromEntries(sections.map(s=>[s[0],[]]));list.forEach(t=>groups[bucket(t)].push(t));document.getElementById("tasks").innerHTML=sections.map(([id,label])=>'<section class="'+(collapsed.has(id)?"collapsed ":"")+'task-section" data-section="'+id+'"><button class="section-toggle"><span>'+label+'</span><span>'+groups[id].length+'</span></button><div class="section-body">'+(groups[id].length?groups[id].map(card).join(""):'<div class="empty">No tasks here.</div>')+'</div></section>').join("")}async function load(){list=await(await fetch("/api/tasks")).json();render()}function open(t=null){editing=t?.id||null;document.getElementById("modal-title").textContent=t?"Edit Task":"Add Task";document.getElementById("save").textContent=t?"Save task":"Add task";title.value=t?.title||"";due.value=t?.due||"";priority.value=t?.priority||"normal";notes.value=t?.notes||"";modal.classList.add("open");title.focus()}function close(){modal.classList.remove("open");editing=null;title.value="";due.value="";priority.value="normal";notes.value="";status.textContent=""}async function save(){if(!title.value.trim()){status.textContent="Add a task title first.";return}const existing=list.find(t=>t.id===editing);const payload={id:editing||crypto.randomUUID(),title:title.value.trim(),due:due.value,priority:priority.value,notes:notes.value.trim(),done:existing?.done||false,createdAt:existing?.createdAt||new Date().toISOString()};list=await(await fetch("/api/tasks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)})).json();close();render()}document.getElementById("open").onclick=()=>open();document.getElementById("close").onclick=close;document.getElementById("clear").onclick=()=>{title.value="";due.value="";priority.value="normal";notes.value=""};document.getElementById("save").onclick=save;modal.addEventListener("click",e=>{if(e.target===modal)close()});document.getElementById("tasks").addEventListener("click",async e=>{const section=e.target.closest(".section-toggle");if(section){const id=section.closest(".task-section").dataset.section;collapsed.has(id)?collapsed.delete(id):collapsed.add(id);render();return}const del=e.target.closest(".delete");const cardEl=e.target.closest(".task-card");if(del&&cardEl){list=await(await fetch("/api/tasks/"+cardEl.dataset.id,{method:"DELETE"})).json();render();return}if(e.target.type==="checkbox"&&cardEl){const t=list.find(x=>x.id===cardEl.dataset.id);t.done=e.target.checked;list=await(await fetch("/api/tasks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(t)})).json();render();return}if(cardEl)open(list.find(x=>x.id===cardEl.dataset.id))});load();
`;
  return layout("Morning Tasks", "T", "Tasks", body, script);
}

async function releasesPage(): Promise<string> {
  const body = `<section class="panel"><h2>Release Notes</h2><p id="release-status">Loading Quickbase release records...</p><div class="filters"><button class="pill filter-pill active" data-filter="all">All</button><button class="pill filter-pill new" data-filter="new">New</button><button class="pill filter-pill upcoming" data-filter="upcoming">Upcoming</button><button class="pill filter-pill released" data-filter="released">Released</button></div><a href="${QUICKBASE_RELEASES_URL}" target="_blank" rel="noreferrer">Open source app</a></section><section class="grid two" id="release-list"></section>`;
  const script = listPageScript("/api/quickbase-releases", "release");
  return layout("Quickbase Releases", "R", "Releases", body, script);
}

async function companyPage(): Promise<string> {
  const body = `<section class="panel"><h2>Company News</h2><p id="company-status">Loading company news...</p><a href="${VTG_NEWS_URL}" target="_blank" rel="noreferrer">Open source page</a></section><section class="grid two company-list" id="company-list"></section>`;
  const script = listPageScript("/api/company-news", "company");
  return layout("Company News", "C", "Company", body, script);
}

function listPageScript(api: string, kind: "release" | "company"): string {
  if (kind === "release") {
    return `
let records=[],filter="all";function statusOf(r){return String(r.status||"").toLowerCase().includes("released")?"released":"upcoming"}function show(r){if(filter==="all")return true;if(filter==="new")return r.isNew;if(filter==="released")return statusOf(r)==="released";return statusOf(r)==="upcoming"}function render(){document.getElementById("release-list").innerHTML=records.filter(show).map(r=>'<article class="card release-card"><span class="pill '+statusOf(r)+'">'+esc(statusOf(r))+'</span>'+(r.isNew?'<span class="pill new">New</span>':"")+'<h3>'+esc(r.feature||r.summary||"Quickbase release")+'</h3><div class="meta">'+esc(r.area||"")+'</div><p>'+esc(r.summary||"")+'</p><a href="'+esc(safeUrl(r.url))+'" target="_blank" rel="noreferrer">View note</a></article>').join("")||'<div class="empty">No release notes match this filter.</div>'}document.querySelectorAll(".filters button").forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll(".filters button").forEach(x=>x.classList.toggle("active",x===b));render()});fetch("${api}").then(r=>r.json()).then(d=>{records=d.records||[];const n=records.filter(r=>r.isNew).length;document.getElementById("release-status").textContent=records.length+" release notes loaded / "+n+" new. Updated "+d.generated+".";render()});
`;
  }
  return `
fetch("${api}").then(r=>r.json()).then(d=>{document.getElementById("company-status").textContent=(d.records||[]).length+" company stories loaded. Updated "+d.generated+".";document.getElementById("company-list").innerHTML=(d.records||[]).map(r=>'<article class="card company-card">'+(r.isNew?'<span class="pill new">New</span>':"")+'<div class="meta">'+esc(r.date)+'</div><h3>'+esc(r.title)+'</h3><p>'+esc(r.summary)+'</p><a href="'+esc(safeUrl(r.url))+'" target="_blank" rel="noreferrer">Read more</a></article>').join("")});
`;
}

function metricsPage(): string {
  const body = `<section class="panel"><h2>Live Instrumentation</h2><p id="metrics-status">Loading...</p><button class="refresh" id="refresh">Refresh</button></section><section class="grid" id="gauges"></section><section class="grid two" id="stats"></section><section class="grid two" id="bars"></section><section class="grid two"><div class="card"><p class="meta">Recent Events</p><div id="events"></div></div></section>`;
  const script = `
function fmt(v){return Math.round(Number(v||0)).toLocaleString()}
function gauge(l,v,max){const pct=max?Math.max(0,Math.min(100,Number(v||0)/max*100)):0;return'<article class="card"><div class="gauge" style="--pct:'+pct.toFixed(1)+'"><strong>'+fmt(v)+'</strong></div><p class="meta" style="text-align:center;margin-top:8px">'+l+'</p></article>'}
function stat(l,v,unit){return'<article class="card"><p class="meta">'+l+'</p><h2>'+fmt(v)+(unit?'<span style="font-size:1rem;font-weight:500"> '+esc(unit)+'</span>':'')+'</h2></article>'}
function bars(title,rows){const max=Math.max(1,...rows.map(r=>r[1]||0));return'<article class="card"><p class="meta">'+title+'</p><div class="bars">'+rows.map(([l,v])=>'<div class="bar-row"><span>'+esc(String(l))+'</span><div class="bar-track"><div class="bar-fill" style="width:'+Math.round((v||0)/max*100)+'%"></div></div><span class="bar-val">'+fmt(v)+'</span></div>').join('')+'</div></article>'}
async function load(){
  const d=await(await fetch("/api/metrics")).json();
  const gmax=Math.max(100,d.page_loads||0,d.unique_stories_served||0,d.unique_release_notes_loaded||0,d.unique_company_news_loaded||0);
  document.getElementById("gauges").innerHTML=[gauge("Page Loads",d.page_loads,gmax),gauge("Unique Stories",d.unique_stories_served,gmax),gauge("Unique Releases",d.unique_release_notes_loaded,gmax),gauge("Unique Company News",d.unique_company_news_loaded,gmax)].join("");
  const avg=d.response_samples?Math.round((d.last_response_ms||0)/d.response_samples):0;
  document.getElementById("stats").innerHTML=[stat("Avg Load",avg,"ms"),stat("Last Load",d.last_load_ms,"ms"),stat("API Samples",d.response_samples),stat("News Refreshes",d.news_refreshes),stat("Tasks Created",d.tasks_created),stat("Tasks Completed",d.tasks_completed),stat("Tasks Deleted",d.tasks_deleted),stat("Open Tasks",d.current_open_tasks)].join("");
  document.getElementById("bars").innerHTML=[
    bars("Page Loads",[["News",d["page:News"]],["Tasks",d["page:Tasks"]],["Releases",d["page:Releases"]],["Company",d["page:Company"]],["Metrics",d["page:Metrics"]]]),
    bars("API Calls",[["QB Status",d["api:quickbase-status"]],["Tasks",d["api:tasks"]],["Company",d["api:company-news"]],["Releases",d["api:quickbase-releases"]],["Tasks Save",d["api:tasks-save"]]]),
    bars("Task Flow",[["Created",d.tasks_created],["Completed",d.tasks_completed],["Deleted",d.tasks_deleted],["Reopened",d.tasks_reopened]])
  ].join("");
  document.getElementById("events").innerHTML=(d.events||[]).map(e=>'<p><strong>'+esc(e.label)+'</strong> <span class="meta">'+fmt(e.amount)+' / '+esc(e.created_at)+'</span></p>').join("")||'<p class="meta">No events yet.</p>';
  document.getElementById("metrics-status").textContent="Updated "+d.generated+".";
}
document.getElementById("refresh").onclick=load;load();setInterval(load,60000);
`;
  return layout("Dashboard Metrics", "M", "Metrics", body, script);
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const started = performance.now();
  const url = new URL(request.url);
  const path = url.pathname === "/" || url.pathname === "/dashboard.html" ? "/news.html" :
    url.pathname === "/releases.html" ? "/quickbase-releases.html" :
    url.pathname === "/company.html" ? "/company-news.html" : url.pathname;

  if (path !== url.pathname) {
    return Response.redirect(new URL(path, url.origin).toString(), 302);
  }

  if (path === "/api/tasks") {
    if (request.method === "GET") {
      ctx.waitUntil(metric(env, "api:tasks"));
      return json(await tasks(env), 200, 15);
    }
    const denied = requireWriteToken(request, env);
    if (denied) return denied;
    ctx.waitUntil(metric(env, "api:tasks-save"));
    const payload = await request.json<Partial<Task>>();
    return json(await upsertTask(env, payload));
  }
  if (path.startsWith("/api/tasks/") && request.method === "DELETE") {
    const denied = requireWriteToken(request, env);
    if (denied) return denied;
    return json(await deleteTask(env, decodeURIComponent(path.replace("/api/tasks/", ""))));
  }
  if (path === "/api/quickbase-status") {
    ctx.waitUntil(metric(env, "api:quickbase-status"));
    return json(await quickbaseStatus(), 200, 300);
  }
  if (path === "/api/quickbase-releases") {
    await metric(env, "api:quickbase-releases");
    return json(await quickbaseReleases(env), 200, 600);
  }
  if (path === "/api/company-news") {
    await metric(env, "api:company-news");
    return json(await companyNews(env), 200, 600);
  }
  if (path === "/api/metrics") return json(await metrics(env), 200, 30);
  if (path === "/api/refresh-news" && request.method === "POST") {
    const denied = requireWriteToken(request, env);
    if (denied) return denied;
    return json({ stories: await refreshNews(env), refreshed: displayStamp() });
  }

  let body: string | null = null;
  if (path === "/news.html") body = await newsPage(env);
  if (path === "/tasks.html") body = await tasksPage(env);
  if (path === "/quickbase-releases.html") body = await releasesPage();
  if (path === "/company-news.html") body = await companyPage();
  if (path === "/metrics.html") body = metricsPage();
  if (body) {
    ctx.waitUntil(trackPage(env, path, performance.now() - started));
    return htmlResponse(body);
  }
  return new Response("Not found", { status: 404 });
}

export default {
  fetch: route,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const easternHour = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: "America/New_York"
    }).format(new Date());
    if (easternHour === "08") {
      ctx.waitUntil(refreshNews(env));
    }
  }
};
