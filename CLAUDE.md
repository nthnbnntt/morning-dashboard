# Claude Code Instructions

Follow `AGENTS.md` before making changes in this repository. It is the shared instruction source for Codex and Claude Code.

Important short version:

- Work from the repository root that contains `wrangler.jsonc`.
- Read `docs/project-state.md` before editing.
- Keep the Quickbase code page minimal; do not paste dashboard logic into Quickbase.
- Browser UI logic lives in `public/js/features/`, shared styling lives in `public/css/dashboard.css`, and the Quickbase loader pulls GitHub Pages assets.
- After changing browser JavaScript, run `npm run check:assets` and commit the regenerated `public/js/dashboard.bundle.js`.
