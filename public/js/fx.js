// Motion + celebration helpers. GSAP is loaded globally from /vendor/gsap.min.js.
const gsap = window.gsap;
export { gsap };

const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = () => mq.matches;

export const EASE_OUT = 'expo.out';

export function haptic(pattern = 12) {
  // Only after a real user gesture (Chrome blocks and logs otherwise); no-op on iOS.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

/** Animate a number into an element with a formatter. Returns the tween. */
export function countUp(el, from, to, { duration = 1.4, format = v => v.toFixed(2), ease = 'power3.out', onComplete } = {}) {
  const o = { v: from };
  if (reducedMotion()) { el.textContent = format(to); onComplete?.(); return null; }
  return gsap.to(o, {
    v: to, duration, ease,
    onUpdate: () => { el.textContent = format(o.v); },
    onComplete: () => { el.textContent = format(to); onComplete?.(); },
  });
}

// ---------- Canvas particles: confetti + coins, optionally flying to a target ----------
const canvas = document.getElementById('fxCanvas');
const ctx = canvas.getContext('2d');
let parts = [];
let raf = 0;
let last = 0;
const COLORS = ['#3fe58c', '#f6c453', '#ffe29a', '#eef6f0', '#9dffc6', '#ff9e6b'];

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function localPoint(x, y) {
  const r = canvas.getBoundingClientRect();
  return { x: x - r.left, y: y - r.top };
}

function loop(t) {
  const dt = Math.min(0.033, (t - (last || t)) / 1000);
  last = t;
  const r = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  parts = parts.filter(p => p.life > 0);
  for (const p of parts) {
    p.age += dt;
    if (p.fly) {
      // Quadratic bezier from origin to target
      const k = Math.min(1, Math.max(0, (p.age - p.delay) / p.dur));
      if (k <= 0) continue;
      const e = 1 - Math.pow(1 - k, 3);
      const x = (1 - e) * (1 - e) * p.x0 + 2 * (1 - e) * e * p.cx + e * e * p.tx;
      const y = (1 - e) * (1 - e) * p.y0 + 2 * (1 - e) * e * p.cy + e * e * p.ty;
      p.x = x; p.y = y; p.rot += dt * 8;
      if (k >= 1) { p.life = 0; p.onArrive?.(); continue; }
    } else {
      p.vy += p.g * dt;
      p.vx *= 0.992; p.vy *= 0.992;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
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
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
    }
    ctx.restore();
  }
  if (parts.length) raf = requestAnimationFrame(loop);
  else { raf = 0; last = 0; ctx.clearRect(0, 0, r.width, r.height); }
}

function kick() { if (!raf) { resize(); raf = requestAnimationFrame(loop); } }

/** Confetti + coin fountain from a screen point. */
export function burst(x, y, { confetti = 90, coins = 26, power = 1 } = {}) {
  if (reducedMotion()) return;
  const o = localPoint(x, y);
  for (let i = 0; i < confetti; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.3;
    const v = (380 + Math.random() * 520) * power;
    parts.push({ x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 900, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16,
      s: 7 + Math.random() * 7, c: COLORS[i % COLORS.length], life: 1.8 + Math.random() * 1.2, age: 0 });
  }
  for (let i = 0; i < coins; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const v = (420 + Math.random() * 460) * power;
    parts.push({ coin: true, x: o.x, y: o.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1300, rot: Math.random() * 6, vr: 6 + Math.random() * 10,
      s: 7 + Math.random() * 5, life: 1.6 + Math.random() * 0.8, age: 0 });
  }
  kick();
}

/** Coins that fly from one element to another (e.g. winnings into the balance pill). */
export function flyCoins(fromEl, toEl, { count = 14, onFirstArrive, onDone } = {}) {
  if (reducedMotion() || !fromEl || !toEl) { onFirstArrive?.(); onDone?.(); return; }
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  const o = localPoint(a.left + a.width / 2, a.top + a.height / 2);
  const t = localPoint(b.left + b.width / 2, b.top + b.height / 2);
  let arrived = 0;
  for (let i = 0; i < count; i++) {
    const sx = o.x + (Math.random() - 0.5) * a.width * 0.6;
    const sy = o.y + (Math.random() - 0.5) * a.height * 0.5;
    parts.push({
      fly: true, coin: true, x: sx, y: sy, x0: sx, y0: sy, tx: t.x, ty: t.y,
      cx: (sx + t.x) / 2 + (Math.random() - 0.5) * 160, cy: Math.min(sy, t.y) - 60 - Math.random() * 80,
      dur: 0.75 + Math.random() * 0.25, delay: i * 0.045, age: 0, rot: Math.random() * 6, s: 7 + Math.random() * 3, life: 1,
      onArrive: () => { arrived++; if (arrived === 1) onFirstArrive?.(); if (arrived === count) onDone?.(); },
    });
  }
  kick();
}

window.addEventListener('resize', () => { if (raf) resize(); });
