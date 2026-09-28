// Racing silks as inline SVG, matching the jockeys in the race videos.
import { SILKS } from './data.js';

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

const cache = new Map();
export function silkSVG(no) {
  if (cache.has(no)) return cache.get(no);
  const s = SILKS[no] || { body: '#777', sleeves: '#777', cap: '#777', pattern: 'plain' };
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
  cache.set(no, svg);
  return svg;
}

export const saddle = no => `<span class="saddle">${no}</span>`;
