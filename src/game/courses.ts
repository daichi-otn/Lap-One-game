import type { Weather } from './weather';

export interface Course {
  id: string;
  name: string;
  difficulty: string;
  points: [number, number][]; // 閉じたコースの制御点 (x, z)
  width: number;
  laps: number;
  prizeMult: number; // 賞金倍率
  entryFee?: number; // このコース専用の参加費 (省略時は通常の参加費)
  ground: number; // 周囲の地面の色
  weather: Partial<Record<Weather, number>>; // 天候の出現重み
}

// 星形の多角形 (角度順に点を置くので自己交差しない)
function radial(radii: number[], stretchX = 1): [number, number][] {
  return radii.map((r, i) => {
    const a = (i / radii.length) * Math.PI * 2;
    return [Math.cos(a) * r * stretchX, Math.sin(a) * r];
  });
}

export const COURSES: Course[] = [
  {
    id: 'easy',
    name: 'ゆるやかな楕円',
    difficulty: '初級',
    points: radial(Array(16).fill(260), 1.5),
    width: 21,
    laps: 2,
    prizeMult: 1,
    ground: 0x3a7d44,
    weather: { sunny: 5, cloudy: 3, rain: 2 },
  },
  {
    id: 'technical',
    name: 'テクニカルサーキット',
    difficulty: '中級',
    points: radial([240, 170, 300, 190, 320, 150, 280, 200, 300, 170, 260, 160, 320, 190, 280, 220]),
    width: 18,
    laps: 2,
    prizeMult: 1.2,
    ground: 0x5b7f3a,
    weather: { cloudy: 2, rain: 4, storm: 2 },
  },
  {
    id: 'hairpin',
    name: '高速ヘアピン',
    difficulty: '上級',
    points: radial([460, 460, 460, 460, 460, 150, 460, 460, 460, 150]),
    width: 18,
    laps: 2,
    prizeMult: 1.5,
    ground: 0x8a7b52,
    weather: { sunny: 3, fog: 3, rain: 2 },
  },
  {
    id: 'lakeside',
    name: '湖畔ロングストレート',
    difficulty: '中級',
    points: radial([380, 420, 360, 440, 380, 300, 400, 430, 360, 420, 390, 320, 410, 370, 440, 380, 350, 410, 430, 340]),
    width: 21,
    laps: 2,
    prizeMult: 1.3,
    ground: 0x2f6f5a,
    weather: { sunny: 3, cloudy: 3, rain: 2, fog: 1 },
  },
  {
    id: 'mountain',
    name: '山岳ワインディング',
    difficulty: '上級',
    points: radial([240, 289, 310, 289, 240, 191, 170, 191, 240, 289, 310, 289, 240, 191, 170, 191, 240, 289, 310, 289, 240, 191, 170, 191]),
    width: 16,
    laps: 2,
    prizeMult: 1.6,
    ground: 0x5a5a4a,
    weather: { cloudy: 3, rain: 3, storm: 2, fog: 2 },
  },
  {
    id: 'harbor',
    name: '港湾サーキット',
    difficulty: '中級',
    points: radial([420, 420, 420, 420, 300, 220, 180, 220, 300, 380, 420, 400, 340, 260, 300, 380, 420, 380, 320, 240, 200, 240, 300, 380], 1.4),
    width: 20,
    laps: 2,
    prizeMult: 1.1,
    ground: 0x2d5a6b,
    weather: { sunny: 3, cloudy: 2, rain: 2 },
  },
  {
    id: 'mountain-loop',
    name: '山岳ループ',
    difficulty: '上級',
    points: radial([200, 320, 200, 320, 200, 320, 200, 320, 200, 320, 200, 320, 200, 320, 200, 320], 1.0),
    width: 14,
    laps: 2,
    prizeMult: 1.7,
    ground: 0x4a5a3a,
    weather: { cloudy: 2, rain: 3, fog: 2 },
  },
  {
    id: 'high-speed-oval',
    name: 'ハイスピードオーバル',
    difficulty: '中級',
    points: radial([330, 330, 300, 330, 330, 330, 300, 330, 330, 330, 300, 330], 2.0),
    width: 24,
    laps: 2,
    prizeMult: 1.3,
    ground: 0x4a6b3a,
    weather: { sunny: 4, cloudy: 2 },
  },
  {
    id: 'city-circuit',
    name: '市街地サーキット',
    difficulty: '上級',
    points: radial([260, 260, 140, 260, 260, 140, 260, 260, 140, 260, 260, 160, 260, 260, 150, 260, 260, 140, 260, 260, 160, 260, 260, 140], 1.2),
    width: 16,
    laps: 2,
    prizeMult: 1.4,
    ground: 0x3b3b44,
    weather: { rain: 2, storm: 2, fog: 1 },
  },
  {
    id: 'forest-circuit',
    name: '森のサーキット',
    difficulty: '中級',
    points: radial(Array.from({ length: 30 }, (_, i) => 240 + 60 * Math.sin(i * 1.3)), 1.1),
    width: 18,
    laps: 2,
    prizeMult: 1.5,
    ground: 0x2f4d2a,
    weather: { cloudy: 3, rain: 2, fog: 2 },
  },
];

COURSES.push({
  id: 'premium',
  name: 'プレミアム・ナイトサーキット',
  difficulty: '上級',
  points: radial([420, 300, 460, 320, 440, 280, 400, 340, 470, 300, 430, 290], 1.2),
  width: 20,
  laps: 2,
  prizeMult: 2.5,
  entryFee: 5000,
  ground: 0x2a2f3a,
  weather: { rain: 3, fog: 2, storm: 2 },
});

export function findCourse(id: string | undefined): Course | undefined {
  return COURSES.find((c) => c.id === id);
}
