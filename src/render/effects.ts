import * as THREE from 'three';

// 光や煙の粒 (ぼんやりした丸い絵) を作る。stops は [位置 0〜1, 色] の並び
const textureCache = new Map<string, THREE.CanvasTexture>();
export function radialTexture(key: string, stops: [number, string][]): THREE.CanvasTexture {
  const cached = textureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(canvas);
  textureCache.set(key, tex);
  return tex;
}

// 火の粒 (明るい芯から、外へ向けて赤く消える)
export function fireTexture(): THREE.CanvasTexture {
  return radialTexture('fire', [
    [0, 'rgba(255,250,220,1)'],
    [0.3, 'rgba(255,190,70,0.95)'],
    [0.65, 'rgba(255,90,20,0.6)'],
    [1, 'rgba(255,40,0,0)'],
  ]);
}

// 煙の粒 (濃い色、白っぽい色)
export function smokeTexture(dark: boolean): THREE.CanvasTexture {
  return dark
    ? radialTexture('smoke-dark', [
        [0, 'rgba(70,70,74,0.9)'],
        [0.6, 'rgba(45,45,50,0.55)'],
        [1, 'rgba(30,30,34,0)'],
      ])
    : radialTexture('smoke-light', [
        [0, 'rgba(235,235,235,0.85)'],
        [0.6, 'rgba(205,205,205,0.45)'],
        [1, 'rgba(190,190,190,0)'],
      ]);
}

// 粒の集まり: 生まれて、大きくなり、薄れて消える。位置・速さ・大きさは個別に決まる
interface Particle {
  sprite: THREE.Sprite;
  age: number;
  life: number;
  v: THREE.Vector3;
  size0: number;
  size1: number;
  opacity0: number;
  drag: number; // 空気の抵抗 (速さを徐々に弱める)
}

export class Particles {
  readonly group = new THREE.Group();
  private list: Particle[] = [];

  add(opts: {
    pos: THREE.Vector3;
    v: THREE.Vector3;
    life: number;
    size0: number;
    size1: number;
    texture: THREE.Texture;
    opacity?: number;
    additive?: boolean;
    drag?: number;
    color?: number;
  }): void {
    const mat = new THREE.SpriteMaterial({
      map: opts.texture,
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      color: opts.color ?? 0xffffff,
      opacity: opts.opacity ?? 1,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(opts.pos);
    sprite.scale.setScalar(opts.size0);
    this.group.add(sprite);
    this.list.push({
      sprite,
      age: 0,
      life: opts.life,
      v: opts.v.clone(),
      size0: opts.size0,
      size1: opts.size1,
      opacity0: opts.opacity ?? 1,
      drag: opts.drag ?? 0.6,
    });
  }

  update(dt: number): void {
    this.list = this.list.filter((p) => {
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        this.group.remove(p.sprite);
        (p.sprite.material as THREE.SpriteMaterial).dispose();
        return false;
      }
      p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.sprite.position.addScaledVector(p.v, dt);
      p.sprite.scale.setScalar(p.size0 + (p.size1 - p.size0) * t);
      (p.sprite.material as THREE.SpriteMaterial).opacity = p.opacity0 * (1 - t) * (1 - t);
      return true;
    });
  }

  get alive(): number {
    return this.list.length;
  }

  clear(): void {
    for (const p of this.list) {
      this.group.remove(p.sprite);
      (p.sprite.material as THREE.SpriteMaterial).dispose();
    }
    this.list = [];
  }
}
