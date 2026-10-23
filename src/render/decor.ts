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
      dummy.position.set(x, 0, z);
      obj.position.copy(dummy.position);
      obj.rotation.y = rnd() * Math.PI * 2;
      group.add(obj);
    }
  }
  return group;
}

// 飾り物の形 (種類ごとに、作る関数を返す)
function makeShapes(): Record<string, () => THREE.Group> {
  const orange = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 });
  const green = new THREE.MeshStandardMaterial({ color: 0x3f7d2a, roughness: 0.8 });
  const ghost = new THREE.MeshStandardMaterial({ color: 0xf2f4ff, transparent: true, opacity: 0.85, roughness: 0.4 });
  const black = new THREE.MeshStandardMaterial({ color: 0x14101a, roughness: 0.9 });
  const pole = new THREE.MeshStandardMaterial({ color: 0x59636d, metalness: 0.6, roughness: 0.5 });
  const lamp = new THREE.MeshStandardMaterial({ color: 0xffd27a, emissive: 0xffa640, emissiveIntensity: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  const carrot = new THREE.MeshStandardMaterial({ color: 0xff8a1a });
  const balloons = [0xff4d6d, 0x4dabff, 0xffd23f, 0x7bed9f].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 }));
  const flagMats = [0xc62828, 0x1e88e5, 0xfdd835].map((c) => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide }));
  const flagPole = new THREE.CylinderGeometry(0.08, 0.1, 6, 6);
  let n = 0;
  return {
    pumpkin: () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 14, 10), orange);
      body.position.y = 0.8;
      body.scale.y = 0.8;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.35, 6), green);
      stem.position.y = 1.75;
      g.add(body, stem);
      return g;
    },
    ghost: () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 10), ghost);
      body.position.y = 3.2;
      const bottom = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.6, 12), ghost);
      bottom.position.y = 1.2;
      bottom.rotation.x = Math.PI;
      g.add(body, bottom);
      return g;
    },
    bat: () => {
      const g = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.4, 3), black);
      wing.rotation.z = Math.PI / 2;
      wing.scale.set(1, 1, 0.4);
      wing.position.y = 4.5;
      g.add(wing);
      return g;
    },
    balloon: () => {
      const g = new THREE.Group();
      const color = balloons[n++ % balloons.length];
      const ball = new THREE.Mesh(new THREE.SphereGeometry(1.1, 14, 10), color);
      ball.position.y = 7;
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 5.5, 4), black);
      string.position.y = 3.6;
      g.add(ball, string);
      return g;
    },
    lantern: () => {
      const g = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 4, 6), pole);
      post.position.y = 2;
      const light = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.7), lamp);
      light.position.y = 4.3;
      g.add(post, light);
      return g;
    },
    flag: () => {
      const g = new THREE.Group();
      const post = new THREE.Mesh(flagPole, pole);
      post.position.y = 3;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), flagMats[n++ % flagMats.length]);
      cloth.position.set(0.9, 5.2, 0);
      g.add(post, cloth);
      return g;
    },
    snowman: () => {
      const g = new THREE.Group();
      const low = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), white);
      low.position.y = 1;
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), white);
      top.position.y = 2.6;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5, 6), carrot);
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, 2.6, 0.75);
      g.add(low, top, nose);
      return g;
    },
  };
}
