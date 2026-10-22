// Runner icons as inline SVG: racing silks (horses, matching the jockeys in the videos) and trap
// jackets (greyhounds, matching the Kiron trap chips). runnerIcon() picks by the current sport.
import { state, sport } from './state.js';

const BODY = 'M12.4 15.2 Q20 12.6 27.6 15.2 L29 35.2 Q20 37.6 11 35.2 Z';
const SLEEVE = 'M12.9 15.5 Q7.6 16.9 5.5 24.6 L4.5 30.3 Q6.6 31.7 8.7 31 L10.5 25 Q11.4 22.4 12.5 21.5 Z';
const CAP = 'M13.6 10.8 Q13.8 3.2 20 3 Q26.2 3.2 26.4 10.8 Z';
const PEAK = 'M12.8 10.6 H27.6 Q27.8 12.4 26 12.4 H14.2 Q12.8 12.4 12.8 10.6 Z';

const lum = hex => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

function patternMarkup(s) {
  if (s.pattern === 'check') {
    let r = '';
    const size = 3.4;
    for (let y = 12, row = 0; y < 38; y += size, row++) {
      for (let x = 10, col = 0; x < 30; x += size, col++) {
        if ((row + col) % 2) r += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${size}" height="${size}"/>`;
      }
    }
    return `<g clip-path="url(#silkBody)" fill="${s.alt}">${r}</g>`;
  }
  if (s.pattern === 'stripe') return `<g clip-path="url(#silkBody)" fill="${s.alt}"><rect x="17.4" y="10" width="5.2" height="30"/></g>`;
  if (s.pattern === 'yoke') return `<g clip-path="url(#silkBody)" fill="${s.alt}"><path d="M8 10 H32 V19.4 Q20 22.6 8 19.4 Z"/></g>`;
  return '';
}

function silkSVG(no) {
  const s = sport().colours[no] || { body: '#777', sleeves: '#777', cap: '#777', pattern: 'plain' };
  const edge = lum(s.body) < 0.25 ? 'rgba(255,255,255,.32)' : 'rgba(0,0,0,.28)';
  const capEdge = lum(s.cap) < 0.25 ? 'rgba(255,255,255,.32)' : 'rgba(0,0,0,.25)';
  const svg = `<svg class="silk" viewBox="0 0 40 40" aria-hidden="true">` +
    `<path d="${SLEEVE}" fill="${s.sleeves}" stroke="${edge}" stroke-width=".7"/>` +
    `<path d="${SLEEVE}" fill="${s.sleeves}" stroke="${edge}" stroke-width=".7" transform="translate(40 0) scale(-1 1)"/>` +
    `<path d="${BODY}" fill="${s.body}"/>${patternMarkup(s)}` +
    `<path d="${BODY}" fill="url(#silkShade)" stroke="${edge}" stroke-width=".7"/>` +
    `<path d="M17 14.2 L20 17.6 L23 14.2" fill="none" stroke="rgba(0,0,0,.28)" stroke-width=".9" stroke-linecap="round"/>` +
    `<path d="${CAP}" fill="${s.cap}" stroke="${capEdge}" stroke-width=".7"/>` +
    `<path d="${CAP}" fill="url(#silkShade)"/>` +
    `<path d="${PEAK}" fill="${s.cap}"/><path d="${PEAK}" fill="rgba(0,0,0,.3)"/>` +
    `</svg>`;
  return svg;
}

// Trap jacket: a rounded square in the trap colours with the number on it (hoops for trap 6, quarters for 7).
const RUG = 'x="5" y="5" width="30" height="30" rx="6.5"';
function trapSVG(no) {
  const t = sport().colours[no] || { body: '#777', ink: '#fff' };
  const edge = lum(t.body) < 0.25 ? 'rgba(255,255,255,.3)' : 'rgba(0,0,0,.28)';
  let hoops = '';
  if (t.pattern === 'hoops') {
    for (let y = 5 + 30 / 7, i = 0; i < 3; i++, y += 60 / 7) hoops += `<rect x="5" y="${y.toFixed(2)}" width="30" height="${(30 / 7).toFixed(2)}"/>`;
    hoops = `<g clip-path="url(#trapRug)" fill="${t.alt}">${hoops}</g>`;
  } else if (t.pattern === 'quarters') {   // alt in the top-right and bottom-left quarters
    hoops = `<g clip-path="url(#trapRug)" fill="${t.alt}"><rect x="20" y="5" width="15" height="15"/><rect x="5" y="20" width="15" height="15"/></g>`;
  }
  const outline = t.pattern === 'hoops' ? ` stroke="#fff" stroke-width="2.4" paint-order="stroke" stroke-linejoin="round"` : '';
  return `<svg class="silk silk--trap" viewBox="0 0 40 40" aria-hidden="true">` +
    `<rect ${RUG} fill="${t.body}"/>${hoops}` +
    `<rect ${RUG} fill="url(#silkShade)" stroke="${edge}" stroke-width=".8"/>` +
    `<text x="20" y="21.5" text-anchor="middle" dominant-baseline="central" fill="${t.ink}"${outline}>${no}</text>` +
    `</svg>`;
}

const cache = new Map();
/** Silk (horses) or trap jacket (dogs) for a runner number, as an SVG string. */
export function runnerIcon(no) {
  const key = `${state.sport}:${no}`;
  if (!cache.has(key)) cache.set(key, sport().icon === 'trap' ? trapSVG(no) : silkSVG(no));
  return cache.get(key);
}

// Saddle-cloth number badge. Trap jackets already carry the number, so dogs get none.
export const saddle = no => (sport().icon === 'trap' ? '' : `<span class="saddle">${no}</span>`);
