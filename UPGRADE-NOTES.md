# Better Thyself website upgrade

Prepared October 24, 2026. Changes are in this local checkout; GitHub and the live Cloudflare site have not been changed.

## Latest videos and Shorts

The old home gallery and store carousel read the first item of a manually ordered playlist. The full-episode playlist starts with the September 7 upload even though newer episodes exist. Rebuilding the gallery also selected the first card again, including after Load More.

Both pages now share `youtube-feed.js`. The Videos and Shorts tabs use separate channel-generated feeds, order public entries by `contentDetails.videoPublishedAt`, and exclude private, deleted, unlisted, or future-dated entries. The carousel uses the latest full episode. Each visited feed refreshes every five minutes while the tab is visible, and checks again on returning to a stale tab. Refresh errors preserve working content. Loading more does not restart the player, and a new upload does not interrupt a selected video. An untouched preview updates to the newest upload automatically.

Verified against the live API with the existing key and production referrer:

| Feed | Newest public item at verification | Published (UTC) |
| --- | --- | --- |
| Full episodes | You start something all hyped up, then quit… right? (`aLIrqsRmNb4`) | October 23, 2026, 14:50:12 |
| Shorts | You Must F*** The World — motivational Short (`Q-hziyTnPXo`) | October 24, 2026, 12:49:05 |

The tested feeds returned seven full episodes and twelve Shorts. A short landscape episode remains in Videos; the code does not guess Shorts membership from duration.

**Maintenance limit:** YouTube's `UULF` (Videos) and `UUSH` (Shorts) channel-playlist ID conventions are not a documented API contract. They were tested successfully on this channel. If YouTube rejects those playlists with HTTP 400/404, the code falls back to the existing curated playlists and scans all their pages before sorting. That fallback is bounded at 1,000 playlist entries. If YouTube changes its generated feeds, automatic inclusion of new uploads then depends on keeping the curated playlists current. Restrictions/quota failures do not trigger repeated fallback requests.

The existing Google API/referrer restrictions are retained. No new secret or backend is required. A local file or localhost preview may be rejected by those restrictions; that is expected. Use an allowed preview/deployment origin to test live feeds in a browser. A separate server cache may be worthwhile if visitor volume makes the five-minute, per-browser API checks costly.

## Memory findings and choices

The screenshot establishes that the browser reported **429 MB for the Home tab**. It does not identify allocations, establish a leak, or show which resources caused that number. No connected browser was available for a runtime memory profile or before/after comparison. No new total memory figure is claimed.

The following are measured file properties and code observations. The decoded-image figures use `width × height × 4` bytes for a full-resolution RGBA frame; actual browser decoding, caching, downsampling and GPU allocations vary. Do not add these estimates together and call the result measured tab memory.

| Item | Evidence and relevance | Recommendation / current change |
| --- | --- | --- |
| Embedded YouTube player | Home previously created a third-party iframe as soon as its gallery loaded. The store also created its product player automatically. Embedded players add their own scripts, documents and video decoding costs; they are the leading candidate to profile, not a measured explanation of the entire 429 MB. | Keep the videos. Click-to-play previews now create the player only after Play or a video-card click. The third-party cost returns during playback. Removing inline playback entirely and linking to YouTube is an optional, larger UX tradeoff. |
| About portrait | Original PNG is **4,481,714 bytes**, 1836 × 2448, about **17.15 MiB per full-resolution decoded frame**. Used on Home. | Retained the original. Home now uses a **76,098-byte WebP**, 960 × 1280, about **4.69 MiB per full-resolution frame**, loaded lazily. No portrait deletion needed. |
| Arch image | Original is 2000 × 2000, about **15.26 MiB per full-resolution frame**. | Replaced the displayed image with the supplied golden helmet photograph, delivered as a **768 × 768 WebP, 8,414 bytes**, about **2.25 MiB per frame**. The original image remains in the repo. The arch shape is retained. |
| Favicon | Original icon is **1600 × 1600 and 554,060 bytes**, about **9.77 MiB if decoded at full resolution**. Far larger than its UI use requires. | Retained the original. All pages now reference a **64 × 64, 3,761-byte icon**; touch devices get a separate 180px icon. |
| Animated ASCII GIF | **1200 × 646, 13 frames, 660,428 bytes**. One RGBA frame is approximately **2.96 MiB**; all 13 full RGBA frames would be **38.44 MiB**, an illustrative upper calculation, not a measured cache allocation. **It appears on Store, not Home**, so it cannot directly explain the reported Home-tab number. | Kept it, with lazy loading. Consider a static frame or modern video only if the animation is not worth its Store-page cost. No deletion made. |
| Carousel | Store continuously moves a track and creates cloned slides. Its previous clone count targeted a fixed 2000px rather than the visible width. | Preserved the carousel. Clone count now follows the viewport; refresh replaces old clones rather than accumulating them. Motion pauses off screen, in a hidden tab, on hover/focus, or using the pause control. |
| Grain, blending, blur and glows | Full-screen SVG grain uses a blend layer; navigation uses backdrop blur; some buttons continuously animate shadows. These can add painting/compositing work. Their memory cost has not been measured. | Kept the existing look. Only simplify these after comparing rendering performance with each effect disabled individually. |
| PDF and unused originals | The PDF is about **5.19 MB on disk**. It is linked rather than embedded. An image merely being present in the repo does not cause it to load. | Deleting downloadable material or unused originals is not an effective first fix for Home-tab memory. |

**Suggested decision:** keep the embedded-video feature with the new preview behavior, keep the lighter image variants, and profile before deleting the GIF or visual effects. If memory becomes high only after Play, decide whether inline viewing is worth that playback cost. A single memory badge is insufficient to diagnose a leak.

For a useful comparison, use the same browser, viewport and extensions, close unrelated copies of the site, and compare: (1) initial page before Play, (2) after scrolling the page, (3) during playback, and (4) after several video changes. Record process footprint and JavaScript memory separately, and compare equivalent fresh sessions. Browser profiling is still required to quantify improvements.

## Motion and image changes

- Section and image reveals happen as they enter the viewport, with restrained staggered timing.
- Navigation underlines, social icons and call-to-action hover movement provide feedback.
- Reveals use opacity and transforms, and run once. No animation library, scroll polling or permanent `will-change` hints were added.
- Reduced-motion preferences show content immediately, disable carousel movement and button pulses, and use native instant FAQ expansion.
- The arch uses the supplied helmet photograph. Original media, products, GIF, copy and branding are preserved.

## Validation and handoff

**Passed:** JavaScript syntax checks; 11 automated regression tests covering separate feeds, newest-first ordering, private/future entry exclusion, cache deduplication, fallback pagination, restriction errors, click-to-play behavior, player preservation on Load More/refresh, tab-loading races, safe title rendering, carousel refresh, reduced motion, pagination cursor preservation, and hidden-tab polling. The final shared feed implementation was also exercised against the live YouTube API.

**Not verified:** visual desktop/mobile layout, drag feel, actual YouTube playback in a browser, or browser memory totals. The session had no connected browser. Automated DOM checks cannot substitute for these checks.

The website remains buildless HTML/CSS/JavaScript. Test dependencies are development-only: install them inside `tests` and run its test command (`npm install`, then `npm test` from that folder). Do not deploy a `node_modules` directory. The delivery archive excludes Git metadata and test dependencies, and includes all original site media.

Review `index.html` and `shop.html` on an API-authorized origin before deploying the local changes through the existing GitHub/Cloudflare process. No commit, push or deployment was made.

## Sources

- [YouTube playlist item fields](https://developers.google.com/youtube/data/reference/rest/v3/playlistItems) distinguish video publication time from playlist metadata.
- [YouTube channel listing](https://developers.google.com/youtube/data/reference/rest/v3/channels/list) was used to verify the channel identity. The generated category-playlist convention above is based on direct testing, not a claim of documented support.
- [Google's embed performance guidance](https://web.dev/articles/embed-best-practices) explains the costs of third-party embeds and the use of click-to-load facades.
- [Chrome's memory investigation guidance](https://developer.chrome.com/docs/devtools/memory-problems) distinguishes process footprint, JavaScript heap, bloat and leaks.
