# API reference

Base URL: `http://localhost:3040/api`. All bodies are JSON. Errors use `{ "error": "Human-readable explanation." }` with HTTP 400, 401, 403, 404, 409, 413, 415, 429, or 500 as appropriate. The server returns parameter validation errors without exposing SQL errors or stack traces.

## Authentication

`POST /auth/login` accepts `email` and `password`. It sets the `sc_session` HttpOnly cookie and returns `{user, csrf}`. Sessions last 12 hours. Retain cookies and send `X-CSRF-Token: <csrf>` on subsequent POST/PATCH/PUT/DELETE requests. The browser client handles this automatically. Same-origin requests are required when an Origin header is present.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Public readiness/version response |
| POST | `/auth/login` | Sign in |
| GET | `/auth/session` | Current user and CSRF token |
| POST | `/auth/logout` | Invalidate this session |
| POST | `/auth/password` | `current_password`, `new_password`; revoke other sessions |

## Operational data

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/bootstrap?date=YYYY-MM-DD&from=YYYY-MM-DD&to=YYYY-MM-DD` | Settings, guests, tables, servers, selected-day bookings/blocks, event range, summary |
| GET | `/reservations?date=YYYY-MM-DD` | Selected-day reservation details |
| POST | `/reservations` | Create reservation, walk-in, or waitlist record |
| PATCH | `/reservations/:id` | Change fields/status; `version` required |
| GET | `/availability?date=...&start_time=18:00&duration=90&covers=2&exclude=ID` | Active tables with `available` and `reason`; exclude optional for editing |
| GET | `/guests` | Guest list with completed visits and last visit |
| GET | `/guests/:id` | Profile and complete reservation history |
| POST | `/guests` | Create guest |
| PATCH | `/guests/:id` | Edit profile |
| DELETE | `/guests/:id` | Admin only; rejects guests with reservation history |
| POST | `/blocks` | Block an available table interval |
| DELETE | `/blocks/:id` | Remove block |
| POST / PATCH | `/tables` / `/tables/:id` | Admin: create/edit/deactivate table |
| POST / PATCH | `/servers` / `/servers/:id` | Admin: create/edit/deactivate floor staff |
| POST / PATCH / DELETE | `/events` / `/events/:id` | Admin: create/edit/delete calendar events |
| GET | `/export/reservations?from=...&to=...` | CSV, 366-day maximum range |
| GET | `/export/data` | Admin: operational JSON export without secrets |

## Reservation example

Create a guest first:

```json
{"name":"Aarav Sharma","phone":"+91 98765 43210","email":"aarav@example.com","vip":false,"allergies":"Peanuts","seating":"Window","food":"Vegetarian","notes":"Confirm allergies before service"}
```

Then use the guest ID and an available table ID:

```json
{
  "guest_id": 19,
  "date": "2026-11-10",
  "start_time": "18:00",
  "duration": 90,
  "covers": 2,
  "table_id": 1,
  "server_id": null,
  "status": "reserved",
  "origin": "phone",
  "notes": "Anniversary"
}
```

The IDs are illustrative: use IDs returned by your own API. `server_id=null` uses the selected table's server. For waitlist records use `status=waitlisted`, `table_id=null`. New walk-ins may use `status=seated` with an available table.

Changing status requires the current version returned by the API:

```json
{"status":"arrived","version":1}
```

`PATCH` merges supplied fields into the existing row, validates the whole record, then increments its version. The same endpoint handles table reassignment, date/time changes, notes, and party size. Rows are never silently overwritten after a concurrent update.

| Current status | Allowed next statuses |
| --- | --- |
| waitlisted | reserved, arrived, seated, cancelled, no_show |
| reserved | arrived, seated, cancelled, no_show |
| arrived | seated, cancelled, no_show |
| seated | completed |
| completed / cancelled / no_show | None |

A table is required when entering reserved/arrived/seated. New bookings may only start as reserved, arrived, seated, or waitlisted. Completed and cancelled rows retain their history.

## Other payloads

Table: `name`, `section`, `capacity` (1–30), `type` (`Standard`, `Window`, `VIP`), `server_id` (optional), `active`.

Server: `name`, `color` (`#RRGGBB`), `active`.

Event: `title`, `date`, `start_time`, `duration` (15–720 minutes, same-day end), `type` (`Dining`, `Entertainment`, `Promotion`, `Private`), `color`, `description`.

Block: `table_id`, `date`, `start_time`, `duration` (15–360), `reason`. The full interval must fit opening hours and not overlap another block or active booking.

## Administration

| Method | Endpoint | Body or response |
| --- | --- | --- |
| PUT | `/settings` | `name`, `tagline`, `timezone`, `open_time`, `close_time`, `default_duration`, `contact_phone` |
| GET | `/users` | Staff users without hashes |
| POST | `/users` | `name`, `email`, `password` (12–128 characters), `role` (`host`/`admin`) |
| PATCH | `/users/:id` | `active` boolean; cannot disable yourself |
| GET | `/audit` | Latest 200 mutations, joined with user name |

## Important HTTP behavior

- Unsafe writes require JSON and a CSRF token, except login.
- Requests larger than 100 KB are rejected.
- CSV export guards against spreadsheet formula injection in user-entered cells.
- All user data is rendered as React text. No user-provided HTML is injected.
- Static files are served from `dist/` only. Database and server source files are not public.
- This API has no CORS allowance for unrelated sites. Serve the frontend and backend from the same origin.
