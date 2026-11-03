# for us

A browser-only visual prototype of a couple's personal scrapbook. Open `dist/index.html` through a static HTTP server, for example `python -m http.server 4173 --directory dist`.

## GitHub Pages deployment

The `.github/workflows/site.yml` workflow checks JavaScript and local assets, packages `dist/`, and deploys it to GitHub Pages after pushes to `main`. Pull requests run checks without deploying. You can also use **Actions → Build and deploy site → Run workflow**.

In **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. No deployment secret, package installation, or framework build is required. All asset paths are relative so the site works under `/our-little-dhuniya/`.

This deployment is public and contains sample memories. The original media prototype has no private permanent media storage; R Notes has its own private Supabase access. Keep personal photos and credentials out of this repository until private storage and access are implemented.

## Bucket list

Our Bucket List adds wishes with a title, story, category and timing. Wishes can be edited, filtered, checked off, and reopened. Wishes and checkmarks are saved in this browser only; they do not sync between devices. Initial wishes are samples. A failed save keeps the form open, and damaged saved data is left untouched.

The published navigation is Little Moments, Memory Books, Keepsakes, Our Bucket List, and R Notes. The remaining planned pages are being refined locally and are not included in this release.

## R Notes

R Notes is an expanding plain-text writing page inside the same website, with only Undo and Redo as writing controls. Every input event immediately writes a Yjs update to IndexedDB and starts a Supabase insert. There is no debounce, manual Save button, or Edit mode. Whitespace and line breaks are preserved. Supabase Realtime exchanges updates; Yjs merges simultaneous edits and scopes undo to the current writer.

Open the private `#notes/<invite>` link once per browser/device. It automatically creates a device session and joins the private page. There is no email/password form. After pairing, the regular R Notes tab works on that device. Anyone holding the link can join; share it privately. The link is not in GitHub or the deployed files. Its local recovery copy is in the ignored `.env.notes-invite` file in the release checkout. Clearing site data requires opening the private link again.

The live project uses `supabase/notes.sql` and `supabase/private-link.sql`. Only approved members can read and append updates. The public publishable key in `dist/notes-config.mjs` is intentional; it cannot grant access to notes without the private link/membership. No database password or service-role key is used by the site. Invite hashes live in an unexposed private schema. Previously created password accounts are not required by the page.

Offline edits are stored in IndexedDB and merged back on reconnection or reopening. The status says saved only after the shared database acknowledges writes. Browser/network failures cannot guarantee immediate remote delivery. Keep an offline device's site data until it has synced. A failed initial connection is retried; the editor waits for initial synchronization before accepting input.

The append-only update log currently replays on connection, paginated in groups of 500. Add snapshots/compaction if years of updates make startup slow. A single encoded update is capped at 256 KiB; exceptionally large pastes or recovery snapshots show an explicit error rather than discarding text.

The scheduled `notes-health.yml` workflow performs two small database health calls daily, without reading notes. It reduces inactivity risk but does not guarantee the free project will never pause. GitHub may delay schedules or disable schedules on inactive public repositories. Keep Supabase warning emails enabled.

To modify the bundled module: `npm ci --ignore-scripts`, `npm run test:notes`, then `npm run build:notes`. CI performs the same checks and build before Pages deployment. Do not publish Home, Journey, or Little World from the separate local checkout until approved.

## Included

- Pastel scrapbook wall and gallery views, with individual photo and video viewers.
- Memory books with two-page laptop spreads, single-page phone views, animated page turns, keyboard arrows, swipe navigation, and reduced-motion support.
- Separate Keepsakes collection; existing keepsakes and moments can be referenced inside books without copying files.
- Session-only local photo, video, and keepsake previews. Refresh restores sample content. Nothing is uploaded to a server.
- User-supplied bunny (her) and otter (him) illustrations.

Telegram, private shared storage, accounts, and a manual scrapbook arrangement editor are not connected in this visual stage.

## Assets and licenses

Photographs are downloaded sample images from Unsplash. Original image URLs and download commands are in `download-assets.py`; [Unsplash license](https://unsplash.com/license).

Video demonstration: [MDN CC0 flower clip](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4), intentionally labelled as sample content in its description. It requires internet access.

Mali and Patrick Hand are self-hosted from Google Fonts under the SIL Open Font License. Special Elite is self-hosted under the Apache License 2.0. License texts are retained in `dist/assets/licenses/`. Sources: https://github.com/google/fonts/tree/main/ofl/mali, https://github.com/google/fonts/tree/main/ofl/patrickhand, https://github.com/google/fonts/tree/main/apache/specialelite.

The bunny and otter assets were supplied by the user. Other bow, flower, heart, and sparkle decorations are original SVG drawings in the source.

Design settings: variance 8, motion 6, density 4. Custom scrapbook aesthetic using native HTML/CSS/JS. The brief explicitly selects light pastel paper, hand lettering, and multiple pastel accents.

## Checks

Run `node --check dist/app.js` and `node check.mjs`. Browser QA covers navigation, book boundaries, phone layout, media controls, local upload previews, and reuse of a keepsake in a book.
