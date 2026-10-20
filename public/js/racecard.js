// Race card: header, market tabs, runner rows, Win/Place buttons, the exotic pick grid and the Head to Head panel.
import { state, sport, on, $, $$ } from './state.js';
import { BET_TYPES, SET_SIDES, pickError, buildBet, betCost, betMaxReturn, h2hPairs } from './pricing.js';
import { betLabel, betHint, boxToggleLabel } from './sports.js';
import { money, odds } from './store.js';
import { runnerIcon, saddle } from './silks.js';
import { gsap, reducedMotion } from './fx.js';
import { addBet, toggleSimple, hasSimple, toggleBet, betKey, hasKey } from './betslip.js';

const list = $('#runnerList');
const h2h = $('#h2hPanel');
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
  $('#raceTitle').textContent = r.venue;
  $('#raceMeta').textContent = `${r.distance}m · ${sport().surface} · ${r.runners} runners`;
  $('#raceNo').textContent = state.raceNo;
  $('#raceBlurb').textContent = `${sport().title} · ${r.runners} ${sport().nouns} over ${r.distance}m. Place your bets — the race goes off the moment you do.`;
  $('#raceHeadBg').style.backgroundImage = `url(${r.thumb || r.poster})`;
  document.body.style.setProperty('--poster', `url(${new URL(r.thumb || r.poster, location.href).href})`);
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
    return `<div class="odds flex-shrink-0">
      <button class="odd" data-bet="WIN" data-h="${no}" aria-label="Win ${f.runners[no].name} at ${odds(f.win[no])}">
        <span class="odd__price">${odds(f.win[no])}</span><span class="odd__tag">Win</span></button>
      <button class="odd odd--place" data-bet="PLACE" data-h="${no}" aria-label="Place ${f.runners[no].name} at ${odds(f.place[no])}">
        <span class="odd__price">${odds(f.place[no])}</span><span class="odd__tag">Place</span></button>
    </div>`;
  }
  if (isOrderedGrid()) {
    const n = BET_TYPES[state.exoticType].size;
    return `<div class="picks flex-shrink-0">${POS.slice(0, n).map((p, i) =>
      `<button class="pick" data-leg="${i}" data-h="${no}" aria-label="${p}: #${no}">${p}</button>`).join('')}</div>`;
  }
  return `<div class="picks flex-shrink-0"><button class="pick pick--any" data-leg="0" data-h="${no}" aria-label="Pick #${no}">
    <svg><use href="#i-plus"/></svg><span class="p-odds">${odds(f.win[no])}</span></button></div>`;
}

function headMarkup() {
  if (state.market === 'wp') return `<span>Runner · form · rating</span><span>Tap odds to bet</span>`;
  if (isOrderedGrid()) return `<span>Runner</span><span>Tap positions</span>`;
  return `<span>Runner</span><span>Pick · win odds</span>`;
}

export function renderRunners({ animate = false } = {}) {
  const f = state.field;
  if (animate) { list.scrollTop = h2h.scrollTop = 0; $('#viewCard').classList.remove('is-compact'); }
  const isH2H = state.market === 'h2h';
  list.hidden = head.hidden = isH2H;
  h2h.hidden = !isH2H;
  if (isH2H) renderH2H();
  else {
    head.innerHTML = headMarkup();
    list.innerHTML = f.horses.map(no => {   // trap / saddle order (1, 2, 3…), like a printed racecard
      const r = f.runners[no];
      return `<li class="runner d-flex align-items-center gap-3" data-h="${no}">
        <div class="runner__silk flex-shrink-0">${runnerIcon(no)}${saddle(no)}</div>
        <div class="runner__info flex-grow-1 min-w-0">
          <div class="runner__name"><span>${r.name}</span>${no === f.favourite ? '<em class="fav">FAV</em>' : ''}</div>
          <div class="runner__meta">${formMarkup(r.form)}${ratingMarkup(r.rating)}</div>
        </div>
        ${rightMarkup(no)}
      </li>`;
    }).join('');
  }
  syncSelections();
  const rows = isH2H ? $$('.h2h__match, .h2h__set', h2h) : list.children;
  if (animate && !reducedMotion()) {
    gsap.fromTo(rows, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'expo.out', stagger: 0.035, clearProps: 'transform,opacity' });
  }
}

// ---------- Head to Head ----------
// Matchups between neighbouring favourites (F1 v F2, F2 v F3, F3 v F4), and two winner markets on the
// winning number: Odd / Even and High / Low. Each price button toggles one bet on the slip.
function matchSide(a, b, rank, end) {
  const f = state.field;
  const bet = buildBet('H2H', [[a], [b]], { stake: state.stake, field: f });
  const price = odds(bet.combos[0].price);
  return `<div class="h2h__side h2h__side--${end} col d-flex flex-column gap-2 min-w-0">
    <div class="h2h__who d-flex align-items-center gap-2 min-w-0">
      <span class="h2h__rank flex-shrink-0">F${rank}</span><span class="h2h__name text-truncate">${f.runners[a].name}</span>
    </div>
    <div class="d-flex align-items-center gap-2">
      <span class="h2h__silk flex-shrink-0">${runnerIcon(a)}${saddle(a)}</span>
      <button class="odd odd--wide flex-grow-1" data-key="${betKey(bet)}" data-a="${a}" data-b="${b}"
        aria-label="${f.runners[a].name} to finish ahead of ${f.runners[b].name} at ${price}"><span class="odd__price">${price}</span></button>
    </div>
  </div>`;
}

function setButton(type, side) {
  const bet = buildBet(type, [], { stake: state.stake, field: state.field, side });
  const nos = bet.legs[0];
  const price = odds(bet.combos[0].price);
  return `<div class="col-6">
    <button class="mkt w-100 d-flex align-items-center justify-content-between gap-2" data-key="${betKey(bet)}" data-type="${type}" data-side="${side}"
      aria-label="Winner ${side.toLowerCase()} (${sport().number}s ${nos.join(', ')}) at ${price}">
      <span class="d-flex flex-column align-items-start gap-1 min-w-0">
        <b class="mkt__side">${side}</b>
        <span class="mkt__nos d-flex flex-wrap gap-1">${nos.map(h => `<span class="mkt__no">${runnerIcon(h)}</span>`).join('')}</span>
      </span>
      <span class="mkt__price">${price}</span>
    </button>
  </div>`;
}

function renderH2H() {
  const f = state.field;
  const rank = no => f.byOdds.indexOf(no) + 1;
  const { number } = sport();
  h2h.innerHTML = `
    <section class="h2h__group">
      <h3 class="h2h__title d-flex align-items-baseline justify-content-between gap-3"><span>Head to head</span><small>${betHint(state.sport, 'H2H')}</small></h3>
      ${h2hPairs(f).map(([a, b]) => `<div class="h2h__match row g-0 align-items-end">
        ${matchSide(a, b, rank(a), 'start')}
        <div class="h2h__vs col-auto">vs</div>
        ${matchSide(b, a, rank(b), 'end')}
      </div>`).join('')}
    </section>
    <section class="h2h__group">
      <h3 class="h2h__title d-flex align-items-baseline justify-content-between gap-3"><span>The winner must be</span><small>Winning ${number} number</small></h3>
      ${Object.entries(SET_SIDES).map(([type, sides]) => `<div class="h2h__set row g-2">${sides.map(s => setButton(type, s)).join('')}</div>`).join('')}
    </section>`;
}

function toggleH2H(btn) {
  const { a, b, type, side } = btn.dataset;
  const bet = type
    ? buildBet(type, [], { stake: state.stake, field: state.field, side })
    : buildBet('H2H', [[+a], [+b]], { stake: state.stake, field: state.field });
  toggleBet(bet);
}

/** Reflect slip / pick state onto existing buttons without re-rendering. */
export function syncSelections() {
  if (state.market === 'h2h') {
    $$('[data-key]', h2h).forEach(b => {
      const on = hasKey(b.dataset.key);
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on);
    });
  } else if (state.market === 'wp') {
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
const label = (type, box = false) => betLabel(state.sport, type, box);
const hintFor = (type, box = false) => betHint(state.sport, type, { box, places: state.field?.places });

function renderChips() {
  chips.innerHTML = sport().exotics.map(t =>
    `<button class="chip ${t === state.exoticType ? 'is-active' : ''}" role="radio" aria-checked="${t === state.exoticType}" data-type="${t}">${label(t)}</button>`).join('');
  const t = BET_TYPES[state.exoticType];
  const box = state.box && t.boxable;
  hint.innerHTML = `<b>${label(state.exoticType, box)}</b> · ${hintFor(state.exoticType, box)}`;
  boxSwitch.hidden = !t.boxable;
  const sw = boxToggleLabel(state.sport, state.exoticType);
  $('.switch__label', boxSwitch).innerHTML = sw === 'Box' ? 'Box <small>any order</small>' : sw;
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
  const err = pickError(type, legs, state.box, sport().noun);
  if (err) {
    builder.innerHTML = `<div class="builder__text"><p class="builder__err">${err}</p>
      <p class="builder__line">${label(type, state.box)} · ${hintFor(type, state.box)}</p></div>
      <button class="btn btn--ghost" data-act="clear-picks">Clear</button>`;
    return;
  }
  const bet = buildBet(type, legs, { stake: state.stake, box: state.box, field: state.field });
  const n = bet.combos.length;
  builder.innerHTML = `<div class="builder__text">
      <p class="builder__line"><b>${label(type, state.box)}</b> · ${n} × ${money(state.stake)} = <b>${money(betCost(bet))}</b></p>
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
  if (pickError(state.exoticType, legs, state.box, sport().noun)) return;
  const bet = buildBet(state.exoticType, legs, { stake: state.stake, box: state.box, field: state.field });
  if (addBet(bet)) clearPicks();
}

/** Re-render the card for a new sport: header + chips, keeping the exotic type if the sport offers it. */
export function resetForSport() {
  if (!sport().exotics.includes(state.exoticType)) { state.exoticType = sport().exotics[0]; state.box = false; }
  state.legs = [[], [], []];
  if (state.market === 'exotic') renderChips();
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
  h2h.addEventListener('click', e => {
    const b = e.target.closest('[data-key]');
    if (b) toggleH2H(b);
  });
  builder.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'add-exotic') addExotic();
    if (b.dataset.act === 'clear-picks') clearPicks();
  });
  // Compact the race header once the runner list scrolls (hysteresis avoids flicker at the edge)
  const card = $('#viewCard');
  [list, h2h].forEach(el => el.addEventListener('scroll', () => {
    const y = el.scrollTop;
    if (y > 36) card.classList.add('is-compact');
    else if (y < 6) card.classList.remove('is-compact');
  }, { passive: true }));
  on('slip:changed', syncSelections);
  on('settings:changed', () => { if (state.field) renderRunners(); });
}
