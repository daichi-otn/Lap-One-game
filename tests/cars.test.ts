import { describe, expect, it } from 'vitest';
import { CAR_MODELS, carAero, carById, usedKey, usedPrice } from '../src/game/cars';

describe('new and used cars', () => {
  it('used cars are cheaper and slightly worse', () => {
    const newCar = carById('aero-pro');
    const used = carById(usedKey('aero-pro'));
    expect(used.price).toBe(usedPrice(newCar.price));
    expect(used.price).toBeLessThan(newCar.price);
    expect(used.mods.durability).toBeLessThan(1);
    expect(used.mods.topSpeed ?? 1).toBeLessThan(newCar.mods.topSpeed ?? 1);
  });
  it('the look of a used car is the same model', () => {
    expect(carAero(usedKey('rear-wing'))).toBe(carAero('rear-wing'));
  });
});

describe('car list', () => {
  it('has unique ids, valid appearance levels, and prices in shop order', () => {
    const ids = CAR_MODELS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CAR_MODELS) expect([0, 1, 2, 3]).toContain(c.aero);
    const prices = CAR_MODELS.map((c) => c.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });
  it('shows each car with its own appearance level', () => {
    expect(carAero('hatch-city')).toBe(0);
    expect(carAero('muscle-v8')).toBe(3);
  });
});
