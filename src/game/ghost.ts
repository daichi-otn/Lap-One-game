// ゴースト: タイムアタックで出したベストの走りを記録して、次に薄い車として重ねて走らせる
// 記録は [x, z, heading, dist] を GHOST_STEP 秒ごとに並べたもの。コースごとに 1 つだけ残す
export const GHOST_STEP = 0.1; // 記録の間隔 (秒)

export interface Ghost {
  time: number; // そのときのゴールタイム (秒)
  look: Record<string, number>; // その車の見た目
  frames: number[]; // 4 つずつ区切る: x, z, heading, dist
}

const KEY = 'lapone.ghost.v1';

export function loadGhosts(): Record<string, Ghost> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Record<string, Ghost>;
  } catch {
    // 破損・非対応はゴーストなし扱い
  }
  return {};
}

export function storeGhost(courseId: string, ghost: Ghost): void {
  try {
    const all = loadGhosts();
    all[courseId] = ghost;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // 保存できなくてもプレイは継続
  }
}

// 記録の時刻 t (秒) の位置と向き (間は直線で補う)
export function ghostPose(frames: number[], t: number): { x: number; z: number; heading: number } | null {
  const n = Math.floor(frames.length / 4);
  if (n === 0) return null;
  const pos = Math.min(n - 1, Math.max(0, t / GHOST_STEP));
  const a = Math.floor(pos);
  const b = Math.min(n - 1, a + 1);
  const k = pos - a;
  const fa = a * 4;
  const fb = b * 4;
  return {
    x: frames[fa] + (frames[fb] - frames[fa]) * k,
    z: frames[fa + 1] + (frames[fb + 1] - frames[fa + 1]) * k,
    heading: frames[fa + 2] + (frames[fb + 2] - frames[fa + 2]) * k,
  };
}

// 同じ距離まで進んだ時刻 (ゴーストが、いまの自分の距離に来た時刻)。まだ届いていなければ null
export function ghostTimeAtDist(frames: number[], dist: number): number | null {
  const n = Math.floor(frames.length / 4);
  if (n < 2 || dist < 0) return null;
  // 距離は増えていくので、二分探索で dist を挟む区間を探す
  let lo = 0;
  let hi = n - 1;
  if (frames[hi * 4 + 3] < dist) return null;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (frames[mid * 4 + 3] < dist) lo = mid;
    else hi = mid;
  }
  const d0 = frames[lo * 4 + 3];
  const d1 = frames[hi * 4 + 3];
  const k = d1 > d0 ? (dist - d0) / (d1 - d0) : 0;
  return (lo + k) * GHOST_STEP;
}
