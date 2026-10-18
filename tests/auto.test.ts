import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/game/courses';
import { buildTrack } from '../src/game/track';
import { Race } from '../src/game/race';
import { NEUTRAL_MODS } from '../src/game/parts';

describe('auto throttle and brake', () => {
  it('accelerates and keeps the car on the road with steering only', () => {
    const track = buildTrack(COURSES[0]);
    const race = new Race({ track, weather: 'sunny', playerMods: NEUTRAL_MODS, aiMods: [], autoDrive: true });
    race.phase = 'running';
    race.countdown = 0;
    race.player.aggression = 0;
    race.player.durability = 1e9;
    // アクセルは押さず、ハンドルも動かさない
    for (let i = 0; i < 60 * 15; i++) race.update(1 / 60, { steer: 0, gas: false, brake: false, nitro: false });
    expect(race.player.speed).toBeGreaterThan(10);
    expect(race.player.dnf).toBe(false);
  });
});
