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

// 中古車: 新車の 6 割の値段。耐久と性能が少し下がっている
export const USED_PRICE_RATE = 0.6;
export const USED_MODS: Partial<Mods> = { durability: 0.85, topSpeed: 0.98, accel: 0.98, grip: 0.98 };

export function usedPrice(price: number): number {
  return Math.round((price * USED_PRICE_RATE) / 100) * 100;
}

// 持ち物のキー: 新車は車種の id、中古車は「id:used」
export function usedKey(id: string): string {
  return `${id}:used`;
}

export function carById(key: string | undefined): CarModel {
  const [id, condition] = (key ?? '').split(':');
  const base = CAR_MODELS.find((c) => c.id === id) ?? CAR_MODELS[0];
  if (condition !== 'used') return base;
  const mods: Partial<Mods> = { ...base.mods };
  for (const k of Object.keys(USED_MODS) as (keyof Mods)[]) mods[k] = (mods[k] ?? 1) * (USED_MODS[k] ?? 1);
  return { ...base, name: `${base.name}（中古）`, price: usedPrice(base.price), mods };
}

export function carIndex(key: string | undefined): number {
  const id = (key ?? '').split(':')[0];
  return Math.max(0, CAR_MODELS.findIndex((c) => c.id === id));
}

// 2 つの性能補正を掛け合わせる
export function mulMods(base: Mods, extra: Partial<Mods>): Mods {
  const out: Mods = { ...base };
  for (const key of Object.keys(extra) as (keyof Mods)[]) out[key] *= extra[key] ?? 1;
  return out;
}
