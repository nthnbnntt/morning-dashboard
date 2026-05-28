# Morning Dashboard

Hosted Morning Dashboard with connection to Quickbase API, company news, tickets, metrics, and morning news.

The dashboard now has two deployable parts:

- Cloudflare Worker API and D1 storage in `src/index.ts`
- Quickbase code page/browser assets in `public/`

The Quickbase page loads CSS and JavaScript from GitHub Pages and calls the Worker for `/api/*` data.

For a detailed step-by-step history of how the dashboard was built, see:

```text
docs/build-history.md
```

The browser app supports:

- `#news`
- `#tickets`
- `#releases`
- `#company`
- `#metrics`

The Worker uses D1 for cached news, metrics, and unique item tracking. The Tickets view reads Quickbase records directly from the browser using a temporary Quickbase token for the logged-in user, scoped to the VTG Quickbase app `br35mavda` and table `bsmpv3zg4`.

Agent instructions live in:

```text
AGENTS.md
CLAUDE.md
docs/project-state.md
```

## Cloudflare Resources

D1 database:

```text
morning-dashboard
3a4f906c-2004-4e60-8586-c4d0c5593cff
```

The initial schema is in:

```text
migrations/0001_initial.sql
```

## Local Development

```sh
npm install
npm run types
npm run check
npx wrangler d1 migrations apply morning-dashboard --local
npm run dev
```

Open the Worker API/landing page:

```text
http://127.0.0.1:8787/
```

To test static assets locally, serve `public/` with any static file server and open:

```text
quickbase-dashboard.html
```

## Deploy With Wrangler

Set a Cloudflare API token with Worker and D1 permissions:

```sh
export CLOUDFLARE_API_TOKEN="..."
npm run deploy
```

## Deploy With GitHub Actions

Add this repository secret for Worker deploys:

```text
CLOUDFLARE_API_TOKEN
```

Push to `main`. The workflow in `.github/workflows/deploy-cloudflare.yml` will:

1. install dependencies
2. generate Worker types
3. type-check
4. deploy with Wrangler

The workflow in `.github/workflows/deploy-pages.yml` deploys `public/` to GitHub Pages.

GitHub Pages asset URL:

```text
https://nthnbnntt.github.io/morning-dashboard/
```

Copy `public/quickbase-dashboard.html` into a Quickbase HTML code page in the Tickets app.

## Notes

The cron trigger runs at `12:00 UTC` and `13:00 UTC`, but the Worker only refreshes news when the current time in `America/New_York` is `8 AM`. This handles daylight saving time without manual schedule changes.

The Tickets view is read-only. It uses Quickbase temporary authorization in the browser and does not store Quickbase credentials in the Worker.

`ADMIN_WRITE_TOKEN` is empty in `wrangler.jsonc`; while empty, `/api/refresh-news` is disabled. Set it before using manual admin refreshes.
