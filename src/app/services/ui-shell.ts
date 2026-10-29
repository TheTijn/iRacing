import { Injectable, inject, signal } from '@angular/core';
import type { Phase } from '../core/models';
import { GameState } from './game-state';
import { Motion, gsap } from './motion';

export type SheetName = 'settings' | 'history' | 'help' | 'auto';
type ViewPhase = Exclude<Phase, 'loading'>;

/** Shared UI chrome: toast, balance pill, sheets, the betslip height and view transitions. */
@Injectable({ providedIn: 'root' })
export class UiShell {
  private readonly state = inject(GameState);
  private readonly motion = inject(Motion);

  // ---------- Toast ----------
  readonly toastText = signal('');
  readonly toastError = signal(false);
  readonly toastOn = signal(false);
  private toastTimer = 0;

  toast(msg: string, error = false): void {
    this.toastText.set(msg);
    this.toastError.set(!!error);
    this.toastOn.set(true);
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastOn.set(false), 2200);
  }

  // ---------- Balance pill ----------
  // The pill shows its own number, not state.balance: winnings are credited at the finish but only
  // counted into the pill on the result screen (never show winnings before the reveal).
  readonly shownBalance = signal<number | null>(null);
  /** Bumped to replay the pill's highlight animation. */
  readonly balanceBump = signal(0);
  /** The pill element: target of the coins that fly in on a win. */
  balanceEl: HTMLElement | null = null;
  private balTween: gsap.core.Tween | null = null;

  renderBalance({ animate = false } = {}): void {
    const target = this.state.balance();
    const shown = this.shownBalance();
    this.balTween?.kill();
    if (animate && shown != null && !this.motion.reducedMotion()) {
      this.balTween = this.motion.countUp(shown, target, { duration: 1.1, onUpdate: v => this.shownBalance.set(v) });
      this.balanceBump.update(n => n + 1);
    } else {
      this.shownBalance.set(target);
    }
  }

  // ---------- Sheets ----------
  readonly sheet = signal<SheetName | null>(null);
  openSheet(name: SheetName): void { this.sheet.set(name); }
  closeSheet(): void { this.sheet.set(null); }

  /** Height of the visible (bottom-sheet) betslip; the views pad their scrollers by it (--slip-h). */
  readonly slipHeight = signal(0);

  // ---------- Views ----------
  // Imperative on purpose: each phase's view cross-fades with GSAP, and the outgoing view keeps
  // `is-active` until its fade ends. The app shell registers the four view elements once rendered.
  private views: Partial<Record<ViewPhase, HTMLElement>> = {};
  private current: HTMLElement | null = null;

  registerViews(views: Record<ViewPhase, HTMLElement>): void { this.views = views; }

  showView(phase: ViewPhase, { instant = false } = {}): void {
    const next = this.views[phase]!;
    this.state.phase.set(phase);
    if (next === this.current) return;
    const prev = this.current;
    this.current = next;
    Object.values(this.views).forEach(v => { if (v !== next && v !== prev) v.classList.remove('is-active'); });
    next.classList.add('is-active');
    next.style.pointerEvents = '';
    if (instant || this.motion.reducedMotion() || !prev) {
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
}
