# R112: one minimal video player for the web app

## What changed
- New `apps/web/src/components/VideoPlayer/` (component, CSS, 13 unit tests). It wraps a real `<video>` (no native `controls`, `controlsList="nodownload noplaybackrate nofullscreen"`, `disablePictureInPicture`, context menu blocked) with:
  - a surface button: tap or click toggles play/pause, play icon when paused, named "Play video" / "Pause video";
  - an always-visible 44x44 mute button named "Mute video" / "Unmute video" with `aria-pressed`;
  - a thin progress bar at the bottom edge, a `role="slider"` ("Video progress", `aria-valuemin/max/now`, `aria-valuetext` like "0:12 of 1:05"), draggable by pointer and touch, keyboard: ArrowLeft/Right 5 s, Home/End.
  - Only one player plays at a time. Autoplay falls back to muted if the browser blocks sound. Focus rings, reduced-motion respected, brand tokens only, no new dependency. A very small clip gets a minimum box (180x140) so the controls never overlap.
- Three call sites now use it:
  1. `pages/community/MediaElement.tsx` (props `onLoadError`/`onLoaded`/`onDuration`/`playVideo`, preload behaviour and aria-label "Video attached to this post" kept; `useViewHeartbeat` still finds the real `<video>`; SensitiveMedia blur and its minimum size are untouched).
  2. `pages/ContestVotingPage.tsx`.
  3. The `pages/search/VideosCarousel.tsx` modal (still autoplays).

## Left alone
`apps/admin` (native controls), the carousel tile preview videos, FinalWeekCarousel's muted preview, the blog CoverMedia comment, upload limits, the "Checking" state, posting.

## Copy
Only new accessible names were added. They are not tagged and `docs/pending-copy-manifest.md` needs no entries (it lists only tagged strings).

## Tests
- `tsc`, eslint, production build: clean.
- Vitest: VideoPlayer 13 tests; the community and search folders 307 tests pass, 0 failed.
- Playwright (run alone, real Chrome, real API): new spec 69 (desktop and mobile: no native chrome, play/pause, mute, bar click and drag, keyboard seek, tab order) 2 passed; specs 41, 18, 62 and 16 (pinned clock) passed earlier.
- Screenshots in `docs/r112-screens/` (desktop and mobile, paused and playing).

## Not verified
Real-device autoplay and iOS Safari behaviour; touch dragging was exercised through pointer events in Chrome only. The full Playwright suite and CI were not run.
