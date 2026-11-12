# AGENTS.md — start here

This file is the entry point for any AI assistant or developer opening this repository.
Read it fully, then read the documents it links. **Do not start from scratch**: most of the system exists and is tested.

## What this project is
**TSUBA** (formerly Danimor; repo `danialmor/TSUBA`) is a private business ecosystem for a construction / interior-design company in Isfahan, Iran
(owner: Danial, architect and construction project manager; ~10 active projects, 30–40 users).
One domain hosts several sites ("modules") that share **one login, one database, one permission system and one integration layer**.

- User-facing language: **Persian (Farsi), right-to-left**. Documentation and code comments for maintainers: **English**.
- Primary device of the owner: **iPad, Safari, browser only**. Everything must work there.
- Preference: free / low-cost solutions; one small VPS.

## Read next (in this order)
1. `docs/STATUS.md` — what is done, what is half-done, known limitations, **what to do next**.
2. `docs/ARCHITECTURE.md` — components, data model, API reference, integration layer, security.
3. `docs/DECISIONS.md` — why things are the way they are (do not undo these without the owner's approval).
4. `docs/DEPLOY-fa.md` — server installation guide for the owner (Persian).

## Repository map
| Path | What it is |
|---|---|
| `index.html` | Ecosystem landing page: TSUBA emblem with the 12 platforms around it (noindex). |
| `shared/brand.js` | **Brand root**: name, logo, taglines and the 12 platforms (numeral, name, description, colour, icon, link). Change the brand only here. |
| `shared/demo.js` | In-browser demo hub used only on GitHub Pages (`*.github.io`) so the panel can be tried without a server. |
| `assets/tsuba-emblem.svg` | The logo (text SVG wrapping a WebP). |
| `msp-bi/` | **Project Control** dashboard (single large HTML app, v3.44.0) + `hub-bridge.js` (server sync) + `sw.js` + PWA files. |
| `admin/` | **User Control Panel** + unified login: ecosystem-admin console (subscriptions, requests, modules, staff, system) and subscription-admin panel (users, 10 levels, profile). |
| `aide/` | Connection/test page for the CEO & Secretary desk. The real Aide app lives in repo `danialmor/aide`. |
| `shared/sdk.js` | Browser SDK for the hub (login, offline outbox, conflicts, paging, AI streaming). |
| `hub/server.py` | **The core backend** (Python 3 standard library only, SQLite). |
| `hub/deploy/` | `install.sh` (one-command VPS install), `update.sh` + timer (auto-update from GitHub every 10 min), Caddyfile, systemd units. |
| `hub/tests/` | All tests (see below). |
| `docs/` | Documentation (English) + owner guides (Persian, `*-fa.md`). |

## How to run locally
```
python3 hub/server.py init                       # creates admin "Admin" / PIN "Admin123" and the default sites
HUB_TEST_MODE=1 HUB_STATIC_DIR=$PWD python3 hub/server.py   # http://127.0.0.1:8787/admin/ (login) and /msp-bi/
```
Environment: `HUB_DATA_DIR`, `HUB_PORT`, `HUB_STATIC_DIR`, `HUB_TEST_MODE`, `HUB_CONFIG` (JSON file, see `hub/config.example.json`).

## Tests (must stay green)
```
python3 hub/tests/test_hub.py       # auth, CAS records, sync, admin, AI gateway
python3 hub/tests/test_perf.py      # indexes, paging, ETag/304, AI streaming
python3 hub/tests/test_core.py      # ecosystem core: module registry, event bus, relations
python3 hub/tests/test_testmode.py  # test mode credentials
python3 hub/tests/test_tenants.py   # subscriptions: owner panel, levels, seats, codes, isolation, expiry
node hub/tests/sdk_test.js && node hub/tests/sdk_perf_test.js
node hub/tests/e2e_bridge.js        # real hub + browser (needs Playwright): login, server save, 2nd device, merge, files, logout
node hub/tests/e2e_panel.js         # control panel: admin creates subscription, owner adds user, user lands in his module
```

## Rules for changes
1. **All data lives on the server** (hub). The browser keeps only a session working copy that is wiped on logout. Never add a feature that stores business data only in the browser when running against the hub.
2. Dashboard changes: bump `VERSION` and add a Persian entry at the top of `CHANGELOG` inside `msp-bi/index.html`; bump the cache name in `msp-bi/sw.js`.
3. Keep the hub dependency-free (stdlib only). Add tests for every new endpoint.
4. This repository is **public**: never commit real company data, real user lists, tokens or keys.
5. UI text in Persian, RTL, with correct ZWNJ (half-space). Code, comments and docs in English (some legacy Persian comments exist).
6. Ask the owner before changing anything listed in `docs/DECISIONS.md`.
7. Never hard-code the brand name, logo or platform names in a page: read them from `shared/brand.js` (`data-brand="name|logo|tagline-en|tagline-fa|motto|favicon"`, `BRAND.label(slug,'fa')`, `BRAND.desc(slug,'fa')`). Show platforms as `<numeral> — <function>` with the description smaller below.
8. Dashboard visuals follow `docs/THEME-RULES.md`: frames, cards and scrollbars take colour and shape only from the theme tokens; long content scrolls inside fixed frames like the dashboard; check layouts with the 15-project simulation.
9. Subscription users must never see the control panel; only the ecosystem admin and subscription admins (`owner`) do. Keep data isolation per subscription (`Hub.ss`).

## Where to start
See **"Next steps"** in `docs/STATUS.md`. The top item is always the current priority.
