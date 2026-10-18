import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/game/courses';
import { buildTrack } from '../src/game/track';
import { Race } from '../src/game/race';
import { NEUTRAL_MODS } from '../src/game/parts';
import { payout } from '../src/game/economy';

describe('economy', () => {
  it('pays prize, participation, or nothing', () => {
    expect(payout('win', 1)).toBe(3000);
    expect(payout('win', 1.5)).toBe(4500);
    expect(payout('finish', 1.5)).toBe(500);
    expect(payout('dnf', 1.5)).toBe(0);
  });
});

describe('race simulation', () => {
  for (const course of COURSES) {
    it(`${course.name}: AI cars complete the laps`, () => {
      const track = buildTrack(course);
      const race = new Race({
        track,
        weather: 'sunny',
        playerMods: NEUTRAL_MODS,
        aiMods: [NEUTRAL_MODS, NEUTRAL_MODS, NEUTRAL_MODS],
      });
      // プレイヤーは走らせず、CPU の完走だけを確認する
      race.player.durability = Number.MAX_SAFE_INTEGER;
      // 止まっているプレイヤーに寄せる妨害はオフにして、周回だけを確かめる
      for (const c of race.cars) c.aggression = 0;
      // 止まっているプレイヤーとの衝突も除外する (速い CPU がぶつかると即大破するため)
      const keepPlayerClear = () => { race.player.hitCooldown = 1e9; };
      keepPlayerClear();
      const dt = 1 / 60;
      let guard = 0;
      while (!race.cars.every((c) => c.finished || c.dnf) && guard++ < 60 * 900) {
        race.update(dt, { steer: 0, gas: false, brake: false });
        race.player.durability = Number.MAX_SAFE_INTEGER;
        keepPlayerClear();
      }
      const ai = race.cars.filter((c) => !c.isPlayer);
      expect(ai.filter((c) => c.finished).length).toBeGreaterThanOrEqual(2);
    });
  }

  it('player who crashes is disqualified and the race ends as dnf', () => {
    const track = buildTrack(COURSES[0]);
    const race = new Race({ track, weather: 'storm', playerMods: NEUTRAL_MODS, aiMods: [] });
    race.phase = 'running';
    race.player.durability = 0.01;
    // コースから大きく外れて壁の外に出す → 壁ダメージで耐久が尽きる
    race.player.x = 1000;
    race.player.z = 1000;
    race.update(1 / 60, { steer: 0, gas: true, brake: false });
    expect(race.player.dnf).toBe(true);
    expect(race.phase).toBe('finished');
    expect(race.outcome).toBe('dnf');
  });
});

describe('nitro', () => {
  it('boosts speed while gauge lasts and drains the gauge', () => {
    const run = (nitro: boolean) => {
      const race = new Race({ track: buildTrack(COURSES[0]), weather: 'sunny', playerMods: NEUTRAL_MODS, aiMods: [] });
      race.countdown = 0;
      race.phase = 'running';
      race.player.nitro = 100;
      for (let i = 0; i < 60; i++) {
        race.update(1 / 60, { steer: 0, gas: true, brake: false, nitro });
        race.player.durability = Number.MAX_SAFE_INTEGER;
      }
      return race.player;
    };
    const boosted = run(true);
    const normal = run(false);
    expect(boosted.speed).toBeGreaterThan(normal.speed);
    expect(boosted.nitro).toBeLessThan(normal.nitro);
  });
});

describe('pit stop', () => {
  it('entering the pit lane slowly repairs to full and adds 60 seconds', () => {
    const track = buildTrack(COURSES[0]);
    const race = new Race({ track, weather: 'sunny', playerMods: NEUTRAL_MODS, aiMods: [] });
    race.countdown = 0;
    race.phase = 'running';
    const i = track.pitFrom + 5;
    const p = track.pts[i];
    const t = track.pts[(i + 1) % track.pts.length].clone().sub(p).setY(0).normalize();
    const half = track.course.width / 2;
    // ピットレーン (道の右側) の位置に、ほぼ止まって置く
    race.player.x = p.x + -t.z * (half - 2);
    race.player.z = p.z + t.x * (half - 2);
    race.player.speed = 0;
    race.player.durability = 40;
    const before = race.time;
    race.update(1 / 60, { steer: 0, gas: false, brake: false, nitro: false });
    expect(race.pitStops).toBe(1);
    expect(race.player.durability).toBe(race.player.maxDurability);
    expect(race.time - before).toBeGreaterThanOrEqual(60);
  });
});
