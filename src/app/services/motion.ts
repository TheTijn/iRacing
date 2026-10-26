import { Injectable } from '@angular/core';
import { gsap } from 'gsap';

export { gsap };

interface Particle {
  x: number; y: number; rot: number; s: number; life: number; age: number;
  coin?: boolean; c?: string;
  // free particles
  vx?: number; vy?: number; g?: number; vr?: number;
  // particles flying to a target (quadratic bezier)
  fly?: boolean; x0?: number; y0?: number; tx?: number; ty?: number; cx?: number; cy?: number;
  dur?: number; delay?: number; onArrive?: () => void;
}

const COLORS = ['#3fe58c', '#f6c453', '#ffe29a', '#eef6f0', '#9dffc6', '#ff9e6b'];

/** Motion + celebration helpers: GSAP tweens, haptics and the canvas confetti / coins layer. */
@Injectable({ providedIn: 'root' })
export class Motion {
  private readonly mq = matchMedia('(prefers-reduced-motion: reduce)');
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private parts: Particle[] = [];
  private raf = 0;
  private last = 0;
  private celebration: (gsap.core.Animation | null)[] = [];

  constructor() {
    window.addEventListener('resize', () => { if (this.raf) this.resize(); });
  }

  reducedMotion(): boolean { return this.mq.matches; }

  haptic(pattern: number | number[] = 12): void {
    // Only after a real user gesture (Chrome blocks and logs otherwise); no-op on iOS.
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
  }

  /** Animate a number from → to, handing each value to onUpdate. Returns the tween. */
  countUp(from: number, to: number, { duration = 1.4, ease = 'power3.out', onUpdate, onComplete }: {
    duration?: number; ease?: string; onUpdate: (v: number) => void; onComplete?: () => void;
  }): gsap.core.Tween | null {
    const o = { v: from };
    if (this.reducedMotion()) { onUpdate(to); onComplete?.(); return null; }
    return gsap.to(o, {
      v: to, duration, ease,
      onUpdate: () => onUpdate(o.v),
      onComplete: () => { onUpdate(to); onComplete?.(); },
    });
  }

  /** Win celebration tweens (result screen), so a new race or the lobby can cut them short. */
  trackCelebration(...anims: (gsap.core.Animation | null)[]): void { this.celebration.push(...anims); }
  cancelCelebration(): void {
    this.celebration.forEach(a => a?.kill());
    this.celebration = [];
  }

  // ---------- Canvas particles: confetti + coins, optionally flying to a target ----------
  attachCanvas(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  private resize(): void {
    if (!this.canvas || !this.ctx) return;
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(r.width * dpr);
    this.canvas.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private localPoint(x: number, y: number) {
    const r = this.canvas!.getBoundingClientRect();
    return { x: x - r.left, y: y - r.top };
  }

  private loop = (t: number): void => {
    const ctx = this.ctx!;
    const dt = Math.min(0.033, (t - (this.last || t)) / 1000);
    this.last = t;
    const r = this.canvas!.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    this.parts = this.parts.filter(p => p.life > 0);
    for (const p of this.parts) {
      p.age += dt;
      if (p.fly) {
        // Quadratic bezier from origin to target
        const k = Math.min(1, Math.max(0, (p.age - p.delay!) / p.dur!));
        if (k <= 0) continue;
        const e = 1 - Math.pow(1 - k, 3);
        p.x = (1 - e) * (1 - e) * p.x0! + 2 * (1 - e) * e * p.cx! + e * e * p.tx!;
        p.y = (1 - e) * (1 - e) * p.y0! + 2 * (1 - e) * e * p.cy! + e * e * p.ty!;
        p.rot += dt * 8;
        if (k >= 1) { p.life = 0; p.onArrive?.(); continue; }
      } else {
        p.vy! += p.g! * dt;
        p.vx! *= 0.992; p.vy! *= 0.992;
        p.x += p.vx! * dt; p.y += p.vy! * dt;
        p.rot += p.vr! * dt;
        p.life -= dt;
      }
      const alpha = p.fly ? 1 : Math.min(1, p.life / 0.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      if (p.coin) {
        const sx = Math.abs(Math.cos(p.rot));
        ctx.scale(Math.max(0.15, sx), 1);
        const g = ctx.createLinearGradient(0, -p.s, 0, p.s);
        g.addColorStop(0, '#fff3c4'); g.addColorStop(0.5, '#f6c453'); g.addColorStop(1, '#b77d14');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, p.s, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(120,70,0,.5)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(0, 0, p.s * 0.68, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c!;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      }
      ctx.restore();
    }
    if (this.parts.length) this.raf = requestAnimationFrame(this.loop);
    else { this.raf = 0; this.last = 0; ctx.clearRect(0, 0, r.width, r.height); }
  };

  private kick(): void {
    if (!this.raf) { this.resize(); this.raf = requestAnimationFrame(this.loop); }
  }

  /** Confetti + coin fountain from a screen point. */
  burst(x: number, y: number, { confetti = 90, coins = 26, power = 1 } = {}): void {
    if (this.reducedMotion() || !this.canvas) return;
    const o = this.localPoint(x, y);
    for (let i = 0; i < confetti; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
      const v = (380 + Math.random() * 520) * power;
      this.parts.push({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16,
        s: 7 + Math.random() * 7, c: COLORS[i % COLORS.length], life: 1.8 + Math.random() * 1.2, age: 0 });
    }
    for (let i = 0; i < coins; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
      const v = (420 + Math.random() * 460) * power;
      this.parts.push({ coin: true, x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1300, rot: Math.random() * 6, vr: 6 + Math.random() * 10,
        s: 7 + Math.random() * 5, life: 1.6 + Math.random() * 0.8, age: 0 });
    }
    this.kick();
  }

  /** Coins that fly from one element to another (e.g. winnings into the balance pill). */
  flyCoins(fromEl: Element | null, toEl: Element | null, { count = 14, onFirstArrive, onDone }: {
    count?: number; onFirstArrive?: () => void; onDone?: () => void;
  } = {}): void {
    if (this.reducedMotion() || !fromEl || !toEl || !this.canvas) { onFirstArrive?.(); onDone?.(); return; }
    const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
    const o = this.localPoint(a.left + a.width / 2, a.top + a.height / 2);
    const t = this.localPoint(b.left + b.width / 2, b.top + b.height / 2);
    let arrived = 0;
    for (let i = 0; i < count; i++) {
      const sx = o.x + (Math.random() - 0.5) * a.width * 0.6;
      const sy = o.y + (Math.random() - 0.5) * a.height * 0.5;
      this.parts.push({
        fly: true, coin: true, x: sx, y: sy, x0: sx, y0: sy, tx: t.x, ty: t.y,
        cx: (sx + t.x) / 2 + (Math.random() - 0.5) * 160, cy: Math.min(sy, t.y) - 60 - Math.random() * 80,
        dur: 0.75 + Math.random() * 0.25, delay: i * 0.045, age: 0, rot: Math.random() * 6, s: 7 + Math.random() * 3, life: 1,
        onArrive: () => { arrived++; if (arrived === 1) onFirstArrive?.(); if (arrived === count) onDone?.(); },
      });
    }
    this.kick();
  }
}
