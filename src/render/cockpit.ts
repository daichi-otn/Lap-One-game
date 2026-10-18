import * as THREE from 'three';

// 角を丸めた箱 (内装の部品用)。縁を面取りして、箱の角が目立たないようにする
export interface NavScreen {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
}

export function softBox(w: number, h: number, d: number, r = 0.06): THREE.BufferGeometry {
  const bevel = Math.min(r, w / 4, h / 4, d / 4);
  const iw = w - bevel * 2;
  const ih = h - bevel * 2;
  const cr = Math.min(r, iw / 2, ih / 2);
  const shape = new THREE.Shape();
  const x0 = -iw / 2;
  const y0 = -ih / 2;
  shape.moveTo(x0 + cr, y0);
  shape.lineTo(x0 + iw - cr, y0);
  shape.quadraticCurveTo(x0 + iw, y0, x0 + iw, y0 + cr);
  shape.lineTo(x0 + iw, y0 + ih - cr);
  shape.quadraticCurveTo(x0 + iw, y0 + ih, x0 + iw - cr, y0 + ih);
  shape.lineTo(x0 + cr, y0 + ih);
  shape.quadraticCurveTo(x0, y0 + ih, x0, y0 + ih - cr);
  shape.lineTo(x0, y0 + cr);
  shape.quadraticCurveTo(x0, y0, x0 + cr, y0);
  const depth = Math.max(0.001, d - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 4,
    curveSegments: 8,
  });
  geo.translate(0, 0, -depth / 2);
  return geo;
}

// 運転席の内装 (一人称のときだけ表示)
// 運転席の内装。seat / handle は装着中のパーツの段階 (1 が標準、2 と 3 が上位)
export function buildCockpit(look: { seat?: number; handle?: number } = {}): THREE.Group {
  const seatTier = look.seat ?? 1;
  const handleTier = look.handle ?? 1;
  // 運転席の内装 (一人称のときだけ表示)。実在の車種を参考にした概算の形状
  // 黒い本革、ソフトタッチのダッシュボード、アルミのアクセント、中央の大型タッチパネル
  const cockpit = new THREE.Group();
  // シート: 標準は黒、上位はバケットシート (赤いアクセント、サイドのサポート)
  const seatColor = seatTier === 1 ? 0x23262a : seatTier === 2 ? 0x2a2d33 : 0x17191c;
  const leather = new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.8 });
  const seatAccent = new THREE.MeshStandardMaterial({ color: seatTier === 1 ? seatColor : 0xc62828, roughness: 0.6 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.7 });
  const alu = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.3 });
  // 中央の画面にはナビ (地図) を映す。描く内容は scene.ts が毎フレーム更新する
  const navCanvas = document.createElement('canvas');
  navCanvas.width = 256;
  navCanvas.height = 160;
  const navTex = new THREE.CanvasTexture(navCanvas);
  const screen = new THREE.MeshStandardMaterial({
    color: 0x0b0d10,
    map: navTex,
    emissive: 0xffffff,
    emissiveMap: navTex,
    emissiveIntensity: 0.9,
    roughness: 0.2,
    metalness: 0.2,
  });
  const addTo = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    cockpit.add(m);
    return m;
  };

  // ダッシュボード: 横に長く、中央が少し高い
  addTo(softBox(1.75, 0.2, 0.42), dashMat, 0, 0.88, 0.72);
  addTo(softBox(1.2, 0.14, 0.4), dashMat, 0, 0.98, 0.8);
  // ダッシュ上部のアルミのライン
  addTo(softBox(1.5, 0.015, 0.02), alu, 0, 0.99, 0.99);
  // 中央の大型タッチパネル (手前に傾けてある)
  addTo(softBox(0.46, 0.3, 0.02), dashMat, 0, 1.13, 0.86, -0.35);
  // 地図を映す板。箱の運転席側の面に重ねる (箱の形の UV では地図が正しく映らないため、平面を使う)
  const screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), screen);
  screenPlane.position.set(0, 1.13, 0.86 - 0.0125);
  screenPlane.rotation.set(-0.35, Math.PI, 0);
  cockpit.add(screenPlane);
  // エアベント (左右に横スリット)
  for (const x of [-0.55, 0.55]) {
    for (const dy of [0, 0.05]) addTo(softBox(0.34, 0.012, 0.03), alu, x, 0.92 + dy, 0.93);
  }

  // ステアリング: 3本スポーク、軸は運転手の方へ傾ける
  const wheelPos = { x: -0.4, y: 0.88, z: 0.45 };
  const steering = new THREE.Group();
  steering.position.set(wheelPos.x, wheelPos.y, wheelPos.z);
  steering.rotation.x = -0.9;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 10, 32), leather);
  if (handleTier >= 2) {
    // 上位のハンドル: 上に赤いセンターマーク
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), new THREE.MeshStandardMaterial({ color: 0xc62828 }));
    mark.position.set(0, 0.18, 0);
    rim.add(mark);
  }
  steering.add(rim);
  for (const angle of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 - (2 * Math.PI) / 3]) {
    const spoke = new THREE.Mesh(softBox(0.16, 0.03, 0.02), leather);
    spoke.position.set(Math.cos(angle) * 0.09, Math.sin(angle) * 0.09, 0);
    spoke.rotation.z = angle;
    steering.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 24), alu);
  hub.rotation.x = Math.PI / 2;
  steering.add(hub);
  cockpit.add(steering);
  // ハンドル軸
  addTo(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 16), dashMat, -0.4, 0.8, 0.66, -1.1);

  // センターコンソールとシフトレバー
  addTo(softBox(0.22, 0.18, 0.7), dashMat, 0, 0.55, 0.05);
  addTo(new THREE.CylinderGeometry(0.02, 0.025, 0.14, 16), alu, 0, 0.68, -0.05);

  // ドアの内張りとアームレスト
  for (const x of [0.85, -0.85]) {
    addTo(softBox(0.1, 0.5, 1.0), dashMat, x, 0.65, 0.0);
    addTo(softBox(0.2, 0.05, 0.3), leather, x * 0.85, 0.62, -0.1);
  }

  // 運転席と助手席
  for (const x of [-0.4, 0.4]) {
    addTo(softBox(0.5, 0.14, 0.5), leather, x, 0.45, -0.2);
    if (seatTier >= 2) {
      // サイドのサポート (バケット)
      for (const side of [1, -1]) addTo(softBox(0.06, 0.28, 0.46), seatAccent, x + side * 0.27, 0.6, -0.42, -0.08);
    }
    addTo(softBox(0.5, 0.75, 0.12), leather, x, 0.9, -0.45, -0.08);
    addTo(softBox(0.32, 0.18, 0.12), leather, x, 1.3, -0.5);
  }
  cockpit.userData.nav = { canvas: navCanvas, texture: navTex } satisfies NavScreen;
  return cockpit;
}
