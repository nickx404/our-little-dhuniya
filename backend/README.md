# Private scrapbook backend

Oracle hosts the private site, API, SQLite records and local Telegram Bot API. GitHub stores source and deploys the public demo. The backend does not run on GitHub Pages.

## Runtime

Use Ubuntu, Python 3.11 or newer, Flask 3.x, Gunicorn and Caddy. The existing Telegram Bot API must run in local mode on `127.0.0.1:8081`, with its working directory under `/srv/dhuniya-telegram`. Never expose that port. The two-person deployment uses one Gunicorn worker with threads and one separate upload worker. Multiple Gunicorn processes are unsupported because cache leases and upload locks are process-local.

1. Copy `backend/` and the approved `dist/` to `/srv/dhuniya-telegram/app/`. An optional full private frontend can replace that deployed `dist/` without changing the API or publishing those pages to GitHub.
2. Install `requirements.txt`, or the equivalent Ubuntu Flask/Gunicorn packages. Keep `/srv/dhuniya-telegram` owned by the service user and mode 0700.
3. For initial setup only, run `python3 setup_archive.py`. It checks the bot and private channel and stores `archive.json` with restrictive permissions. Existing installations retain their configuration and shared PIN. Reconfiguration changes signing secrets and invalidates sessions.
4. Create `/srv/dhuniya-telegram/site.env` containing `DHUNIYA_HOSTS=127.0.0.1:4178,our-little-dhuniya.duckdns.org`. Include `DHUNIYA_SITE` if using a different frontend location.
5. Install the service and timer files from `deploy/`. Enable `dhuniya-archive`, `dhuniya-upload-worker` and `dhuniya-backup.timer` with systemd.
6. Point the DNS hostname to the VM. Permit inbound TCP 80 and 443 in the subnet security list and operating-system firewall. The application and Bot API remain bound to loopback. Retain SSH for administration.
7. Install the Caddy configuration and reload Caddy. Its automatic HTTPS needs publicly reachable DNS and web ports. Do not enable URL access logging, which could record signed media links.

The public demo's private-site link is configured once in `dist/notes-config.mjs`. Server-rendered assets and API calls use relative URLs. Renaming the GitHub repository only requires updating Git remotes and public-demo links and verifying the Pages build; the Oracle address and stored files remain independent.

## Authentication

Every document load serves the lock. PIN verification returns a signed authorization token held only in the page's JavaScript module memory, valid for up to 12 hours. Refreshing or opening another tab loses that token and requires the PIN again. PIN failures are recorded in SQLite and throttled to five failures per minute. Private endpoints reject missing authorization. GET assets contain application code and sample artwork only, with no stored personal data.

Media URLs are signed for one item and expire after an hour. Anyone possessing such a URL can use it until expiry; the application sends `Referrer-Policy: no-referrer`. Download responses are private and not cached. Reopening a memory obtains a fresh URL. Stored authorization never uses cookies or browser storage.

## Upload and download protocol

- `POST /api/uploads` creates or resumes a UUID upload with original filename, byte size, a SHA-256 fingerprint of its first MiB, title, caption, date, tags and collection. The fingerprint detects a commonly mistaken file selection; it does not prove that every byte in a reselected file is identical.
- `PUT /api/uploads/{id}/parts/{number}` receives up to 8 MiB with `Upload-Offset` and `Upload-Checksum` headers. Acknowledged chunks survive restart. Repeating an acknowledged chunk is checked against staged bytes. Trailing bytes from an uncommitted write are discarded on resume.
- Each Telegram document contains at most 2,000,000,000 bytes. Documents are queued after assembly on disk, and the next document starts after the preceding document is confirmed. A 3,000 MB source becomes a 2,000 MB document plus a 1,000 MB document. RAM use is bounded independently of source size.
- `GET /api/uploads/{id}` reports part states. A separate worker serializes Telegram sends. An interrupted send response or worker restart marks the part uncertain. An explicit retry acknowledges that a Telegram post might already exist. The worker never silently resends an uncertain part.
- `POST /api/items/{id}/link` issues the signed media URL. The media route serves byte ranges across document boundaries and sets the original filename for downloads. Browser playback depends on the original file's codec. Unsupported formats remain downloadable.
- Metadata edits update SQLite. Removal marks the item deleted and unlinks saved book references while retaining Telegram documents. Cancelled uploads retain already sent Telegram parts.

Files have no 200 MB application cap. A finite disk reserve, browser numeric limits, service availability and Telegram's per-document limit still apply. The staging allocator reserves headroom for incoming documents and a Telegram copy. The known downloaded-file cache has a 6 GB target. Open file descriptors allow in-flight streams to survive cache eviction on Linux. Telegram state databases, credentials and staging paths are never cache eviction candidates. The local Bot API maintainer permits manual deletion of downloaded cache files; live verification also checks re-download after deletion.

## Notes migration

The private frontend preserves Yjs CRDT updates, device recovery and Undo/Redo, with authenticated incremental polling to Oracle. The old database rows are retained for recovery.

1. Freeze legacy writes using `supabase/freeze-notes.sql`.
2. Export all `id,payload` rows from the legacy notes table in ascending sequence order into a private JSON array. Include all pages of results.
3. Back up the Oracle database, then run `python3 import_notes.py /private/path/export.json`. Import is idempotent by update UUID.
4. Verify the same text and line breaks on the private website and compare imported update IDs/counts.
5. Run `supabase/close-public-notes.sql`, then verify that anonymous reads and inserts are denied. Keep the export outside Git and outside the web root.

## Backup and restore

The daily timer takes a consistent SQLite backup, checks database integrity, and posts the snapshot as a document to the same private channel. It retains seven local daily snapshots. Snapshots contain private notes and metadata; keep the channel private. A lost response may leave an extra backup post. Bot credentials and signing secrets are not included in the database backup and must be retained separately and securely.

To restore, stop the API and upload worker. Preserve the current database and its WAL files together in a private recovery directory. Download a selected snapshot from the private channel. Run SQLite `PRAGMA integrity_check` against the snapshot, copy it to the configured database path while the services are stopped, and restore service-user ownership and mode 0600. Restore `archive.json` separately if rebuilding the server. Start the services and verify notes, a known file and metadata. Telegram documents must still exist and be accessible to the configured bot.

## Checks

Run `python -m unittest discover -s backend -p test_backend.py`, `node check.mjs`, `npm run test:notes`, and `node --test tests/delete.test.mjs`. Backend tests use an isolated temporary database and a fake Telegram transport.

`python3 verify_live.py --port 4178 --large` explicitly uploads synthetic files to the real configured channel, including a file 257 bytes over the document boundary. It verifies original checksums, cross-part byte ranges, metadata edits, cache recovery and soft removal. Test Telegram documents remain available for inspection. Run it deliberately with sufficient bandwidth and disk space. Run it as a durable systemd transient job for lengthy tests so a disconnected SSH session does not stop the verifier.

Use `journalctl` for service errors and `/api/health` for basic process health. A successful health response alone does not verify Telegram connectivity. Keep logs free of credentials, authorization headers, private notes and signed media URLs.
