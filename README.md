# Sushi Clinic — Restaurant Manager

A complete locally runnable restaurant reservation and front-desk application, built from the supplied six-screen reference. The UI keeps the narrow charcoal navigation rail, light gray workspace, blue accents, compact cards, guestbook, table grid, server list, event calendar, and booking dialog. The login, reports, and settings screens extend that design.

This package includes editable source, a built frontend, a real API, a persistent database, sample records, automated tests, and launch scripts. It is a single-restaurant application intended for local operation and further development.

## Start on Windows

1. Install **Node.js 24 LTS**, 64-bit, from <https://nodejs.org>.
2. Extract the entire ZIP.
3. Double-click **START_WINDOWS.bat** inside `sushi-clinic`.
4. Open <http://localhost:3040> if the browser does not open automatically.

The included `dist/` contains React and all browser code. Running the app does **not** require `npm install`. There are no backend third-party runtime packages, native database build steps, remote fonts, or runtime CDNs. The Node runtime itself must be installed separately.

| Local demo account | Email | Password |
| --- | --- | --- |
| Administrator | `admin@sushiclinic.local` | `SushiAdmin!2026` |
| Front desk | `host@sushiclinic.local` | `SushiHost!2026` |

Change these passwords using the account icon before using real guest records. They are documented defaults for the local demo. The data is fictional and is created only on the first launch, around that launch date. The app uses **Asia/Kolkata** by default.

On Linux/macOS, run `sh start.sh`, or `npm start` from this folder.

## Included workflows

| Module | Working behavior |
| --- | --- |
| Calendar | Service date navigation; hourly board and tabular list; guest search; section/status filters; editable bookings; arrival, seating, completion, cancellation, and no-show actions |
| Booking dialog | Existing or new guest; date, start time, covers, duration, source, notes, server; table availability checked by the API; selectable section/type filters |
| Walk-in / waitlist | Immediate seated bookings with assigned tables; unassigned waitlist parties; later table assignment; quick-seat party-size buttons |
| Guestbook | Create/edit guest, contact details, VIP flag, allergies, seating/food preferences, notes, completed visit count, past and upcoming reservations |
| Tables | Patio/Ground Floor/Terrace sample sections; custom sections; editable table capacities and types; snapshot time; scheduled blocks; server assignments; inactive tables |
| Servers | Create/edit/deactivate server records, identifier colors, table assignment, workload by service date, current and closed bookings |
| Events | Create/edit/delete events, categories and colors, month/week/day calendars, descriptions; hosts have read-only access |
| Reports | Selected-date totals and booking mix, searchable register, CSV export for date ranges up to 366 days |
| Settings | Restaurant name, service hours, time zone, default duration, phone, staff logins, account disabling, latest 200 audit entries |
| Data | SQLite persistence; JSON export without authentication secrets; consistent full SQLite backup script |

The `mailto:` and `tel:` links in guest profiles open the user's own mail/phone application. The app does not automatically send messages.

## Booking rules

- A reservation has one guest and at most one table. Multiple tables cannot be joined into one booking.
- Covers are 1–30; duration is 15–360 minutes. Table capacity must fit the party.
- The full interval must fit inside the restaurant's same-day opening hours.
- Reserved, arrived, and seated bookings occupy `[start, end)`. The exact end of one booking may be the start of another.
- Scheduled blocks occupy their own intervals. Conflicting bookings and blocks are rejected.
- Availability is checked again inside the booking transaction. Simultaneous requests cannot double-book the same slot.
- Updates require the current `version`; stale changes return HTTP 409.
- Only valid lifecycle transitions are accepted. Closed records cannot be reopened or edited.
- Table occupancy is based on the planned interval. For a guest staying longer, edit/extend the booking before its end; extension is subject to conflicts. No live occupancy sensor is connected.
- Existing booking history protects guest deletion, table capacity reductions, and deactivating resources with upcoming active bookings.
- A private event does not automatically block tables. Add the required table blocks separately.

## Roles

| Capability | Host | Administrator |
| --- | --- | --- |
| Read operational screens, guest history, events and reports | Yes | Yes |
| Create/edit guests and reservations; update booking status | Yes | Yes |
| Create/delete table blocks | Yes | Yes |
| Export reservations as CSV | Yes | Yes |
| Edit tables, servers and events | No | Yes |
| Delete a guest without reservation history | No | Yes |
| Edit settings, staff logins, view audit, export all restaurant data | No | Yes |
| Change own password | Yes | Yes |

Server records represent floor staff. Application login accounts are managed separately; creating a server does not create login credentials.

## Edit the application

```bash
npm ci
npm run dev
```

This builds and watches the React frontend while serving the application at port 3040. Refresh the browser after changes. Backend changes require restarting the process.

```bash
npm run check
npm run build
npm test
```

The dependency lockfile includes cross-platform optional esbuild packages. Run `npm ci` on your own operating system; do not copy another system's `node_modules`. `node_modules` is intentionally excluded from the ZIP.

## Stack and source

| Layer | Implementation |
| --- | --- |
| Frontend | React 19.2, custom responsive CSS, inline SVG icons, esbuild |
| API | Node.js 24 built-in HTTP server and URL handling |
| Database | Node's built-in SQLite, foreign keys, WAL, prepared statements, transactional booking validation |
| Authentication | Scrypt password hashes; random session tokens stored as hashes; HttpOnly SameSite cookies; CSRF tokens; origin checks |
| Tests | Node test runner, actual HTTP requests, temporary SQLite databases, React DOM + jsdom integration |

| Directory | Purpose |
| --- | --- |
| `frontend/` | React components, UI forms, page workflows, API client, styles, HTML |
| `server/` | Schema/seed, auth, validation, services, HTTP routing, startup |
| `scripts/` | Frontend build/watch, syntax checking, database backup |
| `tests/` | API, data persistence, React interaction, and distribution tests |
| `dist/` | Ready-to-run compiled browser application and source maps |
| `docs/` | API reference, operations guide, architecture, verification report |
| `data/` | Database created on the first launch |

## Empty database instead of demo records

Before the first start, copy `.env.example` to `.env`, set `SEED_DEMO=false`, and set your own `ADMIN_EMAIL` and a password of at least 12 characters in `ADMIN_PASSWORD`. The app then creates only the administrator and default settings. Create tables, servers, and guests from the interface.

The seed settings only apply when the database has no users. They do not erase or reset an existing database. See the operations guide for safe backup and switching to a fresh database.

## Docker

```bash
docker compose up --build -d
```

Open <http://localhost:3040>. The Compose file publishes only to the local host and keeps persistent data in named volumes. Docker image retrieval needs internet access. Docker execution was not available in the build environment; review `docs/TEST_REPORT.md` for actual verification.

## Scope and verification limits

The supplied reference covers reservations and front-desk management. This release implements those workflows; it does not include a kitchen display, menu ordering, billing, payment processing, SMS/email delivery, third-party booking sync, multiple branches, overnight services, recurring events, or joined-table reservations. JSON export is for portability, not an in-app restore format.

Records are persisted by the API, not browser local storage. There is no WebSocket push: actions refresh the data, and the refresh icon retrieves changes from another workstation. Large installations need pagination, workload testing, and a production deployment review. The synchronous SQLite design is intended for a small restaurant installation.

Automated API and React DOM tests are included. A real browser, native Windows session, and Docker runtime were unavailable here, so visual rendering, Windows shell execution, and Docker startup are not claimed as tested. Read `docs/TEST_REPORT.md` for the checks that passed.

## Documentation references

- [Node.js 24 SQLite API](https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html)
- [React createRoot](https://react.dev/reference/react-dom/client/createRoot)
- [esbuild build API](https://esbuild.github.io/api/#build)

Original application code is provided under the MIT license. Third-party notices are included in `docs/THIRD_PARTY_NOTICES.md` and `dist/app.js.LEGAL.txt`.
