import * as THREE from 'three';

// ショートパンツ：腰から股を通って左右の裾まで、一枚につながった面。
// 腰（hips）ジョイントのローカル座標で組み、裾側は太ももの回転に合わせて毎フレーム CPU で変形する。
// 輪の並び（2K 点）：0 = 前の中心、1..K-1 = 左（または右）のふくらみ、K = 後ろの中心、K+1.. = 股の縫い目（脚の輪のみ）
const K = 14;
const N = 2 * K;
const SEAT = 10; // 腰〜股の段数
const LEG = 8; // 股〜裾の段数
const Y_TOP = 0.14; // 上端（胴の中に隠れる高さ）
const Y_CROTCH = -0.05;
const Y_HEM = -0.105;
const LEG_X = 0.08; // 太ももジョイントの x
const THIGH_REST_Y = -0.02;
const HEM_R = 0.074;

// 腰〜股の断面：[t, 左右のふくらみの中心 c, 横の半径 rx, 前後の半径 rz]
// 上は胴の中で細く、腰でいちばん張り、股に向かって左右の脚へ分かれていく
const SEAT_KEYS = [
  [0, 0, 0.066, 0.054],
  [0.25, 0, 0.094, 0.078],
  [0.5, 0.012, 0.097, 0.087],
  [0.75, 0.045, 0.09, 0.084],
  [1, 0.072, 0.08, 0.078],
];

function seatShape(t) {
  for (let i = 1; i < SEAT_KEYS.length; i++) {
    const a = SEAT_KEYS[i - 1];
    const b = SEAT_KEYS[i];
    if (t <= b[0]) {
      const f = THREE.MathUtils.smoothstep(t, a[0], b[0]);
      return [a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
    }
  }
  const l = SEAT_KEYS[SEAT_KEYS.length - 1];
  return [l[1], l[2], l[3]];
}

// 片側のふくらみ（前の中心 → 外側 → 後ろの中心）の j 番目（j = 0..K）
function lobePoint(t, j, side) {
  const [c, rx, rz] = seatShape(t);
  const a0 = Math.asin(THREE.MathUtils.clamp(-c / rx, -1, 1));
  const a = a0 + ((Math.PI - 2 * a0) * j) / K;
  const x = j === 0 || j === K ? 0 : c + rx * Math.sin(a);
  return new THREE.Vector3(side * x, Y_TOP + (Y_CROTCH - Y_TOP) * t, rz * Math.cos(a));
}

export class Shorts {
  constructor(material) {
    const pos = [];
    const wL = [];
    const wR = [];
    const idx = [];
    const add = (p, l, r) => {
      pos.push(p.x, p.y, p.z);
      wL.push(l);
      wR.push(r);
      return pos.length / 3 - 1;
    };

    // --- 腰〜股（両側のふくらみで一周）
    const seat = [];
    for (let s = 0; s <= SEAT; s++) {
      const t = s / SEAT;
      const thighW = 0.35 * THREE.MathUtils.smoothstep(t, 0.6, 1);
      const ring = new Array(N);
      ring[0] = add(lobePoint(t, 0, 1), 0, 0);
      ring[K] = add(lobePoint(t, K, 1), 0, 0);
      for (let j = 1; j < K; j++) {
        ring[j] = add(lobePoint(t, j, 1), thighW, 0);
        ring[N - j] = add(lobePoint(t, j, -1), 0, thighW);
      }
      seat.push(ring);
    }
    for (let s = 0; s < SEAT; s++) {
      const a = seat[s];
      const b = seat[s + 1];
      for (let i = 0; i < N; i++) {
        const i2 = (i + 1) % N;
        idx.push(a[i], b[i], a[i2], a[i2], b[i], b[i2]);
      }
    }
    const crotch = seat[SEAT];

    // --- 股の縫い目（後ろの中心 → 前の中心、真ん中が少し下がる）
    const zF = pos[crotch[0] * 3 + 2];
    const zB = pos[crotch[K] * 3 + 2];
    const seam = [];
    for (let m = 1; m < K; m++) {
      const f = m / K;
      seam.push(add(new THREE.Vector3(0, Y_CROTCH - 0.012 * Math.sin(Math.PI * f), zB + (zF - zB) * f), 0.15, 0.15));
    }

    // --- 左右の脚：股の輪（ふくらみ＋縫い目）から、太ももを囲む丸い裾へ
    for (const side of [1, -1]) {
      const top = new Array(N);
      top[0] = crotch[0];
      top[K] = crotch[K];
      for (let j = 1; j < K; j++) {
        top[j] = side > 0 ? crotch[j] : crotch[N - j];
        top[K + j] = seam[j - 1];
      }
      const start = top.map((vi) => new THREE.Vector3(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2]));
      const cx = side * LEG_X;
      let prev = top;
      for (let l = 1; l <= LEG; l++) {
        const u = l / LEG;
        const e = 1 - (1 - u) * (1 - u); // 内側の平らな面を早めに丸める
        const w = 0.35 + 0.65 * THREE.MathUtils.smoothstep(u, 0, 0.6);
        const ring = start.map((p) => {
          const beta = Math.atan2(p.x - cx, p.z);
          const r = HEM_R * (1 + 0.04 * u);
          const hx = cx + r * Math.sin(beta);
          const hz = r * Math.cos(beta);
          const q = new THREE.Vector3(p.x + (hx - p.x) * e, p.y + (Y_HEM - p.y) * u, p.z + (hz - p.z) * e);
          return add(q, side > 0 ? w : 0, side > 0 ? 0 : w);
        });
        for (let i = 0; i < N; i++) {
          const i2 = (i + 1) % N;
          // 右脚は左の鏡写しなので、面の向きをそろえるために巻き順を逆にする
          if (side > 0) idx.push(prev[i], ring[i], prev[i2], prev[i2], ring[i], ring[i2]);
          else idx.push(prev[i], prev[i2], ring[i], prev[i2], ring[i2], ring[i]);
        }
        prev = ring;
      }
    }

    this.rest = new Float32Array(pos);
    this.wL = new Float32Array(wL);
    this.wR = new Float32Array(wR);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.02, 0), 0.4);
    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'shorts';

    this._restInv = [
      new THREE.Matrix4().makeTranslation(LEG_X, THIGH_REST_Y, 0).invert(),
      new THREE.Matrix4().makeTranslation(-LEG_X, THIGH_REST_Y, 0).invert(),
    ];
    this._d = [new THREE.Matrix4(), new THREE.Matrix4()];
    this._a = new THREE.Vector3();
  }

  // thighL / thighR：腰ジョイントの子の太ももジョイント（matrix は更新済みであること）
  update(thighL, thighR) {
    this._d[0].multiplyMatrices(thighL.matrix, this._restInv[0]);
    this._d[1].multiplyMatrices(thighR.matrix, this._restInv[1]);
    const out = this.geometry.attributes.position.array;
    const rest = this.rest;
    const a = this._a;
    for (let i = 0, n = this.wL.length; i < n; i++) {
      const k = i * 3;
      const l = this.wL[i];
      const r = this.wR[i];
      const h = 1 - l - r;
      let x = rest[k] * h;
      let y = rest[k + 1] * h;
      let z = rest[k + 2] * h;
      if (l > 0) {
        a.set(rest[k], rest[k + 1], rest[k + 2]).applyMatrix4(this._d[0]);
        x += a.x * l;
        y += a.y * l;
        z += a.z * l;
      }
      if (r > 0) {
        a.set(rest[k], rest[k + 1], rest[k + 2]).applyMatrix4(this._d[1]);
        x += a.x * r;
        y += a.y * r;
        z += a.z * r;
      }
      out[k] = x;
      out[k + 1] = y;
      out[k + 2] = z;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }
}
