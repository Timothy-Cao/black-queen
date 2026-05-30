# Design — Audio (OST + SFX), Settings overhaul, end-game polish

**Date:** 2026-05-29. **Status:** implemented. Single-player only (multiplayer unaffected).

## Goals (from the user)
1. Music (OST): smoky-jazz-lounge, menu + gameplay loops, Web Audio playback.
2. New SFX for moments that lacked them; keep the existing zero-asset synth engine.
3. Audio controls = **Music + SFX volume sliders** in a full-screen Settings modal.
4. **Escape** opens Settings in-game; Settings is a full-screen overlay that **blurs + pauses** the game.
5. Speed control **always visible** top-left (done earlier).
6. **Modern SVG** = default card deck (done earlier).
7. Fix AI-difficulty label (Hard-4 showed "Normal") (done earlier).
8. **Bidding** is unmistakable: pulsing gold glow + "● Your bid" header (done earlier).
9. **300-point perfect game** gets a special celebration; non-300 end screen is slimmer/classier and lower-lag.

## Architecture

### Audio
- **`src/game/sfx.ts`** (existing, extended): synth SFX. Replaced the single mute flag with an
  SFX **volume** (`setSfxVolume`/`getSfxVolume`, 0..1; 0 = silent). Exposes
  `getSharedAudioContext()` so music reuses one `AudioContext`. New sounds: `yourTurn`,
  `uiClick`, `illegalMove`, `gameLose`.
- **`src/game/music.ts`** (new, Web Audio — "Option B"): decodes mp3s into buffer sources routed
  through per-voice `GainNode`s under one music master gain. `playScene("menu"|"game"|null)`
  crossfades (1.2s) and loops gaplessly. `setMusicVolume`, `duckMusic` (dip under fanfares),
  `resumeAudio` (autoplay unlock on first gesture). Missing/failed files = silent, never an error.
  Tracks: `public/music/Candlelit Card Room.mp3` (menu), `Candlelit Cards.mp3` (gameplay).

### Settings + pause
- **`SettingsModal.tsx`** (new): full-screen blurred overlay, Music/SFX sliders, AI speed,
  card design, info panel, debug reveal, How-to-play, Quit.
- **`SettingsBar.tsx`** (slimmed): top-left gear (opens modal) + always-visible speed pill.
- **`App.tsx`**: `settingsOpen` state; Escape toggles it (and is no longer a "pass" shortcut —
  pass stays on `p`). The AI driver effect early-returns when `settingsOpen` → true pause.
  Volumes are React state persisted to `bq:musicVol` / `bq:sfxVol` (migrates old `bq:muted`).
  Music scene follows `state ? "game" : "menu"`. New SFX wired: `yourTurn` on the rising edge of
  the human's actionable turn; `illegalMove` when clicking a dimmed illegal card (HandStrip);
  `gameLose`/`gameWin` chosen from the human's perspective at game end; `uiClick` on menu/settings.

### End-game + 300
- **`RoundEnd.tsx`**: non-perfect screen drops `backdrop-blur` + the 60px gold glow → flat
  professional panel (lower GPU cost). Defender Δ shows "—" (their score is unaffected).
  Perfect game (`teamPts === 300`) → gold "★ Perfect Game ★" banner + glow. Confetti gated to
  perfect-only in `App.tsx`.

## Non-goals / notes
- Modern-SVG default applies only when no deck is saved in localStorage (existing choices kept).
- Music files are real assets the user generated via Suno; loop seamlessness handled by code crossfade.
</content>
