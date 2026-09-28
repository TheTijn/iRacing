// Race card: header, market tabs, runner rows, Win/Place buttons and the exotic pick grid.
import { state, on, $, $$ } from './state.js';
import { BET_TYPES, EXOTICS, pickError, buildBet, betCost, betMaxReturn } from './pricing.js';
import { VENUE } from './data.js';
import { money, odds } from './store.js';
import { silkSVG, saddle } from './silks.js';
import { gsap, reducedMotion } from './fx.js';
import { addBet, toggleSimple, hasSimple } from './betslip.js';

const list = $('#runnerList');
const head = $('#runnerHead');
const builder = $('#builder');
const exoticBar = $('#exoticBar');
const chips = $('#exoticChips');
const hint = $('#exoticHint');
const boxSwitch = $('#boxSwitch');
const boxToggle = $('#boxToggle');
const tabs = $('#marketTabs');

const POS = ['1st', '2nd', '3rd'];

export function renderHeader() {
  const r = state.race;
  $('#raceTitle').textContent = VENUE.name;
  $('#raceMeta').textContent = `${r.distance}m · ${VENUE.surface} · ${r.runners} runners`;
  $('#raceNo').textContent = state.raceNo;
  $('#raceHeadBg').style.backgroundImage = `url(${r.poster})`;
  document.body.style.setProperty('--poster', `url(${new URL(r.poster, location.href).href})`);
}

function formMarkup(form) {
  return `<span class="form" aria-label="Last 5 runs ${form.join(', ')}">` +
    form.map(f => `<i class="${f === 1 ? 'w' : f && f <= 3 ? 'p' : ''}">${f}</i>`).join('') + '</span>';
}
function ratingMarkup(r) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<i class="${r >= i ? 'on' : r >= i - 0.5 ? 'half' : ''}"></i>`;
  return `<span class="rating" aria-label="Rating ${r} of 5">${s}</span>`;
}

function isOrderedGrid() {
  const t = BET_TYPES[state.exoticType];
  return t.ordered && !state.box;
}

function rightMarkup(no) {
  const f = state.field;
  if (state.market === 'wp') {
    return `<div class="odds">
      <button class="odd" data-bet="WIN" data-h="${no}" aria-label="Win ${f.runners[no].name} at ${odds(f.win[no])}">
        <span class="odd__price">${odds(f.win[no])}</span><span class="odd__tag">Win</span></button>
      <button class="odd odd--place" data-bet="PLACE" data-h="${no}" aria-label="Place ${f.runners[no].name} at ${odds(f.place[no])}">
        <span class="odd__price">${odds(f.place[no])}</span><span class="odd__tag">Place</span></button>
    </div>`;
  }
  if (isOrderedGrid()) {
    const n = BET_TYPES[state.exoticType].size;
    return `<div class="picks">${POS.slice(0, n).map((p, i) =>
      `<button class="pick" data-leg="${i}" data-h="${no}" aria-label="${p}: #${no}">${p}</button>`).join('')}</div>`;
  }
  return `<div class="picks"><button class="pick pick--any" data-leg="0" data-h="${no}" aria-label="Pick #${no}">
    <svg><use href="#i-plus"/></svg><span class="p-odds">${odds(f.win[no])}</span></button></div>`;
}

function headMarkup() {
  if (state.market === 'wp') return `<span>Runner · form · rating</span><span>Tap odds to bet</span>`;
  if (isOrderedGrid()) return `<span>Runner</span><span>Tap positions</span>`;
  return `<span>Runner</span><span>Pick · win odds</span>`;
}

export function renderRunners({ animate = false } = {}) {
  const f = state.field;
  if (animate) { list.scrollTop = 0; $('#viewCard').classList.remove('is-compact'); }
  head.innerHTML = headMarkup();
  list.innerHTML = f.byOdds.map(no => {
    const r = f.runners[no];
    return `<li class="runner" data-h="${no}">
      <div class="runner__silk">${silkSVG(no)}${saddle(no)}</div>
      <div class="runner__info">
        <div class="runner__name"><span>${r.name}</span>${no === f.favourite ? '<em class="fav">FAV</em>' : ''}</div>
        <div class="runner__meta">${formMarkup(r.form)}${ratingMarkup(r.rating)}</div>
      </div>
      ${rightMarkup(no)}
    </li>`;
  }).join('');
  syncSelections();
  if (animate && !reducedMotion()) {
    gsap.fromTo(list.children, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'expo.out', stagger: 0.035, clearProps: 'transform,opacity' });
  }
}

/** Reflect slip / pick state onto existing buttons without re-rendering. */
export function syncSelections() {
  if (state.market === 'wp') {
    $$('.odd', list).forEach(b => b.classList.toggle('is-on', hasSimple(b.dataset.bet, +b.dataset.h)));
  } else {
    $$('.pick', list).forEach(b => {
      const on = state.legs[+b.dataset.leg].includes(+b.dataset.h);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on);
      if (b.classList.contains('pick--any')) b.querySelector('use').setAttribute('href', on ? '#i-check' : '#i-plus');
    });
  }
  renderBuilder();
}

// ---------- Exotics ----------
function renderChips() {
  chips.innerHTML = EXOTICS.map(t =>
    `<button class="chip ${t === state.exoticType ? 'is-active' : ''}" role="radio" aria-checked="${t === state.exoticType}" data-type="${t}">${BET_TYPES[t].label}</button>`).join('');
  const t = BET_TYPES[state.exoticType];
  hint.innerHTML = `<b>${t.label}</b> · ${state.box && t.boxable ? `${t.size === 2 ? 'Top 2' : 'Top 3'} in any order` : t.hint}`;
  boxSwitch.hidden = !t.boxable;
  boxToggle.checked = state.box;
}

function currentLegs() {
  return isOrderedGrid() ? state.legs.slice(0, BET_TYPES[state.exoticType].size) : [state.legs[0]];
}

function renderBuilder() {
  const active = state.market === 'exotic' && state.phase === 'betting';
  const anyPick = state.legs.some(l => l.length);
  const show = active && anyPick;
  builder.classList.toggle('is-on', show);
  document.getElementById('app').style.setProperty('--builder-h', show ? '76px' : '0px');
  if (!show) return;

  const type = state.exoticType;
  const legs = currentLegs();
  const err = pickError(type, legs, state.box);
  if (err) {
    builder.innerHTML = `<div class="builder__text"><p class="builder__err">${err}</p>
      <p class="builder__line">${BET_TYPES[type].label}${state.box ? ' box' : ''} · ${BET_TYPES[type].hint}</p></div>
      <button class="btn btn--ghost" data-act="clear-picks">Clear</button>`;
    return;
  }
  const bet = buildBet(type, legs, { stake: state.stake, box: state.box, field: state.field });
  const n = bet.combos.length;
  builder.innerHTML = `<div class="builder__text">
      <p class="builder__line"><b>${BET_TYPES[type].label}${state.box ? ' box' : ''}</b> · ${n} × ${money(state.stake)} = <b>${money(betCost(bet))}</b></p>
      <p class="builder__pays">Pays up to <b>${money(betMaxReturn(bet, state.field.horses, state.field.places))}</b></p>
    </div>
    <button class="btn btn--primary" data-act="add-exotic">Add to slip</button>`;
}

function clearPicks() { state.legs = [[], [], []]; syncSelections(); }

function togglePick(leg, h) {
  const legs = state.legs;
  const i = legs[leg].indexOf(h);
  if (i >= 0) legs[leg].splice(i, 1);
  else legs[leg].push(h);
  syncSelections();
}

function addExotic() {
  const legs = currentLegs();
  if (pickError(state.exoticType, legs, state.box)) return;
  const bet = buildBet(state.exoticType, legs, { stake: state.stake, box: state.box, field: state.field });
  if (addBet(bet)) clearPicks();
}

export function setMarket(market) {
  state.market = market;
  tabs.dataset.active = market;
  $$('.seg__btn', tabs).forEach(b => {
    const on = b.dataset.market === market;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-selected', on);
  });
  exoticBar.hidden = market !== 'exotic';
  if (market === 'exotic') renderChips();
  renderRunners();
}

function setExoticType(type) {
  const wasGrid = isOrderedGrid();
  state.exoticType = type;
  if (!BET_TYPES[type].boxable) state.box = false;
  // Keep picks where they still make sense; collapse positional picks when switching layouts.
  if (wasGrid !== isOrderedGrid()) state.legs = [[...new Set(state.legs.flat())], [], []];
  const size = BET_TYPES[type].size;
  if (isOrderedGrid()) for (let i = size; i < 3; i++) state.legs[i] = [];
  renderChips();
  renderRunners();
}

export function initRaceCard() {
  tabs.addEventListener('click', e => {
    const b = e.target.closest('.seg__btn');
    if (b && b.dataset.market !== state.market) setMarket(b.dataset.market);
  });
  chips.addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (c && c.dataset.type !== state.exoticType) setExoticType(c.dataset.type);
  });
  boxToggle.addEventListener('change', () => {
    state.box = boxToggle.checked;
    state.legs = [[...new Set(state.legs.flat())], [], []];
    renderChips();
    renderRunners();
  });
  list.addEventListener('click', e => {
    const odd = e.target.closest('.odd');
    if (odd) { toggleSimple(odd.dataset.bet, +odd.dataset.h); syncSelections(); return; }
    const pick = e.target.closest('.pick');
    if (pick) togglePick(+pick.dataset.leg, +pick.dataset.h);
  });
  builder.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'add-exotic') addExotic();
    if (b.dataset.act === 'clear-picks') clearPicks();
  });
  // Compact the race header once the runner list scrolls (hysteresis avoids flicker at the edge)
  const card = $('#viewCard');
  list.addEventListener('scroll', () => {
    const y = list.scrollTop;
    if (y > 36) card.classList.add('is-compact');
    else if (y < 6) card.classList.remove('is-compact');
  }, { passive: true });
  on('slip:changed', syncSelections);
  on('settings:changed', () => { if (state.field) renderRunners(); });
}
