# CLAUDE.md

Instant Racing: a mobile-first instant horse **and greyhound** racing betting game (play money). A Horses/Dogs toggle in the top bar switches sport; it is one engine with per-sport config in `public/js/sports.js`. Sibling of iHockey, and it uses the same deploy model: an Express static server, SCSS, and vanilla ES modules with no bundler.

## Commands

```bash
npm run dev          # SCSS watch + server auto-reload (PORT env, default 3100)
npm start            # compile SCSS once, then serve
npm test             # node:test — pricing, settlement, field/market sanity (scripts/*.test.mjs)
npm run races        # rebuild public/data/races.json from "Test Videos/*.txt" + "Dog racing videos/*.txt" (with asserts)
npm run transcode    # re-encode both sports' sources → public/assets/races/(dogs/) (needs ffmpeg; `-- 28 dogs` for one sport)
npm run telemetry:dogs  # derive "Dog racing videos/*.txt" from the footage + *.keys.json (needs ffmpeg)
```

Debug: `?race=190` / `?race=d01` forces a specific video every race (and switches to its sport). `?sport=dogs` opens on dogs. `window.__ir.state`, `__ir.setSport('dogs')` in the console.

## Race assets pipeline

- The source videos in `Test Videos/` are **MPEG-4 Part 2**, which browsers can't play, and are 46MB each. They are gitignored.
  - `scripts/transcode.sh` makes 540p H.264 `+faststart` versions (~10MB, trimmed to 65s) plus a poster JPG.
- Each video has a telemetry `.txt` with **one line per frame at 25 fps**: `phase, leaderDistanceToGo, horse numbers in running order (leader first)`.
  - Phases: `G` in the gates, `I` running, `R` pull-up, `1`/`2` slow-mo finish replay, `3` empty shot.
  - The finish is the first `I` frame with distance 0.
- `scripts/build-races.mjs` compresses this into `races.json`: order-change events, sampled distance, finish and replay frames, and the result. It asserts consistency.
  - The runner count, distance and finish frame are all read from the data. New videos (e.g. 6 runners / 400m) just need the mp4 + txt, then running the two scripts.
- Silks per saddle number are in `public/js/sports.js` (`SILKS`). They match the jockeys in the videos and are the same across every video.

### Greyhounds (`Dog racing videos/`)
- Kiron virtual greyhound races: 6 traps, 720m, 1080p30 H.264, ~150MB each (gitignored). Kiron's HUD (venue, distance, running-order bar) is burned into the footage and kept as-is.
- They ship **without telemetry**. `scripts/derive-dog-telemetry.mjs` reads the burned-in order bar (6 trap chips at fixed pixel slots, classified by colour) on every frame, debounces chip-slide flicker, and writes a `.txt` in the horse format (at 30 fps, with `# venue=` / `# fps=` headers).
- Per-video `<name>.keys.json` holds the hand-checked parts: `jumpFrame`, `finishFrame` (read off the line cam), `replayStart`/`replayEnd`, `result`, distance keyframes (the HUD distance is linear, so `[[jump,720],[finish,0]]`), and `overrides` for frames the classifier can't see (e.g. a pass on the last frames before the bar fades). The script asserts the last bar read equals `result`.
- Adding a dog video: drop the mp4 in, run `npm run telemetry:dogs -- --dump` to inspect reads, write its keys file (check frames with ffmpeg contact sheets), then `npm run telemetry:dogs`, `npm run transcode -- 28 dogs`, `npm run races`. Race ids are `d<nn>`; assets go to `public/assets/races/dogs/dog-<nn>.mp4/.jpg`.
- Trap colours (`TRAPS`, matching the Kiron chips): 1 red, 2 blue, 3 white, 4 black, 5 yellow, 6 black/white hoops.

## Architecture (`public/js/`)

| Module | Role |
|---|---|
| `main.js` | Boot + phase machine (`betting → racing → result`; ~1.2s finish-line beat on natural finishes, none on Skip/Instant), shuffle bag per sport, `setSport()`, rebet/next, settings, history, replay |
| `state.js` | Single mutable `state` + tiny event bus (`emit`/`on`) + `$`/`$$` |
| `pricing.js` | **Pure** (also imported by node tests): bet types, Harville exotic pricing, combination expansion, `settle()`, exact `maxReturn()`, `liveState()`, odds formats |
| `sports.js` | Pure per-sport config: runner profiles, silks/traps, surface, wording, exotic list, UK greyhound labels (Forecast/Tricast, boxed = Reverse Forecast/Combination Tricast), `betLabel()`/`betHint()` |
| `field.js` | Pure: random profiles of the sport → saddle/trap numbers; rescales prices to a fixed book (11% win, 11% per place) |
| `racecard.js` | Runner list, Win/Place odds buttons, exotic pick grid + builder bar |
| `betslip.js` | Bottom-sheet slip, stakes, bet descriptions (shared by other views) |
| `race.js` | Video → frame clock (timer fallback for data saver / video failure), distance rail, running-order strip, live bet states, callouts, skip, finish beat |
| `results.js` | Win / partial-return / loss hero, podium, settled bets, actions |
| `ui.js`, `fx.js`, `silks.js`, `store.js` | View transitions/sheets/toast (emits `phase`), GSAP + canvas particles, `runnerIcon()` silk / trap-jacket SVGs, persistence + money/odds formatting |

Key rules:
- **Sport**: `state.sport` (`horses`|`dogs`, persisted in `settings.sport`); `sport()` in `state.js` returns its config. Each race in `races.json` carries `sport` and `venue`. Switching is only allowed in the betting/result phases (toggle buttons are disabled while racing); it clears the slip and Rebet picks and starts a new race. Balance and history are shared (history entries are tagged with the sport). Never hard-code "horse" copy: use `sport().noun` / `betHint()`.
- `BET_TYPES` keys are the same for both sports, so `settle()`/pricing never branch on sport. Only labels and the offered exotics differ. With 6 runners `placesFor()` pays the top 2.
- **Every bet uses one shape**: `{ type, stake (per combo), box, legs, combos: [{sel, price}] }`. `settle(bet, finishOrder)` handles every market, and so do live status and max return. Prices are fixed when the bet is added.
- **Balance**: the stake is deducted when the bet is placed. Winnings are added to `state.balance` at the finish, but the pill only animates on the result screen. Don't show winnings before the reveal (iHockey's mistake).
- The result is decided by which video plays, and the video is chosen during betting (shuffle bag) so it can preload. Odds only describe a fair market, and the result is not drawn from them.
- Win celebrations (confetti/coins) only happen when the return is **more than the stake**. A partial return is shown plainly, with no fake "win" (responsible-gambling norm).
- Show/hide overlays with opacity/visibility classes. `newRace()` resets race/reveal state.
- `localStorage` holds settings and demo balance, and `sessionStorage` holds bet history. All access is wrapped in try/catch.

## Styles

`scss/style.scss` pulls in the partials (`_tokens`, `_base`, `_card`, `_slip`, `_race`, `_result`, `_sheets`, `_responsive`). **`public/css/style.css` is compiled output, so never edit it.**
- Colours are CSS custom properties in `_base.scss :root`. Easing, breakpoints and mixins are in `_tokens.scss`.
- Fonts: Big Shoulders Display (display/numbers) and Instrument Sans (UI, weight 500).
- Layouts:
  - Full-bleed on phones.
  - Landscape phones get a full-screen video HUD.
  - At ≥768×600 the app becomes a 440px shell over a blurred race still.
- Bump `?v=` on the CSS link when deploying CSS changes. The JS modules have no version query, so a hard refresh may be needed after a deploy.
