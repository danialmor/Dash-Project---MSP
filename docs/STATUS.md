# Status (last updated: 2026-11-09)

## Done and tested
| Area | State | Notes |
|---|---|---|
| Hub core (`hub/server.py`) | ✅ | Identity, permissions, versioned records, sync, change feed, admin, backups, AI gateway, ETag, paging. |
| Ecosystem core | ✅ | Module registry (12 modules), event bus, cross-module relations (`test_core.py`). |
| Dashboard ↔ hub (`msp-bi/hub-bridge.js`) | ✅ | Login, server-only persistence, merge on conflict, binary files, chunking, colleague notice, logout wipe (`e2e_bridge.js`). |
| Project Control dashboard (`msp-bi/index.html`, v3.44.0) | ✅ | Home, dashboard (EVM tiles), project control (Gantt, WBS tree with gear menu, timeline with pinned/auto/changed rows, delays), projects page (portfolio + 13 detail tabs), letters with approval routes, messenger, planning, files, mobile role views, simulation center. |
| Delay reporting | ✅ | In-app form identical to the owner's Microsoft Form; requests-and-response view; Excel import of the Forms export (deduplicated). |
| Landing page (`index.html`) | ✅ | Neon ecosystem hub with Danimor logo; live modules link to their sites; "ورود" button to `/admin/`. |
| Subscriptions / multi-tenancy | ✅ | Tenants, subscription history, seats, up to 10 named levels, personal user codes, per-tenant data isolation, suspension/expiry, signup requests (`test_tenants.py`). |
| User Control Panel (`admin/index.html`) | ✅ | Unified login; ecosystem-admin console (overview, subscriptions, requests, modules, head-office staff, system, profile); subscription-admin panel (overview, users, levels, profile); users are redirected to their module (`e2e_panel.js`). |
| Deployment | ✅ (dry-run only) | `install.sh` verified in a dry run; **never run on a real server yet**. |

## Not done / known limitations
1. **Not deployed.** The owner has no VPS yet. GitHub Pages (`danialmor.github.io/Dash-Project---MSP`) shows the dashboard in local mode only.
2. **`msp-bi/index.html` is ~650 KB**, too large for the AI's GitHub connector. The owner uploads it manually; everything else can be committed directly. Planned fix: split into modules (see next steps).
3. Some dashboard parts still render **built-in sample data** regardless of the server: the WBS tree (`RAW`), legacy delay list (`DL`), project list fallback (`PJ`). They must be moved to server data.
4. Delay responses: anyone can respond during design phase (`DLR_ENFORCE=false`). Target: only CEO and deputies (open question: should the project manager keep this right?).
5. The mobile supervisor delay form still uses the old short form (not the full Microsoft-Form fields).
6. Projects page: files (renders/catalogs/plans) are stored as links only; no direct upload yet.
7. Aide (executive desk) still runs on Cloudflare Worker + D1 in repo `danialmor/aide`; it is not yet on the hub.
8. Subscriptions exist, but there is **no online payment** yet: the ecosystem admin creates/renews subscriptions manually. Users of a subscription cannot use Aide yet (Aide is a separate app).
9. When a module is used by a subscription user, the dashboard still shows its built-in sample data (see 3).
10. `.github/workflows/*` cannot be written by the AI connector (missing workflow permission); deployment does not depend on GitHub Actions.

## Next steps (priority order — continue from the top)
1. **Owner action:** buy a VPS (Ubuntu 24.04, root), run `install.sh`, create users, turn off `test_mode`.
2. **Split `msp-bi/index.html`** into small files (CSS + JS modules, build script producing the single-file preview) so changes can be committed directly.
3. **Replace built-in sample data** (RAW tree, DL, PJ) with server collections; import real MS Project files through the hub.
4. **Landing page from the registry:** make `index.html` read `GET /api/v1/modules` instead of its static list (role-based redirect after login is already done in `/admin/`).
5. **Delay permissions:** enforce responders (CEO, deputies) via hub roles; decide on project manager.
6. **Emit domain events** from the dashboard (e.g. `delay.requested`, `delay.answered`, `letter.sent`) in addition to `data.updated`, and show cross-module relations (letter ↔ delay ↔ project).
7. **Aide migration** to the hub: A1 bridge (events only), then A2 full migration.
8. **Sales side of subscriptions:** price list per plan/seat, wallet + manual top-up, online payment gateway paying to the owner's account (country/currency still unknown), automatic renewal reminders before `ends`.
9. Build the planned modules: training, portfolio, shared cursor, designer workspace, CRM, company space.
