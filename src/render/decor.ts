import * as THREE from 'three';
import type { Track } from '../game/track';
import { SAMPLES, tangentAt } from '../game/track';
import type { DecorationConfig } from '../game/config';

// 飾り物を、道の周りに並べる (コースの中には置かない)。種類ごとに形を作り、同じ形は使い回す
export function buildDecorations(track: Track, list: DecorationConfig[]): THREE.Group {
  const group = new THREE.Group();
  const half = track.course.width / 2;
  const dummy = new THREE.Object3D();
  // 乱数は種を決めて、毎回同じ並びにする
  let seed = track.length * 3 + 11;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const clear = (x: number, z: number, r: number): boolean => {
    const lim = r * r;
    for (const q of track.pts) {
      const dx = q.x - x;
      const dz = q.z - z;
      if (dx * dx + dz * dz < lim) return false;
    }
    return true;
  };
  const shapes = makeShapes();

  for (const item of list) {
    const make = shapes[item.kind];
    if (!make) continue;
    const count = Math.round(Math.max(0, Math.min(100, item.density)) * 0.6);
    for (let k = 0; k < count; k++) {
      const i = Math.floor(rnd() * SAMPLES);
      const p = track.pts[i];
      const t = tangentAt(track.pts, i);
      const side = rnd() < 0.5 ? 1 : -1;
      const o = side * (half + 14 + rnd() * 34);
      const x = p.x - t.z * o;
      const z = p.z + t.x * o;
      if (!clear(x, z, half + 8)) continue;
      const obj = make();
      obj.scale.setScalar(SIZE);
      obj.position.set(x, 0, z);
      obj.rotation.y = rnd() * Math.PI * 2;
      group.add(obj);
    }
  }
  return group;
}

// 飾り物の形 (種類ごとに、作る関数を返す)。細かい部分まで作り、全体は見やすい大きさにする
const SIZE = 2.4; // 飾り物の大きさ (全体に掛ける倍率)

function makeShapes(): Record<string, () => THREE.Group> {
  const orange = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.55 });
  const orangeDark = new THREE.MeshStandardMaterial({ color: 0xd9560a, roughness: 0.6 });
  const green = new THREE.MeshStandardMaterial({ color: 0x3f7d2a, roughness: 0.8 });
  const glow = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffb300, emissiveIntensity: 1.2 });
  const ghost = new THREE.MeshStandardMaterial({ color: 0xf4f6ff, transparent: true, opacity: 0.88, roughness: 0.35 });
  const black = new THREE.MeshStandardMaterial({ color: 0x17121d, roughness: 0.9 });
  const pole = new THREE.MeshStandardMaterial({ color: 0x59636d, metalness: 0.6, roughness: 0.45 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 0.8, roughness: 0.3 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
  const carrot = new THREE.MeshStandardMaterial({ color: 0xff8a1a, roughness: 0.6 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.5 });
  const scarf = new THREE.MeshStandardMaterial({ color: 0xd32f2f, roughness: 0.8 });
  const balloons = [0xff4d6d, 0x4dabff, 0xffd23f, 0x7bed9f, 0xb388ff].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35 }));
  const flagMats = [0xc62828, 0x1e88e5, 0xfdd835, 0x2e7d32].map((c) => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.7 }));
  const eyeGeo = new THREE.ConeGeometry(0.16, 0.34, 3);
  let n = 0;
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };
  return {
    pumpkin: () => {
      const g = new THREE.Group();
      // 縦の筋が入った実の部分 (6 枚の楕円を重ねる)
      for (let i = 0; i < 6; i++) {
        const seg = mesh(new THREE.SphereGeometry(0.9, 14, 10), i % 2 ? orange : orangeDark, 0, 0.85, 0);
        seg.scale.set(0.45, 0.78, 0.9);
        seg.rotation.y = (i / 6) * Math.PI;
        g.add(seg);
      }
      // ヘタと葉
      g.add(mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.42, 7), green, 0, 1.85, 0));
      const leaf = mesh(new THREE.SphereGeometry(0.22, 8, 6), green, 0.28, 1.95, 0);
      leaf.scale.set(1.6, 0.4, 0.9);
      g.add(leaf);
      // 顔 (目と口を光らせる)
      for (const x of [-0.28, 0.28]) {
        const eye = mesh(eyeGeo, glow, x, 0.95, 0.74);
        eye.rotation.z = x < 0 ? 0.3 : -0.3;
        g.add(eye);
      }
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.14, 0.1), glow, 0, 0.5, 0.78));
      return g;
    },
    ghost: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.SphereGeometry(1.0, 16, 12), ghost, 0, 3.4, 0));
      // 体の下のすそ (三角の波)
      for (let i = 0; i < 4; i++) {
        const tail = mesh(new THREE.ConeGeometry(0.36, 1.1, 8), ghost, -0.75 + i * 0.5, 1.6, 0);
        tail.rotation.x = Math.PI;
        g.add(tail);
      }
      const eyeL = mesh(new THREE.SphereGeometry(0.12, 8, 6), black, -0.36, 3.5, 0.9);
      const eyeR = mesh(new THREE.SphereGeometry(0.12, 8, 6), black, 0.36, 3.5, 0.9);
      const mouth = mesh(new THREE.SphereGeometry(0.2, 8, 6), black, 0, 3.05, 0.92);
      mouth.scale.set(1, 1.3, 0.4);
      g.add(eyeL, eyeR, mouth);
      return g;
    },
    bat: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.SphereGeometry(0.32, 10, 8), black, 0, 4.6, 0));
      for (const side of [-1, 1]) {
        // 羽: 波のあるふち (三角を並べる)
        for (let i = 0; i < 3; i++) {
          const f = mesh(new THREE.ConeGeometry(0.42, 1.0, 3), black, side * (0.55 + i * 0.5), 4.6, 0.1 - i * 0.05);
          f.rotation.z = side * Math.PI / 2;
          f.rotation.x = 0.25;
          f.scale.set(1, 1, 0.35);
          g.add(f);
        }
      }
      for (const side of [-1, 1]) g.add(mesh(new THREE.ConeGeometry(0.07, 0.25, 4), black, side * 0.14, 4.95, 0));
      return g;
    },
    balloon: () => {
      const g = new THREE.Group();
      const color = balloons[n++ % balloons.length];
      const ball = mesh(new THREE.SphereGeometry(1.25, 16, 12), color, 0, 8.2, 0);
      ball.scale.set(1, 1.15, 1);
      const knot = mesh(new THREE.ConeGeometry(0.16, 0.34, 6), color, 0, 6.8, 0);
      knot.rotation.x = Math.PI;
      const shine = mesh(new THREE.SphereGeometry(0.22, 8, 6), white, -0.42, 8.9, 0.8);
      shine.scale.set(1, 1.4, 0.5);
      const string = mesh(new THREE.CylinderGeometry(0.03, 0.03, 6.4, 4), black, 0, 3.4, 0);
      g.add(ball, knot, shine, string);
      return g;
    },
    lantern: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.12, 0.16, 5, 8), pole, 0, 2.5, 0));
      g.add(mesh(new THREE.BoxGeometry(0.14, 0.14, 1.4), pole, 0, 5.1, 0));
      // ちょうちん (明るい箱と、その枠)
      g.add(mesh(new THREE.BoxGeometry(0.9, 1.0, 0.9), glow, 0, 4.3, 0));
      for (const [x, z] of [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]]) {
        g.add(mesh(new THREE.BoxGeometry(0.1, 1.06, 0.1), gold, x, 4.3, z));
      }
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.1, 1.0), gold, 0, 4.85, 0));
      g.add(mesh(new THREE.BoxGeometry(1.0, 0.1, 1.0), gold, 0, 3.75, 0));
      return g;
    },
    flag: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 7.5, 8), pole, 0, 3.75, 0));
      g.add(mesh(new THREE.SphereGeometry(0.2, 8, 6), gold, 0, 7.6, 0));
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5, 6, 2), flagMats[n++ % flagMats.length]);
      cloth.position.set(1.25, 6.2, 0);
      // 旗のはためき: 端を少し波打たせる
      const pos = cloth.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, Math.sin((x + 1.2) * 2.2) * 0.18 * (x + 1.2) / 2.4);
      }
      g.add(cloth);
      return g;
    },
    snowman: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.SphereGeometry(1.2, 14, 10), white, 0, 1.2, 0));
      g.add(mesh(new THREE.SphereGeometry(0.85, 14, 10), white, 0, 3.2, 0));
      g.add(mesh(new THREE.SphereGeometry(0.6, 12, 8), white, 0, 4.6, 0));
      // 帽子
      g.add(mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 12), black, 0, 5.1, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.6, 12), black, 0, 5.4, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 12), red, 0, 5.2, 0));
      // 鼻・目・ボタン・マフラー
      const nose = mesh(new THREE.ConeGeometry(0.1, 0.55, 6), carrot, 0, 4.6, 0.6);
      nose.rotation.x = Math.PI / 2;
      g.add(nose);
      for (const x of [-0.2, 0.2]) g.add(mesh(new THREE.SphereGeometry(0.07, 6, 5), black, x, 4.8, 0.5));
      for (const y of [2.4, 3.2, 1.6]) g.add(mesh(new THREE.SphereGeometry(0.1, 6, 5), black, 0, y, 0.95));
      g.add(mesh(new THREE.TorusGeometry(0.66, 0.1, 6, 14), scarf, 0, 3.95, 0));
      const tail = mesh(new THREE.BoxGeometry(0.2, 0.8, 0.12), scarf, 0.5, 3.4, 0.55);
      g.add(tail);
      // 腕 (枝)
      for (const side of [-1, 1]) {
        const arm = mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 5), black, side * 1.3, 3.0, 0);
        arm.rotation.z = side * 0.9;
        g.add(arm);
      }
      return g;
    },
  };
}
