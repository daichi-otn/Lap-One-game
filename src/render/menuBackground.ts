import * as THREE from 'three';
import { instantiateCar, loadCarTemplate } from './carModel';
import { NEUTRAL_MODS } from '../game/parts';

// メニューの背景: 3D のスポーツカーが横を走り抜ける。host の中に描画し、返り値で止める
export function startMenuBackground(host: HTMLElement): () => void {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // 遠くは霧で暗くして、メニューの背景色に溶け込ませる
  scene.fog = new THREE.Fog(0x101820, 22, 75);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);
  camera.position.set(0, 3.2, 14);
  camera.lookAt(0, 0.6, -8);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.3));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(10, 20, 15);
  scene.add(sun);

  // 路面と、流れていく白い破線
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 60),
    new THREE.MeshStandardMaterial({ color: 0x1b2028, roughness: 0.9 }),
  );
  road.rotation.x = -Math.PI / 2;
  scene.add(road);
  const dashes: THREE.Mesh[] = [];
  const dashGeo = new THREE.BoxGeometry(4, 0.02, 0.25);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, emissive: 0x222222 });
  for (let i = 0; i < 24; i++) {
    const d = new THREE.Mesh(dashGeo, dashMat);
    d.position.set(-50 + i * 8, 0.01, -8.5);
    scene.add(d);
    dashes.push(d);
  }

  // 車: 手前の車ほど速く、大きく見える
  const lanes = [
    { z: -7, speed: 13, color: 0x4f5b66 },
    { z: -10, speed: 19, color: 0xffb300 },
    { z: -13, speed: 11, color: 0x67e8f9 },
    { z: -16, speed: 17, color: 0xff5252 },
    { z: -19, speed: 9, color: 0xb388ff },
  ];
  const cars = lanes.map((lane, i) => {
    const car = new THREE.Group();
    car.rotation.y = Math.PI / 2; // 進行方向 (+X) を向ける
    void loadCarTemplate().then((template) => {
      car.add(instantiateCar(template));
    });
    car.position.set(-40 + i * 14, 0, lane.z);
    scene.add(car);
    return { car, speed: lane.speed };
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

  let last = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const c of cars) {
      c.car.position.x += c.speed * dt;
      if (c.car.position.x > 45) c.car.position.x -= 90;
    }
    for (const d of dashes) {
      d.position.x += 22 * dt;
      if (d.position.x > 50) d.position.x -= 200;
    }
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    observer.disconnect();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
