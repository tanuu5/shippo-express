import * as THREE from 'three';

// やわらかいトゥーン陰影用のグラデーション。
// 参照画像は影が薄いスタジオ照明なので、暗部を明るめ（0.52）にして境界をなだらかにする。
let gradientTex = null;
export function softToonGradient() {
  if (gradientTex) return gradientTex;
  const w = 256;
  const data = new Uint8Array(w * 4);
  for (let i = 0; i < w; i++) {
    const x = i / (w - 1);
    const t = THREE.MathUtils.smoothstep(x, 0.38, 0.62);
    const v = 0.5 + 0.5 * t + 0.04 * THREE.MathUtils.smoothstep(x, 0.8, 1.0);
    const b = Math.round(Math.min(1, v) * 255);
    data[i * 4] = b;
    data[i * 4 + 1] = b;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  gradientTex = new THREE.DataTexture(data, w, 1, THREE.RGBAFormat);
  gradientTex.minFilter = THREE.LinearFilter;
  gradientTex.magFilter = THREE.LinearFilter;
  gradientTex.generateMipmaps = false;
  gradientTex.needsUpdate = true;
  return gradientTex;
}

export function toonMat(color, opts = {}) {
  const m = new THREE.MeshToonMaterial({
    color: color === undefined ? 0xffffff : color,
    gradientMap: softToonGradient(),
    ...opts,
  });
  return m;
}
