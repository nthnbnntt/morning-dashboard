# Morning Dashboard Agent Instructions

This repository is the canonical source for the Quickbase Morning Dashboard.

## First Steps

1. Start in the repository root that contains `wrangler.jsonc`.
2. Run `git status --short --branch` and confirm whether local work is already in progress.
3. Read `docs/project-state.md` before making changes.
4. Prefer the latest local `main` if it is intentionally ahead of `origin/main`; otherwise fetch/pull before starting if the user asks for GitHub freshness.
5. Do not edit generated or dependency folders such as `node_modules/`, `.wrangler/`, `dist/`, or `worker-configuration.d.ts`.

## Architecture

- `src/index.ts` is the Cloudflare Worker API and D1 storage layer.
- `public/quickbase-dashboard.html` is the copy-paste Quickbase code page shell.
- `public/css/dashboard.css` is shared browser styling.
- `public/js/config.js` is public runtime configuration.
- `public/js/app.js` is the browser bootstrap/router.
- `public/js/features/` contains feature modules. Keep future UI work scoped to the relevant feature module when possible.

## Development Rules

- Keep Cloudflare API endpoints under `/api/*`.
- Keep Quickbase ticket reads in the browser using the Quickbase temporary token flow.
- Keep external public feeds and D1-backed state in Cloudflare.
- Use feature modules rather than one large HTML/JS string in the Worker.
- When adding or changing runtime URLs, update `public/js/config.js`, `README.md`, and `docs/project-state.md`.
- If a change alters current architecture or deployment assumptions, update `docs/project-state.md` in the same change.

## Checks

Run these before handing work back when relevant:

```sh
npm run check
npm run dev
```

For static asset checks, serve the `public/` directory locally and open `quickbase-dashboard.html`.

## Deployment

- `.github/workflows/deploy-cloudflare.yml` deploys the Worker on `main`.
- `.github/workflows/deploy-pages.yml` deploys `public/` to GitHub Pages on `main`.
- GitHub Pages assets default to `https://nthnbnntt.github.io/morning-dashboard/`.
