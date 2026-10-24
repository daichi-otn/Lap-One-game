import { BASE } from './physics';
import type { Mods } from './parts';
import { WEATHER, type Weather } from './weather';
import { tangentAt, nearestIndex, pitLaneOffset, SAMPLES, type Track } from './track';
import { stepCar, type CarInput, type CarState, type Env, type Impact } from './car';
import type { Outcome } from './economy';

export interface RaceSetup {
  track: Track;
  weather: Weather;
  playerMods: Mods;
  playerLook?: Record<string, number>; // 自分の車の見た目 (装着中のパーツ)
  aiMods: Mods[];
  aiStrength?: number; // 開発者モードで変える CPU の強さ (1 が標準)
  autoDrive?: boolean; // ハンドルだけ操作し、アクセルとブレーキは自動
}

export const PLAYER_COLOR = 0xe53935;
const AI_COLORS = [0x2e7dd7, 0xf5a623, 0x8e44ad, 0x20c997, 0xff7043, 0xffee58, 0x78909c, 0xec407a];
const AI_NAMES = ['ライバルA', 'ライバルB', 'ライバルC', 'ライバルD', 'ライバルE', 'ライバルF', 'ライバルG', 'ライバルH'];
const AI_LANES = [-3, 3, -2, 2, -4, 4, 0, -1];
const HIT_COOLDOWN = 0.5;
// 時速 200km/h (約 55.6m/s) を超えて正面衝突すると、一瞬で大破する
const INSTANT_KO_SPEED = 200 / 3.6;

export class Race {
  static readonly COUNTDOWN_SECONDS = 3; // スタート前のカウントダウン (秒)
  readonly track: Track;
  readonly env: Env;
  readonly cars: CarState[];
  readonly player: CarState;
  time = 0;
  countdown = Race.COUNTDOWN_SECONDS;
  phase: 'countdown' | 'running' | 'finished' = 'countdown';
  outcome: Outcome | null = null;
  private finishCount = 0;
  private impacts: Impact[] = [];
  private impactCars: CarState[] = [];
  pitStops = 0; // ピットに入った回数 (画面の表示に使う)
  private inPit = false;
  spotlight: CarState | null = null; // ドローンのカメラで追う車 (復帰した CPU)
  private spotlightUntil = 0;
  static readonly PIT_SECONDS = 60; // ピットの時間 (ゲーム内の時間)
  static readonly RESPAWN_SECONDS = 3; // 大破した CPU が復帰するまでの時間
  static readonly CHASE_GAP = 40; // 復帰するとき、1位の車の何m後ろに戻すか
  static readonly CHASE_BOOST = 1.08; // 追い上げ中の CPU の速度の倍率
  static readonly SPOTLIGHT_SECONDS = 6; // 復帰した CPU を、ドローンで追う時間

  private autoDrive: boolean;
  lastPitBill = { damage: 0, nitro: 0 }; // 直近のピットの作業量 (0〜1 の損傷、ニトロの減り)

  constructor(setup: RaceSetup) {
    this.track = setup.track;
    this.autoDrive = setup.autoDrive ?? false;
    const w = WEATHER[setup.weather];
    this.env = { grip: w.grip, brake: w.brake, wet: w.wet, wind: w.wind, time: 0 };

    this.player = makeCar(setup.track, 0, {
      id: 'player',
      name: 'あなた',
      isPlayer: true,
      color: PLAYER_COLOR,
      mods: setup.playerMods,
      look: setup.playerLook ?? {},
      lane: 0,
      aiFactor: 1,
    });
    this.cars = [this.player];
    // CPU の強さ: 性能 (最高速と加速) と、運転の速さの両方に掛ける
    const strength = setup.aiStrength ?? 1;
    setup.aiMods.forEach((base, i) => {
      const mods = { ...base, topSpeed: base.topSpeed * strength, accel: base.accel * strength };
      this.cars.push(
        makeCar(setup.track, i + 1, {
          id: `ai-${i}`,
          name: AI_NAMES[i] ?? `CPU${i + 1}`,
          isPlayer: false,
          color: AI_COLORS[i % AI_COLORS.length],
          mods,
          lane: AI_LANES[i % AI_LANES.length],
          // 速さは個体差が大きい (強い CPU はプレイヤーより速いことがある)
          aiFactor: (0.96 + Math.random() * 0.06) * strength,
          aggression: Math.random(),
        }),
      );
    });
  }

  update(dt: number, input: CarInput): void {
    if (this.phase === 'finished') return;
    if (this.phase === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.phase = 'running';
      return;
    }

    this.time += dt;
    this.env.time = this.time;
    if (this.spotlight && (this.time >= this.spotlightUntil || this.spotlight.finished)) this.spotlight = null;
    const laps = this.track.course.laps * this.track.length;

    for (const car of this.cars) {
      if (car.dnf && car.respawnAt !== undefined && this.time >= car.respawnAt) this.respawn(car);
    }

    for (const car of this.cars) {
      if (car.dnf || car.finished) continue;
      const ci = car.isPlayer ? (this.autoDrive ? this.autoPedals(car, input) : input) : aiInput(car, this.track, this.player, car.chasing);
      this.damage(car, stepCar(car, ci, dt, this.env, this.track));
      if (car.chasing) {
        const lead = this.leaderOf(car);
        if (!lead || car.dist >= lead.dist) car.chasing = false;
      }
      if (car.wallImpact) {
        this.impacts.push(car.wallImpact);
        this.impactCars.push(car);
        car.wallImpact = undefined;
      }
      if (car.dnf) continue;
      if (car.dist >= laps) {
        car.finished = true;
        car.finishOrder = ++this.finishCount;
        car.finishTime = this.time;
      }
    }

    this.collide(dt);
    this.checkPit();

    if (this.player.dnf) {
      this.outcome = 'dnf';
      this.phase = 'finished';
    } else if (this.player.finished) {
      this.outcome = this.playerPosition() === 1 ? 'win' : 'finish';
      this.phase = 'finished';
    }
  }

  // 順位 (完走順 → 走行距離順、失格は最下位)
  // 画面へ渡すための衝突の記録を取り出す (取り出すと空になる)
  // ハンドルだけ操作するとき、アクセルとブレーキは、コースの速さの目安に合わせて自動で操作する
  private autoPedals(car: CarState, input: CarInput): CarInput {
    const near = nearestIndex(this.track, car.x, car.z);
    const target = this.track.maxSpeed[near] * 0.95;
    return { steer: input.steer, gas: car.speed < target, brake: car.speed > target + 4, nitro: false };
  }

  drainImpacts(): { car: CarState; impact: Impact }[] {
    const out = this.impacts.map((impact, i) => ({ car: this.impactCars[i], impact }));
    this.impacts = [];
    this.impactCars = [];
    return out;
  }

  ranking(): CarState[] {
    return [...this.cars].sort((a, b) => {
      if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
      if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.dist - a.dist;
    });
  }

  playerPosition(): number {
    return this.ranking().indexOf(this.player) + 1;
  }

  // ピットレーン (道の右側) に、ほぼ止まって入ると耐久が全快する。時間は 60 秒加わる
  private checkPit(): void {
    const p = this.player;
    if (p.dnf || p.finished) return;
    const t = this.track;
    const near = nearestIndex(t, p.x, p.z);
    let inLane = false;
    const offset = pitLaneOffset(t, near);
    if (offset > 0) {
      const pt = t.pts[near];
      const tan = tangentAt(t.pts, near);
      const lateral = (p.x - pt.x) * -tan.z + (p.z - pt.z) * tan.x;
      // 分かれ道の上 (道の右側へずれた位置)
      inLane = lateral > offset * 0.6;
    }
    if (inLane && !this.inPit && p.speed < 25) {
      // 修理代と、ニトロの補充の量 (お金の計算は画面側で行う)
      this.lastPitBill = { damage: 1 - p.durability / p.maxDurability, nitro: 100 - p.nitro };
      p.nitro = 100;
      p.durability = p.maxDurability;
      this.time += Race.PIT_SECONDS;
      this.pitStops++;
    }
    this.inPit = inLane;
  }

  private damage(car: CarState, amount: number): void {
    if (amount <= 0) return;
    car.durability -= amount;
    if (car.durability <= 0) {
      car.durability = 0;
      car.dnf = true;
      car.speed = 0;
      // CPU は少しして、1位の車の後ろから復帰して追いかける
      if (!car.isPlayer) car.respawnAt = this.time + Race.RESPAWN_SECONDS;
    }
  }

  // 1位の車 (自分以外で、まだ走っている車のうち先頭)
  private leaderOf(car: CarState): CarState | undefined {
    return this.ranking().find((c) => c !== car && !c.dnf && !c.finished);
  }

  // 大破した CPU を、1位の車の少し後ろに戻す (耐久は全快、追い上げの状態になる)
  private respawn(car: CarState): void {
    const lead = this.leaderOf(car);
    if (!lead) return;
    const t = this.track;
    const L = t.length;
    const s = ((((lead.dist - Race.CHASE_GAP) % L) + L) % L);
    let idx = 0;
    while (idx < SAMPLES - 1 && t.cum[idx + 1] <= s) idx++;
    const p = t.pts[idx];
    const tan = tangentAt(t.pts, idx);
    car.x = p.x - tan.z * car.lane;
    car.z = p.z + tan.x * car.lane;
    car.heading = Math.atan2(tan.x, tan.z);
    car.prevS = t.cum[idx];
    car.dist = lead.dist - Race.CHASE_GAP;
    car.speed = 0;
    car.dnf = false;
    car.respawnAt = undefined;
    car.chasing = true;
    this.spotlight = car;
    this.spotlightUntil = this.time + Race.SPOTLIGHT_SECONDS;
    car.durability = car.maxDurability;
    car.stalled = false;
    car.stalledFor = 0;
    car.rpm = 900;
    car.gear = 0;
    car.shiftTimer = 0;
    car.hitCooldown = 1;
  }

  private collide(dt: number): void {
    for (const car of this.cars) car.hitCooldown = Math.max(0, car.hitCooldown - dt);
    const live = this.cars.filter((c) => !c.dnf && !c.finished);
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i];
        const b = live[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d >= BASE.collisionDist) continue;

        const nx = d > 1e-4 ? dx / d : 1;
        const nz = d > 1e-4 ? dz / d : 0;
        const push = (BASE.collisionDist - d) / 2;
        a.x -= nx * push;
        a.z -= nz * push;
        b.x += nx * push;
        b.z += nz * push;

        if (a.hitCooldown > 0 || b.hitCooldown > 0) continue;
        const va = velocity(a);
        const vb = velocity(b);
        const rel = Math.hypot(va.x - vb.x, va.z - vb.z);
        if (rel > 4) {
          // 激しい衝突は、一瞬で耐久が 0 になる (それ以外は少しずつ)
          // 正面衝突 (お互いに向かって突っ込んでいる) かどうか
          const closing = (va.x - vb.x) * nx + (va.z - vb.z) * nz;
          const headOn = closing > rel * 0.8;
          const fatal = rel > INSTANT_KO_SPEED && headOn;
          const dmg = fatal ? Infinity : (rel - 4) * 0.6;
          this.damage(a, dmg);
          this.damage(b, dmg);
          // 衝突の場所: 2 台の間。それぞれの車は、相手と反対向きにへこむ
          const mx = (a.x + b.x) / 2;
          const mz = (a.z + b.z) / 2;
          const strength = rel - 4;
          this.impacts.push({ x: mx, z: mz, nx: -nx, nz: -nz, strength }, { x: mx, z: mz, nx, nz, strength });
          this.impactCars.push(a, b);
        }
        a.speed *= 0.9;
        b.speed *= 0.9;
        a.hitCooldown = HIT_COOLDOWN;
        b.hitCooldown = HIT_COOLDOWN;
      }
    }
  }
}

function velocity(car: CarState): { x: number; z: number } {
  return { x: Math.sin(car.heading) * car.speed, z: Math.cos(car.heading) * car.speed };
}

function makeCar(
  track: Track,
  slot: number,
  o: { id: string; name: string; isPlayer: boolean; color: number; mods: Mods; look?: Record<string, number>; lane: number; aiFactor: number; aggression?: number },
): CarState {
  // グリッドはゴール直前に並ぶ (スタートは周回の終わりから)
  const idx = (((SAMPLES - 6 - slot * BASE.gridGap) % SAMPLES) + SAMPLES) % SAMPLES;
  const p = track.pts[idx];
  const t = tangentAt(track.pts, idx);
  return {
    id: o.id,
    name: o.name,
    isPlayer: o.isPlayer,
    color: o.color,
    lane: o.lane,
    aiFactor: o.aiFactor,
    aggression: o.aggression ?? 0,
    x: p.x - t.z * o.lane,
    z: p.z + t.x * o.lane,
    heading: Math.atan2(t.x, t.z),
    speed: 0,
    nitro: 0,
    mods: o.mods,
    look: o.look ?? {},
    maxDurability: 100 * o.mods.durability,
    durability: 100 * o.mods.durability,
    dnf: false,
    hitCooldown: 0,
    redTime: 0,
    stalled: false,
    stalledFor: 0,
    rpm: 900,
    gear: 0,
    shiftTimer: 0,
    wheelTurn: 0,
    prevS: track.cum[idx],
    dist: 0,
    finished: false,
    boosting: false,
    finishOrder: 0,
  };
}

// CPU の運転: 先の中心線を狙い、コーナーの上限速度に合わせてアクセル/ブレーキ
function aiInput(car: CarState, track: Track, player: CarState, chasing = false): CarInput {
  // 攻撃的な CPU は、少し前にいるプレイヤーの車に寄せて、妨害する (ぶつかることもある)
  const gap = player.dist - car.dist;
  if (car.aggression > 0.4 && !player.dnf && !player.finished && gap > 0 && gap < 30) {
    const dx = player.x - car.x;
    const dz = player.z - car.z;
    const alpha = wrapAngle(Math.atan2(dx, dz) - car.heading);
    const steer = Math.max(-1, Math.min(1, -alpha * 2.5));
    const speedTarget = Math.max(player.speed, 10) * car.aiFactor * 1.05;
    return { steer, gas: car.speed < speedTarget, brake: car.speed > speedTarget + 4, nitro: false };
  }
  const near = nearestIndex(track, car.x, car.z);
  const sampleLen = track.length / SAMPLES;
  const ahead = Math.round((12 + car.speed * 0.35) / sampleLen);
  const j = (near + ahead) % SAMPLES;
  const p = track.pts[j];
  const t = tangentAt(track.pts, j);
  const tx = p.x - t.z * car.lane;
  const tz = p.z + t.x * car.lane;

  const desired = Math.atan2(tx - car.x, tz - car.z);
  const diff = wrapAngle(desired - car.heading);
  const steer = Math.max(-1, Math.min(1, -diff * 2.2));
  const pace = car.aiFactor * (chasing ? Race.CHASE_BOOST : 1);
  const target = track.maxSpeed[near] * pace * (Math.abs(diff) > 0.5 ? 0.9 : 1);

  // 直線で、ゲージが十分にあれば、ニトロを使う (加速が必要なとき)
  const straight = Math.abs(steer) < 0.15 && Math.abs(diff) < 0.2;
  const nitro = straight && car.speed < target && car.nitro > 40;
  return { steer, gas: car.speed < target, brake: car.speed > target + 3, nitro };
}

function wrapAngle(a: number): number {
  return ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
}
