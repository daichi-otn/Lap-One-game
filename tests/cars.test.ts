import { describe, expect, it } from 'vitest';
import { carById, carIndex, usedKey, usedPrice } from '../src/game/cars';

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
    expect(carIndex(usedKey('rear-wing'))).toBe(carIndex('rear-wing'));
  });
});
