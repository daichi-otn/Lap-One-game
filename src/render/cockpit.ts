import * as THREE from 'three';

// 一人称で見える運転席の内装 (ダッシュボード、ハンドル、センター画面、ドア、シート)。
// 座標は車の前方が +Z、左右が X、高さが Y。運転席は x = -0.4 の位置 (カメラもここに置く)

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

// 運転席の内装。seat / handle は装着中のパーツの段階 (1 が標準、2 と 3 が上位)
export function buildCockpit(look: { seat?: number; handle?: number } = {}): THREE.Group {
  const seatTier = look.seat ?? 1;
  const handleTier = look.handle ?? 1;
  const cockpit = new THREE.Group();

  // 素材: 黒のソフトレザー、ダッシュの樹脂、アルミのアクセント、発光する表示
  const seatColor = seatTier === 1 ? 0x23262a : seatTier === 2 ? 0x2a2d33 : 0x17191c;
  const leather = new THREE.MeshStandardMaterial({ color: seatColor, roughness: 0.8 });
  const seatAccent = new THREE.MeshStandardMaterial({ color: seatTier === 1 ? seatColor : 0xc62828, roughness: 0.6 });
  const dashMat = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.7 });
  const padMat = new THREE.MeshStandardMaterial({ color: 0x25282d, roughness: 0.95 }); // ソフトタッチの上面
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x0f1113, roughness: 0.6 }); // 黒い内張り
  const alu = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.85, roughness: 0.3 });
  const stitch = new THREE.MeshStandardMaterial({ color: 0x6b5a2e, roughness: 0.9 });

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

  const addTo = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    cockpit.add(m);
    return m;
  };

  // ダッシュボード本体: 横に長く、運転席側へ少し傾いた面。上面は柔らかい素材
  // ハンドルの手前ではなく、ハンドルの向こう (前) にダッシュの面が来る
  addTo(softBox(1.9, 0.26, 0.5), dashMat, 0, 0.8, 0.95);
  addTo(softBox(1.8, 0.06, 0.46), padMat, 0, 0.94, 0.9);
  // 上面のステッチ (縫い目) と、助手席側のアルミの加飾
  addTo(softBox(1.6, 0.008, 0.012), stitch, 0, 0.972, 0.7);
  addTo(softBox(0.7, 0.012, 0.02), alu, 0.55, 0.955, 0.9);
  // 計器の覆い (ハンドルの上に出る黒いフード) と、その中の 2 つの丸い計器
  addTo(softBox(0.7, 0.1, 0.3), trimMat, -0.4, 1.1, 0.7, -0.2);
  // 計器: デジタル表示 (速さ・ギア・回転数)。描く内容は scene.ts が毎フレーム更新する
  const clusterCanvas = document.createElement('canvas');
  clusterCanvas.width = 256;
  clusterCanvas.height = 112;
  const clusterTex = new THREE.CanvasTexture(clusterCanvas);
  const clusterMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    map: clusterTex,
    emissive: 0xffffff,
    emissiveMap: clusterTex,
    emissiveIntensity: 0.9,
    roughness: 0.3,
  });
  // ハンドルの向こうに見えるように、ハンドルより手前の位置に置く
  const clusterPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.175), clusterMat);
  clusterPlane.position.set(-0.4, 0.98, 0.36);
  clusterPlane.rotation.set(-0.6, Math.PI, 0);
  cockpit.add(clusterPlane);

  // センター: 中央の大型画面 (手前に傾ける) と、その下のエアコン操作
  addTo(softBox(0.5, 0.34, 0.04), trimMat, 0, 1.09, 0.86, -0.35);
  const screenPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.26), screen);
  screenPlane.position.set(0, 1.09, 0.86 - 0.025);
  screenPlane.rotation.set(-0.35, Math.PI, 0);
  cockpit.add(screenPlane);
  addTo(softBox(0.46, 0.14, 0.18), dashMat, 0, 0.84, 0.92);
  for (const x of [-0.13, -0.04, 0.04, 0.13]) {
    addTo(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 20), alu, x, 0.84, 1.02, Math.PI / 2);
  }

  // 左右の吹き出し口 (横のスリット)
  for (const x of [-0.7, 0.7]) {
    addTo(softBox(0.42, 0.07, 0.1), trimMat, x, 0.86, 0.95);
    for (const dy of [-0.02, 0, 0.02]) addTo(softBox(0.36, 0.008, 0.02), alu, x, 0.86 + dy, 1.0);
  }

  // ステアリング: 3本スポーク、軸は運転手の方へ傾ける
  const wheelPos = { x: -0.4, y: 0.88, z: 0.45 };
  const steering = new THREE.Group();
  // 傾き (tilt) の中で、ハンドルだけが回る (spin)。輪の面は運転手の方を向き、上部がダッシュ側へ少し倒れている
  const tilt = new THREE.Group();
  tilt.position.set(wheelPos.x, wheelPos.y, wheelPos.z);
  tilt.rotation.x = 0.45;
  cockpit.add(tilt);
  // リムは楕円に近いので、横を少し広くする
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.024, 12, 40), leather);
  rim.scale.set(1, 0.9, 1);
  if (handleTier >= 2) {
    // 上位のハンドル: 上に赤いセンターマーク
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.02), new THREE.MeshStandardMaterial({ color: 0xc62828 }));
    mark.position.set(0, 0.17, 0);
    rim.add(mark);
  }
  steering.add(rim);
  for (const angle of [Math.PI / 2, Math.PI / 2 + (2 * Math.PI) / 3, Math.PI / 2 - (2 * Math.PI) / 3]) {
    const spoke = new THREE.Mesh(softBox(0.15, 0.03, 0.03), dashMat);
    spoke.position.set(Math.cos(angle) * 0.09, Math.sin(angle) * 0.09, 0);
    spoke.rotation.z = angle;
    steering.add(spoke);
  }
  // ハブ (エアバッグのカバー) と、左右のスポーク上のボタン
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.03, 28), dashMat);
  hub.rotation.x = Math.PI / 2;
  steering.add(hub);
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16), alu);
  logo.position.z = 0.016;
  steering.add(logo);
  for (const x of [-0.13, 0.13]) {
    const button = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), alu);
    button.position.set(x, -0.04, 0.02);
    steering.add(button);
  }
  tilt.add(steering);
  // ハンドルの軸 (ステアリングコラム)
  addTo(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 16), dashMat, -0.4, 0.84, 0.6, Math.PI / 2 - 0.2);

  // センターコンソールとシフトレバー、サイドブレーキ
  addTo(softBox(0.24, 0.18, 0.72), trimMat, 0, 0.5, 0.05);
  addTo(new THREE.CylinderGeometry(0.018, 0.022, 0.12, 16), alu, 0, 0.64, -0.05);
  addTo(new THREE.SphereGeometry(0.035, 16, 12), leather, 0, 0.72, -0.05);

  // ドアの内張り、アームレスト、ドアのハンドル (左右)
  for (const x of [0.9, -0.9]) {
    addTo(softBox(0.12, 0.5, 1.0), trimMat, x, 0.62, 0.0);
    addTo(softBox(0.22, 0.05, 0.34), leather, x * 0.85, 0.6, -0.12);
    addTo(softBox(0.04, 0.03, 0.14), alu, x * 0.88, 0.72, 0.2);
  }

  // 運転席と助手席: 座面、背もたれ、ヘッドレスト、(上位は) サイドのサポート
  for (const x of [-0.4, 0.4]) {
    addTo(softBox(0.52, 0.16, 0.56), leather, x, 0.42, -0.18);
    if (seatTier >= 2) {
      for (const side of [1, -1]) addTo(softBox(0.06, 0.28, 0.46), seatAccent, x + side * 0.27, 0.6, -0.42, -0.08);
    }
    addTo(softBox(0.52, 0.8, 0.14), leather, x, 0.9, -0.45, -0.12);
    addTo(softBox(0.32, 0.2, 0.14), leather, x, 1.34, -0.5);
  }
  // 運転席のシートベルト (肩から腰へ)
  addTo(softBox(0.06, 0.82, 0.012), trimMat, -0.3, 0.92, -0.3, -0.12);

  // ペダル (足元に見える)
  addTo(softBox(0.12, 0.035, 0.12), alu, -0.25, 0.14, 0.82);
  addTo(softBox(0.12, 0.035, 0.12), alu, -0.4, 0.14, 0.82);
  addTo(softBox(0.36, 0.02, 0.22), trimMat, -0.35, 0.12, 0.92);

  cockpit.userData.nav = { canvas: navCanvas, texture: navTex } satisfies NavScreen;
  cockpit.userData.wheel = steering;
  cockpit.userData.cluster = { canvas: clusterCanvas, texture: clusterTex } satisfies NavScreen;
  return cockpit;
}
