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

// 部品ごとに、カメラを寄せる場所。車は原点、前は x 負
interface Focus {
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
  hood?: boolean; // ボンネットを開ける (エンジン・ターボ)
  noFrontTire?: boolean; // 前のタイヤを外す (ブレーキ・タイヤ)
}
const FOCUS: Record<string, Focus> = {
  engine: { pos: [-2.6, 1.8, 1.8], look: [-0.8, 0.5, 0], fov: 45, hood: true },
  turbo: { pos: [-2.0, 1.5, 1.3], look: [-0.6, 0.45, 0], fov: 45, hood: true },
  brake: { pos: [-2.0, 0.8, 1.5], look: [-0.64, 0.2, 0.35], fov: 40, noFrontTire: true },
  tire: { pos: [-2.2, 0.9, 1.9], look: [-0.64, 0.2, 0.35], fov: 42, noFrontTire: true },
  frame: { pos: [0.4, 0.5, 3.4], look: [0, 0.4, 0], fov: 40 },
  chassis: { pos: [0.5, 0.25, 3.0], look: [0, 0.2, 0], fov: 42 },
  window: { pos: [0, 1.5, 3.4], look: [0, 1.0, 0], fov: 40 },
  muffler: { pos: [2.8, 0.7, 1.6], look: [1.0, 0.1, 0], fov: 40 },
};

// ガレージの左に映す自分の車。engineSwap が true のときは、ボンネットを開けてエンジンを見せる。
// focus は選んでいる部品 (その部品に近づいて見せる)。空なら全体を見せる
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

  // 車のモデルは読み込みに少し時間がかかるので、読み終わってから中身を入れる
  let firstPerson = false;
  const car = new THREE.Group();
  scene.add(car);
  const target = FOCUS[focus];
  // 前のタイヤの実際の位置 (読み込み後に決まる)。タイヤやブレーキを選んだときは、ここを狙う
  const wheelAt = new THREE.Vector3();
  let hasWheel = false;
  void loadCarTemplate().then((template) => {
    const inst = instantiateCar(template, look);
    car.add(inst);
    car.userData = inst.userData;
    // 運転席の内装は、一人称のときだけ見せる
    (inst.userData as CarParts).cockpit.visible = false;
    // 前のタイヤを外すと、中のブレーキが見える
    if (target?.noFrontTire) {
      const spinners = (inst.userData as CarParts).spinners.slice(0, 2);
      for (const sp of spinners) sp.getObjectByName('tire')?.removeFromParent();
      car.updateMatrixWorld(true);
      if (spinners[0]) {
        spinners[0].getWorldPosition(wheelAt);
        hasWheel = true;
      }
    }
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
    const parts = car.userData as Partial<CarParts>;
    // ボンネット: エンジンを選んだときは開けたままにする。そうでなければ、エンジン交換の開閉
    if (parts.hinge) {
      const want = target?.hood ? -OPEN_ANGLE : -lidAngle((now - swapStart) / 1000);
      parts.hinge.rotation.z += (want - parts.hinge.rotation.z) * Math.min(1, dt * 6);
    }
    // 一人称: 運転席から前を見る (ゲームの一人称と同じ位置)
    const first = firstPerson;
    if (parts.body) parts.body.visible = !first;
    if (parts.cockpit) parts.cockpit.visible = first;
    // 寄せる先 (部品を選んでいるとき) か、全体 (既定の視点)
    let goal: { pos: number[]; look: number[]; fov: number } = target ?? { pos: [6.4, 3.0, 8.4], look: [0, 0.7, -0.3], fov: 35 };
    if (first) goal = { pos: [0.6, 1.2, -0.2], look: [0, 1.3, 30], fov: 72 };
    else if (target?.noFrontTire && hasWheel) {
      // タイヤの斜め前から、少し上にして、ブレーキを見せる
      goal = {
        pos: [wheelAt.x - 0.9, wheelAt.y + 0.5, wheelAt.z + 0.9],
        look: [wheelAt.x, wheelAt.y, wheelAt.z],
        fov: target.fov,
      };
    }
    const k = Math.min(1, dt * 5);
    camPos.lerp(new THREE.Vector3(...goal.pos), k);
    camLook.lerp(new THREE.Vector3(...goal.look), k);
    camera.fov += (goal.fov - camera.fov) * k;
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
