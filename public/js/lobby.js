// Lobby: one thumbnail tile per game (a venue of a sport), showing the still of its first race. Picking a tile hands the game key to main.js.
import { state, $ } from './state.js';
import { SPORTS, GAMES, GAME_ORDER, gameRaces } from './sports.js';

const grid = $('#lobbyGrid');
const ICONS = { dogs: 'i-dog', horses: 'i-horse' };

/** Rebuild the tiles (marks the game being played). */
export function renderLobby() {
  grid.innerHTML = GAME_ORDER.map(k => GAMES[k]).map(g => {
    const races = gameRaces(g, state.races);
    if (!races.length) return '';
    const s = SPORTS[g.sport];
    const r = races[0];
    const current = g.key === state.game;
    const thumb = new URL(r.thumb || r.poster, location.href).href;   // absolute: a var() url resolves against the stylesheet
    return `<div class="col">
      <button class="game h-100 w-100 d-flex align-items-end justify-content-between gap-3${current ? ' is-current' : ''}" data-game="${g.key}" style="--thumb:url('${thumb}')"
          aria-label="${g.venue}, Instant ${s.brand}${current ? ' (playing now)' : ''}">
        <span class="game__bg" aria-hidden="true"></span>
        ${current ? '<span class="game__badge d-flex align-items-center gap-2"><span class="dot"></span>Playing</span>' : ''}
        <span class="game__body d-flex flex-column align-items-start gap-2 min-w-0">
          <span class="game__icon" aria-hidden="true"><svg><use href="#${ICONS[s.key]}"/></svg></span>
          <span class="game__name d-flex flex-column"><b>${g.venue}</b><span>Instant ${s.brand}</span></span>
          <span class="game__meta">${g.runners || r.runners} ${s.nouns} · ${r.distance}m · ${s.surface}</span>
        </span>
        <span class="game__cta d-flex align-items-center flex-shrink-0">${current ? 'Resume' : 'Play'}<svg><use href="#i-chevron"/></svg></span>
      </button>
    </div>`;
  }).join('');
}

export function initLobby({ onPick }) {
  grid.addEventListener('click', e => {
    const b = e.target.closest('.game');
    if (b) onPick(b.dataset.game);
  });
}
