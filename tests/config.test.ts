import { describe, expect, it } from 'vitest';
import { activeEvents, eventPrizeMult, GameConfig } from '../src/game/config';

const config: GameConfig = {
  title: { tagline: '', banner: '' },
  courseTags: {},
  events: [
    { id: 'a', name: 'A', start: '2026-10-01', end: '2026-10-10', courses: ['harbor'], prizeMult: 2, enabled: true },
    { id: 'b', name: 'B', start: '2026-10-01', end: '2026-10-31', courses: [], prizeMult: 1.5, enabled: false },
  ],
};

describe('config events', () => {
  it('shows only enabled events within their dates', () => {
    expect(activeEvents(config, '2026-10-05').map((e) => e.id)).toEqual(['a']);
    expect(activeEvents(config, '2026-10-20')).toEqual([]);
  });
  it('multiplies prizes only for the listed courses', () => {
    expect(eventPrizeMult(config, 'harbor', '2026-10-05')).toBe(2);
    expect(eventPrizeMult(config, 'technical', '2026-10-05')).toBe(1);
  });
});
