import { describe, expect, it } from 'vitest';
import { ghostPose, ghostTimeAtDist } from '../src/game/ghost';

// 4 つずつ: x, z, heading, dist。0.1 秒ごとに 1 m 進む直線
const frames = [0, 0, 0, 0, 1, 0, 0, 1, 2, 0, 0, 2, 3, 0, 0, 3];

describe('ghost', () => {
  it('interpolates the position between recorded frames', () => {
    expect(ghostPose(frames, 0.05)).toEqual({ x: 0.5, z: 0, heading: 0 });
    expect(ghostPose(frames, 99)?.x).toBe(3);
  });
  it('finds the time at which the ghost reached a distance', () => {
    expect(ghostTimeAtDist(frames, 1.5)).toBeCloseTo(0.15);
    expect(ghostTimeAtDist(frames, 5)).toBeNull();
  });
});
