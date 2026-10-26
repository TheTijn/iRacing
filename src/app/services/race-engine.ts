import { Injectable, computed, inject, signal } from '@angular/core';
import { BET_TYPES, liveState, settle } from '../core/pricing';
import { betLabel } from '../core/sports';
import type { Bet, LiveState, Race } from '../core/models';
import { GameState } from './game-state';
import { Motion } from './motion';
import { Persistence } from './persistence';
import { UiShell } from './ui-shell';

const UI_ORDER_MS = 250;
const CALLOUT_GAP_MS = 2400;
const STATE_TXT: Record<LiveState, string> = { winning: 'Winning', close: 'In reach', out: 'Behind' };

interface Clock { mode: 'video' | 'timer'; now(): number }

interface Run {
  onFinish: (order: number[], info: { natural: boolean }) => void;
  done: boolean;
  clock: Clock | null;
  evIdx: number;
  orderKey: string;
  lastOrder: number;
  lastRail: number;
  lastCallout: number;
  leader: number | null;
  raf: number;
  wd: number;
  stallTimer: number;
  calloutTimer: number;
  resume: (() => void) | null;
  wdLast?: number;
  wdStuck?: number;
}

/** How a live bet's runners are shown: Odd/Even side label, and the separator between runners. */
export interface LiveBetLayout {
  side?: string;
  horses: number[];
  sep: 'ahead of' | '→' | null;
}

export interface LiveBet {
  bet: Bet;
  title: string;
  layout: LiveBetLayout;
  /** ' · Runner name' for single-runner bets. */
  name: string;
  state: LiveState;
  stateText: string;
  ret: number;
}

/**
 * Live race: plays the video, maps media time → telemetry frame, and drives the distance rail, running
 * order, live bet states and lead-change callouts (as signals the live race view renders). Falls back to a
 * wall-clock timer when the video is hidden (data saver), stalls or fails.
 */
@Injectable({ providedIn: 'root' })
export class RaceEngine {
  private readonly state = inject(GameState);
  private readonly motion = inject(Motion);
  private readonly persistence = inject(Persistence);
  private readonly ui = inject(UiShell);

  private video: HTMLVideoElement | null = null;
  private run: Run | null = null;
  private beat: (() => void) | null = null;

  /** Bumped per race so the running order chips are rebuilt, not slid over from the last race. */
  readonly runId = signal(0);
  readonly stageRace = signal('');
  readonly distToGo = signal(0);
  /** Share of the race run, 0–1 (the rail fill). */
  readonly progress = signal(0);
  /** Running order, leader first. */
  readonly order = signal<number[]>([]);
  /** The race is over: live bets show Won / Lost. */
  readonly final = signal(false);
  readonly railLead = signal<{ label: 'Leader' | 'Winner'; no: number } | null>(null);
  readonly callout = signal<{ no: number; text: string; mine: boolean } | null>(null);
  readonly calloutOn = signal(false);
  readonly announce = signal('');
  readonly loading = signal(false);
  /** Stage collapsed to the tracker (data saver, or the video failed). */
  readonly collapsed = signal(false);
  /** The data saver button's state. */
  readonly saverOn = signal(false);

  /** Runners carrying the player's bets. */
  readonly mine = computed(() => {
    const s = new Set<number>();
    this.state.placed().forEach(b => b.legs.flat().forEach(h => s.add(h)));
    return s;
  });
  /** Runner → index in the running order. */
  readonly positions = computed(() => new Map(this.order().map((h, i) => [h, i])));

  readonly liveBets = computed<LiveBet[]>(() => {
    const field = this.state.field();
    const order = this.order();
    if (!field || !order.length) return [];
    const final = this.final();
    return this.state.placed().map(b => {
      const ret = settle(b, order, field.places);
      const s: LiveState = final ? (ret > 0 ? 'winning' : 'out') : liveState(b, order, field.places);
      const flat = b.legs.flat();
      return {
        bet: b,
        title: betLabel(field.sport, b.type, b.box),
        layout: layoutOf(b),
        name: flat.length === 1 ? ` · ${field.runners[b.legs[0][0]].name}` : '',
        state: s,
        stateText: final ? (s === 'winning' ? 'Won' : 'Lost') : STATE_TXT[s],
        ret,
      };
    });
  });

  /** 'n/m winning · €x if it ended now' line above the live bets. */
  readonly liveNow = computed(() => {
    const bets = this.liveBets();
    const total = bets.reduce((s, b) => s + b.ret, 0);
    return { count: bets.length, winning: bets.filter(b => b.state === 'winning').length, total };
  });

  attachVideo(video: HTMLVideoElement): void {
    this.video = video;
    video.muted = true;
    video.addEventListener('error', () => {
      if (this.run && !this.run.done && this.run.clock?.mode === 'video') this.useTimer('Video unavailable — live tracker only');
    });
  }

  // ---------- Clock: video time, or a wall-clock timer (data saver / video failure) ----------
  private videoClock(): Clock { const v = this.video!; return { mode: 'video', now: () => v.currentTime }; }
  private timerClock(fromT = 0): Clock {
    const t0 = performance.now();
    return { mode: 'timer', now: () => fromT + (performance.now() - t0) / 1000 };
  }

  /** Called during betting: poster, and preload the video unless data saver / instant results is on. */
  prepare(race: Race): void {
    if (!this.video) return;
    this.video.poster = race.poster;
    const { saver, instant } = this.state.settings();
    if (saver || instant) return;   // don't burn data preloading
    this.loadSrc(race);
  }
  private loadSrc(race: Race): void {
    const video = this.video!;
    if (video.dataset['src'] === race.src) return;
    video.dataset['src'] = race.src;
    video.src = race.src;
    video.preload = 'auto';
    video.load();
  }

  private showCallout(h: number, verb?: string): void {
    const run = this.run!;
    const r = this.state.field()!.runners[h];
    const isMine = this.mine().has(h);
    this.callout.set({ no: h, text: verb || (isMine ? 'hits the front for you!' : 'hits the front'), mine: isMine });
    this.calloutOn.set(true);
    clearTimeout(run.calloutTimer);
    run.calloutTimer = window.setTimeout(() => this.calloutOn.set(false), 1900);
    this.announce.set(`Number ${h}, ${r.name}, ${verb || 'leads'}`);
    if (isMine) this.motion.haptic(10);
  }

  // ---------- Frame loop ----------
  private orderAt(frame: number): number[] {
    const run = this.run!;
    const ev = this.state.race()!.orderEvents;
    if (run.evIdx >= ev.length || ev[run.evIdx].f > frame) run.evIdx = 0;
    while (run.evIdx + 1 < ev.length && ev[run.evIdx + 1].f <= frame) run.evIdx++;
    return ev[run.evIdx].order;
  }

  private distAt(frame: number): number {
    const { dist, distStep } = this.state.race()!;
    const x = frame / distStep;
    const i = Math.min(dist.length - 1, Math.floor(x));
    const j = Math.min(dist.length - 1, i + 1);
    return dist[i] + (dist[j] - dist[i]) * (x - i);
  }

  private tick = (): void => {
    const run = this.run;
    if (!run || run.done) return;
    const race = this.state.race()!;
    const field = this.state.field()!;
    const t = run.clock!.now();
    const frame = Math.max(0, Math.floor(t * race.fps + 1e-3));
    if (frame >= race.finishFrame) { this.finish(); return; }

    const now = performance.now();
    if (now - run.lastRail > 60) {
      const d = Math.max(0, this.distAt(frame));
      this.distToGo.set(Math.ceil(d));
      this.progress.set(1 - d / race.distance);
      run.lastRail = now;
    }

    // In the gates the telemetry lists horses in reverse; show saddle order until the jump.
    const order = frame < race.gateEndFrame ? field.horses : this.orderAt(frame);
    const key = order.join();
    if (key !== run.orderKey && now - run.lastOrder >= UI_ORDER_MS) {
      run.orderKey = key;
      run.lastOrder = now;
      this.order.set(order);
      const leader = order[0];
      this.railLead.set({ label: 'Leader', no: leader });
      if (leader !== run.leader) {
        if (run.leader != null && frame > race.gateEndFrame + 3 * race.fps && now - run.lastCallout > CALLOUT_GAP_MS) {
          this.showCallout(leader);
          run.lastCallout = now;
        }
        run.leader = leader;
      }
    }
    run.raf = requestAnimationFrame(this.tick);
  };

  private useTimer(reason?: string): void {
    const run = this.run;
    if (!run || run.done) return;
    const t = run.clock?.mode === 'video' ? this.video!.currentTime : (run.clock ? run.clock.now() : 0);
    run.clock = this.timerClock(t);
    this.video!.pause();
    this.collapsed.set(true);
    this.loading.set(false);
    if (reason) this.ui.toast(reason);
  }

  private startVideo(): void {
    const run = this.run!;
    const video = this.video!;
    this.loadSrc(this.state.race()!);
    this.loading.set(true);
    video.addEventListener('playing', () => this.loading.set(false), { once: true });
    try { video.currentTime = 0; } catch { /* not seekable yet */ }
    const p = video.play();
    run.clock = this.videoClock();
    p?.catch?.(() => { if (this.run === run && !run.done && run.clock!.mode === 'video') this.useTimer('Video unavailable — live tracker only'); });
    run.stallTimer = window.setTimeout(() => {
      if (this.run && !this.run.done && video.readyState < 3 && video.currentTime < 0.2) this.useTimer('Slow connection — switched to live tracker');
    }, 9000);
  }

  start({ onFinish, instant = false }: { onFinish: Run['onFinish']; instant?: boolean }): void {
    this.stop();
    this.run = {
      onFinish, done: false, clock: null, evIdx: 0, orderKey: '', lastOrder: 0, lastRail: 0, lastCallout: 0, leader: null,
      raf: 0, wd: 0, stallTimer: 0, calloutTimer: 0, resume: null,
    };
    const race = this.state.race()!;
    this.calloutOn.set(false);
    this.stageRace.set(`Race ${this.state.raceNo()} · ${race.distance}m`);
    this.distToGo.set(race.distance);
    this.progress.set(0);
    this.railLead.set(null);
    this.final.set(false);
    this.runId.update(n => n + 1);
    this.order.set(this.state.field()!.horses);

    if (instant) { this.finish({ instant: true }); return; }

    const saver = this.state.settings().saver;
    this.setSaverUI(saver);
    if (saver) this.run.clock = this.timerClock(0);
    else this.startVideo();
    this.run.wd = window.setInterval(this.watchdog, 500);
    this.run.raf = requestAnimationFrame(this.tick);
  }

  private setSaverUI(on: boolean): void {
    this.collapsed.set(on);
    this.saverOn.set(on);
  }

  /** Switch the running race between video and tracker-only. Safe to call from a tap or from Settings. */
  setSaver(on: boolean): void {
    const run = this.run;
    if (!run || run.done) return;
    const isSaver = run.clock!.mode !== 'video';
    this.setSaverUI(on);
    if (on === isSaver) return;
    if (on) { this.detachResume(); this.useTimer(); return; }
    // Resume the video at the current race time. play() runs synchronously (iOS gesture rule);
    // only the seek waits for metadata, and it bails if this race has ended meanwhile.
    const video = this.video!;
    this.loadSrc(this.state.race()!);
    this.loading.set(true);
    video.play().catch(() => { if (this.run === run && !run.done) this.useTimer('Video unavailable — live tracker only'); });
    this.detachResume();
    run.resume = () => {
      run.resume = null;
      if (this.run !== run || run.done) return;
      try { video.currentTime = run.clock!.now() + 0.2; } catch { /* ignore */ }
      run.clock = this.videoClock();
      this.loading.set(false);
    };
    if (video.readyState >= 1) run.resume(); else video.addEventListener('loadedmetadata', run.resume, { once: true });
  }
  private detachResume(): void {
    if (this.run?.resume) { this.video!.removeEventListener('loadedmetadata', this.run.resume); this.run.resume = null; }
  }

  /** The stage's eye button: hide / show the video mid-race (and remember it as the data saver setting). */
  toggleSaver(): void {
    const run = this.run;
    if (!run || run.done) return;
    const saver = run.clock!.mode === 'video';
    this.state.settings.update(s => ({ ...s, saver }));
    this.persistence.saveSettings(this.state.settings());
    this.setSaver(saver);
  }

  // Watchdog: iOS pauses video in the background; networks stall. Resume, or fall back to the tracker.
  private watchdog = (): void => {
    const run = this.run;
    const video = this.video!;
    if (!run || run.done || run.clock!.mode !== 'video') return;
    if (document.hidden) return;
    if (video.paused && !run.resume) video.play().catch(() => {});
    const t = video.currentTime;
    if (t < 0.1) return;            // initial load is covered by the 9s stall timer in startVideo()
    if (t === run.wdLast) {
      run.wdStuck = (run.wdStuck || 0) + 1;
      if (run.wdStuck === 2) this.loading.set(true);
      if (run.wdStuck >= 6) { run.wdStuck = 0; this.useTimer('Video stalled — switched to live tracker'); }   // ~3s
    } else {
      if ((run.wdStuck || 0) >= 2) this.loading.set(false);
      run.wdStuck = 0;
    }
    run.wdLast = t;
  };

  /** Skip to the result (Skip button, Escape). */
  skip(): void {
    if (!this.run || this.run.done) return;
    this.finish({ skipped: true });
  }

  /** The Skip button: skips the race, or the finish-line beat once the race has finished. */
  skipPressed(): void {
    if (this.run && !this.run.done) this.skip();
    else this.beat?.();
  }

  private finish({ skipped = false, instant = false } = {}): void {
    const run = this.run;
    if (!run || run.done) return;
    run.done = true;
    cancelAnimationFrame(run.raf);
    clearTimeout(run.stallTimer);
    clearInterval(run.wd);
    this.detachResume();
    this.loading.set(false);
    if (skipped || run.clock?.mode !== 'video') this.video?.pause();
    const race = this.state.race()!;
    this.distToGo.set(0);
    this.progress.set(1);
    run.orderKey = race.result.join();
    this.order.set(race.result);
    this.final.set(true);
    this.railLead.set({ label: 'Winner', no: race.result[0] });
    const natural = !skipped && !instant && run.clock?.mode === 'video';
    if (natural) this.showCallout(race.result[0], 'wins!');
    run.onFinish(race.result, { natural });
  }

  stop(): void {
    const run = this.run;
    if (!run) return;
    run.done = true;
    cancelAnimationFrame(run.raf);
    clearTimeout(run.stallTimer);
    clearTimeout(run.calloutTimer);
    clearInterval(run.wd);
    this.detachResume();
    this.run = null;
  }

  pauseVideo(): void { this.video?.pause(); }

  /**
   * Short beat after the finish so the winner is seen crossing the line, then onDone().
   * Tapping Skip during the beat jumps straight on. ms <= 0 continues immediately.
   */
  afterFinish(ms: number, onDone: () => void): void {
    let timer = 0, done = false;
    const go = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (this.beat === go) this.beat = null;
      onDone();
    };
    if (ms <= 0) { go(); return; }
    timer = window.setTimeout(go, ms);
    this.beat = go;
  }
}

function layoutOf(b: Bet): LiveBetLayout {
  const horses = [...new Set(b.legs.flat())];
  const t = BET_TYPES[b.type];
  if (t.set) return { side: b.side, horses, sep: null };
  if (t.pair) return { horses: b.combos[0].sel, sep: 'ahead of' };
  if (b.combos.length === 1 && b.type !== 'WIN' && b.type !== 'PLACE') return { horses: b.combos[0].sel, sep: '→' };
  return { horses, sep: null };
}
