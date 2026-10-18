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

// 乱数 (種を決めると、毎回同じ並びになる)
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 自動で作るコース。名前は「地名 + サーキット/ループ/リンク」の組み合わせで、重ならないようにする
const PREFIX = ['港湾', '山岳', '森林', '砂漠', '湖畔', '夜間', '海岸', '雪原', '高原', '都市', '渓谷', '湿地', '岬', '火山', '草原'];
const SUFFIX = ['サーキット', 'ループ'];
const GROUND = [0x2d5a6b, 0x4a5a3a, 0x4a6b3a, 0x3b3b44, 0x2f4d2a, 0x8a7b52, 0x5a5a4a, 0x6b5a3a, 0x3a5a6b, 0x6b4a4a];
const WEATHERS: Course['weather'][] = [
  { sunny: 4, cloudy: 2 },
  { cloudy: 3, rain: 2 },
  { rain: 3, storm: 2, fog: 1 },
  { sunny: 3, fog: 2, rain: 1 },
];

function makeCourse(k: number): Course {
  const r = rng(1000 + k * 7919);
  const n = 18 + Math.floor(r() * 12); // 制御点の数
  const base = 240 + r() * 100;
  // 周期的な波 (滑らかにつながる) と、ヘアピンの凹み (内側へ深く入る)
  const waves = [2, 3, 4, 5].map((h) => ({ h, a: 20 + r() * 70, p: r() * Math.PI * 2 }));
  const dips = Array.from({ length: 2 + Math.floor(r() * 3) }, () => ({
    c: r() * n,
    depth: 80 + r() * 120,
    w: 1 + r() * 1.5,
  }));
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    let v = base;
    for (const wv of waves) v += wv.a * Math.sin(wv.h * ang + wv.p);
    for (const d of dips) {
      const dist = Math.min(Math.abs(i - d.c), n - Math.abs(i - d.c));
      v -= d.depth * Math.exp(-((dist / d.w) ** 2));
    }
    radii.push(Math.min(440, Math.max(150, v)));
  }
  // 荒さ (隣との半径の差) で、難易度と賞金を決める
  let rough = 0;
  for (let i = 0; i < n; i++) rough += Math.abs(radii[(i + 1) % n] - radii[i]);
  rough /= n * 100;
  const difficulty = rough < 0.7 ? '初級' : rough < 1.3 ? '中級' : '上級';
  const prizeMult = difficulty === '初級' ? 1 : difficulty === '中級' ? 1.3 : 1.6;
  return {
    id: `gen-${k}`,
    name: `${PREFIX[k % PREFIX.length]}${SUFFIX[Math.floor(k / PREFIX.length) % SUFFIX.length]}`,
    difficulty,
    points: radial(radii, 1.0 + r() * 0.6),
    width: 14 + Math.floor(r() * 11),
    laps: 2,
    prizeMult,
    ground: GROUND[k % GROUND.length],
    weather: WEATHERS[k % WEATHERS.length],
  };
}

// 追加のコース (自動で作ったもの)
for (let k = 0; k < 30; k++) COURSES.push(makeCourse(k));

export function findCourse(id: string | undefined): Course | undefined {
  return COURSES.find((c) => c.id === id);
}
