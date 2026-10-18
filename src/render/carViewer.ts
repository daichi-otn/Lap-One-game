import * as THREE from 'three';
import { HOOD_OPEN_ANGLE, instantiateCar, loadCarTemplate, type CarParts, type Look } from './carModel';
import type { Mods } from '../game/parts';

export interface CarViewer {
  stop(): void;
}

const OPEN_ANGLE = HOOD_OPEN_ANGLE; // ボンネットを開く角度 (rad)
const OPEN_TIME = 0.7; // 開く・閉じるのにかかる時間 (秒)
const HOLD_TIME = 1.4; // 開いたままにする時間 (秒)

// ガレージの左に映す自分の車。engineSwap が true のときは、ボンネットを開けてエンジンを見せる
export function startCarViewer(host: HTMLElement, color: number, mods: Mods, engineSwap: boolean, look: Look = {}): CarViewer {
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
  const car = new THREE.Group();
  scene.add(car);
  void loadCarTemplate().then((template) => {
    const inst = instantiateCar(template, look);
    car.add(inst);
    car.userData = inst.userData;
    // ガレージでは運転席の内装は見せない (一人称のときだけ)
    (inst.userData as CarParts).cockpit.visible = false;
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

  let raf = 0;
  const frame = (now: number) => {
    const parts = car.userData as Partial<CarParts>;
    if (parts.hinge) parts.hinge.rotation.z = -lidAngle((now - swapStart) / 1000);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return {
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
