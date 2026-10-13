// Boot + phase machine: BETTING → RACING → REVEAL → RESULT → (Rebet | Next race), per sport.
import { state, sport, on, emit, $, $$ } from './state.js';
import { CONFIG } from './data.js';
import { SPORTS } from './sports.js';
import { settle, buildBet, BET_TYPES } from './pricing.js';
import { loadStore, saveBalance, saveSettings, loadHistory, pushHistory, money, odds } from './store.js';
import { buildField } from './field.js';
import { initRaceCard, renderHeader, renderRunners, resetForSport } from './racecard.js';
import { initSlip, render as renderSlip, slipCost, describeSel, betTitle, closeSlip, addBet, newId } from './betslip.js';
import * as race from './race.js';
import { initResults, renderResult, cancelCelebration, resultReady } from './results.js';
import { toast, renderBalance, showView, initSheets, openSheetEl, closeSheet } from './ui.js';
import { initLobby, renderLobby } from './lobby.js';
import { gsap, reducedMotion } from './fx.js';

const app = $('#app');
const params = new URLSearchParams(location.search);
const forcedRace = params.get('race');   // debug: ?race=190 / ?race=d01 plays that video every time
const forcedSport = params.get('sport'); // debug: ?sport=horses opens on that sport
const DEFAULT_SPORT = 'dogs';            // the app opens on greyhounds; horses are picked in the lobby
const bags = {};                         // shuffle bag per sport
const lastRaceId = {};

function pickRace() {
  if (forcedRace) {
    const r = state.races.find(x => x.id === forcedRace && x.sport === state.sport);
    if (r) return r;
  }
  const bag = (bags[state.sport] ||= []);
  if (!bag.length) {
    bag.push(...state.races.filter(r => r.sport === state.sport).sort(() => Math.random() - 0.5));
    if (bag.length > 1 && bag[bag.length - 1].id === lastRaceId[state.sport]) bag.unshift(bag.pop());
  }
  const r = bag.pop();
  lastRaceId[state.sport] = r.id;
  return r;
}

function newRace({ keepField = false } = {}) {
  race.stop();
  state.race = pickRace();
  state.raceNo++;
  const f = state.field;
  if (!keepField || !f || f.sport !== state.sport || f.horses.length !== state.race.runners) {
    state.field = buildField(state.race.runners, Math.random, state.sport);
  }
  state.legs = [[], [], []];
  state.placed = [];
  state.outcome = null;
  renderHeader();
  renderRunners({ animate: state.phase === 'result' || state.phase === 'loading' });
  renderBalance();
  race.prepare(state.race);
}

const cloneBet = (b, fresh = false) => ({
  ...b,
  id: fresh ? newId() : b.id,
  legs: b.legs.map(l => l.slice()),
  combos: b.combos.map(c => ({ ...c, sel: c.sel.slice() })),
});

function placeBets(bets) {
  const cost = slipCost(bets);
  if (!bets.length) return false;
  if (cost > state.balance + 1e-9) { toast(`Not enough balance (need ${money(cost)})`, true); return false; }
  state.balance = Math.round((state.balance - cost) * 100) / 100;
  saveBalance();
  renderBalance({ animate: true });
  state.placed = bets.map(b => cloneBet(b));
  state.lastPlaced = bets.map(b => cloneBet(b));
  state.slip = [];
  closeSlip();
  if (!state.settings.instant) showView('racing');
  renderSlip();
  race.start({ instant: state.settings.instant, onFinish: onRaceFinish });
  return true;
}

function onRaceFinish(order, { natural = false } = {}) {
  const { places } = state.field;
  const bets = state.placed.map(b => ({ ...b, ret: settle(b, order, places) }));
  const staked = slipCost(state.placed);
  const returned = Math.round(bets.reduce((s, b) => s + b.ret, 0) * 100) / 100;
  const outcome = { raceNo: state.raceNo, order, bets, staked, returned };
  state.outcome = outcome;

  // Credit immediately in state (display animates on the result screen)
  state.balance = Math.round((state.balance + returned) * 100) / 100;
  saveBalance();

  pushHistory({
    raceNo: state.raceNo, sport: state.sport, at: Date.now(), podium: order.slice(0, 3), staked, returned,
    bets: bets.map(b => ({ id: b.id, title: betTitle(b), sel: describeSel(b), stake: b.stake * b.combos.length, ret: b.ret })),
  });

  race.afterFinish(natural ? CONFIG.finishBeatMs : 0, () => {
    race.pauseVideo();
    showView('result');
    renderResult(outcome, { canRebet: state.lastPlaced.length > 0 });   // affordability is checked at Place bet
  });
}

/** Rebet: next race on the same field with last race's bets back on the slip. Nothing is placed (or deducted)
 *  until the player presses Place bet, so they can add or change bets first. */
function rebet() {
  const bets = state.lastPlaced.map(b => cloneBet(b, true));
  const oldField = state.field;
  newRace({ keepField: true });
  showView('betting');
  if (state.field !== oldField) {   // field changed: the old picks don't exist in it
    state.slip = [];
    renderSlip();
    emit('slip:changed');
    toast('New field — pick your runners');
    return;
  }
  state.slip = bets;
  renderSlip();
  emit('slip:changed');   // highlights the re-added prices on the card
  if (slipCost(bets) > state.balance + 1e-9) toast(`Not enough balance for these bets (${money(slipCost(bets))}) — lower a stake`, true);
  else toast(`${bets.length} ${bets.length === 1 ? 'bet' : 'bets'} back on your slip — add more or place`);
}

function nextRace() {
  newRace();
  showView('betting');
  renderSlip();
  if (state.balance < CONFIG.minStake) toast('Out of demo funds — reset your balance in Settings', true);
}

// ---------- Replay ----------
const replayEl = $('#replay');
const replayVideo = $('#replayVideo');
let replayBounds = null;
function openReplay() {
  const r = state.race;
  if (r.replayStart == null) return;
  replayBounds = [r.replayStart / r.fps, r.replayEnd / r.fps];
  if (replayVideo.dataset.src !== r.src) { replayVideo.src = r.src; replayVideo.dataset.src = r.src; }
  replayVideo.preload = 'auto';
  replayVideo.removeEventListener('loadedmetadata', seekReplay);
  replayVideo.play().catch(() => {});          // synchronous in the tap (iOS gesture rule)
  if (replayVideo.readyState >= 1) seekReplay(); else replayVideo.addEventListener('loadedmetadata', seekReplay, { once: true });
  replayEl.classList.add('is-open');
}
function seekReplay() { if (replayBounds) replayVideo.currentTime = replayBounds[0]; }
function closeReplay() {
  replayVideo.removeEventListener('loadedmetadata', seekReplay);
  replayEl.classList.remove('is-open');
  replayVideo.pause();
  replayBounds = null;
}
replayVideo.addEventListener('timeupdate', () => {
  if (replayBounds && replayVideo.currentTime >= replayBounds[1]) replayVideo.currentTime = replayBounds[0];
});
$('#btnReplayClose').addEventListener('click', closeReplay);
replayEl.addEventListener('click', e => { if (e.target === replayEl) closeReplay(); });
on('escape', () => { closeReplay(); if (state.phase === 'lobby') pickGame(state.sport); });

// ---------- Sport ----------
// The lobby (the wordmark's stripes) switches sport; ?sport= / ?race= / __ir.setSport() for QA.
/** Wordmark + page title: 'Instant Games' in the lobby, else the sport being played. */
function renderBrand() {
  const brand = state.phase === 'lobby' ? 'Games' : sport().brand;
  $('#brandName').textContent = brand;
  document.title = `Instant ${brand}`;
}
on('phase', renderBrand);

function applySport() {
  const s = sport();
  app.dataset.sport = s.key;
  renderBrand();
  $('#stageLoaderText').textContent = s.loading;
  $('#replayTag').textContent = s.replayTag;
}

/** Switch sport between races: new field from that sport's videos. Same wallet and history. */
function setSport(key) {
  if (key === state.sport || !SPORTS[key] || !['lobby', 'betting', 'result'].includes(state.phase)) return;
  if (!state.races.some(r => r.sport === key)) { toast(`No ${SPORTS[key].name.toLowerCase()} races available`, true); return; }
  const hadBets = state.slip.length > 0;
  cancelCelebration();
  closeReplay();
  closeSlip();
  state.sport = key;
  state.slip = [];
  state.lastPlaced = [];    // picks belong to the other sport's field
  applySport();
  resetForSport();
  newRace();
  showView('betting');
  renderSlip();
  if (hadBets) toast('Betslip cleared for the new field');
}

// ---------- Lobby ----------
// Reachable between races only. Picking the game being played goes back to it: the race card as it was
// (slip intact), or a fresh race when the lobby was opened from the result screen.
let lobbyFrom = 'betting';
function openLobby() {
  if (state.phase === 'lobby') { pickGame(state.sport); return; }
  if (!['betting', 'result'].includes(state.phase)) { toast('The lobby opens after this race'); return; }
  if (state.phase === 'result' && !resultReady()) return;
  lobbyFrom = state.phase;
  cancelCelebration();
  closeReplay();
  closeSlip();
  closeSheet();
  renderLobby();
  showView('lobby');
}
function pickGame(key) {
  if (state.phase !== 'lobby') return;
  if (key !== state.sport) setSport(key);
  else if (lobbyFrom === 'result') nextRace();
  else showView('betting');
}

// ---------- Settings ----------
function syncSettingsUI() {
  $$('#sheetSettings .pills').forEach(g => {
    $$('button', g).forEach(b => b.classList.toggle('is-on', state.settings[g.dataset.setting] === b.dataset.value));
  });
  $$('#sheetSettings input[data-setting]').forEach(i => { i.checked = !!state.settings[i.dataset.setting]; });
}
function initSettings() {
  $('#btnSettings').addEventListener('click', () => { syncSettingsUI(); openSheetEl('#sheetSettings'); });
  $('#sheetSettings').addEventListener('click', e => {
    const b = e.target.closest('.pills button');
    if (!b) return;
    state.settings[b.closest('.pills').dataset.setting] = b.dataset.value;
    applySettings();
  });
  $('#sheetSettings').addEventListener('change', e => {
    const i = e.target.closest('input[data-setting]');
    if (!i) return;
    state.settings[i.dataset.setting] = i.checked;
    applySettings();
  });
  $('#btnResetBalance').addEventListener('click', () => {
    state.balance = CONFIG.startBalance;
    saveBalance();
    renderBalance({ animate: true });
    toast(`Demo balance reset to ${money(CONFIG.startBalance)}`);
  });
  on('settings:save', saveSettings);
}
function applySettings() {
  saveSettings();
  syncSettingsUI();
  renderBalance();
  if (state.phase === 'betting') race.prepare(state.race);
  if (state.phase === 'racing') race.setSaver(!!state.settings.saver);
  emit('settings:changed');
}

// ---------- History ----------
function renderHistory() {
  const list = loadHistory();
  const el = $('#historyList');
  if (!list.length) { el.innerHTML = '<li class="history__empty">No settled bets yet this session.</li>'; return; }
  el.innerHTML = list.map(h => `
    <li class="history__race"><span>Race ${h.raceNo}${h.sport ? ` · ${SPORTS[h.sport]?.name || ''}` : ''} · ${new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      <span>1-2-3: ${h.podium.join('-')}</span></li>
    ${h.bets.map(b => `<li class="rbet ${b.ret > 0 ? 'is-won' : 'is-lost'}">
      <span class="rbet__type">${b.title}<em>${b.id}</em></span>
      <div class="rbet__sel">${b.sel}</div>
      <div class="rbet__side"><span class="rbet__ret">${b.ret > 0 ? money(b.ret) : '—'}</span><span class="rbet__stake">Stake ${money(b.stake)}</span></div>
    </li>`).join('')}`).join('');
}

// ---------- Boot ----------
async function init() {
  loadStore();
  try {
    const res = await fetch('data/races.json');
    state.races = (await res.json()).races;
  } catch (e) {
    toast('Could not load races — please refresh', true);
    throw e;
  }
  const forced = forcedRace && state.races.find(r => r.id === forcedRace);
  const want = [forced?.sport, forcedSport, DEFAULT_SPORT].find(k => SPORTS[k] && state.races.some(r => r.sport === k));
  state.sport = want || state.races[0].sport;
  applySport();
  initSheets();
  initSlip();
  initRaceCard();
  race.initRace();
  initSettings();
  initLobby({ onPick: pickGame });
  $('#btnLobby').addEventListener('click', openLobby);
  initResults({
    onAction: act => {
      // Ignore taps while the result view is still fading in/out (prevents double rebet / double deduction)
      if (state.phase !== 'result' || (act !== 'replay' && !resultReady())) return;
      if (act !== 'replay') cancelCelebration();
      if (act === 'rebet') rebet();
      else if (act === 'next') nextRace();
      else if (act === 'replay') openReplay();
    },
  });
  $('#btnHistory').addEventListener('click', () => { renderHistory(); openSheetEl('#sheetHistory'); });
  on('slip:place', () => placeBets(state.slip));

  newRace();
  showView('betting', { instant: true });
  renderSlip();
  if (!reducedMotion()) {
    gsap.from(['.topbar', '.race-head', '.markets', '.runner-head'], { y: 16, opacity: 0, duration: 0.7, ease: 'expo.out', stagger: 0.07, clearProps: 'transform,opacity' });
  }
}

init();

// Debug handle for QA in the console
window.__ir = { state, settle, buildBet, BET_TYPES, addBet, odds, setSport };
