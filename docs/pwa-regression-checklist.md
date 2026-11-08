# RoadLens PWA regression checklist

Use this checklist before and after each PWA/mobile change. Mark device/browser checks as **not run** until performed on actual hardware; CSS inspection is not device verification.

## Baseline invariants

- [ ] Root `index.html` remains the deployed frontend entry; `car-ai` remains legacy-only.
- [ ] Existing `/api/analyze` endpoint, JSON request contract (`images` + `mimeTypes`), Gemini prompt, response schema, server-side API key handling, and penalty rule calculation are unchanged.
- [ ] A single user-initiated analysis produces one frontend `/api/analyze` request; no automatic/repeated Gemini requests are added.
- [ ] Existing `requestState` prevents duplicate submits; `AbortController` cancellation remains functional.
- [ ] Existing image type/size/resolution checks remain in place. Compression or quality-check changes require their own before/after checks.
- [ ] AI result and confidence remain distinct from human review and legal certainty. Missing official fine data is shown as requiring verification; never inferred from Gemini.
- [ ] History data and user decisions are not overwritten or silently migrated.
- [ ] No GPS/location permission or upload is introduced without explicit user action and consent.
- [ ] Desktop layout remains visually equivalent to the approved desktop baseline.

## PWA / mobile shell

- [ ] Manifest name, short name, start URL, scope, standalone display, theme/background colors, orientation, and icon paths validate.
- [ ] Service Worker installs and activates; app shell assets are reachable and cache version changes when needed.
- [ ] `/api/` requests are not intercepted or cached by the Service Worker.
- [ ] iOS Safari Add to Home Screen launches in standalone mode; status bar, Dynamic Island/notch, and portrait layout are checked.
- [ ] Android Chrome offers installation and launches standalone; portrait and narrow viewport layout are checked.
- [ ] Safe-area top/left/right/bottom insets are respected; bottom controls clear the home-indicator/gesture region.
- [ ] Fixed bottom navigation has five accessible destinations: Home, Analyze, Cases, Statistics, Settings; focus/active state and anchor behavior work.
- [ ] Content can scroll to the final control/card without being covered by the fixed navigation.
- [ ] Touch targets are comfortable; keyboard focus and reduced-motion behavior remain usable.
- [ ] Screens are checked at compact phone widths, iPhone 12/13/14 viewport sizes, and Android phone sizes, including landscape where supported.

## Analysis and results

- [ ] Camera and photo-library selection both work on iOS and Android.
- [ ] Unsupported, oversized, unreadable, and low-resolution images show actionable errors.
- [ ] Loading, API error, rate-limit, timeout, cancellation, and successful-result states are verified.
- [ ] Result rendering uses escaped text; evidence preview uses the selected image and does not persist it unless the user opts in.
- [ ] Empty/uncertain results, contradictions, human-review state, official rule source, and missing fine data render safely.
- [ ] User-confirmed review state is stored separately from immutable AI analysis output.

## Data, privacy, and history (later phase)

- [ ] Storage location and retention are documented; user can delete records and associated images.
- [ ] No raw image or GPS data is persisted by default without clear consent.
- [ ] History migration is tested against existing browser data before deployment.
- [ ] Case search, filter, favorite, status, counts, and report export do not trigger analysis requests.

## Automated and manual test record

- [ ] `npm test`
- [ ] `npm run build`
- [ ] Browser/API smoke test with a configured backend (no secrets in client code)
- [ ] Desktop visual regression
- [ ] iPhone Safari browser mode and installed standalone mode
- [ ] Android Chrome browser mode and installed standalone mode
- [ ] Offline shell fallback and return-online analysis behavior
