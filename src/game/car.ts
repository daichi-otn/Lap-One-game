import type { Mods } from './parts';
import { BASE } from './physics';
import { CAR_HALF_WIDTH, inPitGap, nearestIndex, pitLaneOffset, RAIL_GAP, type Track } from './track';

// 時速 200km/h (約 55.6m/s) を超えて壁にぶつかると、一瞬で大破する
const WALL_KO_SPEED = 200 / 3.6;

// エンジン: 回転数はレッドゾーン (7200 rpm) に一定時間入り続けるとエンスト
export const REDLINE_RPM = 7200;
export const REDLINE_STALL_SECONDS = 3; // レッドゾーンに居続けた時間の上限
const STALL_DNF_SECONDS = 3; // エンスト後、止まってから失格になるまでの時間

const IDLE_RPM = 900;
const RPM_SPAN = 5800; // 各ギアの最高速で、アイドルから何 rpm 上がるか (最高速でレッドゾーン)
const RPM_RISE = 4000; // アクセルを踏んだときの回転の上がりやすさ (rpm/秒)
const RPM_FALL = 2500; // 回転が落ちる速さ (rpm/秒)
const GEAR_TOP = [0.3, 0.5, 0.7, 0.87, 1.0]; // 各ギアの最高速 (最高速に対する割合)
const SHIFT_UP_RPM = 5800;
const SHIFT_DOWN_RPM = 3000;
const SHIFT_SECONDS = 0.3; // 変速中は駆動力が途切れる
const ENGINE_BRAKE = 1.2; // エンジンブレーキの強さ (最高回転で m/s²)

// そのギアで、今の速さのときの回転数
function rpmFor(car: CarState, gear: number): number {
  const gearTop = BASE.topSpeed * car.mods.topSpeed * GEAR_TOP[gear];
  return IDLE_RPM + RPM_SPAN * (car.speed / gearTop);
}

// 回転数は速さに遅れて追いかける。自動で変速し、変速中は駆動が途切れる
function stepEngine(car: CarState, throttle: boolean, dt: number): void {
  car.shiftTimer = Math.max(0, car.shiftTimer - dt);
  const diff = rpmFor(car, car.gear) - car.rpm;
  car.rpm += Math.max(-RPM_FALL * dt, Math.min(throttle ? RPM_RISE * dt : RPM_FALL * dt, diff));
  car.rpm = Math.max(IDLE_RPM, car.rpm);
  if (car.shiftTimer > 0) return;
  if (car.rpm >= SHIFT_UP_RPM && car.gear < GEAR_TOP.length - 1) shiftTo(car, car.gear + 1);
  else if (car.rpm <= SHIFT_DOWN_RPM && car.gear > 0) shiftTo(car, car.gear - 1);
}

function shiftTo(car: CarState, gear: number): void {
  car.gear = gear;
  car.shiftTimer = SHIFT_SECONDS;
  car.rpm = Math.max(IDLE_RPM, rpmFor(car, gear));
}

export interface CarInput {
  steer: number; // -1 (左) 〜 1 (右)
  gas: boolean;
  brake: boolean;
  nitro?: boolean;
}

// ニトロ: 走ると少しずつ溜まり、使うと加速と最高速が上がる
export const NITRO = {
  maxGauge: 100,
  chargePerMeter: 0.25,
  usePerSec: 25,
  accelMult: 1.8,
  topSpeedMult: 1.2,
};

export interface Env {
  grip: number;
  brake: number;
  wet: boolean;
  wind: number;
  time: number;
}

// ぶつかった場所: 位置 (x, z)、ぶつかる向き (車に向かう向き)、強さ
export interface Impact {
  x: number;
  z: number;
  nx: number;
  nz: number;
  strength: number;
}

export interface CarState {
  id: string;
  look: Record<string, number>; // 見た目の段階 (装着中のパーツ)
  name: string;
  isPlayer: boolean;
  color: number;
  lane: number; // 中心線からの横オフセット
  aiFactor: number; // AIの速度の癖 (1 で目標どおり)
  aggression: number; // AIの攻撃性 (0〜1)。高いと、近くのプレイヤーの車を狙って寄せる
  x: number;
  z: number;
  heading: number; // 0 で +Z 方向を向く
  speed: number;
  nitro: number; // ニトロのゲージ (0〜100)
  mods: Mods;
  maxDurability: number;
  durability: number;
  dnf: boolean;
  hitCooldown: number;
  prevS: number;
  dist: number; // スタートからの走行距離
  finished: boolean;
  wallImpact?: Impact; // 今フレームで壁にぶつかった場所 (へこみの表示に使う)
  boosting: boolean; // ニトロ中 (マフラーから炎を出す)
  finishOrder: number;
  finishTime?: number;
  rpm: number; // エンジンの回転数
  gear: number; // 今のギア (0 始まり)
  shiftTimer: number; // 変速中の残り時間 (秒)
  wheelTurn: number; // ハンドルの切れ具合 (-1 から 1)。運転席のハンドルを回すのに使う
  redTime: number; // レッドゾーンに入っている時間 (秒)
  stalled: boolean; // エンストした (大破はしない)
  stalledFor: number; // エンストしてから経った時間 (秒)
}

// 1フレーム分の走行。戻り値は今フレームで受けたダメージ
export function stepCar(car: CarState, input: CarInput, dt: number, env: Env, track: Track): number {
  let damage = 0;
  car.wheelTurn = input.steer;
  const half = track.course.width / 2;

  const before = track.pts[nearestIndex(track, car.x, car.z)];
  const beforeIdx = nearestIndex(track, car.x, car.z);
  const offroad = Math.hypot(car.x - before.x, car.z - before.z) > half + pitLaneOffset(track, beforeIdx);

  // ニトロ中はゲージを消費して加速と最高速が上がる
  // レッドゾーンに長く居るとエンスト。エンジンが止まるとアクセルは効かず、ゆっくり止まって失格
  stepEngine(car, input.gas && !car.stalled, dt);
  if (!car.stalled) {
    car.redTime = car.rpm >= REDLINE_RPM ? car.redTime + dt : 0;
    if (car.redTime >= REDLINE_STALL_SECONDS) car.stalled = true;
  } else {
    car.stalledFor += dt;
    if (car.stalledFor >= STALL_DNF_SECONDS) car.dnf = true;
  }
  const gas = input.gas && !car.stalled && car.shiftTimer <= 0;

  // ニトロはボタンだけで加速する (アクセルを踏んでいなくても効く)
  const boosting = !!input.nitro && !car.stalled && car.shiftTimer <= 0 && car.nitro > 0;
  car.boosting = boosting;
  if (boosting) car.nitro = Math.max(0, car.nitro - NITRO.usePerSec * dt);
  else car.nitro = Math.min(NITRO.maxGauge, car.nitro + car.speed * NITRO.chargePerMeter * dt);

  const top = BASE.topSpeed * car.mods.topSpeed * (boosting ? NITRO.topSpeedMult : 1) * (offroad ? 0.6 : 1);
  const accel = BASE.accel * car.mods.accel * (boosting ? NITRO.accelMult : 1);
  if (gas || boosting) car.speed += accel * Math.max(0.05, 1 - car.speed / top) * dt;
  if (input.brake) car.speed -= BASE.brake * car.mods.brake * env.brake * dt;
  const engineBrake = gas || boosting ? 0 : (ENGINE_BRAKE * (car.rpm - IDLE_RPM)) / RPM_SPAN;
  car.speed -= (0.6 + 0.01 * car.speed + (car.stalled ? 2 : 0) + engineBrake) * dt;
  car.speed = Math.min(Math.max(car.speed, 0), top * 1.03);

  const grip = car.mods.grip * env.grip * (env.wet ? car.mods.rainGrip : 1) * (offroad ? 0.75 : 1);
  const steerScale = Math.min(1, car.speed / 10) / (1 + car.speed / 90);
  car.heading -= input.steer * BASE.turn * car.mods.turn * grip * steerScale * dt;

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const wind = env.wind * dt * 0.5 * (0.6 + 0.4 * Math.sin(env.time * 0.9));
  car.x += fx * car.speed * dt + fz * wind;
  car.z += fz * car.speed * dt - fx * wind;

  // 壁 (コース幅 + 4) の外には出られない。ぶつかると減速してダメージ
  const idx = nearestIndex(track, car.x, car.z);
  const after = track.pts[idx];
  // ガードレールの内側まで。ピットの区間は、レールを切っているので道の外まで行ける
  const wallDist = inPitGap(track, idx)
    ? half + 4 + pitLaneOffset(track, idx)
    : half + RAIL_GAP - CAR_HALF_WIDTH;
  const dx = car.x - after.x;
  const dz = car.z - after.z;
  const off = Math.hypot(dx, dz);
  if (off > wallDist) {
    const k = wallDist / off;
    car.x = after.x + dx * k;
    car.z = after.z + dz * k;
    car.speed *= Math.max(0, 1 - 0.8 * dt);
    // 壁に激しくぶつかると、一瞬で大破する
    damage += car.speed > WALL_KO_SPEED ? Infinity : (BASE.wallDamagePerSec + car.speed * 0.1) * dt;
    if (car.speed > 3) {
      car.wallImpact = { x: after.x + dx * k, z: after.z + dz * k, nx: -dx / off, nz: -dz / off, strength: car.speed };
    }
  }

  // 周回の進捗。スタート/ゴールをまたいでも道のりが連続するように差分をまとめる
  const s = track.cum[nearestIndex(track, car.x, car.z)];
  let d = s - car.prevS;
  if (d < -track.length / 2) d += track.length;
  else if (d > track.length / 2) d -= track.length;
  car.dist += d;
  car.prevS = s;

  return damage;
}
