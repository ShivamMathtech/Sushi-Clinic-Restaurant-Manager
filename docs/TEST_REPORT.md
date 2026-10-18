# Verification report

Release: **Sushi Clinic 1.0.0**  
Verification date: **18 October 2026**  
Environment: Linux x64, Node.js **24.19.0**, SQLite **3.53.3**

## Results

| Check | Result |
| --- | --- |
| `npm run check` — server and script syntax | Passed |
| `npm run build` — production React/CSS bundle | Passed |
| `npm test` — Node test runner | **34 passed, 0 failed, 0 skipped** |
| Isolated copy with no `node_modules` — launch actual server entrypoint | Passed |
| Serve compiled HTML and JavaScript | Passed |
| Empty-database first launch and configured administrator login | Passed |
| Backup creation and SQLite `integrity_check` on backup | Passed (`ok`) |

The Node test runner's total includes the two parent tests that group individual API and UI scenarios. The complete suite finished in approximately 5.1 seconds on this environment after the final build.

## API and database coverage

- Unauthenticated access restrictions and static file boundaries.
- Login failure/success, session cookies, session lookup and logout.
- CSRF protection and cross-origin request rejection.
- Admin/host role restrictions and staff login creation/disabling.
- Guest, server and table creation, input validation and duplicate table names.
- Booking persistence, guest/table/server joins and automatic server assignment.
- Interval overlap rejection and exact adjacent booking acceptance.
- Availability calculation, edit exclusion and capacity constraints.
- Invalid dates, hours, duration, covers, and missing resources.
- Eight simultaneous conflicting booking attempts: exactly one succeeds.
- Optimistic version conflicts and missing versions.
- Waitlist assignment, arrival, seating, completion and terminal-state rules.
- Slot release after completion and guest history preservation.
- Blocks conflicting with bookings, bookings conflicting with blocks, block removal.
- Table capacity/deactivation and server deactivation protections.
- Event create/edit/delete.
- Invalid restaurant time zone and overnight hours.
- Closing existing bookings after service hours change.
- CSV formula escaping, operational JSON excluding authentication secrets, audit records.
- SQL-shaped and HTML-shaped guest names stored as data.
- Password changes, leading/trailing password spaces, and revocation of other sessions.
- SQLite close/reopen persistence and idempotent demo seeding.

## React DOM integration coverage

The React application is rendered in jsdom and connected to the actual local API and temporary SQLite database. These are interface interaction tests, not mocked successful button responses.

- Sign in and render the seeded reservation board.
- Quick-seat buttons retain the selected number of covers.
- Create a new guest inside the booking dialog, choose a table, and save a reservation.
- Progress the booking through arrived, seated and completed.
- Search the guestbook and verify the completed visit count.
- Navigate tables, servers, events, reports, restaurant settings, staff logins and audit log.
- Create an event from its form and confirm it appears in the calendar and database.
- Sign out and verify session removal.

The tests found a stale-card issue when reopening a reservation immediately after saving its status. The client now applies the authoritative saved record before refreshing the rest of the workspace. The test sequence passes after that fix.

## Not verified in this environment

- Actual browser layout, screenshot comparison, CSS rendering, and assistive-technology interaction. jsdom does not perform visual layout.
- Native Windows `.bat` execution or Windows browser auto-launch. The Node backend and distribution were run on Linux.
- Docker image build and container startup.
- Public HTTPS deployment, large-scale performance, external messaging, payments, or third-party integrations.

Responsive CSS rules, local Windows launch scripts and Docker configuration are provided, but they are not presented as browser-, Windows-, or Docker-tested here. No Windows executable or Node installer is bundled.

## Reproduce

```bash
npm ci
npm run check
npm run build
npm test
```

Tests create temporary databases and do not modify `data/sushi-clinic.sqlite`. The distribution test copies source and built assets into a temporary directory, starts the real entrypoint without development dependencies, verifies login/assets, creates a database backup, checks its integrity, then removes the temporary copy.
