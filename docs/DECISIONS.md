# Decision log
Each entry: date · decision · reason. Do not reverse without the owner's approval.

- **2026-11** · One domain, path-based sites (`/msp-bi`, `/admin`, `/aide`, `/api`). · One login cookie-free token, one TLS certificate, simple hosting.
- **2026-11** · Backend = single Python process using only the standard library + SQLite (WAL). · Runs on the smallest VPS, no package installs, easy backup (one file).
- **2026-11** · VPS (Ubuntu 24.04) + Caddy; shared PHP hosting rejected. · Needs a long-running process, live updates and a local AI option.
- **2026-11** · **All data on the server; nothing persistent in the browser.** Browser keeps a session copy wiped at logout. · Explicit owner requirement ("not local").
- **2026-11** · Offline writes are not supported in hub mode for the dashboard (saves show an error and retry); the SDK supports an outbox for other sites. · Simplicity; data must reach the server.
- **2026-11** · Conflict policy: merge arrays by `id`, the saving user wins for the same item; never silently drop changes. · Multi-user editing of shared documents.
- **2026-11** · Test mode with `Admin` / `Admin123` for every environment until real data. · Owner request; must be switched off before production.
- **2026-11** · GitHub repo `danialmor/Dash-Project---MSP` is the source of truth; the server pulls `main` every 10 minutes. · Owner wants automatic updates without manual uploads.
- **2026-11** · No GitHub Actions dependency. · The AI connector cannot write workflow files.
- **2026-11** · Dashboard keeps a "local mode" for preview (claude.ai artifact, GitHub Pages). · Design reviews happen in the preview.
- **2026-11** · Landing page is `noindex`; shows the 12 ecosystem modules; only live modules link to their sites. · Private business system.
- **2026-11** · Delay report form copies the owner's Microsoft Form fields exactly (project, reporter, affected activities, obstacle categories, description, impact, start/end, duration, unit). · Continuity with 128 existing responses (importable).
- **2026-11** · Delay responses (full / partial / reject with reason) must be restricted to CEO and deputies once user panels are live. · Owner requirement.
- **2026-11** · User-facing text in Persian (RTL); developer documentation in English. · Owner requirement for AI hand-over.
- **2026-11** · The public repo must never contain real company data. · Privacy.
