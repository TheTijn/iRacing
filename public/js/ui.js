// Shared UI: toast, balance pill, bottom sheets, view transitions.
import { state, emit, $, $$ } from './state.js';
import { money } from './store.js';
import { gsap, reducedMotion, countUp } from './fx.js';

const app = $('#app');
const toastEl = $('#toast');
let toastTimer = 0;

export function toast(msg, error = false) {
  toastEl.textContent = msg;
  toastEl.classList.toggle('is-error', !!error);
  toastEl.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2200);
}

// ---------- Balance ----------
const balEl = $('#balanceValue');
let shown = null;
let balTween = null;
export function renderBalance({ animate = false } = {}) {
  const target = state.balance;
  balTween?.kill();
  if (animate && shown != null && !reducedMotion()) {
    balTween = countUp(balEl, shown, target, { duration: 1.1, format: v => money(v) });
    const pill = $('#balance');
    pill.classList.remove('is-bump'); void pill.offsetWidth; pill.classList.add('is-bump');
  } else {
    balEl.textContent = money(target);
  }
  shown = target;
}

// ---------- Views ----------
const views = { lobby: '#viewLobby', betting: '#viewCard', racing: '#viewRace', result: '#viewResult' };
let current = null;

export function showView(phase, { instant = false } = {}) {
  const next = $(views[phase]);
  app.dataset.phase = phase;
  state.phase = phase;
  emit('phase', phase);
  if (next === current) return;
  const prev = current;
  current = next;
  $$('.view').forEach(v => { if (v !== next && v !== prev) v.classList.remove('is-active'); });
  next.classList.add('is-active');
  next.style.pointerEvents = '';
  if (instant || reducedMotion() || !prev) {
    prev?.classList.remove('is-active');
    if (prev) prev.style.pointerEvents = '';
    gsap.set(next, { clearProps: 'opacity,transform,visibility' });
    return;
  }
  gsap.killTweensOf([prev, next]);
  prev.style.pointerEvents = 'none';
  gsap.set(next, { opacity: 0, y: 18, scale: 0.985, visibility: 'visible' });
  gsap.to(prev, { opacity: 0, scale: 0.985, duration: 0.22, ease: 'power2.out',
    onComplete: () => { prev.classList.remove('is-active'); prev.style.pointerEvents = ''; gsap.set(prev, { clearProps: 'opacity,transform,visibility' }); } });
  gsap.to(next, { opacity: 1, y: 0, scale: 1, duration: 0.5, delay: 0.08, ease: 'expo.out', clearProps: 'opacity,transform,visibility' });
}

// ---------- Sheets ----------
const scrim = $('#scrim');
let openSheet = null;
export function openSheetEl(id) {
  closeSheet();
  openSheet = $(id);
  openSheet.classList.add('is-open');
  scrim.classList.add('is-on');
  $('[data-close]', openSheet)?.focus({ preventScroll: true });
}
export function closeSheet() {
  if (!openSheet) return;
  openSheet.classList.remove('is-open');
  scrim.classList.remove('is-on');
  openSheet = null;
}
export function initSheets() {
  $$('.sheet [data-close]').forEach(b => b.addEventListener('click', closeSheet));
  scrim.addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (openSheet) closeSheet();
    else emit('escape');
  });
}
