import * as THREE from 'three';
import type { Track } from '../game/track';
import { SAMPLES, tangentAt } from '../game/track';
import type { CustomDecor, DecorationConfig } from '../game/config';

// 運営が書いたカスタム飾り。THREE と mat (色から材質を作る) を受け取り、形を return する
type CustomMaker = (T: typeof THREE, mat: (color: number) => THREE.Material) => THREE.Object3D;

// 飾り物を、道の周りに並べる (コースの中には置かない)。種類ごとに形を作り、同じ形は使い回す
export function buildDecorations(track: Track, list: DecorationConfig[], customs: CustomDecor[] = []): THREE.Group {
  const group = new THREE.Group();
  const half = track.course.width / 2;
  const dummy = new THREE.Object3D();
  // 置く場所は毎回ランダム (レースのたびに、飾りの場所が変わる)
  const rnd = Math.random;
  const makers = new Map<string, CustomMaker | null>(customs.map((c) => [`custom:${c.id}`, compileCustom(c.code)]));
  const materials = new Map<number, THREE.Material>();
  const mat = (color: number): THREE.Material => {
    let m = materials.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
      materials.set(color, m);
    }
    return m;
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
    const maker = makers.get(item.kind);
    const make = maker ? () => maker(THREE, mat) : shapes[item.kind];
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
      // カスタム飾りのコードが壊れていても、ゲームは止めずにその飾りだけ置かない
      let obj: THREE.Object3D;
      try {
        obj = make();
      } catch {
        continue;
      }
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
  const trunk = new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 0.9 });
  const rock = new THREE.MeshStandardMaterial({ color: 0x8d8d8d, roughness: 0.95 });
  const pink = new THREE.MeshStandardMaterial({ color: 0xffb7c5, roughness: 0.6 });
  const ice = new THREE.MeshStandardMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.8, roughness: 0.2, emissive: 0x1e88e5, emissiveIntensity: 0.3 });
  const rainbow = [0xe53935, 0xff9800, 0xffee58, 0x43a047, 0x1e88e5].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 }));
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
    star: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6), pole, 0, 1.7, 0));
      // 細い菱形を交差させて、四方に光る星
      const a = mesh(new THREE.OctahedronGeometry(1.1), gold, 0, 4.4, 0);
      a.scale.set(1.4, 1.4, 0.3);
      const b = mesh(new THREE.OctahedronGeometry(1.1), gold, 0, 4.4, 0);
      b.scale.set(1.4, 1.4, 0.3);
      b.rotation.z = Math.PI / 4;
      g.add(a, b);
      return g;
    },
    tree: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.3, 0.4, 1.2, 8), trunk, 0, 0.6, 0));
      for (const [r, y, h] of [[2.2, 1.5, 2.2], [1.7, 2.8, 2.0], [1.2, 4.0, 1.8]]) {
        g.add(mesh(new THREE.ConeGeometry(r, h, 10), green, 0, y, 0));
      }
      g.add(mesh(new THREE.SphereGeometry(0.3, 8, 6), gold, 0, 5.1, 0));
      for (const [x, y, z] of [[0.9, 2.0, 0.9], [-0.8, 3.0, 0.8], [0.5, 3.6, -0.9]]) {
        g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), red, x, y, z));
      }
      return g;
    },
    present: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(2, 2, 2), red, 0, 1, 0));
      // 金のリボン (十字に交わる帯) とちょうちょ結び
      g.add(mesh(new THREE.BoxGeometry(0.4, 2.04, 2.04), gold, 0, 1, 0));
      g.add(mesh(new THREE.BoxGeometry(2.04, 2.04, 0.4), gold, 0, 1, 0));
      g.add(mesh(new THREE.SphereGeometry(0.35, 8, 6), gold, 0, 2.3, 0));
      return g;
    },
    candy: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 6), white, 0, 1.5, 0));
      // 丸いキャンディと、白い渦巻き
      const disc = mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 20), red, 0, 3.8, 0);
      disc.rotation.x = Math.PI / 2;
      g.add(disc);
      g.add(mesh(new THREE.TorusGeometry(0.7, 0.18, 6, 20), white, 0, 3.8, 0.12));
      return g;
    },
    mushroom: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.5, 0.65, 1.8, 12), white, 0, 0.9, 0));
      const cap = mesh(new THREE.SphereGeometry(1.3, 16, 10), red, 0, 2.1, 0);
      cap.scale.set(1, 0.6, 1);
      g.add(cap);
      // かさの白い水玉
      for (const [x, y, z] of [[0.6, 2.6, 0.6], [-0.7, 2.5, 0.5], [0.1, 2.9, -0.5]]) {
        g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), white, x, y, z));
      }
      return g;
    },
    cactus: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.4, 0.45, 4, 10), green, 0, 2, 0));
      for (const side of [-1, 1]) {
        // 横に伸びて、上に曲がる腕
        const arm = mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.2, 8), green, side * 0.9, 2.3, 0);
        arm.rotation.z = Math.PI / 2;
        g.add(arm, mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.4, 8), green, side * 1.5, 2.95, 0));
      }
      return g;
    },
    palm: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.3, 5.5, 8), trunk, 0, 2.75, 0));
      // 幹の先に、5 枚の葉を放射状に付ける
      const top = new THREE.Group();
      top.position.y = 5.5;
      for (let i = 0; i < 5; i++) {
        const leafGroup = new THREE.Group();
        leafGroup.rotation.y = (i / 5) * Math.PI * 2;
        const leaf = mesh(new THREE.ConeGeometry(0.5, 2.6, 4), green, 1.3, -0.2, 0);
        leaf.rotation.z = -Math.PI / 2;
        leafGroup.add(leaf);
        top.add(leafGroup);
      }
      g.add(top);
      return g;
    },
    cone: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(2, 0.2, 2), black, 0, 0.1, 0));
      g.add(mesh(new THREE.ConeGeometry(0.85, 2.4, 16), orange, 0, 1.4, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.52, 0.6, 0.4, 16), white, 0, 1.3, 0));
      return g;
    },
    cherry: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.25, 0.4, 3.2, 8), trunk, 0, 1.6, 0));
      // 花のかたまり (桜の花びら)
      for (const [x, y, z, r] of [[0, 4.2, 0, 1.5], [-1.2, 3.5, 0.3, 1.0], [1.2, 3.6, -0.2, 1.0], [0.3, 5.0, 0.4, 1.1]]) {
        g.add(mesh(new THREE.SphereGeometry(r, 10, 8), pink, x, y, z));
      }
      return g;
    },
    torii: () => {
      const g = new THREE.Group();
      for (const x of [-2.2, 2.2]) g.add(mesh(new THREE.CylinderGeometry(0.25, 0.28, 5, 8), red, x, 2.5, 0));
      g.add(mesh(new THREE.BoxGeometry(6.4, 0.5, 0.6), red, 0, 5.1, 0));
      g.add(mesh(new THREE.BoxGeometry(7.4, 0.4, 0.8), black, 0, 5.8, 0));
      return g;
    },
    toro: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), stone, 0, 0.25, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.6, 8), stone, 0, 1.3, 0));
      g.add(mesh(new THREE.BoxGeometry(1.2, 0.8, 1.2), stone, 0, 2.5, 0));
      // あかりの窓
      g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1), glow, 0, 2.5, 0.62));
      const roof = mesh(new THREE.ConeGeometry(1.2, 0.9, 4), stone, 0, 3.4, 0);
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      return g;
    },
    daruma: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.SphereGeometry(1.4, 16, 12), red, 0, 1.6, 0));
      g.add(mesh(new THREE.SphereGeometry(0.9, 12, 10), white, 0, 2.6, 0.7));
      for (const x of [-0.35, 0.35]) g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), black, x, 2.7, 1.5));
      return g;
    },
    firework: () => {
      const g = new THREE.Group();
      g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 4), pole, 0, 2.2, 0));
      // 光の粒が円に広がり、中心が光る
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.add(mesh(new THREE.SphereGeometry(0.3, 6, 5), balloons[i % balloons.length], Math.cos(a) * 1.8, 5.2 + Math.sin(a) * 1.8, 0));
      }
      g.add(mesh(new THREE.SphereGeometry(0.5, 8, 6), glow, 0, 5.2, 0));
      return g;
    },
    rainbow: () => {
      const g = new THREE.Group();
      // 半円を内側から外側へ、色の違う細い輪を重ねる
      rainbow.forEach((m, i) => {
        g.add(mesh(new THREE.TorusGeometry(4 - i * 0.5, 0.26, 6, 24, Math.PI), m, 0, 0.3, 0));
      });
      return g;
    },
    cloud: () => {
      const g = new THREE.Group();
      for (const [x, y, r] of [[0, 5, 1.3], [-1.3, 4.6, 1.0], [1.3, 4.6, 1.0], [0.6, 5.6, 1.0], [-0.6, 5.5, 0.9]]) {
        g.add(mesh(new THREE.SphereGeometry(r, 12, 10), white, x, y, 0));
      }
      return g;
    },
    rock: () => {
      const g = new THREE.Group();
      const big = mesh(new THREE.DodecahedronGeometry(1.4), rock, 0, 1.0, 0);
      big.scale.set(1.2, 0.8, 1.0);
      g.add(big, mesh(new THREE.DodecahedronGeometry(0.8), rock, 1.6, 0.5, 0.9));
      return g;
    },
    penguin: () => {
      const g = new THREE.Group();
      const body = mesh(new THREE.SphereGeometry(1.3, 14, 10), black, 0, 1.7, 0);
      body.scale.set(1, 1.2, 0.9);
      g.add(body);
      const belly = mesh(new THREE.SphereGeometry(0.9, 12, 10), white, 0, 1.7, 1.0);
      belly.scale.set(0.8, 1.1, 0.4);
      g.add(belly);
      for (const x of [-0.4, 0.4]) {
        g.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), white, x, 2.85, 1.0));
        g.add(mesh(new THREE.SphereGeometry(0.12, 6, 5), black, x, 2.85, 1.15));
      }
      const beak = mesh(new THREE.ConeGeometry(0.2, 0.5, 6), carrot, 0, 2.5, 1.35);
      beak.rotation.x = Math.PI / 2;
      g.add(beak);
      for (const x of [-0.5, 0.5]) g.add(mesh(new THREE.BoxGeometry(0.5, 0.15, 0.9), carrot, x, 0.08, 0.4));
      return g;
    },
    crystal: () => {
      const g = new THREE.Group();
      const big = mesh(new THREE.OctahedronGeometry(1.0), ice, 0, 2.4, 0);
      big.scale.set(0.8, 2.4, 0.8);
      const side1 = mesh(new THREE.OctahedronGeometry(0.6), ice, 1.1, 0.9, 0.5);
      side1.scale.set(0.7, 1.5, 0.7);
      const side2 = mesh(new THREE.OctahedronGeometry(0.5), ice, -1.0, 0.7, -0.4);
      side2.scale.set(0.7, 1.4, 0.7);
      g.add(big, side1, side2);
      return g;
    },
    bunting: () => {
      const g = new THREE.Group();
      for (const x of [-3, 3]) g.add(mesh(new THREE.CylinderGeometry(0.1, 0.12, 4.5, 6), pole, x, 2.25, 0));
      // 上の綱に、三角の旗を並べる
      const rope = mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 4), black, 0, 4.0, 0);
      rope.rotation.z = Math.PI / 2;
      g.add(rope);
      for (let i = 0; i < 5; i++) {
        const flag = mesh(new THREE.ConeGeometry(0.45, 0.9, 3), flagMats[i % flagMats.length], -2 + i, 3.5, 0);
        flag.rotation.z = Math.PI;
        g.add(flag);
      }
      return g;
    },
    tire: () => {
      const g = new THREE.Group();
      // 黒いタイヤを 3 段に積む
      for (let i = 0; i < 3; i++) {
        const tire = mesh(new THREE.TorusGeometry(0.9, 0.36, 8, 16), black, (i % 2) * 0.15, 0.4 + i * 0.7, 0);
        tire.rotation.x = Math.PI / 2;
        g.add(tire);
      }
      return g;
    },
  };
}

// カスタム飾りのコードを関数にする。書き方が間違っていれば null (その飾りは置かない)
function compileCustom(code: string): CustomMaker | null {
  try {
    return new Function('THREE', 'mat', code) as CustomMaker;
  } catch {
    return null;
  }
}
