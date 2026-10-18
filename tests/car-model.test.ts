import * as THREE from 'three';
import { expect, it } from 'vitest';
import { splitBodyMesh } from '../src/render/carModel';

// 三角形を 1 つ作る (頂点 3 つ)
function tri(points: [number, number, number][]): number[] {
  return points.flat();
}

it('splits the hood out and removes baked tires', () => {
  const positions = [
    // 1: 車体 (中央)
    ...tri([[0, 0.1, 0], [0.1, 0.1, 0], [0, 0.1, 0.1]]),
    // 2: ボンネット (前方、上面)
    ...tri([[-0.6, 0.1, 0], [-0.5, 0.1, 0], [-0.6, 0.1, 0.1]]),
    // 3: タイヤ (焼き込み、車輪の位置)
    ...tri([[-0.635, -0.1, -0.35], [-0.6, -0.12, -0.35], [-0.63, -0.1, -0.33]]),
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mesh = new THREE.Mesh(geo);

  const { body, hood } = splitBodyMesh(mesh);
  // 車体は 1 枚だけ残る (ボンネットとタイヤは取り除く)
  expect(body.index!.count).toBe(3);
  // ボンネットは 1 枚 (頂点 3 つ)、蝶番を原点に移している
  expect(hood.getAttribute('position').count).toBe(3);
  const hp = hood.getAttribute('position');
  expect(hp.getX(0)).toBeCloseTo(-0.6 + 0.36, 5);
});
