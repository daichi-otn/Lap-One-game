import { describe, expect, it } from 'vitest';
import { Gyro } from '../src/input/gyro';

// 傾きの値だけを差し替えて、ハンドルの切れ具合の計算を確かめる
function gyroAt(value: number | null, neutral: number | null = null): Gyro {
  const g = new Gyro();
  g.active = true;
  (g as unknown as { value: number | null }).value = value;
  (g as unknown as { neutral: number | null }).neutral = neutral;
  return g;
}

describe('gyro steering', () => {
  it('ignores small tilts (dead zone)', () => {
    expect(gyroAt(11, 10).steer()).toBe(0);
  });
  it('steers proportionally and clamps to full lock', () => {
    expect(gyroAt(20, 10).steer()).toBeLessThan(0);
    expect(gyroAt(20, 10).steer()).toBeGreaterThan(-1);
    expect(gyroAt(60, 10).steer()).toBe(-1);
    expect(gyroAt(-60, 10).steer()).toBe(1);
  });
  it('uses the resting pose as neutral', () => {
    expect(gyroAt(50, 50).steer()).toBe(0);
  });
  it('a higher sensitivity turns the wheel more for the same tilt', () => {
    const soft = gyroAt(20, 10);
    soft.sensitivity = 0.5;
    const sharp = gyroAt(20, 10);
    sharp.sensitivity = 2;
    expect(Math.abs(sharp.steer())).toBeGreaterThan(Math.abs(soft.steer()));
  });
  it('returns 0 when inactive or no reading', () => {
    const g = new Gyro();
    expect(g.steer()).toBe(0);
    expect(gyroAt(null).steer()).toBe(0);
  });
});
