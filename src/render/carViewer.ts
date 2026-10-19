import * as THREE from 'three';
import { HOOD_OPEN_ANGLE, instantiateCar, loadCarTemplate, type CarParts, type Look } from './carModel';
import type { Mods } from '../game/parts';

export interface CarViewer {
  stop(): void;
  setView(first: boolean): void; // 一人称 (運転席から) か三人称 (後ろから) か
}

const OPEN_ANGLE = HOOD_OPEN_ANGLE; // ボンネットを開く角度 (rad)
const OPEN_TIME = 0.7; // 開く・閉じるのにかかる時間 (秒)
const HOLD_TIME = 1.4; // 開いたままにする時間 (秒)

// 部品ごとの見せ方。anchor は車の中での部品の場所 (車は原点、前は x 負)。
// 車を回して、部品がカメラの側に来るようにする。dist はカメラと部品の距離
interface Focus {
  anchor: [number, number, number] | 'wheel'; // 'wheel' は前のタイヤ (読み込み後に決まる)
  dist: number;
  fov: number;
  from: [number, number, number]; // 部品を見る方向 (車から見て。前は x 負、後ろは x 正、横は z)
  hood?: boolean; // ボンネットを開ける (エンジン・ターボ)
  noFrontTire?: boolean; // 前のタイヤを外す (ブレーキ・タイヤ)
  cockpit?: boolean; // 運転席から見せる (ハンドル・シート)
}
const FOCUS: Record<string, Focus> = {
  engine: { anchor: [-0.6, 0.45, 0], dist: 4.5, fov: 42, hood: true, from: [-1, 0.2, 0] },
  turbo: { anchor: [-0.6, 0.3, 0.12], dist: 4.2, fov: 42, hood: true, from: [-1, 0.2, 0.4] },
  brake: { anchor: 'wheel', dist: 2.8, fov: 40, noFrontTire: true, from: [-1, 0, 1] },
  tire: { anchor: 'wheel', dist: 3.2, fov: 42, noFrontTire: true, from: [-1, 0, 1] },
  frame: { anchor: [0, 0.3, 0.2], dist: 5.0, fov: 40, from: [0, 0.2, 1] },
  chassis: { anchor: [0, 0.1, 0.4], dist: 4.5, fov: 42, from: [0, 0.1, 1] },
  window: { anchor: [0, 0.8, 0], dist: 4.6, fov: 40, from: [0, 0.2, 1] },
  muffler: { anchor: [1.0, 0.05, 0], dist: 4.6, fov: 40, from: [1, 0.1, 0] },
  seat: { anchor: [0.4, 0.6, -0.3], dist: 0, fov: 60, cockpit: true, from: [0, 0, 1] },
  handle: { anchor: [0.4, 0.9, 0.45], dist: 0, fov: 60, cockpit: true, from: [0, 0, 1] },
};
// 部品を見るカメラの方向 (車の斜め前、少し上)
const VIEW_DIR = new THREE.Vector3(1, 0.35, 1).normalize();

// ガレージの左に映す自分の車。engineSwap が true のときは、ボンネットを開けてエンジンを見せる。
// focus は選んでいる部品。その部品が一番見えるように、車を回してカメラを寄せる
export function startCarViewer(
  host: HTMLElement,
  color: number,
  mods: Mods,
  engineSwap: boolean,
  look: Look = {},
  focus = '',
): CarViewer {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(6.4, 3.0, 8.4);
  camera.lookAt(0, 0.7, -0.3);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(6, 10, 8);
  sun.castShadow = true;
  scene.add(sun);

  // 台座 (車の下の円形の床)
  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 48),
    new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: 0.8 }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.receiveShadow = true;
  scene.add(pad);

  let firstPerson = false;
  const car = new THREE.Group();
  scene.add(car);
  const target = FOCUS[focus];
  // 部品の場所 (車の中の座標)。前のタイヤは読み込み後に決める
  let anchor = new THREE.Vector3(...(target && target.anchor !== 'wheel' ? target.anchor : [0, 0.5, 0]));
  let yawGoal = 0;
  let hasAnchor = !!target && target.anchor !== 'wheel';
  void loadCarTemplate().then((template) => {
    const inst = instantiateCar(template, look);
    car.add(inst);
    car.userData = inst.userData;
    // 運転席の内装は、ハンドルとシートを選んだときと一人称のときだけ見せる
    (inst.userData as CarParts).cockpit.visible = false;
    car.updateMatrixWorld(true);
    if (target && target.anchor === 'wheel') {
      // 前のタイヤを外すと、中のブレーキが見える
      const spinners = (inst.userData as CarParts).spinners.slice(0, 2);
      for (const sp of spinners) sp.getObjectByName('tire')?.removeFromParent();
      if (spinners[0]) {
        const w = new THREE.Vector3();
        spinners[0].getWorldPosition(w);
        anchor = w;
        hasAnchor = true;
      }
    }
    // 部品が一番カメラの側に来る車の向きを選ぶ (車は回転できる)
    if (hasAnchor && target && !target.cockpit) {
      let best = 0;
      let bestScore = -Infinity;
      const fromDir = new THREE.Vector3(...target.from).normalize();
      for (let a = 0; a < Math.PI * 2; a += 0.02) {
        const r = fromDir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        const score = new THREE.Vector3(r.x, 0, r.z).normalize().dot(new THREE.Vector3(VIEW_DIR.x, 0, VIEW_DIR.z).normalize());
        if (score > bestScore) {
          bestScore = score;
          best = a;
        }
      }
      yawGoal = best;
    }
    // 運転席から見せるとき、ハンドルとシートは内装を見せる
    if (target?.cockpit) (inst.userData as CarParts).cockpit.visible = true;
  });

  const resize = () => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // ボンネットの開閉。開始時刻からの経過で角度を決める
  let swapStart = engineSwap ? performance.now() : -Infinity;
  const lidAngle = (elapsed: number) => {
    if (elapsed < 0) return 0;
    const total = OPEN_TIME * 2 + HOLD_TIME;
    if (elapsed > total) return 0;
    if (elapsed < OPEN_TIME) return OPEN_ANGLE * easeInOut(elapsed / OPEN_TIME);
    if (elapsed < OPEN_TIME + HOLD_TIME) return OPEN_ANGLE;
    return OPEN_ANGLE * (1 - easeInOut((elapsed - OPEN_TIME - HOLD_TIME) / OPEN_TIME));
  };

  const camPos = new THREE.Vector3(6.4, 3.0, 8.4);
  const camLook = new THREE.Vector3(0, 0.7, -0.3);
  let raf = 0;
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const k = Math.min(1, dt * 4);
    const parts = car.userData as Partial<CarParts>;
    // 車の向き: 部品を選んでいるときは、部品が見える向き。そうでなければ正面
    car.rotation.y += (yawGoal - car.rotation.y) * k;
    // ボンネット: エンジンを選んだときは開けたままにする。そうでなければ、エンジン交換の開閉
    if (parts.hinge) {
      const want = target?.hood ? -OPEN_ANGLE : -lidAngle((now - swapStart) / 1000);
      parts.hinge.rotation.z += (want - parts.hinge.rotation.z) * Math.min(1, dt * 6);
    }
    // 一人称・運転席の見せ方のとき、車体は隠して内装を見せる
    const interior = firstPerson || !!target?.cockpit;
    if (parts.body) parts.body.visible = !interior;
    if (parts.cockpit) parts.cockpit.visible = interior;
    // 寄せる先
    let posGoal: THREE.Vector3;
    let lookGoal: THREE.Vector3;
    let fov = 35;
    if (firstPerson) {
      posGoal = new THREE.Vector3(0.6, 1.2, -0.2);
      lookGoal = new THREE.Vector3(0, 1.3, 30);
      fov = 72;
    } else if (target?.cockpit) {
      // 運転席から、ハンドルやシートを見る
      posGoal = new THREE.Vector3(0.6, 1.2, -0.2);
      lookGoal = anchor.clone();
      fov = target.fov;
    } else if (target && hasAnchor) {
      // 部品の今の場所 (車の回転に合わせて動かす) の斜め前から見る
      const rotated = anchor.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), car.rotation.y);
      lookGoal = rotated;
      posGoal = rotated.clone().addScaledVector(VIEW_DIR, target.dist).add(new THREE.Vector3(0, 0.9, 0));
      fov = target.fov;
    } else {
      posGoal = new THREE.Vector3(6.4, 3.0, 8.4);
      lookGoal = new THREE.Vector3(0, 0.7, -0.3);
    }
    camPos.lerp(posGoal, k);
    camLook.lerp(lookGoal, k);
    camera.fov += (fov - camera.fov) * k;
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
    setView: (first: boolean) => {
      firstPerson = first;
    },
    stop: () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

function easeInOut(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
}
