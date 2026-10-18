import * as THREE from 'three';
import type { Course } from './courses';
import { BASE } from './physics';

export const SAMPLES = 1400;

export interface Track {
  course: Course;
  pts: THREE.Vector3[]; // 等間隔にサンプルした中心線
  cum: Float64Array; // 各サンプルまでの道のり (周回の進捗に使う)
  length: number;
  maxSpeed: Float32Array; // コーナーで出せる上限速度 (AIの目標速度)
  pitFrom: number; // ピットの区間 (サンプル番号)
  pitTo: number;
}

export function buildTrack(course: Course): Track {
  const curve = new THREE.CatmullRomCurve3(
    course.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  const pts = curve.getSpacedPoints(SAMPLES);
  pts.pop(); // 終点は始点と同じなので除く

  const cum = new Float64Array(SAMPLES);
  let length = 0;
  for (let i = 0; i < SAMPLES; i++) {
    cum[i] = length;
    length += pts[i].distanceTo(pts[(i + 1) % SAMPLES]);
  }

  const segment = length / SAMPLES;
  const maxSpeed = new Float32Array(SAMPLES);
  for (let i = 0; i < SAMPLES; i++) {
    const a = tangentAt(pts, i - 3);
    const b = tangentAt(pts, i + 3);
    const angle = Math.acos(Math.min(1, Math.max(-1, a.dot(b))));
    const curvature = angle / (6 * segment);
    maxSpeed[i] = Math.min(BASE.topSpeed, Math.sqrt(BASE.latAccel / Math.max(curvature, 1e-4)));
  }

  // ピット: 周回の 12% あたりの道の右側 (ピットレーン)
  const pitFrom = Math.floor(SAMPLES * 0.12);
  const pitTo = pitFrom + Math.floor(SAMPLES * 0.04);
  return { course, pts, cum, length, maxSpeed, pitFrom, pitTo };
}

export function tangentAt(pts: THREE.Vector3[], i: number): THREE.Vector3 {
  const n = pts.length;
  const j = ((i % n) + n) % n;
  const k = (j + 1) % n;
  return new THREE.Vector3().subVectors(pts[k], pts[j]).setY(0).normalize();
}

// 位置に最も近いサンプル番号 (コース数が少ないので総当たりで十分)
// ピットの分かれ道: 道の右側へのずれ量 (道の中心からの距離)。区間の両端で 0、中ほどで最大
// ガードレールの位置 (道の端から) と、車の幅の半分。レールの内側に車の中心が来るまで
export const RAIL_GAP = 2.5;
export const CAR_HALF_WIDTH = 0.9;

// ピットの入口・出口の前後で、ガードレールを切っている区間
export function inPitGap(track: Track, i: number): boolean {
  const j = ((i % SAMPLES) + SAMPLES) % SAMPLES;
  return j >= track.pitFrom - 20 && j <= track.pitTo + 20;
}

export function pitLaneOffset(track: Track, i: number): number {
  const n = track.pitTo - track.pitFrom;
  const j = ((i % SAMPLES) + SAMPLES) % SAMPLES;
  if (j < track.pitFrom || j > track.pitTo) return 0;
  const u = (j - track.pitFrom) / n;
  const ramp = Math.min(1, u / 0.2, (1 - u) / 0.2);
  const s = ramp * ramp * (3 - 2 * ramp);
  return (track.course.width / 2 + 4) * s;
}

export function nearestIndex(track: Track, x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  const pts = track.pts;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - x;
    const dz = pts[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
