// Result screen: hero (win / partial return / loss), podium, settled bets, next actions.
import { state, sport, $ } from './state.js';
import { money, odds } from './store.js';
import { describeSel, betTitle, slipCost } from './betslip.js';
import { podiumMarkup } from './race.js';
import { gsap, reducedMotion, countUp, burst, flyCoins, haptic } from './fx.js';
import { renderBalance } from './ui.js';

const view = $('#viewResult');
const hero = $('#resultHero');
const podium = $('#resultPodium');
const betsEl = $('#resultBets');
const btnNext = $('#btnNext');
const btnRebet = $('#btnRebet');
const btnReplay = $('#btnReplay');
let tl = null;
let amountTween = null;
let shownAt = 0;

/** Result actions only accept taps once the screen has settled (guards a double tap on Skip landing on Next race). */
export const resultReady = () => performance.now() - shownAt > 450;

export function cancelCelebration() {
  tl?.kill();
  amountTween?.kill();
  amountTween = null;
}

/**
 * outcome: { raceNo, order, bets: [bet + { ret }], staked, returned }
 * kind: 'win' (profit), 'partial' (some return, net loss), 'loss'
 */
export function outcomeKind(o) {
  if (o.returned <= 0) return 'loss';
  return o.returned > o.staked ? 'win' : 'partial';
}

function heroMarkup(o, kind) {
  const w = state.field.runners[o.order[0]];
  const net = o.returned - o.staked;
  if (kind === 'win') {
    return `<p class="hero__eyebrow">Race ${o.raceNo} · You won</p>
      <p class="hero__amount" id="heroAmount">${money(0)}</p>
      <p class="hero__sub">Staked <b>${money(o.staked)}</b> · Profit <b class="profit">+${money(net)}</b></p>`;
  }
  if (kind === 'partial') {
    return `<p class="hero__eyebrow">Race ${o.raceNo} · Returned</p>
      <p class="hero__title" id="heroAmount">${money(0)}</p>
      <p class="hero__sub">Staked <b>${money(o.staked)}</b> · Net <b>${money(net)}</b></p>`;
  }
  return `<p class="hero__eyebrow">Race ${o.raceNo} · Result</p>
    <h2 class="hero__title">Not this time</h2>
    <p class="hero__sub"><b>#${o.order[0]} ${w.name}</b> won at ${odds(state.field.win[o.order[0]])}.<br>${sport().waiting}</p>`;
}

function betMarkup(b) {
  const won = b.ret > 0;
  return `<li class="rbet ${won ? 'is-won' : 'is-lost'}">
    <span class="rbet__type">${betTitle(b)}<em>${won ? 'Won' : 'Lost'}</em></span>
    <div class="rbet__sel">${describeSel(b)}</div>
    <div class="rbet__side"><span class="rbet__ret">${won ? money(b.ret) : '—'}</span><span class="rbet__stake">Stake ${money(b.stake * b.combos.length)}</span></div>
  </li>`;
}

export function renderResult(o, { canRebet }) {
  const kind = outcomeKind(o);
  view.classList.toggle('is-win', kind === 'win');
  hero.innerHTML = heroMarkup(o, kind);
  podium.innerHTML = `<ol class="podium">${podiumMarkup(o.order)}</ol>`;
  betsEl.innerHTML = o.bets.map(betMarkup).join('');
  $('.result__scroll', view).scrollTop = 0;
  $('.result__list', view).scrollTop = 0;   // its own scroller in the desktop layout

  const rebetCost = slipCost(state.lastPlaced);
  // Buttons never move (muscle memory: Rebet is always bottom right); only the highlight follows the outcome.
  btnNext.innerHTML = `<span>Next race</span><small>New field · race ${o.raceNo + 1}</small>`;
  btnRebet.innerHTML = `<span>Rebet</span><small>${money(rebetCost)} · same picks</small>`;
  btnNext.className = `btn btn--xl ${kind === 'win' ? 'btn--ghost' : 'btn--primary'}`;
  btnRebet.className = `btn btn--xl ${kind === 'win' ? 'btn--gold' : 'btn--ghost'}`;
  btnRebet.disabled = !canRebet;
  btnReplay.hidden = state.race.replayStart == null || state.settings.saver;

  shownAt = performance.now();
  animateIn(o, kind);
}

function animateIn(o, kind) {
  cancelCelebration();
  const amountEl = $('#heroAmount');
  const credit = () => renderBalance({ animate: true });

  if (reducedMotion()) {
    if (amountEl) amountEl.textContent = money(o.returned);
    credit();
    return;
  }
  tl = gsap.timeline();
  tl.fromTo(hero.children, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'expo.out', stagger: 0.08 })
    .fromTo(podium.querySelectorAll('.podium__step'), { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: 'expo.out', stagger: 0.07 }, 0.25)
    .fromTo(betsEl.children, { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45, ease: 'expo.out', stagger: 0.05 }, 0.4)
    .fromTo('#resultActions', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: 'expo.out' }, 0.3);

  if (kind === 'loss') { credit(); return; }

  tl.add(() => {
    amountTween = countUp(amountEl, 0, o.returned, {
      duration: kind === 'win' ? 1.6 : 0.9,
      format: v => money(v),
      onComplete: () => {
        if (state.phase !== 'result') return;
        if (kind !== 'win') { credit(); return; }
        const r = amountEl.getBoundingClientRect();
        burst(r.left + r.width / 2, r.top + r.height / 2, { power: o.returned / o.staked > 5 ? 1.2 : 1 });
        haptic([18, 40, 30]);
        gsap.fromTo(amountEl, { scale: 1.08 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' });
        flyCoins(amountEl, $('#balance'), { onFirstArrive: credit });
      },
    });
  }, 0.2);
}

export function initResults({ onAction }) {
  [btnNext, btnRebet].forEach(b => b.addEventListener('click', () => onAction(b.dataset.act)));
  btnReplay.addEventListener('click', () => onAction('replay'));
}
