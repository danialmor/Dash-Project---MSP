# Status (last updated: 2026-11-08)

## Done and tested
| Area | State | Notes |
|---|---|---|
| Hub core (`hub/server.py`) | ✅ | Identity, permissions, versioned records, sync, change feed, admin, backups, AI gateway, ETag, paging. |
| Ecosystem core | ✅ | Module registry (12 modules), event bus, cross-module relations (`test_core.py`). |
| Dashboard ↔ hub (`msp-bi/hub-bridge.js`) | ✅ | Login, server-only persistence, merge on conflict, binary files, chunking, colleague notice, logout wipe (`e2e_bridge.js`). |
| Project Control dashboard (`msp-bi/index.html`, v3.44.0) | ✅ | Home, dashboard (EVM tiles), project control (Gantt, WBS tree with gear menu, timeline with pinned/auto/changed rows, delays), projects page (portfolio + 13 detail tabs), letters with approval routes, messenger, planning, files, mobile role views, simulation center. |
| Delay reporting | ✅ | In-app form identical to the owner's Microsoft Form; requests-and-response view; Excel import of the Forms export (deduplicated). |
| Landing page (`index.html`) | ✅ | Neon ecosystem hub with Danimor logo; live modules link to their sites. |
| Deployment | ✅ (dry-run only) | `install.sh` verified in a dry run; **never run on a real server yet**. |

## Not done / known limitations
1. **Not deployed.** The owner has no VPS yet. GitHub Pages (`danialmor.github.io/Dash-Project---MSP`) shows the dashboard in local mode only.
2. **`msp-bi/index.html` is ~650 KB**, too large for the AI's GitHub connector. The owner uploads it manually; everything else can be committed directly. Planned fix: split into modules (see next steps).
3. Some dashboard parts still render **built-in sample data** regardless of the server: the WBS tree (`RAW`), legacy delay list (`DL`), project list fallback (`PJ`). They must be moved to server data.
4. Delay responses: anyone can respond during design phase (`DLR_ENFORCE=false`). Target: only CEO and deputies (open question: should the project manager keep this right?).
5. The mobile supervisor delay form still uses the old short form (not the full Microsoft-Form fields).
6. Projects page: files (renders/catalogs/plans) are stored as links only; no direct upload yet.
7. Aide (executive desk) still runs on Cloudflare Worker + D1 in repo `danialmor/aide`; it is not yet on the hub.
8. No multi-tenant / sales features yet (see roadmap).
9. `.github/workflows/*` cannot be written by the AI connector (missing workflow permission); deployment does not depend on GitHub Actions.

## Next steps (priority order — continue from the top)
1. **Owner action:** buy a VPS (Ubuntu 24.04, root), run `install.sh`, create users, turn off `test_mode`.
2. **Split `msp-bi/index.html`** into small files (CSS + JS modules, build script producing the single-file preview) so changes can be committed directly.
3. **Replace built-in sample data** (RAW tree, DL, PJ) with server collections; import real MS Project files through the hub.
4. **Role-based landing:** after login, redirect each user to their module (secretary → /aide/, project manager → /msp-bi/) using `GET /modules` + grants; make `index.html` read the registry instead of its static list.
5. **Delay permissions:** enforce responders (CEO, deputies) via hub roles; decide on project manager.
6. **Emit domain events** from the dashboard (e.g. `delay.requested`, `delay.answered`, `letter.sent`) in addition to `data.updated`, and show cross-module relations (letter ↔ delay ↔ project).
7. **Aide migration** to the hub: A1 bridge (events only), then A2 full migration.
8. **Multi-tenant SaaS** (owner request): tenants, plans with per-seat monthly pricing, subscriptions, wallet + manual top-up, payment gateway paying to the owner's account (country/currency still unknown), a tab per customer in the owner panel, tenant admins managing their own users.
9. Build the planned modules: training, portfolio, shared cursor, designer workspace, CRM, company space.
