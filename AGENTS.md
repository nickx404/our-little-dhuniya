# Working on Our Little Dhuniya

## Repository and release boundaries

- `dist/` is the public GitHub Pages frontend. `src/notes.mjs` and `src/notes-model.mjs` supply its built Yjs notes module. `backend/` is the separate Oracle application and Telegram upload worker.
- The real private website is `https://our-little-dhuniya.duckdns.org/`. GitHub Pages is the public demo. Publishing this repository does not redeploy Oracle.
- The full private frontend is already configured and deployed on Oracle. Its newer Home, Journey, Keepsakes, Bucket List and Little World work is held in the local `codex/full-site-ready` branch. Publish that work only when the user authorizes it. Existing published Keepsakes and Bucket List versions may remain on `main`.
- Do not copy an entire local checkout into a release without checking its diff. Keep the full private frontend on Oracle when deploying backend-only changes.

## Runtime contracts

- Run one Gunicorn worker with threads and one separate upload worker. Upload and cache locks depend on this topology. Use the supplied systemd units and Caddy configuration.
- Bind the application and local Telegram Bot API to loopback. Public web traffic enters through HTTPS on Caddy. The API validates its configured Host and accepts proxy protocol information only from that loopback deployment.
- Every fresh document, refresh and new tab starts at the paper lock. Oracle verifies the PIN. Authorization stays in the current document's module memory. Do not restore persistent login cookies or browser-stored authorization without an explicit product change.
- Require authorization for private data and mutations. Media uses scoped expiring links. Keep signed URLs, authorization values, PINs and bot credentials out of logs.
- Network upload chunks are at most 8 MiB. Telegram documents are at most 2,000,000,000 bytes. Split larger files only at that document boundary. Do not restore the old 200 MB application cap or describe storage as infinite.
- Stage documents on disk and stream downloads/ranges with bounded memory. Preserve part offsets, sizes, checksums and Telegram identifiers. A failed or interrupted Telegram response can leave an existing post; uncertain sends require explicit reconciliation or an acknowledged retry, never a silent automatic resend.
- Store metadata in SQLite and preserve old archive records. Item removals are recoverable and retain Telegram documents. Shared document writes use versions to reject stale overwrites.
- Notes use authenticated Oracle endpoints and the existing Yjs update format, local recovery and Undo/Redo. Anonymous access to the legacy Supabase notes table was closed after migration. Do not reopen it or discard its recovery rows.

## Private data

- Runtime data lives under `/srv/dhuniya-telegram`, outside the web root. Never commit `archive.json`, SQLite databases, exported notes, snapshots, staging files, tokens, PIN values or SSH keys.
- Use the existing server configuration when updating an installation. Initial setup is interactive through `backend/setup_archive.py`; rerunning it changes signing secrets and invalidates sessions.
- Back up the database before migrations. Daily snapshots are sent to the private Telegram channel and checked before restoration. Preserve channel privacy and keep credentials separately from database backups.
- Use synthetic files and isolated databases for tests. Avoid displaying private notes or credentials in tool output. Preserve the user's existing text, whitespace and line breaks.

## Checks

From the repository root:

```sh
npm ci --ignore-scripts
npm run test:notes
node --test tests/delete.test.mjs
npm run build:notes
node --check dist/app.js
node check.mjs
python -m pip install -r backend/requirements.txt
python -m unittest discover -s backend -p test_backend.py
git diff --check
```

The full-pages branch also checks its journal module through `check.mjs`. Check mobile layout and reduced-motion behavior for UI changes. Preserve the seven-link private header with four links above three; the logo links home.

`backend/verify_live.py` intentionally posts synthetic files to the real private channel. Use it deliberately. The `--large` case crosses the Telegram document boundary and uses substantial bandwidth. Run long checks as durable jobs, and verify checksums, cross-part byte ranges, resume behavior, metadata and cache recovery. Test posts remain in Telegram for inspection; completed test entries can be softly removed from the scrapbook.

## Deployment

- Follow `backend/README.md`. Back up first, preserve runtime configuration and the complete private frontend, deploy the changed files, and restart the appropriate services. Account for in-flight uploads before restarting the sender.
- Check HTTPS, missing-authorization responses, relevant real upload/playback paths and service status. A successful health response alone does not prove Telegram or media playback works.
- Inspect the release for secrets and excluded pages before pushing. Watch the GitHub workflow through completion after a release.
- Renaming the repository changes the GitHub Pages project path. Update Git remotes and public-demo links and verify Pages. Oracle's hostname and relative API paths remain independent of the repository name.
