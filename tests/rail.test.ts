import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/game/courses';
import { buildTrack, CAR_HALF_WIDTH, RAIL_GAP, tangentAt } from '../src/game/track';
import { Race } from '../src/game/race';
import { NEUTRAL_MODS } from '../src/game/parts';

describe('guardrail collision', () => {
  it('keeps the car inside the guardrail', () => {
    const course = COURSES[0];
    const track = buildTrack(course);
    const race = new Race({ track, weather: 'sunny', playerMods: NEUTRAL_MODS, aiMods: [] });
    race.phase = 'running';
    race.countdown = 0;
    const p = race.player;
    p.aggression = 0;
    const i = 500; // ピットから離れた区間
    const c = track.pts[i];
    const t = tangentAt(track.pts, i);
    const half = course.width / 2;
    // 道の端より外、ガードレールより外側に置く
    const off = half + 3;
    p.x = c.x - t.z * off;
    p.z = c.z + t.x * off;
    p.speed = 20;
    race.update(1 / 60, { steer: 0, gas: false, brake: false, nitro: false });
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    expect(d).toBeLessThanOrEqual(half + RAIL_GAP - CAR_HALF_WIDTH + 0.8);
  });
});
