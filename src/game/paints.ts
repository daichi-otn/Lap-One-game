// ボディの色: 車体の模様の色相を回して塗り替える (1 番目が最初から塗ってある色)
export interface Paint {
  id: string;
  name: string;
  price: number;
  hue: number; // 色相を回す角度 (度)
  dark: number; // 明るさの倍率 (1 が変えない)
}

export const PAINTS: Paint[] = [
  { id: 'blue', name: 'ミッドナイトブルー', price: 0, hue: 0, dark: 1 },
  { id: 'red', name: 'レッド', price: 3000, hue: 145, dark: 1 },
  { id: 'gold', name: 'ゴールド', price: 5000, hue: 190, dark: 1.05 },
  { id: 'green', name: 'グリーン', price: 3000, hue: 275, dark: 1 },
  { id: 'purple', name: 'パープル', price: 4000, hue: 60, dark: 1 },
  { id: 'black', name: 'ブラック', price: 2000, hue: 0, dark: 0.4 },
];

export function paintIndex(id: string | undefined): number {
  return Math.max(0, PAINTS.findIndex((p) => p.id === id));
}

export const PIT_INSURANCE_PRICE = 5000; // ピットの修理代が半分になる保険
