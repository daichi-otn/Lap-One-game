import type { Mods } from './parts';

// 車種: 車体の見た目 (後付けのエアロパーツ) と、性能の補正。0 番が最初から持っている車
export interface CarModel {
  id: string;
  name: string;
  price: number;
  aero: number; // 0: なし, 1: サイドスカート付き, 2: リアウイング付き, 3: エアロ一式
  mods: Partial<Mods>;
}

// 値段の順に並べる (ショップの並びになる)。性能は、速さと操縦性・雨の強さなどで個性を分ける
export const CAR_MODELS: CarModel[] = [
  { id: 'standard', name: 'スタンダード', price: 0, aero: 0, mods: {} },
  { id: 'hatch-city', name: 'シティハッチ', price: 6000, aero: 0, mods: { topSpeed: 0.94, turn: 1.1, brake: 1.05 } },
  { id: 'sport-skirt', name: 'スポーツスカート', price: 8000, aero: 1, mods: { accel: 1.04, grip: 1.02 } },
  { id: 'touring-sedan', name: 'ツーリングセダン', price: 12000, aero: 1, mods: { durability: 1.2, grip: 1.02, rainGrip: 1.05 } },
  { id: 'rear-wing', name: 'リアウイングGT', price: 15000, aero: 2, mods: { topSpeed: 1.04, grip: 1.03 } },
  { id: 'rally-awd', name: 'ラリーAWD', price: 20000, aero: 2, mods: { grip: 1.06, rainGrip: 1.12, topSpeed: 0.98 } },
  { id: 'aero-pro', name: 'エアロプロ', price: 30000, aero: 3, mods: { topSpeed: 1.06, accel: 1.04, grip: 1.05 } },
  { id: 'muscle-v8', name: 'マッスルV8', price: 45000, aero: 3, mods: { topSpeed: 1.1, accel: 1.06, turn: 0.96 } },
  { id: 'super-gt', name: 'スーパーGT', price: 80000, aero: 3, mods: { topSpeed: 1.1, accel: 1.06, grip: 1.06, turn: 1.04 } },
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

// 見た目の段階 (エアロパーツ)。車種の並び順ではなく、車種ごとの aero で決まる
export function carAero(key: string | undefined): number {
  return carById(key).aero;
}

// 2 つの性能補正を掛け合わせる
export function mulMods(base: Mods, extra: Partial<Mods>): Mods {
  const out: Mods = { ...base };
  for (const key of Object.keys(extra) as (keyof Mods)[]) out[key] *= extra[key] ?? 1;
  return out;
}
