// ボディの色: 車体の模様の色相を回して塗り替える (1 番目が最初から塗ってある色)
export interface Paint {
  id: string;
  name: string;
  price: number;
  hue: number; // 色相を回す角度 (度)
  dark: number; // 明るさの倍率 (1 が変えない)
  pattern?: 'stripe' | 'checker' | 'flame'; // 模様 (あれば、ベースの色の上に重ねる)
  accent?: number; // 模様の色
}

export const PAINTS: Paint[] = [
  { id: 'blue', name: 'ミッドナイトブルー', price: 0, hue: 0, dark: 1 },
  { id: 'red', name: 'レッド', price: 3000, hue: 145, dark: 1 },
  { id: 'gold', name: 'ゴールド', price: 5000, hue: 190, dark: 1.05 },
  { id: 'green', name: 'グリーン', price: 3000, hue: 275, dark: 1 },
  { id: 'purple', name: 'パープル', price: 4000, hue: 60, dark: 1 },
  { id: 'black', name: 'ブラック', price: 2000, hue: 0, dark: 0.4 },
];

// 追加の色 (色相を回して作る)。最初の 6 色に続けて並ぶ
const EXTRA_NAMES = ['オレンジ', 'イエロー', 'ライム', 'ミント', 'ターコイズ', 'スカイ', 'コバルト', 'インディゴ', 'バイオレット', 'マゼンタ', 'ピンク', 'ローズ', 'ワイン', 'ブラウン', 'サンド', 'オリーブ', 'フォレスト', 'ティール', 'ネイビー', 'グレー', 'シルバー', 'ホワイト', 'アイボリー', 'チャコール'];
EXTRA_NAMES.forEach((name, i) => {
  PAINTS.push({ id: `paint-${i}`, name, price: 2500 + i * 200, hue: (i + 1) * 15, dark: name === 'ホワイト' || name === 'シルバー' || name === 'アイボリー' ? 1.6 : name === 'チャコール' || name === 'ネイビー' ? 0.55 : 1 });
});

// 模様入りの色 (ベースの色の上に、ストライプやチェッカーを重ねる)
const PATTERN_PAINTS: Paint[] = [
  { id: 'stripe-red', name: 'ストライプ（レッド）', price: 6000, hue: 0, dark: 1, pattern: 'stripe', accent: 0xffffff },
  { id: 'stripe-blue', name: 'ストライプ（ブルー）', price: 6000, hue: 210, dark: 1, pattern: 'stripe', accent: 0xffffff },
  { id: 'stripe-gold', name: 'ストライプ（ゴールド）', price: 7000, hue: 190, dark: 1.05, pattern: 'stripe', accent: 0xffd27a },
  { id: 'checker', name: 'チェッカー', price: 8000, hue: 0, dark: 1, pattern: 'checker', accent: 0xffffff },
  { id: 'flame', name: 'フレイム', price: 9000, hue: 0, dark: 1, pattern: 'flame', accent: 0xffb300 },
];
PAINTS.push(...PATTERN_PAINTS);

export function paintIndex(id: string | undefined): number {
  return Math.max(0, PAINTS.findIndex((p) => p.id === id));
}

export const PIT_INSURANCE_PRICE = 5000; // ピットの修理代が半分になる保険
