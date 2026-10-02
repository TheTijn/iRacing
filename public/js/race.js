// Live race: plays the video, maps media time → telemetry frame, drives the distance rail, running
// order strip, live bet states and lead-change callouts.
import { state, emit, on, $, $$ } from './state.js';
import { liveState, settle } from './pricing.js';
import { money, ordinal, odds } from './store.js';
import { runnerIcon, saddle } from './silks.js';
import { betTitle } from './betslip.js';
import { haptic } from './fx.js';
import { toast } from './ui.js';

const video = $('#raceVideo');
const stage = $('#stage');
const loader = $('#stageLoader');
const strip = $('#orderStrip');
const liveList = $('#liveBets');
const liveNow = $('#liveNow');
const railDist = $('#railDist');
const railFill = $('#railFill');
const railLead = $('#railLead');
const callout = $('#callout');
const announcer = $('#liveAnnouncer');
const btnSaver = $('#btnSaver');

const UI_ORDER_MS = 250;
const CALLOUT_GAP_MS = 2400;

let run = null;   // current run context

// ---------- Clock: video time, or a wall-clock timer (data saver / video failure) ----------
function videoClock() { return { mode: 'video', now: () => video.currentTime }; }
function timerClock(fromT = 0) {
  const t0 = performance.now();
  return { mode: 'timer', now: () => fromT + (performance.now() - t0) / 1000 };
}

export function prepare(race) {
  video.poster = race.poster;
  if (state.settings.saver || state.settings.instant) return;   // don't burn data preloading
  loadSrc(race);
}
function loadSrc(race) {
  if (video.dataset.src === race.src) return;
  video.dataset.src = race.src;
  video.src = race.src;
  video.preload = 'auto';
  video.load();
}

// ---------- Rendering helpers ----------
function mine() {
  const s = new Set();
  state.placed.forEach(b => b.legs.flat().forEach(h => s.add(h)));
  return s;
}

function buildStrip() {
  const { horses } = state.field;
  const my = mine();
  strip.style.setProperty('--n', horses.length);
  const SUF = ['st', 'nd', 'rd'];
  strip.innerHTML = `<div class="order__slots" aria-hidden="true">${horses.map((_, i) =>
    i < 3 ? `<span class="is-top">${i + 1}<sup>${SUF[i]}</sup></span>` : `<span>${i + 1}</span>`).join('')}</div>
    <div class="order__chips">${horses.map(h =>
    `<div class="ochip ${my.has(h) ? 'is-mine' : ''}" data-h="${h}">
      <span class="ochip__silk">${runnerIcon(h)}</span>${saddle(h)}
    </div>`).join('')}</div>`;
  run.chips = Object.fromEntries($$('.ochip', strip).map(el => [el.dataset.h, el]));
}

function horseLive(h, order) {
  const pos = order.indexOf(h) + 1;
  return `<span class="lbet__horse">${runnerIcon(h)}<b>#${h}</b><span class="lbet__pos" data-pos="${h}">${ordinal(pos)}</span></span>`;
}

function buildLiveBets(order) {
  liveList.innerHTML = state.placed.map(b => {
    const horses = [...new Set(b.legs.flat())];
    const sel = b.combos.length === 1 && b.type !== 'WIN' && b.type !== 'PLACE'
      ? b.combos[0].sel.map(h => horseLive(h, order)).join('<span class="sep">→</span>')
      : horses.map(h => horseLive(h, order)).join('');
    const nm = b.legs.flat().length === 1 ? ` · ${state.field.runners[b.legs[0][0]].name}` : '';
    return `<li class="lbet is-out" data-id="${b.id}">
      <span class="lbet__type">${betTitle(b)}${nm}</span>
      <div class="lbet__sel">${sel}</div>
      <div class="lbet__side"><span class="lbet__state">—</span><span class="lbet__ret"></span></div>
    </li>`;
  }).join('');
  run.cards = Object.fromEntries($$('.lbet', liveList).map(el => [el.dataset.id, el]));
}

const STATE_TXT = { winning: 'Winning', close: 'In reach', out: 'Behind' };

function applyOrder(order, { final = false } = {}) {
  const places = state.field.places;
  order.forEach((h, i) => {
    const el = run.chips[h];
    if (!el) return;
    el.style.transform = `translateX(${i * 100}%)`;
    el.classList.toggle('is-lead', i === 0);
  });

  let total = 0, winning = 0;
  for (const b of state.placed) {
    const el = run.cards[b.id];
    const s = final ? (settle(b, order, places) > 0 ? 'winning' : 'out') : liveState(b, order, places);
    const ret = settle(b, order, places);
    total += ret;
    if (s === 'winning') winning++;
    if (el.dataset.state !== s) {
      el.dataset.state = s;
      el.className = `lbet is-${s}`;
      el.querySelector('.lbet__state').textContent = final ? (s === 'winning' ? 'Won' : 'Lost') : STATE_TXT[s];
    }
    el.querySelector('.lbet__ret').textContent = ret > 0 ? money(ret) : '';
    el.querySelectorAll('[data-pos]').forEach(p => { p.textContent = ordinal(order.indexOf(+p.dataset.pos) + 1); });
  }
  liveNow.innerHTML = state.placed.length
    ? (total > 0 ? `${winning}/${state.placed.length} winning · <b>${money(total)}</b> if it ended now` : 'Nothing landing yet')
    : '';
}

function showCallout(h, verb) {
  const r = state.field.runners[h];
  const isMine = mine().has(h);
  callout.innerHTML = `${runnerIcon(h)}<span><b>#${h} ${r.name}</b> ${verb || (isMine ? 'hits the front for you!' : 'hits the front')}</span>`;
  callout.classList.toggle('is-mine', isMine);
  callout.classList.add('is-on');
  clearTimeout(run.calloutTimer);
  run.calloutTimer = setTimeout(() => callout.classList.remove('is-on'), 1900);
  announcer.textContent = `Number ${h}, ${r.name}, ${verb || 'leads'}`;
  if (isMine) haptic(10);
}

// ---------- Frame loop ----------
function orderAt(frame) {
  const ev = state.race.orderEvents;
  if (run.evIdx >= ev.length || ev[run.evIdx].f > frame) run.evIdx = 0;
  while (run.evIdx + 1 < ev.length && ev[run.evIdx + 1].f <= frame) run.evIdx++;
  return ev[run.evIdx].order;
}

function distAt(frame) {
  const { dist, distStep } = state.race;
  const x = frame / distStep;
  const i = Math.min(dist.length - 1, Math.floor(x));
  const j = Math.min(dist.length - 1, i + 1);
  return dist[i] + (dist[j] - dist[i]) * (x - i);
}

function tick() {
  if (!run || run.done) return;
  const race = state.race;
  const t = run.clock.now();
  const frame = Math.max(0, Math.floor(t * race.fps + 1e-3));
  if (frame >= race.finishFrame) { finish(); return; }

  const now = performance.now();
  if (now - run.lastRail > 60) {
    const d = Math.max(0, distAt(frame));
    railDist.textContent = Math.ceil(d);
    railFill.style.transform = `scaleX(${1 - d / race.distance})`;
    run.lastRail = now;
  }

  // In the gates the telemetry lists horses in reverse; show saddle order until the jump.
  const order = frame < race.gateEndFrame ? state.field.horses : orderAt(frame);
  const key = order.join();
  if (key !== run.orderKey && now - run.lastOrder >= UI_ORDER_MS) {
    run.orderKey = key;
    run.lastOrder = now;
    applyOrder(order);
    const leader = order[0];
    railLead.innerHTML = `Leader <b>#${leader} ${state.field.runners[leader].name}</b>`;
    if (leader !== run.leader) {
      if (run.leader != null && frame > race.gateEndFrame + 3 * race.fps && now - run.lastCallout > CALLOUT_GAP_MS) {
        showCallout(leader);
        run.lastCallout = now;
      }
      run.leader = leader;
    }
  }
  run.raf = requestAnimationFrame(tick);
}

function useTimer(reason) {
  if (!run || run.done) return;
  const t = run.clock?.mode === 'video' ? video.currentTime : (run.clock ? run.clock.now() : 0);
  run.clock = timerClock(t);
  video.pause();
  stage.classList.add('is-collapsed');
  loader.classList.remove('is-on');
  if (reason) toast(reason);
}

function startVideo() {
  loadSrc(state.race);
  loader.classList.add('is-on');
  const onPlaying = () => { loader.classList.remove('is-on'); };
  video.addEventListener('playing', onPlaying, { once: true });
  try { video.currentTime = 0; } catch { /* not seekable yet */ }
  const p = video.play();
  run.clock = videoClock();
  const r = run;
  p?.catch?.(() => { if (run === r && !r.done && r.clock.mode === 'video') useTimer('Video unavailable — live tracker only'); });
  run.stallTimer = setTimeout(() => {
    if (run && !run.done && video.readyState < 3 && video.currentTime < 0.2) useTimer('Slow connection — switched to live tracker');
  }, 9000);
}

export function start({ onFinish, instant = false }) {
  stop();
  run = { onFinish, done: false, evIdx: 0, orderKey: '', lastOrder: 0, lastRail: 0, lastCallout: 0, leader: null, chips: {}, cards: {} };
  callout.classList.remove('is-on');
  $('#stageRace').textContent = `Race ${state.raceNo} · ${state.race.distance}m`;
  railDist.textContent = state.race.distance;
  railFill.style.transform = 'scaleX(0)';
  railLead.textContent = '';
  buildStrip();
  buildLiveBets(state.field.horses);
  applyOrder(state.field.horses);

  if (instant) { finish({ instant: true }); return; }

  const saver = state.settings.saver;
  setSaverUI(saver);
  if (saver) run.clock = timerClock(0);
  else startVideo();
  run.wd = setInterval(watchdog, 500);
  run.raf = requestAnimationFrame(tick);
}

function setSaverUI(on) {
  stage.classList.toggle('is-collapsed', on);
  btnSaver.setAttribute('aria-pressed', on);
  btnSaver.setAttribute('aria-label', on ? 'Show video' : 'Hide video (data saver)');
  btnSaver.querySelector('use').setAttribute('href', on ? '#i-eye-off' : '#i-eye');
}

/** Switch the running race between video and tracker-only. Safe to call from a tap or from Settings. */
export function setSaver(on) {
  if (!run || run.done) return;
  const isSaver = run.clock.mode !== 'video';
  setSaverUI(on);
  if (on === isSaver) return;
  if (on) { detachResume(); useTimer(); return; }
  // Resume the video at the current race time. play() runs synchronously (iOS gesture rule);
  // only the seek waits for metadata, and it bails if this race has ended meanwhile.
  const r = run;
  loadSrc(state.race);
  loader.classList.add('is-on');
  video.play().catch(() => { if (run === r && !r.done) useTimer('Video unavailable — live tracker only'); });
  detachResume();
  r.resume = () => {
    r.resume = null;
    if (run !== r || r.done) return;
    try { video.currentTime = r.clock.now() + 0.2; } catch { /* ignore */ }
    r.clock = videoClock();
    loader.classList.remove('is-on');
  };
  if (video.readyState >= 1) r.resume(); else video.addEventListener('loadedmetadata', r.resume, { once: true });
}
function detachResume() {
  if (run?.resume) { video.removeEventListener('loadedmetadata', run.resume); run.resume = null; }
}

function toggleSaver() {
  if (!run || run.done) return;
  state.settings.saver = run.clock.mode === 'video';
  emit('settings:save');
  setSaver(state.settings.saver);
}

// Watchdog: iOS pauses video in the background; networks stall. Resume, or fall back to the tracker.
function watchdog() {
  if (!run || run.done || run.clock.mode !== 'video') return;
  if (document.hidden) return;
  if (video.paused && !run.resume) video.play().catch(() => {});
  const t = video.currentTime;
  if (t < 0.1) return;            // initial load is covered by the 9s stall timer in startVideo()
  if (t === run.wdLast) {
    run.wdStuck = (run.wdStuck || 0) + 1;
    if (run.wdStuck === 2) loader.classList.add('is-on');
    if (run.wdStuck >= 6) { run.wdStuck = 0; useTimer('Video stalled — switched to live tracker'); }   // ~3s
  } else {
    if (run.wdStuck >= 2) loader.classList.remove('is-on');
    run.wdStuck = 0;
  }
  run.wdLast = t;
}

export function skip() {
  if (!run || run.done) return;
  finish({ skipped: true });
}

function finish({ skipped = false, instant = false } = {}) {
  if (!run || run.done) return;
  run.done = true;
  cancelAnimationFrame(run.raf);
  clearTimeout(run.stallTimer);
  clearInterval(run.wd);
  detachResume();
  loader.classList.remove('is-on');
  if (skipped || run.clock?.mode !== 'video') video.pause();
  const race = state.race;
  railDist.textContent = 0;
  railFill.style.transform = 'scaleX(1)';
  run.orderKey = race.result.join();
  applyOrder(race.result, { final: true });
  railLead.innerHTML = `Winner <b>#${race.result[0]} ${state.field.runners[race.result[0]].name}</b>`;
  const natural = !skipped && !instant && run.clock?.mode === 'video';
  if (natural) showCallout(race.result[0], 'wins!');
  run.onFinish?.(race.result, { natural });
}

export function stop() {
  if (!run) return;
  run.done = true;
  cancelAnimationFrame(run.raf);
  clearTimeout(run.stallTimer);
  clearTimeout(run.calloutTimer);
  clearInterval(run.wd);
  detachResume();
  run = null;
}

export function pauseVideo() { video.pause(); }

// ---------- Podium (result screen) ----------
export function podiumMarkup(order, mineSet = mine()) {
  const { runners, win } = state.field;
  return order.slice(0, 3).map((h, i) =>
    `<li class="podium__step ${mineSet.has(h) ? 'is-mine' : ''}">
      <div class="podium__silk">${runnerIcon(h)}${saddle(h)}</div>
      <span class="podium__name">${runners[h].name}</span>
      <div class="podium__block"><span class="podium__place">${i + 1}<sup>${['st', 'nd', 'rd'][i]}</sup></span>
        <span class="podium__price">${i === 0 ? `Win ${odds(win[h])}` : `#${h}`}</span></div>
    </li>`).join('');
}

/**
 * Short beat after the finish so the winner is seen crossing the line, then onDone().
 * Tapping Skip during the beat jumps straight on. ms <= 0 continues immediately.
 */
export function afterFinish(ms, onDone) {
  let timer = 0, done = false;
  const btn = $('#btnSkip');
  const go = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    btn.removeEventListener('click', go);
    onDone();
  };
  if (ms <= 0) { go(); return; }
  timer = setTimeout(go, ms);
  btn.addEventListener('click', go);
}

export function initRace() {
  $('#btnSkip').addEventListener('click', skip);
  btnSaver.addEventListener('click', toggleSaver);
  video.addEventListener('error', () => { if (run && !run.done && run.clock?.mode === 'video') useTimer('Video unavailable — live tracker only'); });
  on('escape', () => { if (state.phase === 'racing') skip(); });
}
