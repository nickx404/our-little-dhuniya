# for us

A browser-only visual prototype of a couple's personal scrapbook. Open `dist/index.html` through a static HTTP server, for example `python -m http.server 4173 --directory dist`.

## GitHub Pages deployment

The `.github/workflows/site.yml` workflow checks JavaScript and local assets, packages `dist/`, and deploys it to GitHub Pages after pushes to `main`. Pull requests run checks without deploying. You can also use **Actions → Build and deploy site → Run workflow**.

In **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source. No deployment secret, package installation, or framework build is required. All asset paths are relative so the site works under `/our-little-dhuniya/`.

This deployment is public and contains sample memories. It does not provide authentication or permanent storage. Keep personal photos and credentials out of this repository until private storage and access are implemented.

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
