# Architecture

The React client talks to a same-origin Node HTTP API. The server serves both the compiled client and authenticated API, so a single process and port are sufficient. SQLite stores operational data and sessions on the local disk. No browser-only mock database is used.

## Responsibilities

| Source | Responsibility |
| --- | --- |
| `server/main.mjs` | Environment configuration, database opening, server lifecycle and optional browser launch |
| `server/http.mjs` | JSON parsing, security headers, authentication/role gates, route dispatch, static files, response errors |
| `server/auth.mjs` | Password hashing, session creation/expiry, CSRF validation, login throttling, staff account creation |
| `server/database.mjs` | Version-1 schema initialization, indexes, foreign keys, sample data |
| `server/service.mjs` | CRUD, booking/block constraints, transactions, aggregate queries, exports and audit |
| `server/validation.mjs` | Typed validation, date/time utilities, status transition rules |
| `frontend/App.jsx` | Authentication, date navigation, shared data refresh, modal routing, account dialog |
| `frontend/pages.jsx` | Calendar, guestbook, tables, servers, events, reports, settings |
| `frontend/forms.jsx` | Validated forms and mutation workflows |
| `frontend/ui.jsx` | Shared accessible controls, SVG icons, modal focus handling, formatting |
| `frontend/api.js` | Same-origin JSON fetch client and CSRF management |

## Data model

| Entity | Key relationships |
| --- | --- |
| guests | One guest can have many reservations |
| dining_tables | One table belongs to a named section; optionally assigned to a server |
| servers | Can be assigned to tables and individual reservations |
| reservations | References guest, optional table, optional server; stores service date, interval, status, origin, notes and version |
| blocks | References one table and an unavailable interval |
| events | Independent calendar records; table blocking is explicit |
| users / sessions | Login identity and role; hashed session token, CSRF value, expiration |
| audit | User-linked mutation records |
| settings | Singleton restaurant configuration |
| schema_migrations | Applied schema version |

## Transaction behavior

Every operational mutation runs in a `BEGIN IMMEDIATE` transaction. Booking changes read the latest version, validate resources and capacity, test overlapping table reservations and blocks, then write the change and audit row before committing. If any check fails, the transaction rolls back. There is no `await` inside these synchronous transactions.

Active intervals overlap when `existing.start < requested.end` and `existing.end > requested.start`. This permits exact back-to-back bookings while rejecting partial and fully contained overlaps. Completed, cancelled, no-show and waitlisted rows do not reserve tables.

After mutation, React applies the returned authoritative reservation immediately, then refreshes the shared data. This prevents reopening an old booking card while the refresh request is in flight. The server still rejects stale versions from another tab or workstation.

## Persistence and security

SQLite foreign keys prevent dangling references. WAL and a busy timeout support safe local reads and transactions. Passwords use per-user random salts and scrypt. Session cookies contain random tokens; only token hashes are stored. Mutations require CSRF values and reject cross-origin requests. Staff role checks run on the API, independently of hidden UI controls.

This design deliberately avoids external auth, cloud databases, and runtime dependency installation for local startup. It does not provide tenant isolation, distributed sessions, automatic syncing, or horizontal scaling. Extend and test those concerns before using it for a large multi-restaurant service.
