export interface Env {
  DB: D1Database;
  APP_NAME: string;
  ADMIN_WRITE_TOKEN: string;
}

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

type LogFields = Record<string, string | number | boolean | null | undefined>;

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
const STATIC_DASHBOARD_URL = "https://nthnbnntt.github.io/morning-dashboard/quickbase-dashboard.html";
const ALLOWED_ORIGINS = new Set([
  "https://vtg.quickbase.com",
  "https://nthnbnntt.github.io",
  "http://127.0.0.1:8787",
  "http://127.0.0.1:8080",
  "http://localhost:8787",
  "http://localhost:8080"
]);

const pageNames: Record<string, string> = {
  "/": "News",
  "/news.html": "News",
  "/tickets.html": "Tickets",
  "/quickbase-releases.html": "Releases",
  "/company-news.html": "Company",
  "/metrics.html": "Metrics"
};

function logInfo(event: string, fields: LogFields = {}): void {
  console.log(JSON.stringify({ level: "info", event, ...fields }));
}

function logWarn(event: string, fields: LogFields = {}): void {
  console.warn(JSON.stringify({ level: "warn", event, ...fields }));
}

function logError(event: string, error: unknown, fields: LogFields = {}): void {
  const details = error instanceof Error
    ? { errorName: error.name, errorMessage: error.message }
    : { errorMessage: String(error) };
  console.error(JSON.stringify({ level: "error", event, ...fields, ...details }));
}

function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "vary": "Origin",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-admin-token",
    "access-control-max-age": "86400"
  };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers["access-control-allow-origin"] = origin;
  }
  return headers;
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

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char] ?? char);
}

function json(request: Request, payload: unknown, status = 200, maxAge = 0): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge > 0 ? `public, max-age=${maxAge}, stale-while-revalidate=60` : "no-store",
      ...corsHeaders(request)
    }
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function nowIso(): string {
  return new Date().toISOString();
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

function requireAdminToken(request: Request, env: Env): Response | null {
  const token = env.ADMIN_WRITE_TOKEN?.trim();
  if (!token) return json(request, { ok: false, error: "Admin refresh is disabled until ADMIN_WRITE_TOKEN is configured." }, 403);
  if (request.headers.get("x-admin-token") === token) return null;
  return json(request, { ok: false, error: "Missing or invalid write token" }, 401);
}

function extractTag(block: string, tag: string): string {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return cleanText(match?.[1] ?? "");
}

async function fetchFeed(source: string, url: string): Promise<Story[]> {
  const started = performance.now();
  try {
    const response = await fetch(url, { headers: { "user-agent": "morning-dashboard/2.0" } });
    const body = await response.text();
    const stories = [...body.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, 6).map((match) => {
      const block = match[0];
      return {
        source,
        title: extractTag(block, "title"),
        summary: extractTag(block, "description"),
        url: extractTag(block, "link"),
        published: extractTag(block, "pubDate")
      };
    }).filter((story) => story.title);
    logInfo("feed.fetch_success", { source, status: response.status, stories: stories.length, elapsedMs: Math.round(performance.now() - started) });
    return stories;
  } catch (error) {
    logError("feed.fetch_failed", error, { source, elapsedMs: Math.round(performance.now() - started) });
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
  const started = performance.now();
  logInfo("news.refresh_started", { feeds: FEEDS.length });
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
  logInfo("news.refresh_completed", { feeds: FEEDS.length, stories: stories.length, uniqueAdded: added, elapsedMs: Math.round(performance.now() - started) });
  return stories;
}

async function cachedStories(env: Env): Promise<{ stories: Story[]; refreshedAt: string }> {
  const row = await env.DB.prepare("SELECT payload, refreshed_at FROM news_cache WHERE id = 1").first<{ payload: string; refreshed_at: string }>();
  if (!row) {
    logWarn("news.cache_miss");
    return { stories: await refreshNews(env), refreshedAt: nowIso() };
  }
  try {
    const stories = JSON.parse(row.payload) as Story[];
    logInfo("news.cache_hit", { stories: stories.length });
    return { stories, refreshedAt: row.refreshed_at };
  } catch (error) {
    logError("news.cache_parse_failed", error);
    return { stories: await refreshNews(env), refreshedAt: nowIso() };
  }
}

async function quickbaseStatus(): Promise<Record<string, string>> {
  const started = performance.now();
  try {
    const body = await (await fetch(QUICKBASE_STATUS_URL, { headers: { "user-agent": "morning-dashboard/2.0" } })).text();
    const plain = cleanText(body);
    const label = plain.match(/Login\s+(Normal|Performance issues|Service disruption|Scheduled maintenance)/i)?.[1] ?? "Normal";
    const uptime = plain.match(/TOTAL UPTIME FOR THE LAST 90 DAYS\s+([0-9.]+%)/i)?.[1];
    const lower = label.toLowerCase();
    const state = lower.includes("disruption") ? "disruption" : lower.includes("performance") || lower.includes("maintenance") ? "warning" : "normal";
    logInfo("quickbase.status_loaded", { state, label, elapsedMs: Math.round(performance.now() - started) });
    return { state, label, detail: uptime ? `${uptime} uptime` : "Live status", url: QUICKBASE_STATUS_URL + "#!/" };
  } catch (error) {
    logError("quickbase.status_failed", error, { elapsedMs: Math.round(performance.now() - started) });
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
  const started = performance.now();
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
  logInfo("quickbase.releases_loaded", { records: records.length, uniqueAdded: added, elapsedMs: Math.round(performance.now() - started) });
  return { records, generated: displayStamp(), sourceUrl: QUICKBASE_RELEASES_URL };
}

async function companyNews(env: Env): Promise<{ records: CompanyStory[]; generated: string; sourceUrl: string }> {
  const started = performance.now();
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
  logInfo("company.news_loaded", { records: records.length, uniqueAdded: added, elapsedMs: Math.round(performance.now() - started) });
  return { records, generated: displayStamp(), sourceUrl: VTG_NEWS_URL };
}

async function metrics(env: Env): Promise<Record<string, unknown>> {
  const [{ results: rows }, stories, releases, company, { results: events }] = await Promise.all([
    env.DB.prepare("SELECT key, value FROM metrics").all<{ key: string; value: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM unique_items WHERE type = 'story'").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM unique_items WHERE type = 'release'").first<{ count: number }>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM unique_items WHERE type = 'company'").first<{ count: number }>(),
    env.DB.prepare("SELECT label, amount, created_at FROM metric_events ORDER BY id DESC LIMIT 12").all()
  ]);
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    ...values,
    unique_stories_served: stories?.count ?? 0,
    unique_release_notes_loaded: releases?.count ?? 0,
    unique_company_news_loaded: company?.count ?? 0,
    events,
    generated: displayStamp()
  };
}

async function trackExternalPage(request: Request, env: Env, started: number): Promise<Response> {
  let payload: { path?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    return json(request, { ok: false, error: "Invalid JSON" }, 400);
  }
  const path = typeof payload.path === "string" ? payload.path : "/";
  await trackPage(env, path, performance.now() - started);
  return json(request, { ok: true });
}

function dashboardLanding(env: Env): Response {
  const title = env.APP_NAME || "Morning Dashboard";
  return html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fbfbf6;color:#161713;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    main{width:min(680px,calc(100vw - 32px));border:1px solid #dcdfd2;border-radius:8px;background:#fff;padding:28px}
    h1{margin:0 0 10px;font-size:1.6rem}p{color:#60645b;line-height:1.5}a{color:#0f766e;font-weight:800}
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <p>This Worker now serves the dashboard API and D1-backed storage. The browser dashboard is loaded as a Quickbase code page with assets from GitHub Pages.</p>
    <p><a href="${STATIC_DASHBOARD_URL}">Open the GitHub Pages dashboard shell</a></p>
  </main>
</body>
</html>`);
}

async function handleRequest(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const started = performance.now();
  const url = new URL(request.url);
  const path = url.pathname === "/dashboard.html" ? "/" :
    url.pathname === "/tasks.html" ? "/tickets.html" :
    url.pathname === "/releases.html" ? "/quickbase-releases.html" :
    url.pathname === "/company.html" ? "/company-news.html" : url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }

  if (path !== url.pathname) {
    logInfo("request.redirect", { from: url.pathname, to: path });
    return Response.redirect(new URL(path, url.origin).toString(), 302);
  }

  if (path === "/api/news" && request.method === "GET") {
    ctx.waitUntil(metric(env, "api:news"));
    return json(request, await cachedStories(env), 200, 120);
  }
  if (path === "/api/quickbase-status" && request.method === "GET") {
    ctx.waitUntil(metric(env, "api:quickbase-status"));
    return json(request, await quickbaseStatus(), 200, 300);
  }
  if (path === "/api/quickbase-releases" && request.method === "GET") {
    await metric(env, "api:quickbase-releases");
    return json(request, await quickbaseReleases(env), 200, 600);
  }
  if (path === "/api/company-news" && request.method === "GET") {
    await metric(env, "api:company-news");
    return json(request, await companyNews(env), 200, 600);
  }
  if (path === "/api/metrics" && request.method === "GET") {
    ctx.waitUntil(metric(env, "api:metrics"));
    return json(request, await metrics(env), 200, 30);
  }
  if (path === "/api/page-load" && request.method === "POST") {
    return trackExternalPage(request, env, started);
  }
  if (path === "/api/refresh-news" && request.method === "POST") {
    const denied = requireAdminToken(request, env);
    if (denied) {
      logWarn("news.refresh_denied", { method: request.method, path });
      return denied;
    }
    return json(request, { stories: await refreshNews(env), refreshed: displayStamp() });
  }

  if (path === "/" || path === "/news.html" || path === "/tickets.html" || path === "/quickbase-releases.html" || path === "/company-news.html" || path === "/metrics.html") {
    ctx.waitUntil(trackPage(env, path === "/" ? "/news.html" : path, performance.now() - started));
    return dashboardLanding(env);
  }

  logWarn("request.not_found", { method: request.method, path });
  return json(request, { ok: false, error: "Not found" }, 404);
}

async function route(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const started = performance.now();
  const url = new URL(request.url);
  try {
    const response = await handleRequest(request, env, ctx);
    logInfo("request.completed", {
      method: request.method,
      path: url.pathname,
      status: response.status,
      elapsedMs: Math.round(performance.now() - started)
    });
    return response;
  } catch (error) {
    logError("request.failed", error, {
      method: request.method,
      path: url.pathname,
      elapsedMs: Math.round(performance.now() - started)
    });
    return json(request, { ok: false, error: "Internal server error" }, 500);
  }
}

export default {
  fetch: route,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const started = performance.now();
    const easternHour = new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: "America/New_York"
    }).format(new Date());
    if (easternHour === "08") {
      logInfo("scheduled.refresh_queued", { easternHour });
      ctx.waitUntil(
        refreshNews(env)
          .then((stories) => logInfo("scheduled.refresh_completed", { stories: stories.length, elapsedMs: Math.round(performance.now() - started) }))
          .catch((error) => logError("scheduled.refresh_failed", error, { elapsedMs: Math.round(performance.now() - started) }))
      );
    } else {
      logInfo("scheduled.refresh_skipped", { easternHour });
    }
  }
};
