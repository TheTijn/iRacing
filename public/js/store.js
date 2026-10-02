// Persistence (per-viewer conveniences only — this is a play-money demo) and formatting helpers.
import { state } from './state.js';
import { CONFIG } from './data.js';
import { formatOdds } from './pricing.js';

const KEY_SETTINGS = 'ir_settings';
const KEY_BALANCE = 'ir_balance';
const KEY_HISTORY = 'ir_history';

const read = (store, key, fallback) => {
  try { const v = store.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
};
const write = (store, key, value) => { try { store.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ } };

function guessCurrency() {
  const lang = (navigator.language || 'en-US');
  if (/^en-(US|CA)|-US$/.test(lang)) return 'USD';
  if (/^en-GB|-GB$/.test(lang)) return 'GBP';
  return 'EUR';
}

export function loadStore() {
  state.settings = { odds: 'decimal', currency: guessCurrency(), instant: false, saver: false, sport: 'horses', ...read(localStorage, KEY_SETTINGS, {}) };
  const bal = Number(read(localStorage, KEY_BALANCE, CONFIG.startBalance));
  state.balance = Number.isFinite(bal) ? bal : CONFIG.startBalance;
  state.stake = CONFIG.defaultStake;
}

export const saveSettings = () => write(localStorage, KEY_SETTINGS, state.settings);
export const saveBalance = () => write(localStorage, KEY_BALANCE, Math.round(state.balance * 100) / 100);

export function loadHistory() { return read(sessionStorage, KEY_HISTORY, []); }
export function pushHistory(entry) {
  const list = [entry, ...loadHistory()].slice(0, CONFIG.historyLimit);
  write(sessionStorage, KEY_HISTORY, list);
}

const moneyFmt = {};
export function money(x, { compact = false } = {}) {
  const cur = state.settings?.currency || 'EUR';
  const key = cur + compact;
  moneyFmt[key] ||= new Intl.NumberFormat(navigator.language || 'en-US', {
    style: 'currency', currency: cur,
    minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: 2,
  });
  return moneyFmt[key].format(x);
}

export const odds = dec => formatOdds(dec, state.settings?.odds);

export const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
