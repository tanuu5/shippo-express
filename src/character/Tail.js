import * as THREE from 'three';
import { toonMat } from './materials.js';
import { PALETTE } from './palette.js';

// ふさふさのしっぽ：ワールド空間で揺れる鎖（ばね＋距離拘束）と、それに沿って毎フレーム作り直す毛のチューブ
const N = 8;

// 腰ジョイント基準の休止形（参照画像：体の左側へ垂れ、膝の高さで先が外へ）
const REST = [
  [0.0, -0.03, -0.085],
  [0.02, -0.068, -0.132],
  [0.055, -0.108, -0.162],
  [0.098, -0.158, -0.172],
  [0.14, -0.212, -0.164],
  [0.172, -0.262, -0.142],
  [0.19, -0.3, -0.108],
  [0.2, -0.325, -0.068],
];

export class Tail {
  constructor() {
    this.rings = 30;
    this.radial = 20;
    const count = (this.rings + 1) * (this.radial + 1) + 1;
    this.count = count;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    const R = this.radial + 1;
    for (let i = 0; i < this.rings; i++) {
      for (let j = 0; j < this.radial; j++) {
        const a = i * R + j;
        const b = a + R;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    // 先端のふた
    const tip = (this.rings + 1) * R;
    for (let j = 0; j < this.radial; j++) {
      const a = this.rings * R + j;
      idx.push(a, tip, a + 1);
    }
    geo.setIndex(idx);
    // 色：付け根は少し濃く、先は白
    const cBase = new THREE.Color(PALETTE.tailBase);
    const cMid = new THREE.Color(PALETTE.tail);
    const cTip = new THREE.Color(PALETTE.tailTip);
    const tmp = new THREE.Color();
    for (let i = 0; i <= this.rings; i++) {
      const t = i / this.rings;
      if (t < 0.4) tmp.copy(cBase).lerp(cMid, t / 0.4);
      else if (t < 0.72) tmp.copy(cMid);
      else tmp.copy(cMid).lerp(cTip, Math.min(1, (t - 0.72) / 0.14));
      for (let j = 0; j <= this.radial; j++) {
        const k = (i * R + j) * 3;
        col[k] = tmp.r;
        col[k + 1] = tmp.g;
        col[k + 2] = tmp.b;
      }
    }
    col[tip * 3] = cTip.r;
    col[tip * 3 + 1] = cTip.g;
    col[tip * 3 + 2] = cTip.b;
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 1.5);
    this.geometry = geo;
    this.mesh = new THREE.Mesh(geo, toonMat(0xffffff, { vertexColors: true }));
    this.mesh.name = 'tail';
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;

    this.p = [];
    this.prev = [];
    this.seg = [];
    for (let i = 0; i < N; i++) {
      this.p.push(new THREE.Vector3());
      this.prev.push(new THREE.Vector3());
      if (i > 0) {
        const a = REST[i - 1];
        const b = REST[i];
        this.seg.push(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
      }
    }
    this.initialized = false;
    this.curve = new THREE.CatmullRomCurve3(this.p.map((v) => v.clone()), false, 'centripetal');
    this._t = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this._inv = new THREE.Matrix4();
    this.time = 0;
  }

  // 半径（t: 0=付け根, 1=先端）
  radius(t) {
    const grow = THREE.MathUtils.smoothstep(t, 0.0, 0.42);
    const body = 0.03 + 0.056 * grow;
    const taper = 1 - THREE.MathUtils.smoothstep(t, 0.55, 1.0);
    return body * (0.12 + 0.88 * Math.pow(taper, 0.8));
  }

  reset(hipsMatrix) {
    for (let i = 0; i < N; i++) {
      this.p[i].set(REST[i][0], REST[i][1], REST[i][2]).applyMatrix4(hipsMatrix);
      this.prev[i].copy(this.p[i]);
    }
    this.initialized = true;
  }

  // hipsMatrix: 腰のワールド行列 / rootInverse: キャラ root のワールド逆行列
  update(dt, hipsMatrix, rootInverse, env = {}) {
    dt = Math.min(dt, 1 / 30);
    this.time += dt;
    if (!this.initialized) this.reset(hipsMatrix);
    const wag = env.wag || 0;
    const wagSpeed = env.wagSpeed || 7;
    const lift = env.lift || 0;
    // 付け根はジョイントに固定
    this.p[0].set(REST[0][0], REST[0][1], REST[0][2]).applyMatrix4(hipsMatrix);
    this.prev[0].copy(this.p[0]);
    const g = -9.8 * dt * dt * 0.35;
    for (let i = 1; i < N; i++) {
      const k = i / (N - 1);
      const p = this.p[i];
      const v = this._t.subVectors(p, this.prev[i]).multiplyScalar(0.9);
      this.prev[i].copy(p);
      p.add(v);
      p.y += g;
      // 休止形へ引き戻す（しっぽを振る・持ち上げる）
      const r = REST[i];
      const w = Math.sin(this.time * wagSpeed - i * 0.55) * wag * k;
      const tx = r[0] + w * 0.12;
      const ty = r[1] + lift * k * 0.25;
      const tz = r[2] - lift * k * 0.12;
      const target = new THREE.Vector3(tx, ty, tz).applyMatrix4(hipsMatrix);
      const stiff = 0.34 - 0.24 * k;
      p.lerp(target, stiff);
    }
    // 距離拘束
    for (let it = 0; it < 3; it++) {
      for (let i = 1; i < N; i++) {
        const a = this.p[i - 1];
        const b = this.p[i];
        const d = this._t.subVectors(b, a);
        const len = d.length() || 1e-6;
        b.copy(a).addScaledVector(d, this.seg[i - 1] / len);
      }
    }
    this._build(rootInverse);
  }

  _build(rootInverse) {
    const pts = this.curve.points;
    for (let i = 0; i < N; i++) pts[i].copy(this.p[i]).applyMatrix4(rootInverse);
    this.curve.updateArcLengths();
    const R = this.radial + 1;
    const P = new THREE.Vector3();
    const T = new THREE.Vector3();
    const Nn = new THREE.Vector3();
    const B = new THREE.Vector3();
    // 平行移動フレーム
    this.curve.getTangentAt(0, T);
    Nn.set(1, 0, 0);
    if (Math.abs(T.dot(Nn)) > 0.9) Nn.set(0, 0, 1);
    Nn.addScaledVector(T, -Nn.dot(T)).normalize();
    const prevT = T.clone();
    const pos = this.pos;
    for (let i = 0; i <= this.rings; i++) {
      const t = i / this.rings;
      this.curve.getPointAt(Math.min(t, 0.999), P);
      this.curve.getTangentAt(Math.min(t, 0.999), T);
      // フレームを前の接線から回転させて運ぶ
      const axis = new THREE.Vector3().crossVectors(prevT, T);
      const s = axis.length();
      if (s > 1e-6) {
        const ang = Math.asin(Math.min(1, s));
        Nn.applyAxisAngle(axis.normalize(), ang);
      }
      Nn.addScaledVector(T, -Nn.dot(T)).normalize();
      B.crossVectors(T, Nn);
      prevT.copy(T);
      const r0 = this.radius(t);
      const tuftAmt = THREE.MathUtils.smoothstep(t, 0.12, 0.35) * (1 - THREE.MathUtils.smoothstep(t, 0.9, 1));
      for (let j = 0; j <= this.radial; j++) {
        const a = (j / this.radial) * Math.PI * 2;
        // とがった毛の房
        const x = (a / (Math.PI * 2)) * 6 + t * 4.2;
        const tri = 1 - 2 * Math.abs(x - Math.floor(x) - 0.5);
        const tuft = Math.pow(tri, 1.6) - 0.35;
        const r = r0 * (1 + 0.14 * tuft * tuftAmt);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const k = (i * R + j) * 3;
        pos[k] = P.x + (Nn.x * ca + B.x * sa) * r;
        pos[k + 1] = P.y + (Nn.y * ca + B.y * sa) * r;
        pos[k + 2] = P.z + (Nn.z * ca + B.z * sa) * r;
      }
    }
    // 先端
    this.curve.getPointAt(1, P);
    this.curve.getTangentAt(1, T);
    const tip = (this.rings + 1) * R * 3;
    pos[tip] = P.x + T.x * 0.012;
    pos[tip + 1] = P.y + T.y * 0.012;
    pos[tip + 2] = P.z + T.z * 0.012;
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  // ポンチョ押し出し用：付け根側の 2 区間（ワールド）
  capsulePoints() {
    return [this.p[0], this.p[2], this.p[4]];
  }
}
