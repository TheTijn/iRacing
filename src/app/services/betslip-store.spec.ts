import { stepStake } from './betslip-store';

describe('stepStake', () => {
  it('steps through the stake chips', () => {
    expect(stepStake(1, 1)).toBe(2);
    expect(stepStake(5, 1)).toBe(10);
    expect(stepStake(25, 1)).toBe(50);
    expect(stepStake(10, -1)).toBe(5);
    expect(stepStake(2, -1)).toBe(1);
  });

  it('moves a custom stake to the nearest chip that way', () => {
    expect(stepStake(7.5, 1)).toBe(10);
    expect(stepStake(7.5, -1)).toBe(5);
    expect(stepStake(0.5, 1)).toBe(1);
  });

  it('goes on in steps of the top chip above it, up to the max stake', () => {
    expect(stepStake(50, 1)).toBe(100);
    expect(stepStake(75, 1)).toBe(100);
    expect(stepStake(100, 1)).toBe(150);
    expect(stepStake(75, -1)).toBe(50);
    expect(stepStake(150, -1)).toBe(100);
    expect(stepStake(100, -1)).toBe(50);
    expect(stepStake(50, -1)).toBe(25);
    expect(stepStake(980, 1)).toBe(1000);
  });

  it('stops at either end', () => {
    expect(stepStake(1, -1)).toBeNull();
    expect(stepStake(0.5, -1)).toBeNull();
    expect(stepStake(1000, 1)).toBeNull();
  });
});
