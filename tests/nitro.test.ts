import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/game/courses';
import { buildTrack } from '../src/game/track';
import { Race } from '../src/game/race';
import { NEUTRAL_MODS } from '../src/game/parts';

describe('nitro', () => {
  it('boosts the car with the nitro button alone', () => {
    const track = buildTrack(COURSES[0]);
    const race = new Race({ track, weather: 'sunny', playerMods: NEUTRAL_MODS, aiMods: [] });
    race.phase = 'running';
    race.countdown = 0;
    race.player.aggression = 0;
    race.player.durability = 1e9;
    race.player.speed = 20;
    race.player.nitro = 100;
    for (let i = 0; i < 60; i++) race.update(1 / 60, { steer: 0, gas: false, brake: false, nitro: true });
    expect(race.player.speed).toBeGreaterThan(20);
    expect(race.player.nitro).toBeLessThan(100);
  });
});
