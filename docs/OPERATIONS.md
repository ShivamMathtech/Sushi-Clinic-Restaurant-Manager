# Operation and troubleshooting

## Daily use

Start the server once, keep its terminal open, and open `http://localhost:3040`. Use Ctrl+C in the server terminal to stop it cleanly. Restarting keeps all records. The sample bookings are tied to the first startup date, so if you return later, use the date picker to see them.

The server is bound to `127.0.0.1` by default. Only this computer can access it. To use a trusted local network, set `HOST=0.0.0.0` in `.env` and open the host computer's IP and port from another device. Change the demo passwords first. Use an HTTPS reverse proxy and `COOKIE_SECURE=true` for an HTTPS deployment; never set secure cookies on plain local HTTP. The application does not provision certificates or public hosting.

## Configuration

Copy `.env.example` to `.env`. Windows may hide extensions; confirm it is `.env`, not `.env.txt`.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3040` | HTTP port |
| `HOST` | `127.0.0.1` | Listening address |
| `DATA_DIR` | `./data` | SQLite directory, resolved from the project root |
| `SEED_DEMO` | `true` | Seed fictional demo data on a new database only |
| `ADMIN_EMAIL` | `admin@sushiclinic.local` | Initial administrator email |
| `ADMIN_PASSWORD` | Demo default | Initial administrator password; required when demo seeding is disabled |
| `COOKIE_SECURE` | `false` | Set `true` only behind HTTPS |

If a password contains spaces or `#`, quote it in `.env`. Changing `ADMIN_PASSWORD` does not change an existing account. Change existing passwords through the account dialog. Password recovery by email is not implemented.

The database schema is initialized idempotently on startup; migration version 1 is recorded in `schema_migrations`. Do not edit tables directly while the app runs.

## Back up

Double-click `BACKUP_WINDOWS.bat`, or run:

```bash
npm run backup
```

This uses SQLite's consistent backup API and can run while the server is open. Files are written to `backups/` with a timestamp. These backups contain guest records and staff password hashes, so keep them private. The database and backup directories are not included in the supplied ZIP.

`Settings → Data & backup → Export restaurant data` creates a JSON export of operational records. It excludes staff accounts, passwords, and sessions. That export is not a one-click restore backup.

## Restore a SQLite backup

1. Stop the server completely.
2. Keep an extra copy of the current `data` directory.
3. Move the current `sushi-clinic.sqlite`, `sushi-clinic.sqlite-wal`, and `sushi-clinic.sqlite-shm` files out of the active data directory if present. Move them together so old journal files cannot be mixed with a restored database.
4. Copy the desired backup into the data directory as `sushi-clinic.sqlite`.
5. Start the app and verify records and account access.

Do not copy or delete SQLite journal files while the server is running. Restoring a complete backup restores its accounts and sessions too; sign out and sign in again if necessary.

## Begin with clean records

Back up and stop the app. Instead of deleting your current data, set `DATA_DIR=./data-live` in `.env`, set `SEED_DEMO=false`, and set a new `ADMIN_EMAIL` and `ADMIN_PASSWORD`. Restart. The old database remains in its original directory and the new one starts without demo guests or bookings.

## Common issues

| Symptom | Action |
| --- | --- |
| `node is not recognized` | Install Node.js 24 LTS, then open a new terminal or rerun the launcher. |
| `No such built-in module: node:sqlite` | The Node version is too old. Use Node.js 24, not Node 18/20. |
| SQLite experimental warning | Some Node 24 builds emit a warning. If the ready URL appears, the application has started. |
| `EADDRINUSE` / port occupied | Stop the previous instance, or change `PORT` to `3041` and restart. |
| Empty page after opening HTML | Do not open `frontend/index.html` or `dist/index.html` as a file. Use the HTTP URL while the server runs. |
| `Failed to fetch` | Confirm the terminal is still running and the address/port is correct. |
| Login error | Use the exact email and password; passwords are case-sensitive. Existing account passwords are not reset from `.env`. |
| Login succeeds but session disappears | If using local HTTP, set `COOKIE_SECURE=false`; allow cookies for localhost. |
| Too many login attempts | Wait 15 minutes before retrying. Limits are per client IP and process-local. |
| Table unavailable | Adjust start time, party size, or duration, or choose another table. Check scheduled table blocks. |
| Stale reservation error | Close the dialog, use Refresh, then reopen the reservation. Another change won the update. |
| Cannot disable table/server | Reassign upcoming active bookings first. A server's table assignments are cleared when safely disabled. |
| Cannot delete guest | Reservation history is protected. Edit the profile or keep it for audit/history. |
| First launch has no sample bookings | `SEED_DEMO=false` was used, or the database already existed. Seeding never overwrites your records. |
| `npm ci` fails behind a proxy | Check network/proxy settings. Dependency installation is only needed for editing or testing; the bundled app still runs with Node alone. |

## Time handling

Reservation dates and times are restaurant-local wall-clock values, independent of the server operating system's zone. The restaurant zone controls the service-day default and header clock. Audit and creation timestamps use UTC. Daylight-saving ambiguous times have no special disambiguation in this local version. One continuous, same-day opening interval is supported.

Table status at a selected time derives from planned reservation intervals and blocks. A seated record does not automatically extend its duration. Hosts should update duration before an overrun to protect the table from another booking.

## Production deployment considerations

This is a self-contained local application, not a managed hosting service. For public deployment, supply HTTPS, restricted filesystem permissions, unique accounts, backup retention, firewall configuration, and monitoring. Disable the demo accounts or use an empty database. Secure cookie settings depend on the external HTTPS URL. Login throttling uses the socket IP, so proxied clients share the proxy address; no untrusted forwarded headers are accepted.

The app does not send payment transactions, emails, SMS, or external booking requests. The JSON export and CSV downloads are explicit user actions.
