import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/game/courses';
import { buildTrack } from '../src/game/track';
import { Race } from '../src/game/race';
import { NEUTRAL_MODS } from '../src/game/parts';
import { REDLINE_RPM } from '../src/game/car';

describe('engine redline', () => {
  it('stalls after sitting in the redline, then DNFs without exploding', () => {
    const track = buildTrack(COURSES[0]);
    const race = new Race({ track, weather: 'sunny', playerMods: NEUTRAL_MODS, aiMods: [] });
    race.phase = 'running';
    const p = race.player;
    p.aggression = 0;
    // ニトロで最高速を超えると回転数がレッドゾーンへ入る
    p.speed = 78;
    p.gear = 4;
    p.rpm = 6000;
    expect(p.gear).toBe(4);
    const dt = 1 / 60;
    for (let t = 0; t < 3.5; t += dt) {
      p.speed = 78; // 壁などで減速しないように、レッドゾーンの速さを保つ
      p.nitro = 100;
      race.update(dt, { steer: 0, gas: true, brake: false, nitro: true });
    }
    expect(p.stalled).toBe(true);
    expect(p.dnf).toBe(false);
    // エンスト後は止まりながら失格になる
    for (let t = 0; t < 4; t += dt) race.update(dt, { steer: 0, gas: true, brake: false, nitro: false });
    expect(p.dnf).toBe(true);
    // 大破はしていない (耐久は残っている)
    expect(p.durability).toBeGreaterThan(0);
    expect(race.outcome).toBe('dnf');
  });
});
