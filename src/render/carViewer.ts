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

// 部品ごとの見せ方 (車は原点、前は +Z、横は ±X)。寸法は実際の車から測った値
// cam はカメラの位置、look は見る先。hood はボンネットを開ける、noFrontTire は前のタイヤを外す、cockpit は運転席から見せる
interface Focus {
  cam: [number, number, number];
  look: [number, number, number];
  fov: number;
  hood?: boolean;
  noFrontTire?: boolean;
  cockpit?: boolean;
}
const FOCUS: Record<string, Focus> = {
  engine: { cam: [0.2, 1.5, 4.2], look: [0, 0.7, 0.9], fov: 40, hood: true },
  turbo: { cam: [2.2, 1.3, 1.9], look: [0, 0.8, 0.9], fov: 40, hood: true },
  brake: { cam: [1.6, 0.7, 3.0], look: [0.83, 0.42, 1.45], fov: 38, noFrontTire: true },
  tire: { cam: [2.8, 0.9, 3.2], look: [0.83, 0.42, 1.53], fov: 40, noFrontTire: true },
  frame: { cam: [4.5, 0.8, 0], look: [0, 0.6, 0], fov: 40 },
  chassis: { cam: [4.5, 0.3, 0], look: [0, 0.2, 0], fov: 42 },
  window: { cam: [4.5, 1.5, 0], look: [0, 1.1, 0], fov: 40 },
  muffler: { cam: [0.3, 1.0, -4.2], look: [0, 0.45, -2.0], fov: 40 },
  seat: { cam: [0.6, 1.2, -0.2], look: [0.4, 0.6, 0.2], fov: 60, cockpit: true },
  handle: { cam: [0.6, 1.2, -0.2], look: [0.4, 0.9, 0.45], fov: 60, cockpit: true },
};

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
  void loadCarTemplate().then((template) => {
    const inst = instantiateCar(template, look);
    car.add(inst);
    car.userData = inst.userData;
    // 運転席の内装は、ハンドルとシートを選んだときと一人称のときだけ見せる
    (inst.userData as CarParts).cockpit.visible = false;
    if (target?.noFrontTire) {
      // 前の二つのタイヤ (前は +Z) を外すと、中のブレーキが見える
      car.updateMatrixWorld(true);
      const spinners = [...(inst.userData as CarParts).spinners].sort(
        (a, b) => b.getWorldPosition(new THREE.Vector3()).z - a.getWorldPosition(new THREE.Vector3()).z,
      );
      for (const sp of spinners.slice(0, 2)) sp.getObjectByName('tire')?.removeFromParent();
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
    const k = Math.min(1, dt * 4);
    const parts = car.userData as Partial<CarParts>;
    // ボンネット: エンジン・ターボを選んだときは開けたままにする。そうでなければ、エンジン交換の開閉
    if (parts.hinge) {
      const want = target?.hood ? -OPEN_ANGLE : -lidAngle((now - swapStart) / 1000);
      parts.hinge.rotation.z += (want - parts.hinge.rotation.z) * Math.min(1, dt * 6);
    }
    // 一人称・運転席の見せ方のとき、車体は隠して内装を見せる
    const interior = firstPerson || !!target?.cockpit;
    if (parts.body) parts.body.visible = !interior;
    if (parts.cockpit) parts.cockpit.visible = interior;
    // 寄せる先
    let posGoal = new THREE.Vector3(6.4, 3.0, 8.4);
    let lookGoal = new THREE.Vector3(0, 0.7, -0.3);
    let fov = 35;
    if (firstPerson) {
      posGoal = new THREE.Vector3(0.6, 1.2, -0.2);
      lookGoal = new THREE.Vector3(0, 1.3, 30);
      fov = 72;
    } else if (target) {
      posGoal = new THREE.Vector3(...target.cam);
      lookGoal = new THREE.Vector3(...target.look);
      fov = target.fov;
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
