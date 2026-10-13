// Lobby: one thumbnail tile per sport with races, headed by the venue of its first race (whose still it shows). Picking a tile hands the sport key to main.js.
import { state, $ } from './state.js';
import { SPORTS } from './sports.js';

const grid = $('#lobbyGrid');
const ORDER = ['dogs', 'horses'];   // greyhounds lead
const ICONS = { dogs: 'i-dog', horses: 'i-horse' };

/** Rebuild the tiles (marks the sport being played). */
export function renderLobby() {
  grid.innerHTML = ORDER.map(k => SPORTS[k]).map(s => {
    const races = state.races.filter(r => r.sport === s.key);
    if (!races.length) return '';
    const r = races[0];
    const current = s.key === state.sport;
    const thumb = new URL(r.thumb || r.poster, location.href).href;   // absolute: a var() url resolves against the stylesheet
    return `<button class="game${current ? ' is-current' : ''}" data-sport="${s.key}" style="--thumb:url('${thumb}')"
        aria-label="${r.venue}, Instant ${s.brand}${current ? ' (playing now)' : ''}">
      <span class="game__bg" aria-hidden="true"></span>
      ${current ? '<span class="game__badge"><span class="dot"></span>Playing</span>' : ''}
      <span class="game__body">
        <span class="game__icon" aria-hidden="true"><svg><use href="#${ICONS[s.key]}"/></svg></span>
        <span class="game__name"><b>${r.venue}</b><span>Instant ${s.brand}</span></span>
        <span class="game__meta">${r.runners} ${s.nouns} · ${r.distance}m · ${s.surface}</span>
      </span>
      <span class="game__cta">${current ? 'Resume' : 'Play'}<svg><use href="#i-chevron"/></svg></span>
    </button>`;
  }).join('');
}

export function initLobby({ onPick }) {
  grid.addEventListener('click', e => {
    const b = e.target.closest('.game');
    if (b) onPick(b.dataset.sport);
  });
}
