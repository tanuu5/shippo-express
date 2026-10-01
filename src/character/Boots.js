import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { colorize, extrudeUp, footOutline, mergeColored } from './geom.js';
import { PALETTE } from './palette.js';

// ごついショートブーツ（足首ジョイント基準。地面は y = -ANKLE_H、つま先は +Z）
// 参照画像：クリーム色のアッパー、厚い茶色のラグソール、茶色のパッド入り履き口、
// 三角エンブレム付きのベルト、外側の D リング、茶色の靴ひも。
export const ANKLE_H = 0.085;

export function buildBootGeometry(side) {
  const parts = [];
  const g0 = -ANKLE_H;
  // 靴底
  const sole = extrudeUp(footOutline(0.238, 0.11, 0.078, 0.5), 0.046, 0.008, PALETTE.bootSole);
  sole.translate(0, g0, 0);
  parts.push(toCreasedNormals(sole, 0.6));
  // 側面のラグ（溝）
  for (let i = 0; i < 9; i++) {
    const z = -0.058 + i * 0.026;
    for (const sx of [-1, 1]) {
      const b = new THREE.BoxGeometry(0.008, 0.02, 0.011);
      b.translate(sx * (0.053 - (z > 0.1 ? 0.006 : 0)), g0 + 0.013, z);
      parts.push(colorize(b, 0x7f6660));
    }
  }
  // つま先（少し角ばったスニーカー風）
  const upper = extrudeUp(footOutline(0.214, 0.096, 0.068, 0.62), 0.05, 0.013, PALETTE.bootCream);
  upper.translate(0, g0 + 0.04, 0.003);
  parts.push(toCreasedNormals(upper, 0.9));
  // つま先の縫い目
  const toeSeam = new THREE.TorusGeometry(0.036, 0.0022, 5, 20, Math.PI);
  toeSeam.rotateX(-Math.PI / 2);
  toeSeam.translate(0, g0 + 0.088, 0.1);
  parts.push(colorize(toeSeam, 0xd9cbc5));
  // 筒
  const shaft = new THREE.CylinderGeometry(0.05, 0.051, 0.19, 28, 4, true);
  shaft.translate(0, 0.057, -0.006);
  parts.push(colorize(shaft, PALETTE.bootCream));
  // 前のタン
  const tongue = new THREE.BoxGeometry(0.044, 0.11, 0.016, 1, 3, 1);
  tongue.translate(0, 0.045, 0.043);
  parts.push(colorize(tongue, 0xece0da));
  // 履き口の茶色いパッド
  const collar = new THREE.TorusGeometry(0.049, 0.0135, 10, 28);
  collar.rotateX(Math.PI / 2);
  collar.translate(0, 0.152, -0.006);
  parts.push(colorize(collar, PALETTE.bootCollar));
  // ベルト 2 本
  for (const [y, h] of [
    [0.086, 0.022],
    [0.122, 0.018],
  ]) {
    const band = new THREE.CylinderGeometry(0.0528, 0.0528, h, 28, 1, true);
    band.translate(0, y, -0.006);
    parts.push(colorize(band, PALETTE.bootCollar));
  }
  // 三角のエンブレム
  const tri = new THREE.CylinderGeometry(0.011, 0.011, 0.004, 3);
  tri.rotateX(Math.PI / 2);
  tri.rotateZ(Math.PI / 2 + Math.PI / 6);
  tri.translate(0, 0.086, 0.049);
  parts.push(colorize(tri, 0xd8c7c0));
  // 外側の D リング
  const ring = new THREE.TorusGeometry(0.01, 0.0028, 6, 14);
  ring.rotateY(Math.PI / 2);
  ring.translate(side * 0.055, 0.122, -0.006);
  parts.push(colorize(ring, PALETTE.metal));
  const ring2 = ring.clone();
  ring2.translate(0, -0.036, 0);
  parts.push(ring2);
  // 靴ひも（クロス）
  for (let i = 0; i < 4; i++) {
    const y = -0.006 + i * 0.021;
    for (const s of [-1, 1]) {
      const l = new THREE.BoxGeometry(0.042, 0.005, 0.005);
      l.rotateZ(s * 0.42);
      l.translate(0, y, 0.052 + (i === 0 ? 0.006 : 0));
      parts.push(colorize(l, PALETTE.bootCollar));
    }
  }
  // かかとのプルタブ
  const tab = new THREE.BoxGeometry(0.018, 0.032, 0.007);
  tab.translate(0, 0.162, -0.057);
  parts.push(colorize(tab, PALETTE.bootCollar));
  return mergeColored(parts);
}
