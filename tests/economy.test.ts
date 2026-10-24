import { describe, expect, it } from 'vitest';
import { borrowable, canEnter, credit, DEBT_LIMIT, ENTRY_FEE, payout, refund } from '../src/game/economy';
import { COURSES } from '../src/game/courses';
import { buildTrack } from '../src/game/track';
import { Race } from '../src/game/race';
import { NEUTRAL_MODS } from '../src/game/parts';

describe('finishing breaks even', () => {
  it('pays the participation prize as the entry fee', () => {
    expect(payout('finish', 1, ENTRY_FEE)).toBe(ENTRY_FEE);
    expect(payout('finish', 1.5, 5000)).toBe(5000);
  });

  it('keeps a minimum participation prize for a free race', () => {
    expect(payout('finish', 1, 0)).toBe(500);
  });

  it('pays nothing for dnf and retire', () => {
    expect(payout('dnf', 1, ENTRY_FEE)).toBe(0);
    expect(payout('retire', 1, ENTRY_FEE)).toBe(0);
  });
});

describe('half refund on dnf and retire', () => {
  it('returns half of the entry fee', () => {
    expect(refund('dnf', ENTRY_FEE)).toBe(500);
    expect(refund('retire', ENTRY_FEE)).toBe(500);
    expect(refund('retire', 5000)).toBe(2500);
  });

  it('returns nothing when finishing or winning', () => {
    expect(refund('finish', ENTRY_FEE)).toBe(0);
    expect(refund('win', ENTRY_FEE)).toBe(0);
  });
});

describe('debt', () => {
  it('repays the debt first from incoming coins', () => {
    expect(credit(300, 1000)).toEqual({ debt: 0, coin: 700 });
    expect(credit(2000, 500)).toEqual({ debt: 1500, coin: 0 });
    expect(credit(0, 500)).toEqual({ debt: 0, coin: 500 });
  });

  it('lets a race be entered with borrowing up to the limit', () => {
    expect(canEnter(0, 0, ENTRY_FEE)).toBe(true);
    expect(canEnter(0, DEBT_LIMIT, ENTRY_FEE)).toBe(false);
    expect(canEnter(0, DEBT_LIMIT - ENTRY_FEE, ENTRY_FEE)).toBe(true);
    expect(canEnter(500, DEBT_LIMIT - 1500, ENTRY_FEE)).toBe(true);
  });

  it('limits each loan to a step and to the limit', () => {
    expect(borrowable(0)).toBe(1000);
    expect(borrowable(DEBT_LIMIT - 300)).toBe(300);
    expect(borrowable(DEBT_LIMIT)).toBe(0);
  });
});

describe('retire', () => {
  it('ends the race at once with the retire outcome', () => {
    const track = buildTrack(COURSES[0]);
    const race = new Race({ track, weather: 'sunny', playerMods: NEUTRAL_MODS, aiMods: [] });
    race.phase = 'running';
    race.countdown = 0;
    race.retire();
    expect(race.phase).toBe('finished');
    expect(race.outcome).toBe('retire');
  });
});
