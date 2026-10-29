import { TestBed } from '@angular/core/testing';
import type { Bet } from '../core/models';
import { AutoPlay, type AutoOptions } from './auto-play';

// One £5 win bet per race.
const bets: Bet[] = [{ type: 'WIN', stake: 5, box: false, legs: [[1]], combos: [{ sel: [1], price: 3 }] }];
const opts = (o: Partial<AutoOptions> = {}): AutoOptions => ({ rounds: 10, lossLimit: 50, winLimit: false, skip: false, ...o });

describe('AutoPlay', () => {
  let auto: AutoPlay;
  beforeEach(() => { auto = TestBed.inject(AutoPlay); });

  it('plays the chosen number of races', () => {
    auto.begin(bets, opts({ rounds: 3 }));
    expect(auto.record(5, 0, 1000)).toBeNull();
    expect(auto.record(5, 15, 1000)).toBeNull();
    expect(auto.record(5, 0, 1000)).toMatch(/finished/);
    expect(auto.run()?.net).toBe(0);   // -5 +10 -5
  });

  it('stops before a race that could pass the loss limit', () => {
    auto.begin(bets, opts({ lossLimit: 15 }));
    expect(auto.record(5, 0, 1000)).toBeNull();          // down 5: another race risks 10
    expect(auto.record(5, 0, 1000)).toBeNull();          // down 10: another race risks 15
    expect(auto.record(5, 0, 1000)).toMatch(/loss limit/); // down 15: another race would risk 20
  });

  it('counts winnings against the loss limit', () => {
    auto.begin(bets, opts({ lossLimit: 10 }));
    expect(auto.record(5, 0, 1000)).toBeNull();
    expect(auto.record(5, 15, 1000)).toBeNull();         // net +5
    expect(auto.record(5, 0, 1000)).toBeNull();          // net 0
  });

  it('stops on a single win of 10× the stake only when the win limit is on', () => {
    auto.begin(bets, opts({ winLimit: true }));
    expect(auto.record(5, 45, 1000)).toBeNull();
    expect(auto.record(5, 50, 1000)).toMatch(/win limit/);
    auto.begin(bets, opts());
    expect(auto.record(5, 50, 1000)).toBeNull();
  });

  it('stops when the balance cannot cover the next race', () => {
    auto.begin(bets, opts());
    expect(auto.record(5, 0, 4.99)).toMatch(/balance/);
  });
});
