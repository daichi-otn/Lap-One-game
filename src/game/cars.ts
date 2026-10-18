import type { Mods } from './parts';

// 車種: 車体の見た目 (後付けのエアロパーツ) と、性能の補正。0 番が最初から持っている車
export interface CarModel {
  id: string;
  name: string;
  price: number;
  aero: number; // 0: なし, 1: サイドスカート付き, 2: リアウイング付き, 3: エアロ一式
  mods: Partial<Mods>;
}

export const CAR_MODELS: CarModel[] = [
  { id: 'standard', name: 'スタンダード', price: 0, aero: 0, mods: {} },
  { id: 'sport-skirt', name: 'スポーツスカート', price: 8000, aero: 1, mods: { accel: 1.04, grip: 1.02 } },
  { id: 'rear-wing', name: 'リアウイングGT', price: 15000, aero: 2, mods: { topSpeed: 1.04, grip: 1.03 } },
  { id: 'aero-pro', name: 'エアロプロ', price: 30000, aero: 3, mods: { topSpeed: 1.06, accel: 1.04, grip: 1.05 } },
];

export function carById(id: string | undefined): CarModel {
  return CAR_MODELS.find((c) => c.id === id) ?? CAR_MODELS[0];
}

export function carIndex(id: string | undefined): number {
  return Math.max(0, CAR_MODELS.findIndex((c) => c.id === id));
}

// 2 つの性能補正を掛け合わせる
export function mulMods(base: Mods, extra: Partial<Mods>): Mods {
  const out: Mods = { ...base };
  for (const key of Object.keys(extra) as (keyof Mods)[]) out[key] *= extra[key] ?? 1;
  return out;
}
