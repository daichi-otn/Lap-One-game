import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildCockpit } from './cockpit';
import { TIER_COLORS, tierColor } from './tierColors';

// 車のモデル: "Midnight Blue Sports Car" by Nathan Kiplinger (CC0, SummerEngine) を使う
// 前方は +Z。ボンネットは蝶番の周りで開き、タイヤは車体と別に回る

const MODEL_URL = `${import.meta.env.BASE_URL}models/midnight-sports-car.glb`;
const LENGTH = 4.6; // 車の全長 (m)
// モデルの座標 (読み込み直後) でのタイヤの位置と大きさ
const WHEEL_Y = -0.102;
const WHEEL_R = 0.175;
const WHEEL_W = 0.14;
const WHEEL_OUT_Z = 0.34;
const WHEEL_SPOTS = [
  { x: -0.635, z: -0.35 },
  { x: -0.635, z: 0.35 },
  { x: 0.55, z: -0.35 },
  { x: 0.55, z: 0.35 },
];
// ボンネット: 前方 (x が負) の上面。蝶番はフロントガラスの根元
const HOOD = { pivotX: -0.36, pivotY: 0.13, maxX: -0.355, halfWidth: 0.25, minY: 0.0 };
export const HOOD_OPEN_ANGLE = 0.6; // 開く角度 (rad)
// タイヤの見た目の半径 (m)。タイヤの回転の速さに使う
export const WHEEL_SPIN_RADIUS = 0.42;

// 装着中のパーツ (id 例: "engine-2") から、見た目の段階を作る
export function lookFromEquipped(equipped: Partial<Record<string, string>>): Look & Record<string, number> {
  const look: Record<string, number> = {};
  for (const [slot, id] of Object.entries(equipped)) {
    const tier = Number((id ?? '').split('-')[1]);
    if (tier) look[slot] = tier;
  }
  return look;
}

// 装着中のパーツ (id 例: "engine-2") から、見た目の段階を作る (下の型)
export interface Look {
  engine?: number;
  muffler?: number;
  tire?: number;
  window?: number;
  seat?: number;
  handle?: number;
  chassis?: number;
  brake?: number;
}

export interface CarParts {
  body: THREE.Object3D; // 車体 (モデル全体)
  cockpit: THREE.Group; // 運転席の内装 (一人称のときだけ表示)
  hinge: THREE.Object3D; // ボンネットの蝶番
  spinners: THREE.Object3D[]; // 回るタイヤ
  flames: THREE.Object3D[]; // マフラーの炎 (ニトロ中だけ)
  bodyMesh?: THREE.Mesh; // 車体の面 (へこみの表示に使う。車ごとに複製した形)
  // 衝突で外れて飛ぶ部品 (外れた部品は undefined になる)
  detachable?: {
    hood?: THREE.Object3D;
    trunk?: THREE.Mesh;
    roof?: THREE.Mesh;
    windshield?: THREE.Mesh;
    rearWindow?: THREE.Mesh;
    lightsFront?: THREE.Object3D[];
    lightsRear?: THREE.Object3D[];
    doorLeft?: THREE.Mesh;
    doorRight?: THREE.Mesh;
  };
}

// 車体の三角形から、条件に合うものを切り出して別のメッシュにする (切り出した分は車体から消える)
export function takeTriangles(mesh: THREE.Mesh, pick: (x: number, y: number, z: number) => boolean): THREE.Mesh | undefined {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const index = geo.index ? Array.from(geo.index.array) : Array.from({ length: pos.count }, (_, i) => i);
  const keep: number[] = [];
  const part: number[][] = [];
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]];
    const cx = (pos.getX(tri[0]) + pos.getX(tri[1]) + pos.getX(tri[2])) / 3;
    const cy = (pos.getY(tri[0]) + pos.getY(tri[1]) + pos.getY(tri[2])) / 3;
    const cz = (pos.getZ(tri[0]) + pos.getZ(tri[1]) + pos.getZ(tri[2])) / 3;
    if (pick(cx, cy, cz)) part.push(tri);
    else keep.push(...tri);
  }
  if (part.length === 0) return undefined;
  const pp: number[] = [];
  const pn: number[] = [];
  const pu: number[] = [];
  for (const tri of part) {
    for (const v of tri) {
      pp.push(pos.getX(v), pos.getY(v), pos.getZ(v));
      if (nrm) pn.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
      if (uv) pu.push(uv.getX(v), uv.getY(v));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
  if (nrm) g.setAttribute('normal', new THREE.Float32BufferAttribute(pn, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2));
  if (!nrm) g.computeVertexNormals();
  mesh.geometry = geo;
  geo.setIndex(keep);
  const out = new THREE.Mesh(g, mesh.material);
  out.castShadow = true;
  return out;
}

// 三角形の重心が、タイヤの中にあるか
function inTire(cx: number, cy: number, cz: number): boolean {
  return WHEEL_SPOTS.some(
    (w) => Math.hypot(cx - w.x, cy - WHEEL_Y) < WHEEL_R * 1.05 && Math.abs(cz - w.z) < WHEEL_W / 2 + 0.02,
  );
}

// 車体の三角形から、焼き込まれたタイヤを取り除き、ボンネットを切り出す
export function splitBodyMesh(mesh: THREE.Mesh): { body: THREE.BufferGeometry; hood: THREE.BufferGeometry } {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  const nrm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const index = geo.index ? Array.from(geo.index.array) : Array.from({ length: pos.count }, (_, i) => i);

  const keep: number[] = [];
  const hoodVerts: number[][] = [];
  for (let t = 0; t < index.length; t += 3) {
    const tri = [index[t], index[t + 1], index[t + 2]];
    const cx = (pos.getX(tri[0]) + pos.getX(tri[1]) + pos.getX(tri[2])) / 3;
    const cy = (pos.getY(tri[0]) + pos.getY(tri[1]) + pos.getY(tri[2])) / 3;
    const cz = (pos.getZ(tri[0]) + pos.getZ(tri[1]) + pos.getZ(tri[2])) / 3;
    if (inTire(cx, cy, cz)) continue;
    const isHood = cx < HOOD.maxX && Math.abs(cz) < HOOD.halfWidth && cy > HOOD.minY;
    if (isHood) hoodVerts.push(tri);
    else keep.push(...tri);
  }

  const body = new THREE.BufferGeometry();
  body.setAttribute('position', pos);
  if (nrm) body.setAttribute('normal', nrm);
  if (uv) body.setAttribute('uv', uv);
  body.setIndex(keep);

  // ボンネットは頂点を並べ直した別の形にする (蝶番の位置が原点になるように移す)
  const hp: number[] = [];
  const hn: number[] = [];
  const hu: number[] = [];
  for (const tri of hoodVerts) {
    for (const v of tri) {
      hp.push(pos.getX(v), pos.getY(v), pos.getZ(v));
      if (nrm) hn.push(nrm.getX(v), nrm.getY(v), nrm.getZ(v));
      if (uv) hu.push(uv.getX(v), uv.getY(v));
    }
  }
  const hood = new THREE.BufferGeometry();
  hood.setAttribute('position', new THREE.Float32BufferAttribute(hp, 3));
  if (nrm) hood.setAttribute('normal', new THREE.Float32BufferAttribute(hn, 3));
  if (uv) hood.setAttribute('uv', new THREE.Float32BufferAttribute(hu, 2));
  hood.translate(-HOOD.pivotX, -HOOD.pivotY, 0);
  if (!nrm) hood.computeVertexNormals();
  return { body, hood };
}

// 回るタイヤ: 断面つきのタイヤ、テーパーのあるスポーク、ブレーキディスク、キャリパー
function buildSpinner(look: Look = {}): THREE.Group {
  const tireTier = look.tire ?? 1;
  const brakeTier = look.brake ?? 1;
  const R = WHEEL_R;
  const W = WHEEL_W;
  const spinner = new THREE.Group();
  const pts = [
    [0.66, -0.5], [0.74, -0.5], [0.86, -0.47], [0.94, -0.42], [0.98, -0.34],
    [1.0, -0.22], [1.0, 0.22], [0.98, 0.34], [0.94, 0.42], [0.86, 0.47], [0.74, 0.5], [0.66, 0.5],
  ].map(([r, y]) => new THREE.Vector2(r * R, y * W));
  const tireGeo = new THREE.LatheGeometry(pts, 40);
  tireGeo.rotateX(Math.PI / 2);
  // タイヤ: 上位ほど濃いグリップのゴム。リムは上位で明るく
  const tireColor = tierColor(TIER_COLORS.tire, tireTier);
  const tire = new THREE.Mesh(
    tireGeo,
    new THREE.MeshPhysicalMaterial({ color: tireColor, roughness: 0.82, metalness: 0, sheen: 0.2, sheenColor: 0x333840, side: THREE.DoubleSide }),
  );
  tire.name = 'tire';
  spinner.add(tire);

  const alloy = new THREE.MeshPhysicalMaterial({
    color: tierColor(TIER_COLORS.rim, tireTier),
    metalness: 0.95,
    roughness: tireTier >= 6 ? 0.12 : 0.22,
    clearcoat: 0.4,
  });
  const dark = new THREE.MeshStandardMaterial({ color: tireTier % 2 === 0 ? 0x1c2026 : 0x2b2f35, metalness: 0.7, roughness: 0.4, side: THREE.DoubleSide });
  const face = W * 0.46;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.66 * R, 0.66 * R, W * 0.9, 40, 1, true), dark);
  barrel.rotation.x = Math.PI / 2;
  spinner.add(barrel);
  const dish = new THREE.Mesh(new THREE.CircleGeometry(0.66 * R, 40), dark);
  dish.position.z = face * 0.6;
  spinner.add(dish);
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58 * R, 0.58 * R, 0.035 * R, 40),
    new THREE.MeshStandardMaterial({ color: 0x5b616a, metalness: 0.6, roughness: 0.45 }),
  );
  disc.rotation.x = Math.PI / 2;
  disc.position.z = face * 0.35;
  spinner.add(disc);
  // キャリパー: 標準は灰色、上位は黄色、最上位は赤
  const caliperColor = tierColor(TIER_COLORS.caliper, brakeTier);
  const caliper = new THREE.Mesh(
    new THREE.BoxGeometry(0.1 * R, 0.26 * R, 0.07 * R),
    new THREE.MeshStandardMaterial({ color: caliperColor, roughness: 0.4, metalness: 0.2 }),
  );
  caliper.name = 'caliper';
  caliper.position.set(0, 0.42 * R, face * 0.35 + 0.02 * R);
  spinner.add(caliper);

  const sGeo = (() => {
    const sh = new THREE.Shape();
    sh.moveTo(-0.11 * R, 0.14 * R);
    sh.lineTo(0.11 * R, 0.14 * R);
    sh.quadraticCurveTo(0.07 * R, 0.4 * R, 0.05 * R, 0.6 * R);
    sh.lineTo(-0.05 * R, 0.6 * R);
    sh.quadraticCurveTo(-0.07 * R, 0.4 * R, -0.11 * R, 0.14 * R);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.03 * R, bevelEnabled: true, bevelSize: 0.004 * R, bevelThickness: 0.004 * R, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -0.015 * R);
    return g;
  })();
  for (const side of [1, -1]) {
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.Mesh(sGeo, alloy);
      sp.rotation.z = (k / 5) * Math.PI * 2 + 0.2;
      sp.position.z = side * face;
      if (side < 0) sp.rotation.y = Math.PI;
      spinner.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * R, 0.15 * R, 0.07 * R, 24), alloy);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = side * (face + 0.01 * R);
    spinner.add(hub);
  }
  return spinner;
}

// マフラー (排気管の出口): 段階で大きさと色が変わる。モデルの座標で後ろ (x 正) の下
function buildExhaust(tier: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'muffler';
  // 出口の半径 (モデルの座標。実寸で約 4〜5cm の半径)
  const radius = 0.016 + 0.0007 * (tier - 1);
  const mat = new THREE.MeshStandardMaterial({
    color: tierColor(TIER_COLORS.exhaust, tier),
    metalness: tier === 1 ? 0.6 : 0.95,
    roughness: tier === 1 ? 0.5 : 0.2,
  });
  for (const z of [0.12, -0.12]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.05, 20), mat);
    tip.rotation.z = Math.PI / 2; // 後ろ向き (x 方向)
    tip.position.set(0.93, -0.12, z);
    tip.castShadow = true;
    g.add(tip);
  }
  return g;
}

// ワイパー (窓): 上位は前の窓にワイパーを付ける。モデルの座標で前のフロントガラス
function buildWipers(tier: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'wipers';
  if (tier < 2) return g;
  const arm = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 });
  const count = tier >= 6 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.006, 0.26), arm);
    blade.position.set(-0.44, 0.125, i === 0 ? -0.1 : 0.12);
    blade.rotation.y = 0.1;
    g.add(blade);
  }
  return g;
}

// エンジン (V 型): ボンネットの中に収まる大きさ。モデルの座標で、前方 (x 負) のボンネットの下
function buildEngine(tier = 1): THREE.Group {
  const eng = new THREE.Group();
  eng.name = 'engine';
  const block = new THREE.MeshStandardMaterial({ color: 0x2a2e35, metalness: 0.7, roughness: 0.45 });
  const cover = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.85, roughness: 0.3 });
  // ヘッドカバー: 標準は暗い色、上位は赤
  const red = new THREE.MeshStandardMaterial({ color: tierColor(TIER_COLORS.cover, tier), metalness: tier >= 2 ? 0.4 : 0.7, roughness: tier >= 2 ? 0.35 : 0.4 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 1, roughness: 0.2 });
  // 吸気: 最上位はクロームのインテーク
  const intake = tier >= 6
    ? new THREE.MeshStandardMaterial({ color: 0xd8dde3, metalness: 1, roughness: 0.2 })
    : new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.7 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    m.castShadow = true;
    eng.add(m);
    return m;
  };
  const cx = -0.62; // エンジンの中心 (前後)
  // ブロック (クランクケース)
  add(new THREE.BoxGeometry(0.3, 0.05, 0.22), block, cx, -0.02, 0);
  // V 型のシリンダーバンク (左右に傾ける)
  for (const side of [1, -1]) {
    for (let k = 0; k < 3; k++) {
      const x = cx - 0.1 + k * 0.1;
      add(new THREE.CylinderGeometry(0.035, 0.035, 0.1, 18), block, x, 0.0, side * 0.08, side * 0.35);
    }
    // ヘッドとバルブカバー (赤いカバー)
    add(new THREE.BoxGeometry(0.26, 0.01, 0.07), red, cx, 0.01, side * 0.1, side * 0.35 * 0.8);
  }
  // 吸気マニフォールド (中央の黒い箱)
  add(new THREE.BoxGeometry(0.22, 0.03, 0.08), intake, cx, 0.02, 0);
  // エアクリーナーの箱 (前側)
  add(new THREE.BoxGeometry(0.08, 0.04, 0.12), intake, cx - 0.2, 0.025, 0);
  // 排気管 (後ろ側の左右)
  for (const side of [1, -1]) {
    const pipe = add(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 14), chrome, cx + 0.02, -0.03, side * 0.12);
    pipe.rotation.set(0, 0, Math.PI / 2);
  }
  // 冷却水のホース (細い)
  add(new THREE.BoxGeometry(0.02, 0.02, 0.2), cover, cx + 0.1, 0.02, 0);
  return eng;
}

interface Template {
  model: THREE.Group;
}
let templatePromise: Promise<Template> | null = null;

// GLB を一度だけ読み込み、タイヤとボンネットを整える
export function loadCarTemplate(): Promise<Template> {
  templatePromise ??= (async () => {
    const gltf = await new GLTFLoader().loadAsync(MODEL_URL);
    const model = new THREE.Group();
    model.add(gltf.scene);
    let mesh: THREE.Mesh | null = null;
    gltf.scene.traverse((o) => {
      if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
    });
    if (!mesh) throw new Error('car model has no mesh');
    const { body, hood } = splitBodyMesh(mesh);
    (mesh as THREE.Mesh).geometry = body;

    // 大きさと向き: 長い方向を前後 (Z) に合わせ、全長を LENGTH にする
    const inner = gltf.scene;
    const size = new THREE.Box3().setFromObject(inner).getSize(new THREE.Vector3());
    const scale = LENGTH / Math.max(size.x, size.z);
    inner.scale.setScalar(scale);
    if (size.x > size.z) inner.rotation.y = Math.PI / 2;
    inner.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(inner);
    const c = box.getCenter(new THREE.Vector3());
    inner.position.set(-c.x, -box.min.y, -c.z);
    inner.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    // ボンネット、タイヤ、エンジン (ボンネットの中)。どれもモデルの座標で付ける
    const hinge = new THREE.Group();
    hinge.name = 'hood-hinge';
    hinge.position.set(HOOD.pivotX, HOOD.pivotY, 0);
    const hoodMesh = new THREE.Mesh(hood, (mesh as THREE.Mesh).material);
    hoodMesh.castShadow = true;
    hinge.add(hoodMesh);
    inner.add(hinge);

    return { model };
  })();
  return templatePromise;
}

// 回るタイヤの部品を、段階の組み合わせごとに 1 つだけ作っておく
const spinnerCache = new Map<string, THREE.Group>();

// 車を 1 台作る (テンプレートから複製)。look は装着中のパーツの段階。読み込み前は呼べない
export function instantiateCar(template: Template, look: Look = {}): THREE.Group {
  const group = new THREE.Group();
  const body = template.model.clone(true);
  group.add(body);
  // 拡大縮小と向きを持つ車体 (モデルの座標で部品を付ける先)
  const inner = body.children[0];

  // エンジン・マフラー・窓 (ワイパー)
  inner.add(buildEngine(look.engine ?? 1));
  inner.add(buildExhaust(look.muffler ?? 1));
  inner.add(buildWipers(look.window ?? 1));

  // シャシ: 上位ほど車高が低い (足回りの硬さの見た目)
  body.position.y -= ((look.chassis ?? 1) - 1) * 0.015;

  // タイヤ (回る) とブレーキ
  const spinners: THREE.Object3D[] = [];
  for (const w of WHEEL_SPOTS) {
    const holder = new THREE.Group();
    holder.name = 'wheel';
    holder.position.set(w.x, WHEEL_Y, Math.sign(w.z) * WHEEL_OUT_Z);
    const key = `${look.tire ?? 1}-${look.brake ?? 1}`;
    let proto = spinnerCache.get(key);
    if (!proto) {
      proto = buildSpinner({ tire: look.tire, brake: look.brake });
      spinnerCache.set(key, proto);
    }
    const spinner = proto.clone(); // 形と材質は共有する
    spinner.name = 'spinner';
    holder.add(spinner);
    inner.add(holder);
    spinners.push(spinner);
  }

  // マフラーの炎: ニトロ中だけ、後ろへ向けて出す (出口の位置はマフラーと同じ)
  const flames: THREE.Object3D[] = [];
  for (const z of [0.12, -0.12]) {
    const flame = new THREE.Group();
    flame.name = 'flame';
    flame.position.set(0.96, -0.12, z);
    const core = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.22, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    core.rotation.z = -Math.PI / 2;
    core.position.x = 0.1;
    const outer = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.34, 12),
      new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    outer.rotation.z = -Math.PI / 2;
    outer.position.x = 0.14;
    flame.add(core, outer);
    flame.visible = false;
    inner.add(flame);
    flames.push(flame);
  }

  const cockpit = buildCockpit({ seat: look.seat, handle: look.handle });
  group.add(cockpit);
  const hinge = body.getObjectByName('hood-hinge') ?? new THREE.Object3D();
  // 車体の面は車ごとに複製して、ぶつかった場所をへこませられるようにする
  let bodyMesh: THREE.Mesh | undefined;
  inner.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!bodyMesh && m.isMesh && m.geometry.getAttribute('position').count > 20000) bodyMesh = m;
  });
  if (bodyMesh) bodyMesh.geometry = bodyMesh.geometry.clone();
  // トランク (後ろの上面) と屋根 (中央の上面) を切り出す
  // 車体の面から、部品を切り出す (前が x 負、後ろが x 正、横が z)。窓は透明な色にする
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2a3a, metalness: 0.9, roughness: 0.08, side: THREE.DoubleSide });
  const paintMat = (bodyMesh?.material as THREE.Material) ?? new THREE.MeshStandardMaterial({ color: 0x1f3f7a });
  const det: NonNullable<CarParts['detachable']> = {};
  if (bodyMesh) {
    det.windshield = takeTriangles(bodyMesh, (x, y, z) => x > -0.36 && x < -0.1 && y > 0.13 && Math.abs(z) < 0.3);
    det.roof = takeTriangles(bodyMesh, (x, y, z) => x > -0.1 && x < 0.1 && y > 0.2 && Math.abs(z) < 0.28);
    det.rearWindow = takeTriangles(bodyMesh, (x, y, z) => x > 0.1 && x < 0.42 && y > 0.18 && Math.abs(z) < 0.3);
    det.trunk = takeTriangles(bodyMesh, (x, y, z) => x > 0.42 && y > 0.05 && Math.abs(z) < 0.3);
    det.doorRight = takeTriangles(bodyMesh, (x, y, z) => x > -0.3 && x < 0.4 && y > 0.15 && y < 0.95 && z > 0.6);
    det.doorLeft = takeTriangles(bodyMesh, (x, y, z) => x > -0.3 && x < 0.4 && y > 0.15 && y < 0.95 && z < -0.6);
    if (det.windshield) det.windshield.material = glassMat;
    if (det.rearWindow) det.rearWindow.material = glassMat;
    for (const m of [det.windshield, det.roof, det.rearWindow, det.trunk, det.doorRight, det.doorLeft]) {
      if (m) {
        if (m !== det.windshield && m !== det.rearWindow) m.material = paintMat;
        inner.add(m);
      }
    }
  }
  // ライト: 前後の小さなランプ (車体の表面に付ける)
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff6d5, emissive: 0xfff1b8, emissiveIntensity: 0.6 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 0.8 });
  det.lightsFront = [];
  det.lightsRear = [];
  for (const z of [0.25, -0.25]) { // 車体の幅 (約 ±0.37) の内側に置く
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), lampMat);
    f.position.set(-0.92, 0.0, z); // 車体の先端の表面に合わせる (先端の高さ約 0.05)
    inner.add(f);
    det.lightsFront.push(f);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.16), tailMat);
    r.position.set(0.92, 0.1, z); // 後ろの表面に合わせる (後ろの高さ約 0.14)
    inner.add(r);
    det.lightsRear.push(r);
  }
  det.hood = hinge.children[0];
  group.userData = {
    body,
    cockpit,
    hinge,
    spinners,
    flames,
    bodyMesh,
    detachable: det,
  } satisfies CarParts;
  return group;
}
