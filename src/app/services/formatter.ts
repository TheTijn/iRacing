import { Injectable, inject } from '@angular/core';
import { formatOdds } from '../core/pricing';
import { GameState } from './game-state';

/**
 * Money and odds in the player's chosen currency / odds format. Templates call these directly; they read
 * the settings signal, so every price and amount re-renders when a setting changes.
 */
@Injectable({ providedIn: 'root' })
export class Formatter {
  private readonly state = inject(GameState);
  private readonly moneyFmt = new Map<string, Intl.NumberFormat>();

  money(x: number, { compact = false } = {}): string {
    const cur = this.state.settings().currency || 'EUR';
    const key = cur + compact;
    let fmt = this.moneyFmt.get(key);
    if (!fmt) {
      fmt = new Intl.NumberFormat(navigator.language || 'en-US', {
        style: 'currency', currency: cur,
        minimumFractionDigits: compact ? 0 : 2, maximumFractionDigits: 2,
      });
      this.moneyFmt.set(key, fmt);
    }
    return fmt.format(x);
  }

  odds(dec: number): string { return formatOdds(dec, this.state.settings().odds); }

  ordinal(n: number): string { return ordinal(n); }
}

export const ordinal = (n: number) =>
  n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

export const PLACE_SUFFIX = ['st', 'nd', 'rd'];
