# CLAUDE.md

Instant Racing: a mobile-first instant **greyhound** racing betting game (play money), with a widescreen desktop layout. It is one engine with per-sport config in `src/app/core/sports.ts`. The **lobby** (tap the wordmark's two stripes) offers three **games** (`GAMES` in `sports.ts`): **Summerset Park** (8 dogs, the default: four 8-dog videos plus a 6-dog video with 2 virtual runners), **Crawford Park** (6 dogs) and **Milnerton** (horses). It is an **Angular 22** app (standalone components, signals, zoneless, Angular CLI / `@angular/build`), served in production by a small Express static server.

## Commands

```bash
npm run dev          # ng serve on http://localhost:3100 (live reload)
npm start            # ng build, then serve dist/ with Express (PORT env, default 3100)
npm run build        # ng build (production) → dist/instant-racing/browser
npm run serve        # serve an existing build
npm test             # ng test (Vitest): pricing, settlement, field/market sanity (src/app/core/*.spec.ts)
npm run races        # rebuild public/data/races.json from "Test Videos/*.txt" + "Dog racing videos/*.txt" (with asserts)
npm run transcode    # re-encode both sports' sources → public/assets/races/(dogs/) (needs ffmpeg; `-- 28 dogs` for one sport)
npm run telemetry:dogs  # derive "Dog racing videos/*.txt" from the footage + *.keys.json (needs ffmpeg)
```

Debug: `?race=190` / `?race=d01` forces a specific video every race (and opens its game). `?game=summerset` opens a game, `?sport=horses` that sport's first game. In the console: `__ir.state` (the `GameState` signals, e.g. `__ir.state.balance()`), `__ir.slip`, `__ir.setGame('summerset')` / `__ir.setSport('horses')`.

## Race assets pipeline

- The source videos in `Test Videos/` are **MPEG-4 Part 2**, which browsers can't play, and are 46MB each. They are gitignored.
  - `scripts/transcode.sh` makes 540p H.264 `+faststart` versions (~10MB, trimmed to 65s) plus a poster JPG (the gates, used as the `<video>` poster) and a `-run.jpg` thumbnail ~3s after the release (horses 3.5s, dogs 7s), used by the lobby tiles, race card header and blurred backdrop (`thumb` in `races.json`, falling back to `poster`).
- Each video has a telemetry `.txt` with **one line per frame at 25 fps**: `phase, leaderDistanceToGo, horse numbers in running order (leader first)`.
  - Phases: `G` in the gates, `I` running, `R` pull-up, `1`/`2` slow-mo finish replay, `3` empty shot.
  - The finish is the first `I` frame with distance 0.
- `scripts/build-races.mjs` compresses this into `races.json`: order-change events, sampled distance, finish and replay frames, and the result. It asserts consistency.
  - The runner count, distance and finish frame are all read from the data. New videos (e.g. 6 runners / 400m) just need the mp4 + txt, then running the two scripts.
- `public/` is Angular's static assets folder (copied to the build root): `public/assets/races/` (media) and `public/data/races.json`.
- Silks per saddle number are in `src/app/core/sports.ts` (`SILKS`). They match the jockeys in the videos and are the same across every video.

### Greyhounds (`Dog racing videos/`)
- Kiron virtual greyhound races: 6 traps, 720m, 1080p30 H.264, ~150MB each (gitignored). Kiron's HUD (venue, distance, running-order bar) is burned into the footage and kept as-is.
- They ship **without telemetry**. `scripts/derive-dog-telemetry.mjs` reads the burned-in order bar (6 trap chips at fixed pixel slots, classified by colour) on every frame, debounces chip-slide flicker, and writes a `.txt` in the horse format (at 30 fps, with `# venue=` / `# fps=` headers).
- Per-video `<name>.keys.json` holds the hand-checked parts: `jumpFrame`, `finishFrame` (read off the line cam), `replayStart`/`replayEnd`, `result`, distance keyframes (the HUD distance is linear, so `[[jump,720],[finish,0]]`), and `overrides` for frames the classifier can't see (e.g. a pass on the last frames before the bar fades). The script asserts the last bar read equals `result`.
- Adding a dog video: drop the mp4 in, run `npm run telemetry:dogs -- --dump` to inspect reads, write its keys file (check frames with ffmpeg contact sheets), then `npm run telemetry:dogs`, `npm run transcode -- 28 dogs`, `npm run races`. Race ids are `d<nn>`; assets go to `public/assets/races/dogs/dog-<nn>.mp4/.jpg`.
- Trap colours (`TRAPS`, matching the Kiron chips): 1 red, 2 blue, 3 white, 4 black, 5 yellow, 6 black/white hoops, 7 black/red quarters, 8 green (7 and 8 match the Summerset Park trap box).
- A game's races are the videos whose `venue` matches it (`gameRaces()`): today `d01` is Crawford Park, and Summerset Park has `d02` (6 dogs + 2 virtual) plus `s123`–`s126`.
- **Summerset Park 8-dog footage** (`4x Summerset Park Greyhound examples/`): 640x360 30fps H.264, 360m, no HUD and no slow-mo replay. Telemetry ships as `<name>_<n>.csv` in the horse line format, so no keys file is needed. The file name is **not** the finish order (`1-2-4_1` finishes 1-2-3; the footage agrees with the CSV). Ids are `s<digits of the name>`, and assets are `public/assets/races/dogs/summerset-<digits>.*`.

### Virtual runners (`core/virtual.ts`)
- When a game's `runners` exceeds the video's field (Summerset Park: 8 on 6-dog footage), `newRace()` builds the full field and `withVirtualRunners(race, field)` returns the race with `runners`, `result` and `orderEvents` covering everyone, plus `virtual: [7, 8]`.
- Each virtual runner's finishing place is drawn from its price (a Harville sample of the whole finish), so its odds stay honest; the video's dogs keep their filmed order relative to each other. During the race it moves through the field (a random place out of the traps, then steps of ≤2 places every 2–4.5s homing in on its final place, held from 82% of the race).
- The video and its burned-in HUD still show six dogs. The app's running order strip, live bets, callouts and settlement use the merged order.

## Architecture (`src/app/`)

Angular 22: standalone components, **signals** for all state, zoneless change detection, `OnPush` everywhere. Views derive from signals, so there is no render/emit plumbing: change a signal and the templates follow.

| Folder / file | Role |
|---|---|
| `core/` | **Pure TypeScript** (no Angular, no DOM; unit-tested in `*.spec.ts`). `pricing.ts`: bet types, Harville exotic pricing, combination expansion, head to head / odd-even / high-low pricing (`h2hPairs()`, `winnerSets()`), `settle()`, exact `maxReturn()`, `liveState()`, odds formats. `sports.ts`: runner profiles, silks/traps, wording, exotic list, UK greyhound labels (Forecast/Tricast, boxed = Reverse Forecast/Combination Tricast), `betLabel()`/`betHint()`, `GAMES` / `GAME_ORDER` / `gameRaces()`. `field.ts`: random profiles → saddle/trap numbers, prices rescaled to a fixed book (11% win, 11% per place). `virtual.ts`: virtual runners. `config.ts`, `models.ts` (types) |
| `services/game-state.ts` | `GameState`: every piece of game state as a signal (phase, game, races, race, field, market, legs, placed, balance, settings…) + `sport()` / `gameInfo()` computeds |
| `services/game-flow.ts` | `GameFlow`: boot + phase machine (`betting → racing → result`, plus `lobby` between races; ~1.2s finish-line beat on natural finishes, none on Skip/Instant), shuffle bag per game, `setGame()`, `refreshField()` (the race card's refresh button: new race, new field, slip cleared), place/settle, rebet/next, lobby, settings, the `window.__ir` debug handle |
| `services/betslip-store.ts` | `BetslipStore`: slip bets, stakes, open state; `betKey()` / `slipCost()` |
| `services/race-engine.ts` | `RaceEngine`: video → frame clock (timer fallback for data saver / video failure / stalls), distance rail, running order, live bet states, callouts, skip, finish beat, all as signals |
| `services/ui-shell.ts` | `UiShell`: toast, sheets, balance pill display, `--slip-h`, GSAP view transitions (`showView()`) |
| `services/` (rest) | `Motion` (GSAP, haptics, canvas confetti/coins), `Formatter` (money/odds; reads settings), `Persistence` (storage), `Viewport` (docked-slip media query) |
| `features/` | One folder per view: `topbar`, `lobby`, `race-card` (refresh button, market tabs, runner list, exotic pick grid + builder, Head to Head), `live-race`, `result`, `betslip`, `sheets` (settings, history) |
| `shared/` | `RunnerIcon` (`<svg appRunnerIcon [no]>`: silk / trap-jacket SVG), `BetSelection` (a bet as runner chips: slip, result, history) |
| `app.ts` | Shell: Bootstrap layout of top bar + [views \| betslip], scrim, sheets, FX canvas, toast, Escape key, page title |

Angular conventions here:
- Components use **attribute selectors on their own semantic element** (`<section app-race-card>`, `<aside app-betslip>`, `<header app-topbar>`) and set their classes in `host`. The DOM stays exactly what the Bootstrap rows/cols and the global SCSS expect (no wrapper element between a `.row` and its columns).
- Imperative DOM is limited to animation and media: GSAP tweens run in `afterNextRender`, `RaceEngine` drives the `<video>` element the live view attaches, and `UiShell.showView()` cross-fades the four registered view elements.
- Video `play()` must stay synchronous in the tap handler (iOS gesture rule), so never move it behind an effect or a promise.

Key rules:
- **Game and sport**: `GameState.game` (a `GAMES` key, not persisted) sets `sportKey()` (`dogs`|`horses`); `gameInfo()` / `sport()` return their config. `sport().brand` is the wordmark's second line and the page title ("Games" while in the lobby). Each race in `races.json` carries `sport` and `venue`; the field is tagged with its `game`.
- There is no finish replay in the app (it was removed). `replayStart`/`replayEnd` stay in `races.json` but nothing reads them.
- **Lobby**: opens from betting/result only (a toast during a race). Picking another game calls `setGame()`; picking the current one goes back to the race card as it was, or starts the next race if the lobby was opened from the result screen. Escape or the stripes again also resume. `setGame()` is only allowed in the lobby/betting/result phases; it clears the slip and Rebet picks and starts a new race. Balance and history are shared (history entries are tagged with sport and venue). Never hard-code "horse"/"trap" copy: use `sport().noun` / `sport().number` / `betHint()`.
- **Head to Head tab**: `H2H` (sel `[a, b]` = a finishes ahead of b, priced `p_a / (p_a + p_b)`, exact under Harville) for F1 v F2, F2 v F3, F3 v F4 by price; `ODDEVEN` / `HILO` (the winner's number is odd/even, or in the low/high half of the field; `bet.side` names it). All three are two-way markets on an 11% book (`MATCH_BOOK`). `maxReturn()` also tries every order of the head to head runners behind each podium, so it stays exact.
- `BET_TYPES` keys are the same for both sports, so `settle()`/pricing never branch on sport. Only labels and the offered exotics differ. With 6 runners `placesFor()` pays the top 2.
- **Every bet uses one shape**: `{ type, stake (per combo), box, legs, combos: [{sel, price}] }` (+ `side` on Odd/Even and High/Low). `betKey()` in `betslip-store.ts` is its slip identity. `settle(bet, finishOrder)` handles every market, and so do live status and max return. Prices are fixed when the bet is added.
- **Balance**: the stake is deducted when the bet is placed. Winnings are added to `GameState.balance` at the finish, but the pill (`UiShell.shownBalance`) only counts them in on the result screen. Don't show winnings before the reveal (iHockey's mistake).
- The result is decided by which video plays, and the video is chosen during betting (shuffle bag) so it can preload. Odds only describe a fair market, and the result is not drawn from them.
- Win celebrations (confetti/coins) only happen when the return is **more than the stake**. A partial return is shown plainly, with no fake "win" (responsible-gambling norm).
- Show/hide overlays with opacity/visibility classes. `newRace()` resets race/reveal state.
- `localStorage` holds settings and demo balance, and `sessionStorage` holds bet history. All access is wrapped in try/catch.

## Styles

`src/styles.scss` (the global stylesheet in `angular.json`) pulls in the partials in `src/styles/` (`_bootstrap`, `_tokens`, `_base`, `_card`, `_h2h`, `_slip`, `_race`, `_result`, `_lobby`, `_sheets`, `_responsive`, `_desktop`). Styles are **global, not component-scoped**, on purpose: `_responsive` / `_desktop` restyle every view per breakpoint and must load after the feature partials to win ties, which component style injection can't guarantee. New components get `style: none`; add their rules to the matching partial.
- **Bootstrap 5.3 structures the layout** (`_bootstrap.scss`, compiled from `node_modules/bootstrap/scss`: `angular.json` sets the `includePaths` and silences the `import` deprecation for its `@import`s). It's **layout only**: the grid (`row` / `col-*` / `row-cols-*` / `g-*`), flex, spacing, display, sizing and gap utilities, and the stack / `text-truncate` / `visually-hidden` helpers. There's no reboot, no components and no theme colours; the look is the app's own SCSS.
  - Breakpoints are shared with `_tokens.scss` (`$breakpoints`): **`lg` (≥1024) is the desktop layout and `xl` (≥1280) the wide one**. 768–1023 is the 440px tablet shell, which lays out like a phone, so **don't use `md`-responsive classes** (`sm` likewise).
  - The spacing scale is 4px steps (`1`=4, `2`=8, `3`=12, `4`=16, `5`=20, `6`=24px), not Bootstrap's rem defaults. Plus the custom utilities `min-h-0` / `min-w-0` for flex children that must shrink and scroll.
  - Utilities are compiled **without `!important`** and Bootstrap comes first, so state and media rules in the partials (e.g. hiding the top bar in the landscape HUD) still win. Keep `display` in SCSS, not as a `d-*` class, on anything a media query or state class hides.
  - `.row > *` gives every row child `width: 100%`; keep non-column children (like `.seg__thumb`) sized in SCSS.
- Colours are CSS custom properties in `_base.scss :root`. Easing, breakpoints and mixins are in `_tokens.scss`.
- Fonts: Big Shoulders Display (display/numbers) and Instrument Sans (UI, weight 500).
- Layouts:
  - Full-bleed on phones.
  - Landscape phones get a full-screen video HUD.
  - At 768–1023px wide (and ≥600 tall) the app becomes a 440px shell over a blurred race still.
  - At ≥1024px (Bootstrap `lg`) there is a widescreen desktop layout (`_desktop.scss`; mixins `wide` / `wide-xl` in `_tokens.scss`). The app fills the viewport, capped at 1680px, and the betslip becomes a docked right-hand column (`col-lg-auto` next to the `col` of views) that is always open while betting (`Viewport.docked` in `services/viewport.ts` must match `wide`). Racing: the video and distance rail sit on the left (`.race-main`, `col-lg`), with running order, live bets and Skip in a side panel (`.race-side`, `col-lg-auto`). Result: the hero and podium sit on the left, with bets and actions on the right. At ≥1280px (`xl`) the race card gets a tall hero column (`.card-hero`, `col-xl-5`). On phones the same rows stack with `flex-column`. The fixed column widths (`$dock-w`, `--side-w`) and panel skins live in `_desktop.scss`.
  - Sheets become centred dialogs on desktop.
- Cache busting comes from the Angular build: JS/CSS file names carry content hashes, and `server.js` caches those for a year (`immutable`). `index.html` and `races.json` are sent `no-cache` (ETag revalidation), media for 7 days.
