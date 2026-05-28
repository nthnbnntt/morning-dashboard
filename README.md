# Morning Dashboard on Cloudflare

This is the deployable Cloudflare Worker version of the Morning Dashboard.

It serves:

- `news.html`
- `tasks.html`
- `quickbase-releases.html`
- `company-news.html`
- `metrics.html`

The Worker uses D1 for tasks, cached news, metrics, and unique item tracking.

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

Task writes are public by default because `TASK_WRITE_TOKEN` is empty in `wrangler.jsonc`. Set it to a secret/token before exposing the dashboard broadly.
