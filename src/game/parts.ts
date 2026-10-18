export type Slot =
  | 'engine'
  | 'frame'
  | 'chassis'
  | 'turbo'
  | 'muffler'
  | 'tire'
  | 'brake'
  | 'seat'
  | 'handle'
  | 'window';

export interface Mods {
  topSpeed: number;
  accel: number;
  grip: number;
  rainGrip: number;
  brake: number;
  turn: number;
  durability: number;
  vision: number;
}

export const NEUTRAL_MODS: Mods = {
  topSpeed: 1,
  accel: 1,
  grip: 1,
  rainGrip: 1,
  brake: 1,
  turn: 1,
  durability: 1,
  vision: 1,
};

export const MOD_NAMES: Record<keyof Mods, string> = {
  topSpeed: '最高速',
  accel: '加速',
  grip: 'グリップ',
  rainGrip: '雨天グリップ',
  brake: '制動',
  turn: '旋回',
  durability: '耐久',
  vision: '視界',
};

export const SLOTS: { id: Slot; name: string }[] = [
  { id: 'engine', name: 'エンジン' },
  { id: 'frame', name: 'フレーム' },
  { id: 'chassis', name: 'シャシ' },
  { id: 'turbo', name: 'ターボ' },
  { id: 'muffler', name: 'マフラー' },
  { id: 'tire', name: 'タイヤ' },
  { id: 'brake', name: 'ブレーキパッド' },
  { id: 'seat', name: 'シート' },
  { id: 'handle', name: 'ハンドル' },
  { id: 'window', name: '窓' },
];

interface Tier {
  name: string;
  price: number;
  mods: Partial<Mods>;
}

const STOCK = (name: string): Tier => ({ name, price: 0, mods: {} });

const TIERS: Record<Slot, Tier[]> = {
  engine: [
    STOCK('標準エンジン'),
    { name: 'スポーツエンジン', price: 800, mods: { topSpeed: 1.08, accel: 1.05 } },
    { name: 'レーシングエンジン', price: 2000, mods: { topSpeed: 1.18, accel: 1.1 } },
  ],
  frame: [
    STOCK('標準フレーム'),
    { name: '強化フレーム', price: 800, mods: { durability: 1.15, turn: 0.97 } },
    { name: '軽量カーボンフレーム', price: 2000, mods: { durability: 1.35, turn: 0.99 } },
  ],
  chassis: [
    STOCK('標準シャシ'),
    { name: 'スポーツサス', price: 700, mods: { turn: 1.06, grip: 1.03 } },
    { name: 'レーシングサス', price: 1800, mods: { turn: 1.12, grip: 1.06 } },
  ],
  turbo: [
    STOCK('ターボなし'),
    { name: 'ツインターボ', price: 900, mods: { accel: 1.1 } },
    { name: '大型ターボ', price: 2200, mods: { accel: 1.18, topSpeed: 1.03 } },
  ],
  muffler: [
    STOCK('標準マフラー'),
    { name: 'スポーツマフラー', price: 300, mods: { topSpeed: 1.02 } },
    { name: 'チタンマフラー', price: 900, mods: { topSpeed: 1.03, accel: 1.02 } },
  ],
  tire: [
    STOCK('標準タイヤ'),
    { name: 'ハイグリップタイヤ', price: 600, mods: { grip: 1.08, rainGrip: 1.05 } },
    { name: 'レインタイヤ', price: 1000, mods: { grip: 1.02, rainGrip: 1.3 } },
  ],
  brake: [
    STOCK('標準パッド'),
    { name: 'スポーツパッド', price: 500, mods: { brake: 1.1 } },
    { name: 'レーシングパッド', price: 1500, mods: { brake: 1.2 } },
  ],
  seat: [
    STOCK('標準シート'),
    { name: 'バケットシート', price: 400, mods: { turn: 1.02, grip: 1.01 } },
    { name: 'フルバケット', price: 1100, mods: { turn: 1.04, grip: 1.02 } },
  ],
  handle: [
    STOCK('標準ハンドル'),
    { name: 'スポーツハンドル', price: 300, mods: { turn: 1.05 } },
    { name: 'レーシングハンドル', price: 900, mods: { turn: 1.1 } },
  ],
  window: [
    STOCK('標準窓'),
    { name: 'ワイパー付き窓', price: 500, mods: { vision: 1.1 } },
    { name: '強化ガラス', price: 1200, mods: { vision: 1.2 } },
  ],
};

export interface Part {
  id: string;
  slot: Slot;
  tier: number;
  name: string;
  price: number;
  mods: Partial<Mods>;
}

export const PARTS: Part[] = SLOTS.flatMap(({ id }) =>
  TIERS[id].map((t, i) => ({ id: `${id}-${i + 1}`, slot: id, tier: i + 1, name: t.name, price: t.price, mods: t.mods })),
);

export function computeMods(equipped: Partial<Record<Slot, string>>): Mods {
  const mods: Mods = { ...NEUTRAL_MODS };
  for (const slot of SLOTS) {
    const part = PARTS.find((p) => p.id === equipped[slot.id]);
    if (!part) continue;
    for (const key of Object.keys(part.mods) as (keyof Mods)[]) {
      mods[key] *= part.mods[key] ?? 1;
    }
  }
  return mods;
}
