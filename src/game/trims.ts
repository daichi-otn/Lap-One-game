// ホイールの色と、ハンドルの握りの色。コインで買って付け替える
export interface Trim {
  id: string;
  name: string;
  price: number;
  color: number;
}

const RIM_NAMES = ['シルバー', 'ガンメタ', 'ブラック', 'ゴールド', 'ブロンズ', 'チタン', 'レッド', 'ブルー', 'グリーン', 'イエロー', 'オレンジ', 'パープル', 'ピンク', 'ホワイト', 'マットブラック', 'クローム', 'ダークレッド', 'スカイブルー', 'ライム', 'チャコール'];
const GRIP_NAMES = ['ブラック', 'ダークブラウン', 'キャメル', 'レッド', 'ブルー', 'グリーン', 'ホワイト', 'グレー', 'イエロー', 'オレンジ', 'パープル', 'ピンク', 'ネイビー', 'ワイン', 'カーボン', 'アルミ', 'ゴールド', 'チタン', 'ミント', 'チャコール'];
const RIM_COLORS = [0xd5dde5, 0x5a6470, 0x18191c, 0xd9a441, 0x8c6a3a, 0x9aa0a8, 0xc62828, 0x1e88e5, 0x2e7d32, 0xfdd835, 0xf57c00, 0x7b1fa2, 0xec407a, 0xf2f2f2, 0x2a2d33, 0xe6eaf0, 0x7b1f1f, 0x81d4fa, 0x9ccc65, 0x37474f];
const GRIP_COLORS = [0x17191c, 0x4a3420, 0xb8864b, 0x9b1c1c, 0x1e3a8a, 0x1b5e20, 0xf2f2f2, 0x7a7f87, 0xfbc02d, 0xef6c00, 0x6a1b9a, 0xf06292, 0x1a237e, 0x6d1b3a, 0x2b2b2b, 0xb0b6bd, 0xc9a24a, 0xa8b0b8, 0x4db6ac, 0x3b4048];

export const RIMS: Trim[] = RIM_NAMES.map((name, i) => ({ id: `rim-${i}`, name, price: i === 0 ? 0 : 500 + i * 300, color: RIM_COLORS[i] }));
export const GRIPS: Trim[] = GRIP_NAMES.map((name, i) => ({ id: `grip-${i}`, name, price: i === 0 ? 0 : 400 + i * 250, color: GRIP_COLORS[i] }));

export function trimIndex(list: Trim[], id: string | undefined): number {
  return Math.max(0, list.findIndex((t) => t.id === id));
}
