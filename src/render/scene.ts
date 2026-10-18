import * as THREE from 'three';
import type { Track } from '../game/track';
import { SAMPLES, pitLaneOffset, tangentAt } from '../game/track';
import type { CarState } from '../game/car';
import type { WeatherEffect } from '../game/weather';
import type { Quality } from '../game/save';
import { instantiateCar, loadCarTemplate, WHEEL_SPIN_RADIUS, type CarParts } from './carModel';
import type { Impact } from '../game/car';
import type { NavScreen } from './cockpit';

const QUALITY: Record<Quality, { pixelRatio: number; shadows: boolean; drops: number }> = {
  low: { pixelRatio: 1, shadows: false, drops: 300 },
  medium: { pixelRatio: 1.5, shadows: true, drops: 800 },
  high: { pixelRatio: 2, shadows: true, drops: 1600 },
};

const RAIN_RANGE = 60;
const RAIN_HEIGHT = 30;
const RAIN_SPEED = 35;

// 爆発: 火の玉と衝撃の輪、飛び散る破片。その後、ガソリンの水たまり・くすぶる火・破片が残る
class Explosion {
  readonly group = new THREE.Group();
  private age = 0;
  private fire: THREE.Mesh;
  private ring: THREE.Mesh;
  private debris: { mesh: THREE.Mesh; v: THREE.Vector3 }[] = [];
  private readonly life = 1.6; // 爆発の見た目の長さ
  private readonly wreckLife = 22; // 残骸 (水たまり・火・破片) が残る長さ
  private flames: THREE.Mesh[] = [];
  private puddle: THREE.Mesh;

  constructor(x: number, z: number) {
    this.group.position.set(x, 0.6, z);
    this.fire = new THREE.Mesh(
      new THREE.SphereGeometry(1, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.75, 36),
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.group.add(this.fire, this.ring);
    // ガソリンの水たまり: 黒く光沢のある円盤 (地面すれすれ)
    this.puddle = new THREE.Mesh(
      new THREE.CircleGeometry(1.8, 40),
      new THREE.MeshPhysicalMaterial({ color: 0x14140e, roughness: 0.12, metalness: 0.5, clearcoat: 1, transparent: true, opacity: 0.92 }),
    );
    this.puddle.rotation.x = -Math.PI / 2;
    this.puddle.position.y = -0.55;
    this.puddle.visible = false;
    this.group.add(this.puddle);
    // くすぶる火: 残骸のまわりでゆらぐ炎
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8c2a, transparent: true, opacity: 0.85, depthWrite: false });
    for (let i = 0; i < 7; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 10), flameMat);
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 1.4;
      f.position.set(Math.cos(a) * r, -0.05, Math.sin(a) * r);
      f.visible = false;
      this.group.add(f);
      this.flames.push(f);
    }
    const debrisMat = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7 });
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.3), debrisMat);
      const a = Math.random() * Math.PI * 2;
      const up = 3 + Math.random() * 5;
      const speed = 4 + Math.random() * 6;
      this.group.add(mesh);
      this.debris.push({ mesh, v: new THREE.Vector3(Math.cos(a) * speed, up, Math.sin(a) * speed) });
    }
  }

  // 戻り値: まだ見せるなら true
  update(dt: number): boolean {
    this.age += dt;
    const t = Math.min(1, this.age / this.life);
    const grow = Math.min(1, this.age * 5);
    this.fire.scale.setScalar(0.4 + 2.2 * grow * (1 - t * 0.5));
    (this.fire.material as THREE.MeshBasicMaterial).opacity = 0.95 * (1 - t);
    this.ring.scale.setScalar(1 + this.age * 9);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - t);
    for (const d of this.debris) {
      d.v.y -= 9.8 * dt;
      d.mesh.position.addScaledVector(d.v, dt);
      // 地面 (爆発の位置は地面より 0.6m 上)
      if (d.mesh.position.y < -0.6 + 0.09) {
        d.mesh.position.y = -0.6 + 0.09;
        d.v.set(0, 0, 0);
      }
      d.mesh.rotation.x += dt * 8;
      d.mesh.rotation.z += dt * 6;
    }
    // 残骸: 水たまりと火は、しばらく残ってから消える
    const wreck = this.age > this.life;
    this.puddle.visible = wreck;
    for (const f of this.flames) {
      f.visible = wreck;
      if (wreck) f.scale.set(1, 0.7 + Math.random() * 0.8, 1);
    }
    const fade = Math.min(1, Math.max(0, (this.wreckLife - this.age) / 3));
    (this.puddle.material as THREE.MeshPhysicalMaterial).opacity = 0.92 * fade;
    for (const f of this.flames) (f.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade;
    this.fire.visible = this.age < this.life;
    this.ring.visible = this.age < this.life;
    return this.age < this.wreckLife;
  }
}

export class World {
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly scene = new THREE.Scene();
  // 自分の車の足元の目印 (暗い路面で車が埋もれないように、三人称のときだけ出す)
  private readonly marker = new THREE.Mesh(
    new THREE.RingGeometry(2.4, 2.9, 40),
    new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  private readonly camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 3000);
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.6);
  private readonly ground: THREE.Mesh;
  private road: THREE.Group | null = null;
  private rain: THREE.LineSegments | null = null;
  private rainOffsets = new Float32Array(0);
  private cars = new Map<CarState, THREE.Group>();
  private trackPts: THREE.Vector3[] = [];
  private trackWidth = 20;
  private exploded = new Set<CarState>();
  private normalsDirty = new Set<THREE.Mesh>();
  private normalsTimer = 0;
  private flying: { mesh: THREE.Object3D; v: THREE.Vector3; w: THREE.Vector3; age: number }[] = [];
  private explosions: Explosion[] = [];
  private quality: Quality = 'medium';
  private camPos = new THREE.Vector3();
  private snap = true;

  constructor(container: HTMLElement) {
    container.appendChild(this.renderer.domElement);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
    this.scene.add(this.sun, this.sun.target);
    this.sun.shadow.mapSize.set(1024, 1024);
    Object.assign(this.sun.shadow.camera, { left: -120, right: 120, top: 120, bottom: -120, near: 1, far: 400 });
    this.sun.shadow.camera.updateProjectionMatrix();

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshStandardMaterial({ color: 0x3a7d44 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.setQuality('medium');
  }

  setQuality(q: Quality): void {
    this.quality = q;
    const cfg = QUALITY[q];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cfg.pixelRatio));
    this.renderer.shadowMap.enabled = cfg.shadows;
    this.sun.castShadow = cfg.shadows;
  }

  setTrack(track: Track): void {
    this.trackPts = track.pts;
    this.trackWidth = track.course.width;
    if (this.road) this.scene.remove(this.road);
    this.road = buildRoad(track);
    this.scene.add(this.road);
    (this.ground.material as THREE.MeshStandardMaterial).color.setHex(track.course.ground);
    for (const group of this.cars.values()) this.scene.remove(group);
    this.cars.clear();
    // 前のレースの爆発・残骸・飛んだ部品も消す
    for (const e of this.explosions) this.scene.remove(e.group);
    this.explosions = [];
    for (const f of this.flying) this.scene.remove(f.mesh);
    this.flying = [];
    this.exploded.clear();
    this.normalsDirty.clear();
  }

  setWeather(w: WeatherEffect, vision: number): void {
    this.scene.background = new THREE.Color(w.sky);
    this.scene.fog = new THREE.Fog(w.sky, w.fogNear, w.fogFar * vision);
    this.sun.intensity = 1.6 - 0.9 * w.rain;
    this.buildRain(w.rain);
  }

  setCars(cars: CarState[]): void {
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.06;
    this.scene.add(this.marker);
    for (const [car, group] of this.cars) {
      if (!cars.includes(car)) {
        this.scene.remove(group);
        this.cars.delete(car);
      }
    }
    for (const car of cars) {
      if (this.cars.has(car)) continue;
      // 車のモデルは読み込みに少し時間がかかるので、読み終わってから中身を入れる
      const group = new THREE.Group();
      this.cars.set(car, group);
      this.scene.add(group);
      void loadCarTemplate().then((template) => {
        if (this.cars.get(car) !== group) return;
        const inst = instantiateCar(template, car.look);
        // 影は自分の車だけ落とす (車が多いと重くなるため)
        inst.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = car.isPlayer;
        });
        group.add(inst);
        group.userData = inst.userData; // 車体・内装・ボンネットの参照を外側のグループにも持たせる
      });
    }
    this.snap = true;
  }

  // ぶつかった場所を車体へへこませる (車ごと、場所の近くの頂点を内側へ押す)
  applyImpacts(list: { car: CarState; impact: Impact }[]): void {
    for (const { car, impact } of list) {
      const group = this.cars.get(car);
      const mesh = (group?.userData as Partial<CarParts> | undefined)?.bodyMesh;
      if (!group || !mesh) continue;
      group.updateMatrixWorld(true);
      // 衝突の場所と向きを、車体の座標へ変換する
      const at = mesh.worldToLocal(new THREE.Vector3(impact.x, 0.6, impact.z));
      const dir = mesh
        .worldToLocal(new THREE.Vector3(impact.x + impact.nx, 0.6, impact.z + impact.nz))
        .sub(at)
        .normalize();
      const radius = 0.22; // へこむ範囲 (車体の座標)
      const depth = Math.min(0.05, impact.strength * 0.002); // へこみの深さ
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      let changed = false;
      for (let i = 0; i < pos.count; i++) {
        const dx = pos.getX(i) - at.x;
        const dy = pos.getY(i) - at.y;
        const dz = pos.getZ(i) - at.z;
        const d = Math.hypot(dx, dy, dz);
        if (d >= radius) continue;
        const f = (1 - d / radius) ** 2;
        pos.setXYZ(i, pos.getX(i) - dir.x * depth * f, pos.getY(i) - dir.y * depth * f, pos.getZ(i) - dir.z * depth * f);
        changed = true;
      }
      if (changed) {
        pos.needsUpdate = true;
        this.normalsDirty.add(mesh);
      }
      // 強い衝突では、ぶつかった場所の部品が外れて飛ぶ (ボンネット・トランク・屋根)
      if (impact.strength > 8 && Math.random() < 0.5) this.detachPart(group, car, at, impact);
    }
  }

  // 外れる部品: 正面は「ボンネット、ライト、窓、屋根」の順、後ろは「トランク、ライト、窓、屋根」の順。
  // 横は、ぶつかった側のドアが外れる。強い衝突ごとに、順番の次の部品が外れる
  private detachPart(group: THREE.Group, car: CarState, at: THREE.Vector3, impact: Impact): void {
    const parts = group.userData as Partial<CarParts>;
    const d = parts.detachable;
    if (!d) return;
    const takeFirst = (queue: (() => THREE.Object3D | undefined)[]) => {
      for (const get of queue) {
        const p = get();
        if (p) return p;
      }
      return undefined;
    };
    const hood = () => {
      const p = d.hood;
      d.hood = undefined;
      return p;
    };
    const mesh = (key: 'trunk' | 'roof' | 'windshield' | 'rearWindow' | 'doorLeft' | 'doorRight') => () => {
      const p = d[key];
      d[key] = undefined;
      return p;
    };
    let target: THREE.Object3D | undefined;
    if (at.x < -0.3) {
      // 正面: ボンネット → ライト → 窓 → 屋根
      target = takeFirst([hood, () => this.takeLights(d, 'lightsFront'), mesh('windshield'), mesh('roof')]);
    } else if (at.x > 0.3) {
      // 後ろ: トランク → ライト → 窓 → 屋根
      target = takeFirst([mesh('trunk'), () => this.takeLights(d, 'lightsRear'), mesh('rearWindow'), mesh('roof')]);
    } else {
      // 横: ぶつかった側のドア
      target = at.z > 0 ? takeFirst([mesh('doorRight')]) : takeFirst([mesh('doorLeft')]);
    }
    if (!target) return;
    // 外れた部品は車の外へ。現在の位置・向きを保ったまま、シーンに付け替える
    if (target.parent) this.scene.attach(target);
    const v = new THREE.Vector3(-impact.nx * 5, 3 + Math.random() * 3, -impact.nz * 5);
    v.multiplyScalar(0.6 + Math.min(1, impact.strength / 20));
    this.flying.push({
      mesh: target,
      v,
      w: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
      age: 0,
    });
    void car;
  }

  // ライトは左右まとめて外れる (1 つの部品として扱う)
  private takeLights(d: NonNullable<CarParts['detachable']>, key: 'lightsFront' | 'lightsRear'): THREE.Object3D | undefined {
    const list = d[key];
    if (!list || list.length === 0) return undefined;
    d[key] = [];
    const holder = new THREE.Group();
    for (const l of list) {
      this.scene.attach(l);
      holder.add(l);
    }
    this.scene.add(holder);
    return holder;
  }

  // 飛んでいる部品: 重力で落ち、地面で転がって止まり、しばらくして消える
  private updateFlying(dt: number): void {
    this.flying = this.flying.filter((f) => {
      f.age += dt;
      f.v.y -= 9.8 * dt;
      f.mesh.position.addScaledVector(f.v, dt);
      f.mesh.rotation.x += f.w.x * dt;
      f.mesh.rotation.y += f.w.y * dt;
      f.mesh.rotation.z += f.w.z * dt;
      if (f.mesh.position.y < 0.05) {
        f.mesh.position.y = 0.05;
        f.v.set(f.v.x * 0.6, 0, f.v.z * 0.6);
        f.w.multiplyScalar(0.7);
      }
      if (f.age > 12) {
        this.scene.remove(f.mesh);
        return false;
      }
      return true;
    });
  }

  // 運転席の画面にナビ (地図) を描く。コースを、自分の車の向きに合わせて上向きに回す
  private drawNav(nav: NavScreen, car: CarState): void {
    const ctx = nav.canvas.getContext('2d');
    if (!ctx) return;
    const W = nav.canvas.width;
    const H = nav.canvas.height;
    const S = 0.32; // 1 m あたりの画素数
    const fx = Math.sin(car.heading);
    const fz = Math.cos(car.heading);
    const rx = Math.cos(car.heading);
    const rz = -Math.sin(car.heading);
    const toScreen = (x: number, z: number): [number, number] => {
      const dx = x - car.x;
      const dz = z - car.z;
      return [W / 2 + (dx * rx + dz * rz) * S, H / 2 - (dx * fx + dz * fz) * S];
    };
    ctx.fillStyle = '#0b1620';
    ctx.fillRect(0, 0, W, H);
    // 道路 (幅のある線) と中央の破線
    ctx.beginPath();
    this.trackPts.forEach((p, i) => {
      const [x, y] = toScreen(p.x, p.z);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#3a4650';
    ctx.lineWidth = this.trackWidth * S;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    // 自分の車 (画面の中央で、上が進行方向)
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#9fb0bf';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('NAV', 8, 18);
    nav.texture.needsUpdate = true;
  }

  // 画角を変えたら、投影行列を作り直す
  private setFov(fov: number): void {
    if (this.camera.fov === fov) return;
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  // 毎フレーム: 車の位置・カメラ・雨を更新
  frame(dt: number, player: CarState, firstPerson: boolean): void {
    for (const [car, group] of this.cars) {
      // 耐久が 0 になった車は爆発して消える (自分も CPU も同じ)
      // エンストで失格した車は爆発せず、そのまま止まる
      if (car.dnf && !car.stalled && !this.exploded.has(car)) {
        this.exploded.add(car);
        const boom = new Explosion(car.x, car.z);
        this.explosions.push(boom);
        this.scene.add(boom.group);
        group.visible = false;
      }
      group.position.set(car.x, 0, car.z);
      group.rotation.set(0, car.heading, 0);
      // 一人称のときは車体を隠し、運転席の内装だけを見せる
      const parts = group.userData as Partial<CarParts>;
      if (parts.body) {
        parts.body.visible = !(car.isPlayer && firstPerson);
        parts.cockpit!.visible = car.isPlayer && firstPerson;
      }
      // 一人称のときは、運転席の画面に地図を描く
      const nav = parts.cockpit?.userData.nav as NavScreen | undefined;
      if (car.isPlayer && firstPerson && nav) this.drawNav(nav, car);
      // タイヤは速さに合わせて回す
      for (const sp of parts.spinners ?? []) sp.rotation.z += (car.speed / WHEEL_SPIN_RADIUS) * dt;
      // ニトロ中はマフラーから炎を出す (少しずつ揺らす)
      for (const f of parts.flames ?? []) {
        f.visible = car.boosting;
        if (car.boosting) f.scale.set(1, 0.85 + Math.random() * 0.35, 0.85 + Math.random() * 0.35);
      }
    }

    const fx = Math.sin(player.heading);
    const fz = Math.cos(player.heading);
    this.marker.visible = !firstPerson;
    this.marker.position.x = player.x;
    this.marker.position.z = player.z;
    if (firstPerson) {
      // 運転席: 車の右側 (日本の右ハンドル車に合わせる) の頭の位置から前を見る
      const rx = Math.cos(player.heading);
      const rz = -Math.sin(player.heading);
      // 目の位置は座席の後ろ寄り。ダッシュボードとハンドルが視界の下に入るように、画角を少し広げる
      this.setFov(72);
      this.camera.position.set(player.x - fx * 0.2 - rx * 0.4, 1.5, player.z - fz * 0.2 - rz * 0.4);
      this.camera.lookAt(player.x + fx * 30, 1.3, player.z + fz * 30);
      this.camPos.copy(this.camera.position);
    } else {
      this.setFov(60);
      const desired = new THREE.Vector3(player.x - fx * 11, 5, player.z - fz * 11);
      if (this.snap) this.camPos.copy(desired);
      else this.camPos.lerp(desired, 1 - Math.exp(-6 * dt));
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(player.x + fx * 6, 1.2, player.z + fz * 6);
    }
    this.snap = false;

    this.sun.position.set(player.x + 40, 80, player.z + 30);
    this.sun.target.position.set(player.x, 0, player.z);
    this.updateRain(dt, player.x, player.z);
    this.updateExplosions(dt);
    this.updateFlying(dt);
    // へこんだ車体の法線は、まとめて計算する (毎回だと重い)
    this.normalsTimer += dt;
    if (this.normalsTimer > 0.2 && this.normalsDirty.size > 0) {
      for (const m of this.normalsDirty) m.geometry.computeVertexNormals();
      this.normalsDirty.clear();
      this.normalsTimer = 0;
    }
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  private buildRain(intensity: number): void {
    if (this.rain) {
      this.scene.remove(this.rain);
      this.rain.geometry.dispose();
      this.rain = null;
    }
    if (intensity <= 0) return;

    const count = Math.round(QUALITY[this.quality].drops * intensity);
    this.rainOffsets = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      this.rainOffsets[i * 3] = (Math.random() * 2 - 1) * RAIN_RANGE;
      this.rainOffsets[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
      this.rainOffsets[i * 3 + 2] = (Math.random() * 2 - 1) * RAIN_RANGE;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
    this.rain = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xbfd8ff, transparent: true, opacity: 0.45 }),
    );
    this.rain.frustumCulled = false;
    this.scene.add(this.rain);
  }

  private updateExplosions(dt: number): void {
    this.explosions = this.explosions.filter((e) => {
      const alive = e.update(dt);
      if (!alive) this.scene.remove(e.group);
      return alive;
    });
  }

  private updateRain(dt: number, cx: number, cz: number): void {
    if (!this.rain) return;
    const attr = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const count = this.rainOffsets.length / 3;
    for (let i = 0; i < count; i++) {
      let y = this.rainOffsets[i * 3 + 1] - RAIN_SPEED * dt;
      if (y < 0) y += RAIN_HEIGHT;
      this.rainOffsets[i * 3 + 1] = y;
      const x = cx + this.rainOffsets[i * 3];
      const z = cz + this.rainOffsets[i * 3 + 2];
      arr.set([x, y, z, x, y + 0.8, z], i * 6);
    }
    attr.needsUpdate = true;
  }
}

// ピットへの道 (分かれ道): 道の右側へ広がり、また道に戻る
function buildPitRoad(track: Track): THREE.Mesh {
  const pos: number[] = [];
  const idx: number[] = [];
  const from = track.pitFrom;
  const n = track.pitTo - track.pitFrom;
  const width = 2.6;
  for (let i = 0; i <= n; i++) {
    const j = from + i;
    const p = track.pts[j];
    const tg = tangentAt(track.pts, j);
    const nx = -tg.z;
    const nz = tg.x;
    const off = pitLaneOffset(track, j);
    const cx = p.x + nx * off;
    const cz = p.z + nz * off;
    pos.push(cx - nx * width, 0.035, cz - nz * width, cx + nx * width, 0.035, cz + nz * width);
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x3b3f45, roughness: 0.9, side: THREE.DoubleSide }));
}

// ピットの建物: 道の横に、ガレージのシャッターと看板を付けて建てる
function buildPitBuilding(track: Track): THREE.Group {
  const half = track.course.width / 2;
  const mid = Math.floor((track.pitFrom + track.pitTo) / 2);
  const p = track.pts[mid];
  const t = tangentAt(track.pts, mid);
  const heading = Math.atan2(t.x, t.z);
  const n = { x: -t.z, z: t.x }; // 道の右側へ向かう向き
  const offset = half + 4 + 8; // 分かれ道の外側に建てる
  const g = new THREE.Group();
  g.position.set(p.x + n.x * offset, 0, p.z + n.z * offset);
  g.rotation.y = heading;

  const wall = new THREE.MeshStandardMaterial({ color: 0xe9ecef, roughness: 0.7 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x3a4250, roughness: 0.6 });
  const shutter = new THREE.MeshStandardMaterial({ color: 0x1b1f26, roughness: 0.8 });
  const sign = new THREE.MeshStandardMaterial({ color: 0xff8f1f, emissive: 0x663300, roughness: 0.4 });

  // 建物の本体 (長さは道の方向 Z、道に面する側は +X)
  const body = new THREE.Mesh(new THREE.BoxGeometry(9, 6, 36), wall);
  body.position.y = 3;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const top = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.6, 36.6), roof);
  top.position.y = 6.3;
  top.castShadow = true;
  g.add(top);
  // ガレージのシャッター (道に面する側に 4 つ)
  for (const z of [-12, -4, 4, 12]) {
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 3.6, 6), shutter);
    door.position.set(4.52, 1.8, z);
    g.add(door);
  }
  // 看板 (オレンジの帯)
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 30), sign);
  band.position.set(4.55, 5.1, 0);
  g.add(band);
  return g;
}

function buildRoad(track: Track): THREE.Group {
  const group = new THREE.Group();
  const half = track.course.width / 2;
  const asphalt = new THREE.Color(0x3b3f45);
  const red = new THREE.Color(0xd32f2f);
  const white = new THREE.Color(0xf5f5f5);
  const kerb = (i: number) => (Math.floor(i / 4) % 2 ? red : white);

  group.add(stripMesh(track, -half, half, 0.02, () => asphalt));
  group.add(stripMesh(track, half, half + 1.5, 0.03, kerb));
  group.add(stripMesh(track, -half - 1.5, -half, 0.03, kerb));

  // ピット: 道の右側から分かれる、ピットへの道と、横に建つ建物
  group.add(buildPitRoad(track));
  group.add(buildPitBuilding(track));

  // スタートライン
  const t = tangentAt(track.pts, 0);
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(track.course.width, 0.05, 2),
    new THREE.MeshStandardMaterial({ color: 0xffffff }),
  );
  line.position.copy(track.pts[0]).setY(0.05);
  line.rotation.y = Math.atan2(t.x, t.z);
  group.add(line);
  return group;
}

// 中心線に沿って横方向 [from, to] の帯を作る
function stripMesh(
  track: Track,
  from: number,
  to: number,
  y: number,
  colorAt: (i: number) => THREE.Color,
): THREE.Mesh {
  const pos = new Float32Array((SAMPLES + 1) * 6);
  const col = new Float32Array((SAMPLES + 1) * 6);
  const idx: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    const j = i % SAMPLES;
    const p = track.pts[j];
    const t = tangentAt(track.pts, j);
    const nx = -t.z;
    const nz = t.x;
    const c = colorAt(j);
    const a = i * 2;
    pos.set([p.x + nx * from, y, p.z + nz * from, p.x + nx * to, y, p.z + nz * to], a * 3);
    col.set([c.r, c.g, c.b, c.r, c.g, c.b], a * 3);
    if (i < SAMPLES) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  mesh.receiveShadow = true;
  return mesh;
}
