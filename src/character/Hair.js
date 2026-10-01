import * as THREE from 'three';
import { lockGeometry, mergeColored, colorize } from './geom.js';
import { PALETTE } from './palette.js';

// 髪：頭の形に沿う「地毛のキャップ」＋前髪・横髪・後ろ髪の毛束。
// 参照画像：明るいアッシュベージュのウェーブ。あご〜肩の長さで横に広がり、毛先は外はね。アホ毛はループ。
const D2R = Math.PI / 180;

export function buildHair(C) {
  const sph = (elevDeg, azimDeg, r) => {
    const e = elevDeg * D2R;
    const a = azimDeg * D2R;
    return new THREE.Vector3(C.x + r * Math.cos(e) * Math.sin(a), C.y + r * Math.sin(e), C.z + r * Math.cos(e) * Math.cos(a));
  };
  const V = (x, y, z) => new THREE.Vector3(C.x + x, C.y + y, C.z + z);
  const smooth = (e0, e1, x) => THREE.MathUtils.smoothstep(x, e0, e1);
  // 平たい面の向き：頭の上では中心から放射、首より下では水平に外向き
  const flatAxis = (t, P) => {
    const r = new THREE.Vector3().subVectors(P, C);
    if (r.y < 0) r.y *= Math.max(0, 1 + r.y / 0.05);
    return r;
  };
  const colors = {
    colorRoot: PALETTE.hair,
    colorMid: PALETTE.hair,
    colorTip: PALETTE.hairTip,
    colorInner: PALETTE.hairDeep,
  };
  const pointed = (w0, tipStart = 0.55) => (t) => w0 * (0.86 + 0.34 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7)) * (1 - 0.95 * smooth(tipStart, 1, t));
  const thin = (h0) => (t) => h0 * (1 - 0.5 * t) + 0.0022;

  const staticParts = [];
  const backParts = [];
  const sideParts = [[], []];

  // --- 地毛のキャップ（顔の部分は切り抜く）
  {
    const g = new THREE.SphereGeometry(1, 44, 32);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      const back = Math.max(0, -z);
      const low = Math.max(0, -y);
      const rx = 0.097 + 0.008 * back + 0.012 * low;
      const ry = 0.114 + 0.008 * Math.max(0, y);
      const rz = 0.1 + 0.012 * back;
      p.setXYZ(i, C.x + x * rx, C.y + 0.008 + y * ry, C.z - 0.008 + z * rz);
    }
    const idx = g.index.array;
    const keep = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (let i = 0; i < idx.length; i += 3) {
      a.fromBufferAttribute(p, idx[i]);
      b.fromBufferAttribute(p, idx[i + 1]);
      c.fromBufferAttribute(p, idx[i + 2]);
      const cx = (a.x + b.x + c.x) / 3 - C.x;
      const cy = (a.y + b.y + c.y) / 3 - C.y;
      const cz = (a.z + b.z + c.z) / 3 - C.z;
      const face = cz > -0.01 && cy < 0.045 - 0.3 * Math.max(0, Math.abs(cx) - 0.055);
      const under = cy < -0.08;
      if (!face && !under) keep.push(idx[i], idx[i + 1], idx[i + 2]);
    }
    g.setIndex(keep);
    g.computeVertexNormals();
    colorize(g, new THREE.Color(PALETTE.hair).lerp(new THREE.Color(PALETTE.hairDeep), 0.3));
    staticParts.push(g);
  }

  // --- 前髪（目の上で止め、目と目の間の束だけ長く）
  const bangs = [
    // [毛先の方位角, 毛先の高さ(頭の中心から, m), 幅]
    [2, -0.058, 0.024],
    [-10, -0.036, 0.03],
    [12, -0.034, 0.03],
    [-21, -0.027, 0.032],
    [23, -0.025, 0.032],
    [-32, -0.026, 0.032],
    [34, -0.028, 0.032],
    [-44, -0.036, 0.03],
    [46, -0.038, 0.03],
    [-56, -0.072, 0.028],
    [58, -0.076, 0.028],
  ];
  // 前髪の下地（すき間から額が見えないように、少し暗い幅広の一枚）
  staticParts.push(
    lockGeometry([sph(70, 0, 0.098), sph(40, 0, 0.108), sph(10, 0, 0.108), sph(-8, 0, 0.104)], {
      center: C,
      width: (t) => 0.078 * (1 - 0.35 * t),
      thick: () => 0.004,
      segs: 12,
      radial: 8,
      colorRoot: PALETTE.hairDeep,
      colorMid: PALETTE.hair,
      colorTip: PALETTE.hair,
      colorInner: PALETTE.hairDeep,
    }),
  );
  for (const [az, yTip, w] of bangs) {
    const el = Math.asin(yTip / 0.108) / D2R;
    const pts = [sph(74, az * 0.3, 0.1), sph(52, az * 0.6, 0.113), sph(26, az * 0.85, 0.116), sph(el * 0.45 + 4, az * 0.97, 0.114), sph(el, az * 1.02, 0.108)];
    pts[4].z -= 0.004;
    staticParts.push(lockGeometry(pts, { center: C, width: pointed(w), thick: thin(0.0085), segs: 18, radial: 8, ...colors }));
  }
  // 頭頂の毛束（ふくらみ）
  for (const az of [-60, -30, 0, 30, 60]) {
    const pts = [sph(86, az * 0.2 + 180, 0.1), sph(72, az * 0.5, 0.117), sph(48, az * 0.9, 0.121), sph(24, az * 1.05, 0.118)];
    staticParts.push(lockGeometry(pts, { center: C, width: pointed(0.045, 0.6), thick: thin(0.009), segs: 14, radial: 8, ...colors }));
  }

  // --- 横髪（顔まわり。ウェーブして外にはねる）
  for (const side of [-1, 1]) {
    const S = side;
    const k = side < 0 ? 1 : 0;
    const locks = [
      { pts: [sph(30, S * 62, 0.108), sph(4, S * 67, 0.115), V(S * 0.09, -0.045, 0.048), V(S * 0.1, -0.09, 0.046), V(S * 0.114, -0.13, 0.04), V(S * 0.136, -0.156, 0.034), V(S * 0.156, -0.146, 0.03)], w: 0.028 },
      { pts: [sph(32, S * 78, 0.112), sph(3, S * 84, 0.124), V(S * 0.13, -0.05, 0.022), V(S * 0.146, -0.095, 0.02), V(S * 0.16, -0.135, 0.016), V(S * 0.182, -0.16, 0.01), V(S * 0.2, -0.146, 0.006)], w: 0.042 },
      { pts: [sph(36, S * 96, 0.115), sph(4, S * 101, 0.128), V(S * 0.14, -0.055, -0.026), V(S * 0.156, -0.1, -0.032), V(S * 0.172, -0.14, -0.04), V(S * 0.194, -0.162, -0.046), V(S * 0.208, -0.146, -0.05)], w: 0.046 },
      // 細いウェーブの束（ボリューム感）
      { pts: [sph(10, S * 72, 0.118), V(S * 0.112, -0.04, 0.036), V(S * 0.126, -0.085, 0.042), V(S * 0.12, -0.125, 0.046), V(S * 0.136, -0.16, 0.042), V(S * 0.154, -0.172, 0.036)], w: 0.022 },
      { pts: [sph(8, S * 90, 0.126), V(S * 0.148, -0.045, 0.002), V(S * 0.162, -0.085, 0.006), V(S * 0.156, -0.125, 0.01), V(S * 0.174, -0.16, 0.008), V(S * 0.194, -0.176, 0.002)], w: 0.026 },
      { pts: [sph(0, S * 84, 0.126), V(S * 0.142, -0.06, 0.03), V(S * 0.16, -0.1, 0.034), V(S * 0.174, -0.132, 0.03), V(S * 0.19, -0.14, 0.024)], w: 0.024 },
    ];
    for (const L of locks) {
      sideParts[k].push(lockGeometry(L.pts, { center: C, flatAxis, width: pointed(L.w * 1.3, 0.66), thick: thin(0.012), segs: 24, radial: 8, ...colors }));
    }
    // 外へ飛び出すほつれ毛
    const wisps = [
      [sph(-4, S * 88, 0.124), V(S * 0.145, -0.06, 0.0), V(S * 0.175, -0.09, 0.004), V(S * 0.2, -0.1, 0.012)],
      [sph(-20, S * 70, 0.118), V(S * 0.12, -0.12, 0.05), V(S * 0.15, -0.15, 0.058), V(S * 0.172, -0.146, 0.064)],
    ];
    for (const w of wisps) sideParts[k].push(lockGeometry(w, { center: C, flatAxis, width: pointed(0.008, 0.4), thick: thin(0.0028), segs: 12, radial: 6, ...colors }));
  }

  // --- 後ろ髪（頭頂から肩まで。ふくらんでウェーブし、毛先は外はね）
  // az: 方位角, len: 首より下の長さ, flare: 広がり, amp/phase: うねり, curl: 毛先のはね
  const hang = (az, o) => {
    const a = az * D2R;
    const dx = Math.sin(a);
    const dz = Math.cos(a);
    const tx = Math.cos(a);
    const tz = -Math.sin(a);
    const pts = [sph(o.e0 ?? 66, az, 0.105), sph(34, az, 0.124), sph(-4, az, 0.132), sph(-34, az, 0.132)];
    const y0 = 0.132 * Math.sin(-34 * D2R);
    const r0 = 0.132 * Math.cos(-34 * D2R);
    const n = 5;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const y = y0 - t * o.len + o.curl * 0.55 * smooth(0.7, 1, t);
      const wave = o.amp * Math.sin(t * Math.PI * 1.8 + o.phase);
      const radial = r0 + o.flare * Math.pow(t, 1.15) + o.curl * smooth(0.65, 1, t) + 0.35 * wave * Math.cos(o.phase);
      pts.push(V(dx * radial + tx * wave, y, dz * radial + tz * wave));
    }
    return pts;
  };
  const backCount = 15;
  for (let i = 0; i < backCount; i++) {
    const u = i / (backCount - 1);
    const az = 108 + u * 144 + Math.sin(i * 4.1) * 3;
    const pts = hang(az, {
      len: 0.1 + 0.016 * Math.cos(i * 2.3),
      flare: 0.058 + 0.014 * Math.sin(i * 1.3),
      amp: 0.013,
      phase: i * 1.9,
      curl: 0.03 + 0.008 * Math.sin(i * 3.1),
    });
    backParts.push(lockGeometry(pts, { center: C, flatAxis, width: pointed(0.066, 0.72), thick: thin(0.016), segs: 28, radial: 8, ...colors }));
  }
  // 内側の層（すき間埋め、少し暗い）
  for (let i = 0; i < 11; i++) {
    const az = 118 + (i / 10) * 124;
    const a = az * D2R;
    const pts = [sph(40, az, 0.102), sph(-10, az, 0.118), sph(-42, az, 0.12), new THREE.Vector3(C.x + Math.sin(a) * 0.145, C.y - 0.15, C.z + Math.cos(a) * 0.145)];
    backParts.push(
      lockGeometry(pts, { center: C, flatAxis, width: pointed(0.062, 0.7), thick: thin(0.012), segs: 16, radial: 8, colorRoot: PALETTE.hairDeep, colorMid: PALETTE.hair, colorTip: PALETTE.hair, colorInner: PALETTE.hairDeep }),
    );
  }

  // --- アホ毛（ループ）
  const ahoge = lockGeometry(
    [V(0, 0.114, 0.012), V(0.004, 0.148, 0.022), V(0.026, 0.176, 0.026), V(0.054, 0.168, 0.02), V(0.058, 0.144, 0.012), V(0.04, 0.134, 0.008)],
    {
      center: C,
      flatAxis: () => new THREE.Vector3(0, 0, 1),
      width: (t) => 0.007 * (1 - 0.85 * t) + 0.0008,
      thick: () => 0.003,
      segs: 22,
      radial: 6,
      ...colors,
    },
  );

  return {
    staticGeo: mergeColored(staticParts),
    backGeo: mergeColored(backParts),
    sideGeo: [mergeColored(sideParts[0]), mergeColored(sideParts[1])],
    ahogeGeo: mergeColored([ahoge]),
  };
}
