import { Injectable } from '@angular/core';
import { CONFIG } from '../core/config';
import type { HistoryEntry, Settings } from '../core/models';

const KEY_SETTINGS = 'ir_settings';
const KEY_BALANCE = 'ir_balance';
const KEY_HISTORY = 'ir_history';
const KEY_SESSION = 'ir_session';

/**
 * Persistence for per-viewer conveniences only (this is a play-money demo): settings and the demo balance
 * in localStorage, bet history and the session start in sessionStorage. Every access is wrapped: storage can be unavailable.
 */
@Injectable({ providedIn: 'root' })
export class Persistence {
  private read<T>(store: () => Storage, key: string, fallback: T): T {
    try { const v = store().getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
  }
  private write(store: () => Storage, key: string, value: unknown): void {
    try { store().setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }

  loadSettings(): Settings {
    const saved = this.read<Partial<Settings> & { sport?: unknown }>(() => localStorage, KEY_SETTINGS, {});
    delete saved.sport;   // left over from the old Horses/Dogs toggle; the sport is no longer saved
    // Always US dollars: there is no currency setting, so an older saved choice is overridden.
    return { odds: 'decimal', instant: false, saver: false, autoPlay: true, ...saved, currency: 'USD' };
  }
  saveSettings(settings: Settings): void { this.write(() => localStorage, KEY_SETTINGS, settings); }

  loadBalance(): number {
    const bal = Number(this.read(() => localStorage, KEY_BALANCE, CONFIG.startBalance));
    return Number.isFinite(bal) ? bal : CONFIG.startBalance;
  }
  saveBalance(balance: number): void { this.write(() => localStorage, KEY_BALANCE, Math.round(balance * 100) / 100); }

  loadHistory(): HistoryEntry[] {
    const list = this.read<HistoryEntry[]>(() => sessionStorage, KEY_HISTORY, []);
    // Entries from before the Angular app stored their selections as HTML: skip them.
    return Array.isArray(list) ? list.filter(h => h.bets?.every(b => Array.isArray(b.legs))) : [];
  }
  pushHistory(entry: HistoryEntry): void {
    this.write(() => sessionStorage, KEY_HISTORY, [entry, ...this.loadHistory()].slice(0, CONFIG.historyLimit));
  }

  /** When this browser session started (ms epoch): kept across reloads, like the history. */
  sessionStart(): number {
    const start = Number(this.read(() => sessionStorage, KEY_SESSION, NaN));
    if (Number.isFinite(start) && start <= Date.now()) return start;
    const now = Date.now();
    this.write(() => sessionStorage, KEY_SESSION, now);
    return now;
  }
}
