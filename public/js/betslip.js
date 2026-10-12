// Betslip bottom sheet: add/remove bets, stakes, max return, place.
import { state, emit, on, $, $$ } from './state.js';
import { BET_TYPES, betCost, maxReturn, round2 } from './pricing.js';
import { CONFIG } from './data.js';
import { betLabel } from './sports.js';
import { money, odds } from './store.js';
import { runnerIcon } from './silks.js';
import { gsap, reducedMotion, haptic } from './fx.js';
import { toast } from './ui.js';

const app = $('#app');
const slip = $('#slip');
const bar = $('#slipBar');
const panel = $('#slipPanel');
const foot = $('.slip__foot', slip);
const scrim = $('#scrim');
const tickets = $('#tickets');
const stakeChips = $('#stakeChips');
let open = false;

export const newId = () => 'IR' + Math.random().toString(36).slice(2, 8).toUpperCase();
const simpleKey = (type, h) => `${type}:${h}`;

// ---------- Descriptions (shared by slip, live race and results) ----------
export function horseTag(h, { name = true } = {}) {
  const r = state.field.runners[h];
  return `<span class="mini-silk">${runnerIcon(h)}<b>#${h}</b></span>${name ? `<span class="ticket__name">${r.name}</span>` : ''}`;
}

export function describeSel(bet) {
  const { type, legs, box } = bet;
  if (BET_TYPES[type].size === 1) return horseTag(legs[0][0]);
  if (BET_TYPES[type].ordered && !box) {
    const single = legs.every(l => l.length === 1);
    return legs.map(l => l.map(h => horseTag(h, { name: single && legs.length === 2 })).join('<span class="sep">/</span>'))
      .join('<span class="sep">→</span>');
  }
  return legs[0].slice().sort((a, b) => a - b).map(h => horseTag(h, { name: false })).join('<span class="sep">·</span>');
}

export const betTitle = bet => betLabel(state.sport, bet.type, bet.box);

// ---------- Slip mutations ----------
export const hasSimple = (type, h) => state.slip.some(b => b.key === simpleKey(type, h));

export function addBet(bet) {
  if (state.slip.length >= CONFIG.maxBets) { toast(`Max ${CONFIG.maxBets} bets per slip`, true); return false; }
  const key = bet.key || (BET_TYPES[bet.type].size === 1 ? simpleKey(bet.type, bet.legs[0][0]) :
    `${bet.type}:${bet.box ? 'box' : ''}:${bet.legs.map(l => l.slice().sort((a, b) => a - b).join('.')).join('|')}`);
  if (state.slip.some(b => b.key === key)) { toast('Already on your slip'); return false; }
  state.slip.push({ ...bet, key, id: bet.id || newId() });
  haptic(8);
  changed({ added: true });
  return true;
}

export function toggleSimple(type, h) {
  const key = simpleKey(type, h);
  const i = state.slip.findIndex(b => b.key === key);
  if (i >= 0) { state.slip.splice(i, 1); changed(); return; }
  const price = (type === 'WIN' ? state.field.win : state.field.place)[h];
  addBet({ type, stake: state.stake, box: false, legs: [[h]], combos: [{ sel: [h], price }] });
}

export function removeBet(id) {
  state.slip = state.slip.filter(b => b.id !== id);
  changed();
}

export function clearSlip() {
  state.slip = [];
  changed();
}

export const slipCost = (bets = state.slip) => round2(bets.reduce((s, b) => s + betCost(b), 0));

function changed(info = {}) {
  render(info);
  emit('slip:changed');
}

// ---------- Rendering ----------
function ticketMarkup(b) {
  const n = b.combos.length;
  const priceTxt = n === 1 ? odds(b.combos[0].price) : `${n} combos`;
  const sub = n === 1 ? '' : `<span class="ticket__combos">${money(b.stake)} per combo</span>`;
  const maxRet = maxReturn([b], state.field.horses, state.field.places);
  return `<li class="ticket" data-id="${b.id}">
    <span class="ticket__type">${betTitle(b)}<em>${b.id}</em></span>
    <div class="ticket__price"><span class="ticket__odds">${priceTxt}</span>${sub}</div>
    <div class="ticket__sel">${describeSel(b)}</div>
    <div class="ticket__foot">
      <label class="ticket__stake">Stake <input type="text" inputmode="decimal" value="${b.stake.toFixed(2)}" data-stake="${b.id}" aria-label="Stake for ${betTitle(b)}"></label>
      <span>Cost <b>${money(betCost(b))}</b> · Up to <b>${money(maxRet)}</b></span>
    </div>
    <button class="ticket__rm" data-rm="${b.id}" aria-label="Remove bet"><svg><use href="#i-close"/></svg></button>
  </li>`;
}

function renderChips() {
  const allSame = state.slip.length && state.slip.every(b => b.stake === state.stake);
  stakeChips.innerHTML = CONFIG.stakeChips.map(v =>
    `<button class="stake-chip ${allSame && v === state.stake ? 'is-on' : ''}" data-chip="${v}">${money(v, { compact: true })}</button>`).join('') +
    `<input class="stake-input" type="text" inputmode="decimal" placeholder="Other" aria-label="Custom stake" id="customStake">`;
}

// Desktop / widescreen: the slip is a docked column, always open while betting (matches `wide` in _tokens.scss).
const dockMq = matchMedia('(min-width: 1024px) and (min-height: 600px)');
const docked = () => dockMq.matches;

export function render({ added = false } = {}) {
  const bets = state.slip;
  const visible = state.phase === 'betting' && (bets.length > 0 || docked());
  slip.classList.toggle('is-visible', visible);
  slip.classList.toggle('is-empty', !bets.length);
  if (!visible && open) setOpen(false);

  const cost = slipCost();
  $('#slipCount').textContent = bets.length;
  $('#slipCost').innerHTML = `Total <b>${money(cost)}</b>`;
  $('#slipReturn').textContent = money(state.field ? maxReturn(bets, state.field.horses, state.field.places) : 0);
  $('#placeAmt').textContent = money(cost);
  $('#btnPlace').disabled = !bets.length;
  if (open || docked()) { tickets.innerHTML = bets.map(ticketMarkup).join(''); renderChips(); }

  if (added && !reducedMotion()) {
    gsap.fromTo('#slipCount', { scale: 1.5 }, { scale: 1, duration: 0.45, ease: 'back.out(3)' });
    gsap.fromTo('#slipReturn', { y: -6, opacity: 0.4 }, { y: 0, opacity: 1, duration: 0.35, ease: 'expo.out' });
  }
  requestAnimationFrame(measure);
}

function measure() {
  const visible = slip.classList.contains('is-visible') && !docked();
  const h = visible ? bar.offsetHeight + foot.offsetHeight : 0;
  app.style.setProperty('--slip-h', `${h}px`);
}

function setOpen(v) {
  if (v === open || (v && docked())) return;
  open = v;
  slip.classList.toggle('is-open', v);
  bar.setAttribute('aria-expanded', v);
  scrim.classList.toggle('is-on', v);
  if (v) {
    tickets.innerHTML = state.slip.map(ticketMarkup).join('');
    renderChips();
    panel.style.height = 'auto';
    const target = Math.min(panel.scrollHeight, Math.round(app.clientHeight * 0.62));
    panel.style.height = '0px';
    gsap.to(panel, { height: target, duration: reducedMotion() ? 0 : 0.42, ease: 'expo.out' });
  } else {
    gsap.to(panel, { height: 0, duration: reducedMotion() ? 0 : 0.3, ease: 'power3.out' });
    document.activeElement?.blur?.();
  }
}
export const closeSlip = () => setOpen(false);

function parseStake(v) {
  const n = round2(parseFloat(String(v).replace(',', '.')));
  if (!Number.isFinite(n)) return null;
  return Math.min(CONFIG.maxStake, Math.max(CONFIG.minStake, n));
}

function setAllStakes(v) {
  state.stake = v;
  state.slip.forEach(b => { b.stake = v; });
  changed();
}

export function initSlip() {
  bar.addEventListener('click', () => setOpen(!open));
  scrim.addEventListener('click', () => setOpen(false));
  panel.addEventListener('click', e => {
    const rm = e.target.closest('[data-rm]');
    if (rm) {
      const li = rm.closest('.ticket');
      const id = rm.dataset.rm;
      const done = () => { removeBet(id); if (!state.slip.length) setOpen(false); else resizeOpen(); };
      if (reducedMotion()) done();
      else gsap.to(li, { x: 40, opacity: 0, duration: 0.2, ease: 'power2.in', onComplete: done });
      return;
    }
    const chip = e.target.closest('[data-chip]');
    if (chip) { setAllStakes(+chip.dataset.chip); return; }
  });
  $('#btnClear').addEventListener('click', () => { clearSlip(); setOpen(false); });
  panel.addEventListener('change', e => {
    const input = e.target;
    if (input.id === 'customStake') {
      const v = parseStake(input.value);
      if (v != null) setAllStakes(v);
      return;
    }
    if (input.dataset.stake) {
      const b = state.slip.find(x => x.id === input.dataset.stake);
      const v = parseStake(input.value);
      if (b && v != null) { b.stake = v; changed(); }
      else input.value = b.stake.toFixed(2);
    }
  });
  panel.addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur?.(); });
  $('#btnPlace').addEventListener('click', () => {
    const cost = slipCost();
    if (!state.slip.length) return;
    if (cost > state.balance + 1e-9) { toast(`Not enough balance — lower your stake (need ${money(cost)})`, true); haptic([20, 40, 20]); return; }
    setOpen(false);
    emit('slip:place');
  });
  window.addEventListener('resize', () => requestAnimationFrame(measure));
  dockMq.addEventListener('change', () => { setOpen(false); render(); });
  on('phase', () => render());
  on('settings:changed', () => render());
}

function resizeOpen() {
  if (!open) return;
  const cur = panel.offsetHeight;
  panel.style.height = 'auto';
  const target = Math.min(panel.scrollHeight, Math.round(app.clientHeight * 0.62));
  panel.style.height = cur + 'px';
  gsap.to(panel, { height: target, duration: 0.25, ease: 'power2.out' });
}
