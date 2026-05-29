# Morning Dashboard Agent Instructions

This repository is the canonical source for the Quickbase Morning Dashboard.

## First Steps

1. Start in the repository root that contains `wrangler.jsonc`.
2. Run `git status --short --branch` and confirm whether local work is already in progress.
3. Read `docs/project-state.md` before making changes.
4. Prefer the latest local `main` if it is intentionally ahead of `origin/main`; otherwise fetch/pull before starting if the user asks for GitHub freshness.
5. If changing browser assets, inspect the relevant feature module and CSS before editing; avoid rereading unrelated modules unless the change crosses features.
6. Do not edit generated or dependency folders such as `node_modules/`, `.wrangler/`, `dist/`, or `worker-configuration.d.ts`.

## Architecture

- `src/index.ts` is the Cloudflare Worker API and D1 storage layer.
- `public/quickbase-dashboard.html` is the copy-paste Quickbase code page shell. Keep it intentionally tiny.
- `public/js/quickbase-loader.js` loads CSS, config, and the bundled app from GitHub Pages with cache-busting query strings so the Quickbase code page usually does not need version edits.
- `public/css/dashboard.css` is shared browser styling.
- `public/js/config.js` is public runtime configuration.
- `public/js/app.js` is the browser bootstrap/router.
- `public/js/features/` contains feature modules. Keep future UI work scoped to the relevant feature module when possible.
- `public/js/dashboard.bundle.js` is the GitHub Pages browser bundle generated from `public/js/app.js`.

## Development Rules

- Keep Cloudflare API endpoints under `/api/*`.
- Keep Quickbase ticket reads in the browser using the Quickbase temporary token flow.
- Keep external public feeds and D1-backed state in Cloudflare.
- Use feature modules rather than one large HTML/JS string in the Worker.
- When changing any file under `public/js/` that is imported by the app, run `npm run check:assets` and commit the regenerated `public/js/dashboard.bundle.js`.
- Do not paste app logic into the Quickbase code page. The code page should load `public/js/quickbase-loader.js`, and the loader should pull the latest GitHub Pages assets.
- When adding or changing runtime URLs, update `public/js/config.js`, `README.md`, and `docs/project-state.md`.
- If a change alters current architecture or deployment assumptions, update `docs/project-state.md` in the same change.

## Current UI Conventions

- Browser routing uses hash routes: `#news`, `#tickets`, `#releases`, `#company`, and `#metrics`.
- News source filters and ticket status filters are multi-select. No active filter means show all.
- News page ticket summary links to `#tickets?status=...`, which should preselect the linked ticket status.
- Tickets are cached in browser memory/session storage for five minutes when storage is available. The Quickbase code page environment may limit browser storage, so in-memory cache is still important.
- Ticket cards show app/title, status, metadata, then a 3-line issue preview. The ticket modal shows the same order, with the full issue text and matching action buttons.
- The news article list refreshes on each news page load; the common summary/status area should use cached ticket/status data where possible.

## Checks

Run these before handing work back when relevant:

```sh
npm run check:assets
npm run check
npm run dev
```

For most frontend-only changes, `npm run check:assets` and `npm run check` are enough. Use `npm run dev` when Worker/API behavior changed. For static asset checks, serve the `public/` directory locally and open `quickbase-dashboard.html`.

## Deployment

- `.github/workflows/deploy-cloudflare.yml` deploys the Worker on `main`.
- `.github/workflows/deploy-pages.yml` deploys `public/` to GitHub Pages on `main`.
- GitHub Pages assets default to `https://nthnbnntt.github.io/morning-dashboard/`.
- Live Quickbase code page: `https://vtg.quickbase.com/db/br35mavda?a=dbpage&pagename=dashboard.html`.
