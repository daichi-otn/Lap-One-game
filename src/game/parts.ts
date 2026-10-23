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
  | 'window'
  | 'headlight'
  | 'taillight'
  | 'mirror'
  | 'plate';

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
  { id: 'headlight', name: 'ヘッドライト' },
  { id: 'taillight', name: 'テールランプ' },
  { id: 'mirror', name: 'サイドミラー' },
  { id: 'plate', name: 'ナンバープレート' },
];

interface Tier {
  name: string;
  price: number;
  mods: Partial<Mods>;
}

// 段階 1〜10 の性能の増え方。1 が標準 (補正なし)、10 が最上位
const LADDER = (max: number, i: number): number => 1 + (max - 1) * (i / 9);
// 価格: 1 は無料。段階が上がるほど高くなる (上位は数万コイン。勝ち続けても、すぐには買い尽くせない)
const priceAt = (i: number): number => (i === 0 ? 0 : Math.round((900 * i ** 1.6) / 100) * 100);

const SPECS: Record<Slot, { names: string[]; mods: (i: number) => Partial<Mods> }> = {
  engine: {
    names: ['1.0L 直3', '1.3L 直4', '1.6L 直4 ターボ', '2.0L 直4 ターボ', '2.5L 直5', '3.0L V6 ツインターボ', '3.8L V8', '4.4L V8 ツインターボ', '5.0L V10', '6.0L W12'],
    mods: (i) => ({ topSpeed: LADDER(1.22, i), accel: LADDER(1.15, i) }),
  },
  frame: {
    names: ['スチールフレーム', '強化スチール', 'アルミフレーム', '軽量アルミ', 'クロモリパイプ', 'スペースフレーム', 'ハイブリッドフレーム', '軽量カーボン', 'カーボンモノコック', 'チタンモノコック'],
    mods: (i) => ({ durability: LADDER(1.5, i), turn: LADDER(1.02, i) }),
  },
  chassis: {
    names: ['標準サスペンション', 'スポーツサス', 'ダブルウィッシュボーン', 'エアサス', '車高調整式サス', 'アクティブサス', 'ストラット強化', 'レーシングサス', 'ダウンフォース付きサス', '競技用フルアジャスタブル'],
    mods: (i) => ({ turn: LADDER(1.15, i), grip: LADDER(1.08, i) }),
  },
  turbo: {
    names: ['ターボなし', 'シングルターボ', 'ツインターボ', 'ツインスクロールターボ', '可変ジオメトリターボ', 'インタークーラー付き大型ターボ', '二段ターボ', 'ハイフロー大型ターボ', '電動アシストターボ', 'レース用ツインターボ'],
    mods: (i) => ({ accel: LADDER(1.2, i), topSpeed: LADDER(1.04, i) }),
  },
  muffler: {
    names: ['標準マフラー', 'スポーツマフラー', 'デュアルマフラー', 'ステンレスマフラー', 'チタンマフラー', 'カーボンマフラー', 'サイレンサーなし', 'ドラッグ用マフラー', 'レーシング4本出し', 'ワンオフ大口径マフラー'],
    mods: (i) => ({ topSpeed: LADDER(1.05, i), accel: LADDER(1.03, i) }),
  },
  tire: {
    names: ['標準タイヤ', 'スポーツタイヤ', 'ハイグリップタイヤ', 'ソフトコンパウンド', 'ウェットタイヤ', 'レインタイヤ', 'オールウェザー', 'ミディアムタイヤ', 'スーパーソフト', 'レース用スリック'],
    mods: (i) => ({ grip: LADDER(1.12, i), rainGrip: LADDER(1.35, i) }),
  },
  brake: {
    names: ['標準パッド', 'スポーツパッド', 'セラミックパッド', 'メタルパッド', 'ドリルドローター', 'レーシングパッド', 'ベンチレーテッド', 'カーボンパッド', '耐熱レーシングパッド', '競技用フルカーボン'],
    mods: (i) => ({ brake: LADDER(1.25, i) }),
  },
  seat: {
    names: ['標準シート', 'ファブリックシート', 'レザーシート', 'スポーツシート', 'バケットシート', 'フルバケット', 'ハーネス付きバケット', 'カーボンバケット', 'レーシングシート', '競技用フルハーネス'],
    mods: (i) => ({ turn: LADDER(1.05, i), grip: LADDER(1.03, i) }),
  },
  handle: {
    names: ['標準ハンドル', '本革ハンドル', 'スポーツハンドル', 'マルチファンクション', '太径ハンドル', '小径ハンドル', 'カーボンハンドル', 'レーシングハンドル', 'ステアリングダンパー付き', '競技用スリム'],
    mods: (i) => ({ turn: LADDER(1.12, i) }),
  },
  window: {
    names: ['標準窓', 'UVカットガラス', '断熱ガラス', 'ワイパー付き窓', '撥水ガラス', '強化ガラス', 'スモーク窓', 'ヘッドアップ付き', '超強化ガラス', 'レース用ポリカ窓'],
    mods: (i) => ({ vision: LADDER(1.25, i) }),
  },
  headlight: {
    names: ['標準ライト', 'ハロゲン', 'HID (白)', 'LED (白)', 'LED (黄)', 'LED (青白)', 'デイライト付き', 'レーザー風', 'ライトバー', '競技用ライト'],
    mods: () => ({}),
  },
  mirror: {
    names: ['標準ミラー', '黒いミラー', '白いミラー', '赤いミラー', 'カーボンミラー', '金のミラー', '大型ミラー', 'ミニミラー', '電動ミラー', '競技用ミラー'],
    mods: () => ({}),
  },
  plate: {
    names: ['標準プレート', '白プレート', '黄プレート', '青プレート', '黒プレート', 'ゴールドプレート', 'カーボンプレート', 'ネオンプレート', '赤プレート', '競技用プレート'],
    mods: () => ({}),
  },
  taillight: {
    names: ['標準テール', '赤いテール', 'LEDテール', 'スモークテール', 'ブラックアウト', 'ライトバー式', 'ネオン風', 'オレンジテール', 'レース用テール', '競技用LED'],
    mods: () => ({}),
  },
};

const TIERS = {} as Record<Slot, Tier[]>;
for (const { id } of SLOTS) {
  const spec = SPECS[id];
  TIERS[id] = spec.names.map((name, i) => ({ name, price: priceAt(i), mods: i === 0 ? {} : spec.mods(i) }));
}

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
