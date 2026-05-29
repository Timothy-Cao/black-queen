# Backlog — future action items

Audit 2026-05-28. Items NOT blocking publish; most deferred to after multiplayer.
Ordered by value-per-effort within each tier. (Multiplayer itself: see `docs/HANDOFF.md`.)

## Done this audit
- [x] **Top-level ErrorBoundary** — uncaught render errors now show a recovery screen instead of a white page. (`src/components/ErrorBoundary.tsx`)

---

## Tier 1 — Pre-publish polish (cheap, do before a real marketing push)

- [ ] **Social/share meta (OG + Twitter cards)** — deliberately deferred to the multiplayer pass (per owner). A shared link currently has no preview image/description. Add `og:title/description/image`, `twitter:card`, and a share image. ~1h.
- [ ] **robots.txt + (optional) sitemap** — basic SEO/crawlability. Trivial.
- [ ] **Wire `npm test`** — `smoketest.ts` exists (asserts all AI plays legal) but isn't a script. Add `"test": "tsx src/game/smoketest.ts"` (+ `cd rust && cargo test`) so CI/pre-deploy can catch regressions. Cheap.
- [ ] **20 pre-existing lint problems** — 5 `react-hooks/purity`, 5 `no-explicit-any`, 3 `no-unused-vars`, 3 `ban-ts-comment`, 2 `react-refresh/only-export-components`, 1 `set-state-in-effect`, 1 `exhaustive-deps`. All in older components (App.tsx, Confetti, sfx, etc.), pre-date this session. Low-risk cleanup pass; do carefully (don't change behavior).

## Tier 2 — Single-player depth / retention (makes the core sticky)

- [ ] **Resume in-progress game on refresh** — game state is in-memory; an accidental refresh/close loses the game. Persist `GameState` to localStorage (note: `round.passed` is a `Set` → needs a custom JSON replacer/reviver) and offer "Resume" on load. Medium effort, real UX win. Medium risk (serialization must round-trip exactly — test thoroughly).
- [ ] **Persistent stats** — games played / won, bid-make rate, etc. in localStorage. Gives solo players a reason to return. Self-contained.
- [ ] **Difficulty presets** — one-click Easy/Medium/Hard (maps to AI personalities) instead of per-seat dropdowns, for newcomers. Keep the advanced per-seat control behind an "advanced" toggle.
- [ ] **Onboarding / first-game guidance** — rules are a modal; a guided first hand or contextual tooltips lowers bounce for a non-trivial game.

## Tier 3 — Mobile / UX refinement

- [ ] **Portrait table redesign** — in-game seat pills still clip slightly at screen edges on narrow phones (game is playable; this is cosmetic). Proper fix: reposition the 5 seats for portrait aspect ratios (the current ellipse layout assumes landscape-ish). Medium effort.
- [ ] **Verify AIInfoPage (AI Notes) on mobile** — its tab bar may overflow on narrow screens (unverified this session; HelpModal and all other screens are confirmed fine).
- [ ] **Accessibility pass** — ARIA labels on icon buttons, focus management for modals, keyboard nav for card play (some shortcuts exist). 

## Tier 4 — Performance / infra (larger or higher-risk)

- [ ] **PWA / service worker** — installable + offline single-player + asset caching. Use `vite-plugin-pwa`. Real value for a card game, but service workers cause stale-cache bugs if misconfigured — do deliberately, not rushed.
- [ ] **Compress card art** — `public/cards` is ~1.8MB across 4 skins (only the active skin loads, so not critical). Optimize PNGs / inline small SVGs if it matters.
- [ ] **Vendor chunk-split** — `manualChunks` to separate react/react-dom from app code for better long-term caching across deploys. Marginal.

## Tier 5 — AI (the real "Hard-5")

- [ ] **Learned card-location inference** — the evidence-backed path, Phase 1 de-risked (AUC 0.865). See `docs/hard5_literature_plan.md`. Multi-week (data pipeline → MLP → Rust forward-pass → A/B). Not a quick win; only if AI strength becomes a priority.

## Notes / known edge cases (low priority)
- **All-`random` bidding stalls in redeal loop**: if a user sets all 5 AI personalities to "Random" (which always passes), every bid round all-passes → engine redeals indefinitely (no game starts). Unreachable by default; only via deliberate all-Random config. Guard idea: after N consecutive redeals, force the dealer to bid the minimum. Don't touch `engine.ts` reducer casually (used by the ES tuner).
- **Service-role key discipline** (multiplayer): never expose it client-side; Edge Functions only. Already documented in `docs/auth_setup.md` + `docs/multiplayer_todo.md`.
