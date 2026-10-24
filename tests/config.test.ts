import { describe, expect, it } from 'vitest';
import { activeEvents, eventPrizeMult, GameConfig, upcomingEvent } from '../src/game/config';

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

describe('upcoming event countdown', () => {
  const future: GameConfig = {
    ...config,
    events: [
      ...config.events,
      { id: 'c', name: 'C', start: '2026-11-01', end: '2026-11-05', courses: [], prizeMult: 1, enabled: true },
      { id: 'd', name: 'D', start: '2026-12-01', end: '2026-12-05', courses: [], prizeMult: 1, enabled: true },
    ],
  };
  it('counts days to the nearest future enabled event', () => {
    expect(upcomingEvent(future, '2026-10-22')?.event.id).toBe('c');
    expect(upcomingEvent(future, '2026-10-22')?.days).toBe(10);
  });
  it('shows nothing when no event is scheduled, or only ongoing or disabled ones', () => {
    expect(upcomingEvent(config, '2026-10-05')).toBeNull();
    expect(upcomingEvent(future, '2027-01-01')).toBeNull();
  });
});
