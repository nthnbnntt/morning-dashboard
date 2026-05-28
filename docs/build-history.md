# Morning Dashboard Build History

This document records the major changes made while building the Morning Dashboard, from the first local automation through the hosted Cloudflare Worker version.

## 1. Daily News Automation

The project started as a local morning news summarizer. A Python script fetched RSS feeds, summarized the current headlines, and wrote a dated Markdown briefing.

Key changes:

- Created the first `news_summary.py` generator.
- Added a macOS `launchd` agent to run every morning at 8:00 AM local time.
- Stored generated Markdown summaries by date.
- Verified the scheduled job through `launchctl`.
- Switched the scheduled Python interpreter away from `/usr/bin/python3` because the machine's Xcode license blocked it in non-interactive `launchd` runs.

## 2. HTML Morning Dashboard

The next step was turning the Markdown output into a browser-friendly morning dashboard.

Key changes:

- Added a generated `dashboard.html` page.
- Kept the Markdown archive while making the HTML page the primary morning view.
- Designed a compact news dashboard with a lead story, story cards, source labels, and morning timestamp.
- Added browser checks for layout, horizontal overflow, and story rendering.

## 3. Task Page

Tasks were added as a second page so the dashboard could support the morning planning workflow.

Key changes:

- Added `tasks.html`.
- Added `News` and `Tasks` navigation.
- Added a browser form for adding tasks.
- Added a `tasks.json` data file for tasks added through chat or local automation.
- Added `--add-task` support to the generator.
- Later replaced browser-only task storage with a shared task API so Mac and iPhone could see the same task list.

## 4. Local Phone Access

The dashboard was then made available on the same Wi-Fi network for iPhone use.

Key changes:

- Added a local dashboard server.
- Exposed the generated dashboard folder on the Mac's local network.
- Added a persistent `launchd` server agent.
- Verified access through the Mac LAN IP.
- Added a shared task endpoint backed by `tasks.json` so iPhone and Mac tasks stayed in sync.

## 5. Task Interaction Improvements

The task page went through several mobile-focused refinements.

Key changes:

- Made the task form hidden by default.
- Added a floating plus button for adding tasks.
- Moved the task form into a modal.
- Fixed mobile Safari form submission issues.
- Replaced fragile ID generation with a safer fallback.
- Added visible save status text.
- Moved delete controls to the right side of task cards.
- Added edit mode by tapping a task card.
- Fixed mobile delete behavior.
- Added collapsible task sections:
  - `Today`
  - `This Week`
  - `Next Week`
  - `Next Month`
  - `Complete`
- Set the completed section to load collapsed.
- Changed the destructive `Clear done` behavior into a safe `Clear form` action.

## 6. Shared Header and Mobile Layout

The news and task pages were tightened into a more consistent app shell.

Key changes:

- Made the header identical across pages.
- Moved the time into the title row.
- Fixed mobile header alignment.
- Added fixed header behavior so only the content below the divider scrolls.
- Added custom pull-to-refresh behavior for the internal scroll area.
- Reduced the lead news title size on desktop.
- Adjusted input sizing to avoid iOS Safari auto-zoom.

## 7. News Source and Filter Enhancements

The news page became more interactive and source-aware.

Key changes:

- Added Hacker News as a news source.
- Moved the task tally to the top of the news page.
- Removed the `Stories` and `Sources` summary cards when they became visual clutter.
- Made source labels clickable filters.
- Added automatic scrolling to the start of the news list when a source filter is selected.
- Added a live Quickbase system status strip before the summary tally.

## 8. Quickbase Release Notes Page

A dedicated Quickbase release notes page was added from the public Quickbase release app.

Key changes:

- Added `quickbase-releases.html`.
- Added a `Releases` navigation tab.
- Added an API endpoint for Quickbase release records.
- Loaded release records with feature name, product area, release status, summary, date, and source link.
- Highlighted recently released items as `New`.
- Added filters:
  - `All`
  - `New`
  - `Upcoming`
  - `Released`
- Later restyled the filters to use the same pill visual language as release status badges.

## 9. Company News Page

A company news page was added using VTG's public company news page as the source.

Key changes:

- Added `company-news.html`.
- Added a `Company` navigation tab.
- Added an API endpoint for company news.
- Parsed company story titles, dates, summaries, and links.
- Loaded company stories into dashboard cards.
- Added recent-story highlighting.
- Later tightened card spacing, title margins, paragraph rhythm, and link placement.

## 10. Metrics Dashboard

A metrics page was added to show how the dashboard is being used.

Key changes:

- Added `metrics.html`.
- Added a `Metrics` navigation tab.
- Added persistent metric storage.
- Added gauges, stat cards, bar charts, and a recent event feed.
- Tracked:
  - page loads by page
  - task creation, completion, deletion, and reopening
  - current open and completed task counts
  - API calls
  - load timing
  - news refreshes
- Changed news, release, and company metrics to count unique items instead of total load events.

## 11. File Organization

The local project structure was consolidated and renamed.

Key changes:

- Moved active dashboard files into one `dashboard/` folder.
- Renamed generated pages with clearer names:
  - `news.html`
  - `tasks.html`
  - `quickbase-releases.html`
  - `company-news.html`
  - `metrics.html`
- Kept redirects from older page names where needed.
- Renamed the date-stamped parent folder to `morning-dashboard`.
- Updated launch agents to use the new paths.

## 12. Cloudflare Worker Rebuild

The local Python/server prototype was rebuilt as a deployable Cloudflare Worker.

Key changes:

- Created the Cloudflare Worker project.
- Moved app rendering and APIs into `src/index.ts`.
- Added D1 storage for:
  - tasks
  - cached news
  - metrics
  - unique item tracking
- Added `wrangler.jsonc`.
- Added the initial D1 migration.
- Added scheduled Worker refresh behavior for 8:00 AM Eastern.
- Added GitHub Actions deployment.
- Connected the repo to GitHub at `nthnbnntt/morning-dashboard`.
- Added Cloudflare deployment through the `CLOUDFLARE_API_TOKEN` repository secret.

## 13. Security, Reliability, and Performance Pass

Several fixes were made after the Cloudflare version was deployed.

Key changes:

- Added safer HTML escaping.
- Added URL validation for generated links.
- Fixed partial task updates so editing a task does not accidentally reset completion state.
- Added API response caching where appropriate.
- Improved metrics query efficiency.
- Added background API prefetching for faster page-to-page navigation.
- Added horizontal swipe navigation between dashboard pages.
- Added View Transitions API animations for swipe navigation.
- Added structured Worker console logging for requests, task lifecycle events, feed refreshes, external data loads, redirects, denied writes, scheduled refresh runs, and unexpected failures.
- Added browser DevTools console logging for page loads, API fetches, prefetches, pull refreshes, swipe navigation, news filters, task actions, release filters, company news loads, and metrics refreshes.
- Kept logs privacy-conscious by avoiding task titles, notes, request bodies, tokens, and other sensitive payloads.

## 14. Current Pages

The hosted dashboard currently serves:

- `/news.html`
- `/tasks.html`
- `/quickbase-releases.html`
- `/company-news.html`
- `/metrics.html`

The active hosted URL is:

```text
https://morning-dashboard.n8visions.workers.dev/news.html
```

## 15. Current Notes

- Task writes are public by default while `TASK_WRITE_TOKEN` is empty.
- The scheduled news refresh runs through Cloudflare cron and only refreshes when the current Eastern hour is 8 AM.
- The dashboard still keeps a local-development path through Wrangler.
- GitHub pushes to `main` trigger the Cloudflare deployment workflow.
