# Morning Dashboard on Cloudflare

Hosted Morning Dashboard with connection to Quickbase API, company news, tickets, metrics, and morning news.

This is the deployable Cloudflare Worker version of the local Morning Dashboard prototype.

For a detailed step-by-step history of how the dashboard was built, see:

```text
docs/build-history.md
```

It serves:

- `news.html`
- `tickets.html`
- `quickbase-releases.html`
- `company-news.html`
- `metrics.html`

The Worker uses D1 for cached news, metrics, and unique item tracking. The Tickets page reads Quickbase records directly from the browser using a temporary Quickbase token for the logged-in user.

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

Open:

```text
http://127.0.0.1:8787/news.html
```

## Deploy With Wrangler

Set a Cloudflare API token with Worker and D1 permissions:

```sh
export CLOUDFLARE_API_TOKEN="..."
npm run deploy
```

## Deploy With GitHub Actions

Create a GitHub repository from this `cloudflare/` folder.

Add this repository secret:

```text
CLOUDFLARE_API_TOKEN
```

Push to `main`. The workflow in `.github/workflows/deploy-cloudflare.yml` will:

1. install dependencies
2. generate Worker types
3. type-check
4. deploy with Wrangler

## Notes

The cron trigger runs at `12:00 UTC` and `13:00 UTC`, but the Worker only refreshes news when the current time in `America/New_York` is `8 AM`. This handles daylight saving time without manual schedule changes.

The Tickets page is read-only. It uses Quickbase temporary authorization in the browser and does not store Quickbase credentials in the Worker.

`ADMIN_WRITE_TOKEN` is empty in `wrangler.jsonc`; set it before exposing any admin-only write endpoints broadly.
