import * as THREE from 'three';
import { toonMat } from './materials.js';
import { PALETTE } from './palette.js';

// ポンチョ（フード付きケープコート）＝ 胴のベル ＋ 左右の袖（ベルスリーブ）
// どちらも胸ジョイントのローカル空間で、基準姿勢（腕を 44° 開いた A ポーズ）の形をパラメトリックに作る。
// 毎フレーム、腕の差分行列で袖と胴の一部を CPU スキニングし、すそのなびき（ばね）と脚・しっぽからの押し出しを加える。

const TAU = Math.PI * 2;
export const PONCHO_CHEST_Y = 0.95; // 基準姿勢での胸ジョイントの高さ（ワールド, m）
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const smooth = (t) => {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const hex = (c) => '#' + new THREE.Color(c).getHexString();

function ellipseR(theta, A, Bf, Bb) {
  const s = Math.sin(theta);
  const c = Math.cos(theta);
  const B = c >= 0 ? Bf : Bb;
  return 1 / Math.sqrt((s / A) ** 2 + (c / B) ** 2);
}

// 胴の経線の要所 N(首) S(肩・胸) M(中間) E(すそ) を (r, y) で返す
function bodyKeys(theta) {
  const c = Math.cos(theta);
  const phi = Math.acos(Math.max(-1, Math.min(1, c)));
  const side = Math.sin(theta) ** 2;
  const back = Math.max(0, -c);
  const front = Math.max(0, c);
  const rN = ellipseR(theta, 0.09, 0.084, 0.08);
  const yN = 0.206 - 0.018 * front;
  const rS = ellipseR(theta, 0.168, 0.142, 0.134);
  const yS = lerp(0.098 + 0.024 * back, 0.155, side);
  const yEw = lerp(0.655, 0.56, smooth((phi - 0.95) / (Math.PI - 1.2))) - 0.012 * Math.exp(-(((phi - 0.55) / 0.3) ** 2));
  const yE = yEw - PONCHO_CHEST_Y;
  // すそのゆるいドレープ（波打つ折り目）
  const fold = 0.011 * Math.sin(theta * 9 + 0.6) + 0.006 * Math.sin(theta * 15 + 2.1);
  // 後ろ身頃はすそが広く長い（前から見ると前身頃の下に裏地が広がって見える）
  const rE = ellipseR(theta, 0.34, 0.235, 0.29) + fold + 0.05 * Math.exp(-(((phi - 2.25) / 0.55) ** 2));
  const rM = ellipseR(theta, 0.222, 0.164, 0.178) + fold * 0.3;
  const yM = lerp(yS, yE, 0.45);
  return [
    [rN, yN],
    [rS, yS],
    [rM, yM],
    [rE, yE],
  ];
}

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

function meridian(theta, nV) {
  const k = bodyKeys(theta);
  const P = [[2 * k[0][0] - k[1][0], 2 * k[0][1] - k[1][1]], k[0], k[1], k[2], k[3], [2 * k[3][0] - k[2][0], 2 * k[3][1] - k[2][1]]];
  const dense = [];
  const per = 24;
  for (let seg = 0; seg < 3; seg++) for (let i = 0; i < per; i++) dense.push(cr(P[seg], P[seg + 1], P[seg + 2], P[seg + 3], i / per));
  dense.push(k[3]);
  const acc = [0];
  for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const L = acc[acc.length - 1];
  const out = [];
  let j = 1;
  for (let i = 0; i <= nV; i++) {
    const u = i / nV;
    const target = L * (0.4 * u + 0.6 * (1 - (1 - u) ** 1.3));
    while (j < acc.length - 1 && acc[j] < target) j++;
    const a = acc[j - 1];
    const b = acc[j];
    const f = b > a ? (target - a) / (b - a) : 0;
    out.push([lerp(dense[j - 1][0], dense[j][0], f), lerp(dense[j - 1][1], dense[j][1], f)]);
  }
  return out;
}

// 共通：格子メッシュ（外側＋裏地の 2 枚）
function gridGeometry(nU, nV, rest, uvFn) {
  const count = (nU + 1) * (nV + 1);
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  pos.set(rest);
  const uv = new Float32Array(count * 2);
  for (let i = 0; i <= nV; i++) {
    for (let j = 0; j <= nU; j++) {
      const idx = i * (nU + 1) + j;
      const [u, v] = uvFn(j / nU, i / nV);
      uv[idx * 2] = u;
      uv[idx * 2 + 1] = v;
    }
  }
  const index = [];
  for (let i = 0; i < nV; i++) {
    for (let j = 0; j < nU; j++) {
      const a = i * (nU + 1) + j;
      const b = a + nU + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  geo.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.1, 0), 1.0);
  return geo;
}

function metricOf(rest, nU, nV) {
  const du = new Float32Array((nU + 1) * (nV + 1));
  const dv = new Float32Array((nU + 1) * (nV + 1));
  const P = (i, j) => {
    const k = (i * (nU + 1) + j) * 3;
    return [rest[k], rest[k + 1], rest[k + 2]];
  };
  for (let i = 0; i <= nV; i++) {
    for (let j = 0; j <= nU; j++) {
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(nU, j + 1);
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(nV, i + 1);
      const a = P(i, j0);
      const b = P(i, j1);
      const c = P(i0, j);
      const d = P(i1, j);
      const idx = i * (nU + 1) + j;
      du[idx] = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / ((j1 - j0) / nU);
      dv[idx] = Math.hypot(d[0] - c[0], d[1] - c[1], d[2] - c[2]) / ((i1 - i0) / nV);
    }
  }
  return { du, dv };
}

export class Poncho {
  constructor(opts = {}) {
    this.armSpread = opts.armSpread || (44 * Math.PI) / 180;
    this.armLen = 0.39;
    this.shoulder = [new THREE.Vector3(0.115, 0.15, 0), new THREE.Vector3(-0.115, 0.15, 0)];
    this.vOpen = 0.66;
    this.time = 0;
    this._buildBody();
    this._buildSleeves();

    // すその制御点（ばね）
    this.K = 32;
    this.hemOff = new Float32Array(this.K * 3);
    this.hemVel = new Float32Array(this.K * 3);
    this.hemDir = [];
    for (let k = 0; k < this.K; k++) {
      const th = (k / this.K) * TAU;
      this.hemDir.push([Math.sin(th), Math.cos(th)]);
    }
    this.sleeveOff = [new Float32Array(3), new Float32Array(3)];
    this.sleeveVel = [new Float32Array(3), new Float32Array(3)];

    const coatMat = toonMat(0xffffff, { map: this._paintBody() });
    coatMat.shadowSide = THREE.DoubleSide;
    const liningMat = toonMat(0xffffff, { map: this._paintLining(), side: THREE.BackSide });
    const sleeveMat = toonMat(0xffffff, { map: this._paintSleeve() });
    sleeveMat.shadowSide = THREE.DoubleSide;
    const sleeveLining = toonMat(0xd9c7bf, { side: THREE.BackSide });

    this.group = new THREE.Group();
    this.group.name = 'poncho';
    const mk = (name, geo, mat, shadow) => {
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.castShadow = shadow;
      m.frustumCulled = false;
      m.userData.noShadow = !shadow;
      this.group.add(m);
      return m;
    };
    mk('ponchoBody', this.body.geo, coatMat, true);
    mk('ponchoLining', this.body.geo, liningMat, false);
    for (let k = 0; k < 2; k++) {
      mk('sleeve' + (k ? 'R' : 'L'), this.sleeves[k].geo, sleeveMat, true);
      mk('sleeveLining' + (k ? 'R' : 'L'), this.sleeves[k].geo, sleeveLining, false);
    }
  }

  thetaAt(s, v) {
    const tmin = 0.004 + 0.25 * Math.pow(smooth((v - this.vOpen) / (1 - this.vOpen)), 1.2);
    return tmin + s * (TAU - 2 * tmin);
  }

  _buildBody() {
    const nU = 104;
    const nV = 26;
    const count = (nU + 1) * (nV + 1);
    const rest = new Float32Array(count * 3);
    const theta = new Float32Array(count);
    const vv = new Float32Array(count);
    const hemW = new Float32Array(count);
    const wUp = new Float32Array(count);
    const sideOf = new Int8Array(count);
    const dirs = [];
    for (let s = 0; s < 2; s++) {
      const sg = s === 0 ? 1 : -1;
      dirs.push(new THREE.Vector3(sg * Math.sin(this.armSpread), -Math.cos(this.armSpread), 0));
    }
    const tmp = new THREE.Vector3();
    for (let i = 0; i <= nV; i++) {
      const v = i / nV;
      for (let j = 0; j <= nU; j++) {
        const th = this.thetaAt(j / nU, v);
        const [r, y] = meridian(th, nV)[i];
        const idx = i * (nU + 1) + j;
        const x = r * Math.sin(th);
        const z = r * Math.cos(th);
        rest[idx * 3] = x;
        rest[idx * 3 + 1] = y;
        rest[idx * 3 + 2] = z;
        theta[idx] = th;
        vv[idx] = v;
        hemW[idx] = Math.pow(smooth((v - 0.2) / 0.8), 1.35);
        // 肩の上だけ腕に少しついていく（腕を上げたとき肩が引っ張られる）
        const side = Math.sin(th) >= 0 ? 0 : 1;
        sideOf[idx] = side;
        const phi = Math.acos(Math.cos(th));
        const mask = Math.exp(-(((phi - Math.PI / 2) / 0.5) ** 2));
        tmp.set(x, y, z).sub(this.shoulder[side]);
        const lam = tmp.dot(dirs[side]) / this.armLen;
        wUp[idx] = 0.55 * mask * smooth(lam / 0.3) * (1 - smooth((v - 0.35) / 0.3));
      }
    }
    const metric = metricOf(rest, nU, nV);
    const geo = gridGeometry(nU, nV, rest, (s, v) => [s, 1 - v]);
    this.body = { nU, nV, count, rest, theta, vv, hemW, wUp, sideOf, geo, ...metric };
  }

  _buildSleeves() {
    this.sleeves = [];
    const nU = 32; // 周方向（ψ=0 が袖の下側。継ぎ目を下に隠す）
    const nV = 18; // 腕に沿う方向
    const L0 = -0.14;
    const L1 = 1.04;
    for (let side = 0; side < 2; side++) {
      const sg = side === 0 ? 1 : -1;
      const O = this.shoulder[side];
      const D = new THREE.Vector3(sg * Math.sin(this.armSpread), -Math.cos(this.armSpread), 0);
      const U = new THREE.Vector3(sg * Math.cos(this.armSpread), Math.sin(this.armSpread), 0);
      const Z = new THREE.Vector3(0, 0, 1);
      const count = (nU + 1) * (nV + 1);
      const rest = new Float32Array(count * 3);
      const lam = new Float32Array(count);
      const hang = new Float32Array(count);
      const P = new THREE.Vector3();
      for (let i = 0; i <= nV; i++) {
        const l = L0 + ((L1 - L0) * i) / nV;
        const lc = Math.max(0, l);
        const rb = 0.066 + 0.026 * Math.pow(lc, 1.3);
        const drape = 0.058 * Math.pow(smooth((lc - 0.2) / 0.8), 1.3);
        for (let j = 0; j <= nU; j++) {
          const psi = (j / nU) * TAU; // 0=下, π=上
          const up = -Math.cos(psi); // 上向き成分（U 方向）
          const fr = Math.sin(psi) * sg; // 前後（左右で向きをそろえる）
          const h = Math.pow(Math.max(0, -up), 1.25); // 下側ほど垂れる
          P.copy(O)
            .addScaledVector(D, l * this.armLen)
            .addScaledVector(U, up * rb)
            .addScaledVector(Z, fr * rb * 1.08);
          P.y -= drape * h;
          const idx = i * (nU + 1) + j;
          rest[idx * 3] = P.x;
          rest[idx * 3 + 1] = P.y;
          rest[idx * 3 + 2] = P.z;
          lam[idx] = l;
          hang[idx] = h * smooth(lc);
        }
      }
      const metric = metricOf(rest, nU, nV);
      // ψ の回る向きを左右で反転しているので、どちらの袖も同じ三角形の並びで外向きになる
      const geo = gridGeometry(nU, nV, rest, (s, v) => [sg > 0 ? s : 1 - s, 1 - v]);
      this.sleeves.push({ nU, nV, count, rest, lam, hang, geo, L0, L1, ...metric });
    }
  }

  // 胴の (θ, ワールド高さ) に最も近い格子点の (s, v)
  locate(theta, yWorld) {
    const b = this.body;
    const y = yWorld - PONCHO_CHEST_Y;
    let best = 0;
    let bd = Infinity;
    for (let idx = 0; idx < b.count; idx++) {
      let dt = Math.abs(b.theta[idx] - theta);
      dt = Math.min(dt, TAU - dt);
      const d = dt * 0.3 + Math.abs(b.rest[idx * 3 + 1] - y);
      if (d < bd) {
        bd = d;
        best = idx;
      }
    }
    const i = Math.floor(best / (b.nU + 1));
    const j = best % (b.nU + 1);
    return { s: j / b.nU, v: i / b.nV };
  }

  _metric(part, s, v) {
    const i = Math.round(v * part.nV);
    const j = Math.round(s * part.nU);
    const idx = i * (part.nU + 1) + j;
    return { du: part.du[idx], dv: part.dv[idx] };
  }

  _paintBody() {
    const b = this.body;
    const W = 2048;
    const H = 1024;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    const trim = hex(PALETTE.trim);
    const strap = hex(PALETTE.strap);
    const metal = hex(PALETTE.metal);
    g.fillStyle = hex(PALETTE.coat);
    g.fillRect(0, 0, W, H);
    // 布の折り目（すそへ向かって濃くなる縦のかげ）
    for (let k = 0; k < 30; k++) {
      const x = ((k + 0.5) / 30) * W + Math.sin(k * 12.9898) * 30;
      const hw = 22 + 26 * Math.abs(Math.sin(k * 7.13));
      const grad = g.createLinearGradient(x - hw, 0, x + hw, 0);
      const a = 0.018 + 0.026 * Math.abs(Math.sin(k * 3.7));
      grad.addColorStop(0, 'rgba(120,90,80,0)');
      grad.addColorStop(0.5, `rgba(120,90,80,${a})`);
      grad.addColorStop(1, 'rgba(120,90,80,0)');
      g.fillStyle = grad;
      const top = H * (0.35 + 0.2 * Math.abs(Math.sin(k * 5.3)));
      const vg = g.createLinearGradient(0, top, 0, H);
      g.fillRect(x - hw, top, hw * 2, H - top);
      void vg;
    }
    const feature = (s, v, fn) => {
      const m = this._metric(b, s, v);
      g.save();
      g.translate(s * W, v * H);
      g.scale(W / m.du, H / m.dv);
      fn(g);
      g.restore();
    };
    // すそのトリム
    const hemBand = (off, width, color) => {
      g.fillStyle = color;
      const steps = 512;
      for (let k = 0; k < steps; k++) {
        const s0 = k / steps;
        const m = this._metric(b, s0 + 0.5 / steps, 1);
        const o = off / m.dv;
        const hv = width / m.dv;
        g.fillRect(s0 * W - 0.5, (1 - o - hv) * H, W / steps + 1, hv * H + 1);
      }
    };
    hemBand(0, 0.03, trim);
    hemBand(0, 0.004, '#8b6f6a');
    // 前立て
    for (const edge of [0, 1]) {
      for (let k = 0; k < 128; k++) {
        const v0 = k / 128;
        const v1 = (k + 1) / 128;
        const m = this._metric(b, edge, (v0 + v1) / 2);
        if (v0 > this.vOpen - 0.1) {
          const w = 0.021 / m.du;
          g.fillStyle = trim;
          g.fillRect(edge === 0 ? 0 : (1 - w) * W, v0 * H - 0.5, w * W, (v1 - v0) * H + 1);
        } else {
          const w = 0.008 / m.du;
          g.fillStyle = '#b8a098';
          g.fillRect(edge === 0 ? 0 : (1 - w) * W, v0 * H - 0.5, w * W, (v1 - v0) * H + 1);
          g.fillStyle = '#9b817a';
          const tw = 0.005 / m.du;
          for (let t = 0; t < 3; t++) g.fillRect(edge === 0 ? 0 : (1 - tw) * W, (v0 + ((v1 - v0) * t) / 3) * H, tw * W, 1.3);
        }
      }
    }
    // ポケット
    const pocket = (c) => {
      c.fillStyle = 'rgba(110,80,72,0.22)';
      c.fillRect(-0.035, -0.042, 0.08, 0.11);
      c.fillStyle = '#f4e9e3';
      c.fillRect(-0.04, -0.048, 0.08, 0.108);
      c.strokeStyle = '#cfb8b0';
      c.lineWidth = 0.0025;
      c.strokeRect(-0.037, -0.045, 0.074, 0.102);
      c.fillStyle = 'rgba(110,80,72,0.28)';
      c.fillRect(-0.041, -0.041, 0.084, 0.042);
      c.fillStyle = '#f7ede8';
      c.fillRect(-0.043, -0.05, 0.086, 0.042);
      c.strokeStyle = '#cfb8b0';
      c.strokeRect(-0.04, -0.047, 0.08, 0.036);
      c.fillStyle = strap;
      c.fillRect(-0.0095, -0.052, 0.019, 0.106);
      c.strokeStyle = metal;
      c.lineWidth = 0.0038;
      c.strokeRect(-0.0135, -0.012, 0.027, 0.025);
      c.fillStyle = metal;
      c.fillRect(-0.0018, -0.012, 0.0036, 0.025);
    };
    for (const th of [0.72, TAU - 0.72]) {
      const hit = this.locate(th, 0.8);
      feature(hit.s, hit.v, pocket);
    }
    // 肉球（左胸）
    const pawHit = this.locate(0.56, 1.045);
    feature(pawHit.s, pawHit.v, (c) => {
      c.fillStyle = hex(PALETTE.paw);
      c.beginPath();
      c.ellipse(0, 0.006, 0.0128, 0.0108, 0, 0, TAU);
      c.fill();
      for (const [x, y, r] of [
        [-0.0148, -0.0085, 0.005],
        [-0.0053, -0.016, 0.0054],
        [0.0053, -0.016, 0.0054],
        [0.0148, -0.0085, 0.005],
      ]) {
        c.beginPath();
        c.ellipse(x, y, r, r * 1.2, 0, 0, TAU);
        c.fill();
      }
    });
    // 三角エンブレム（左下前）と帯（右下前）
    const triHit = this.locate(0.36, 0.735);
    feature(triHit.s, triHit.v, (c) => {
      c.strokeStyle = trim;
      c.lineWidth = 0.0042;
      c.beginPath();
      c.moveTo(-0.026, 0.013);
      c.lineTo(0.026, 0.013);
      c.lineTo(-0.009, -0.015);
      c.closePath();
      c.stroke();
      c.beginPath();
      c.moveTo(-0.013, 0.005);
      c.lineTo(0.009, 0.005);
      c.stroke();
    });
    const stripeHit = this.locate(TAU - 0.42, 0.735);
    feature(stripeHit.s, stripeHit.v, (c) => {
      c.fillStyle = trim;
      c.rotate(-0.2);
      c.fillRect(-0.032, -0.0065, 0.064, 0.013);
    });
    // 肩の切り替え（前後）
    for (const th of [Math.PI / 2, (3 * Math.PI) / 2]) {
      const hit = this.locate(th, 1.085);
      feature(hit.s, hit.v, (c) => {
        c.fillStyle = trim;
        c.fillRect(-0.09, -0.012, 0.18, 0.024);
      });
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  _paintLining() {
    const b = this.body;
    const W = 1024;
    const H = 512;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = hex(PALETTE.coatLining);
    g.fillRect(0, 0, W, H);
    g.fillStyle = hex(PALETTE.trim);
    for (let k = 0; k < 256; k++) {
      const m = this._metric(b, (k + 0.5) / 256, 1);
      const hv = 0.026 / m.dv;
      g.fillRect((k / 256) * W - 0.5, (1 - hv) * H, W / 256 + 1, hv * H + 1);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _paintSleeve() {
    const sl = this.sleeves[0];
    const W = 1024;
    const H = 512;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    const trim = hex(PALETTE.trim);
    const strap = hex(PALETTE.strap);
    const metal = hex(PALETTE.metal);
    g.fillStyle = hex(PALETTE.coat);
    g.fillRect(0, 0, W, H);
    // 腕に沿った位置 l（0=肩, 1=手首）→ キャンバスの y
    const yOf = (l) => ((l - sl.L0) / (sl.L1 - sl.L0)) * H;
    const bandAt = (l, widthM, color) => {
      const m = this._metric(sl, 0.5, (l - sl.L0) / (sl.L1 - sl.L0));
      const hpx = (widthM / m.dv) * H;
      g.fillStyle = color;
      g.fillRect(0, yOf(l) - hpx / 2, W, hpx);
    };
    // 袖口：端の帯と、その少し上の帯
    const endM = this._metric(sl, 0.5, 1);
    const endH = (0.03 / endM.dv) * H;
    g.fillStyle = trim;
    g.fillRect(0, H - endH, W, endH);
    g.fillStyle = '#8b6f6a';
    g.fillRect(0, H - endH * 0.14, W, endH * 0.14);
    bandAt(0.955, 0.009, trim);
    // 上腕のベルトとバックル（袖の上側＝u 0.5）
    bandAt(0.44, 0.02, strap);
    const bm = this._metric(sl, 0.36, (0.44 - sl.L0) / (sl.L1 - sl.L0));
    g.save();
    g.translate(0.36 * W, yOf(0.44));
    g.scale(W / bm.du, H / bm.dv);
    g.strokeStyle = metal;
    g.lineWidth = 0.004;
    g.strokeRect(-0.016, -0.016, 0.032, 0.032);
    g.fillStyle = metal;
    g.fillRect(-0.002, -0.013, 0.004, 0.026);
    g.restore();
    // 肩の茶色いパッチ（袖の上側）
    const pm = this._metric(sl, 0.5, (0.12 - sl.L0) / (sl.L1 - sl.L0));
    g.save();
    g.translate(0.5 * W, yOf(0.12));
    g.scale(W / pm.du, H / pm.dv);
    g.fillStyle = trim;
    g.beginPath();
    g.moveTo(-0.055, -0.04);
    g.lineTo(0.055, -0.04);
    g.lineTo(0.045, 0.045);
    g.lineTo(-0.045, 0.045);
    g.closePath();
    g.fill();
    g.restore();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  // ctx: { dt, armDelta:[{up,fore}], accelLocal, windLocal, capsules, boxBack, flutter }
  update(ctx) {
    const dt = Math.min(0.05, ctx.dt);
    this.time += dt;
    const acc = ctx.accelLocal;
    const wind = ctx.windLocal;
    const flutter = ctx.flutter || 0;
    const K = this.K;
    const off = this.hemOff;
    const vel = this.hemVel;
    for (let k = 0; k < K; k++) {
      const [dx, dz] = this.hemDir[k];
      let tx = wind.x * 0.017 - acc.x * 0.0035;
      let ty = wind.y * 0.02 - acc.y * 0.0025;
      let tz = wind.z * 0.017 - acc.z * 0.0035;
      const lift = Math.max(0, wind.y);
      tx += dx * lift * 0.012;
      tz += dz * lift * 0.012;
      const radial = tx * dx + tz * dz;
      if (radial < -0.018) {
        tx -= dx * (radial + 0.018);
        tz -= dz * (radial + 0.018);
      }
      const ph = this.time * 13 + k * 0.9;
      const fl = flutter * (0.012 * Math.sin(ph) + 0.006 * Math.sin(ph * 1.7 + 1.3));
      tx += dx * fl;
      tz += dz * fl;
      ty += fl * 0.6;
      const mag = Math.hypot(tx, ty, tz);
      if (mag > 0.2) {
        tx *= 0.2 / mag;
        ty *= 0.2 / mag;
        tz *= 0.2 / mag;
      }
      for (let c = 0; c < 3; c++) {
        const t = c === 0 ? tx : c === 1 ? ty : tz;
        const i = k * 3 + c;
        vel[i] += ((t - off[i]) * 90 - vel[i] * 11) * dt;
        off[i] += vel[i] * dt;
      }
    }
    // 袖の垂れ下がり部分のなびき
    for (let s = 0; s < 2; s++) {
      const o = this.sleeveOff[s];
      const v = this.sleeveVel[s];
      const tgt = [wind.x * 0.008 - acc.x * 0.002, Math.max(-0.02, wind.y * 0.01), wind.z * 0.008 - acc.z * 0.002];
      const ph = this.time * 11 + s * 2;
      tgt[0] += flutter * 0.008 * Math.sin(ph);
      tgt[2] += flutter * 0.008 * Math.cos(ph * 1.3);
      for (let c = 0; c < 3; c++) {
        v[c] += ((Math.max(-0.12, Math.min(0.12, tgt[c])) - o[c]) * 80 - v[c] * 9) * dt;
        o[c] += v[c] * dt;
      }
    }

    const U = [ctx.armDelta[0].up.elements, ctx.armDelta[1].up.elements];
    const F = [ctx.armDelta[0].fore.elements, ctx.armDelta[1].fore.elements];
    const caps = ctx.capsules || [];
    const boxBack = ctx.boxBack;

    // --- 胴
    const b = this.body;
    const pos = b.geo.attributes.position.array;
    for (let i = 0; i < b.count; i++) {
      const i3 = i * 3;
      const x = b.rest[i3];
      const y = b.rest[i3 + 1];
      const z = b.rest[i3 + 2];
      let px = x;
      let py = y;
      let pz = z;
      const wu = b.wUp[i];
      if (wu > 0.001) {
        const u = U[b.sideOf[i]];
        px = (1 - wu) * x + wu * (u[0] * x + u[4] * y + u[8] * z + u[12]);
        py = (1 - wu) * y + wu * (u[1] * x + u[5] * y + u[9] * z + u[13]);
        pz = (1 - wu) * z + wu * (u[2] * x + u[6] * y + u[10] * z + u[14]);
      }
      const hw = b.hemW[i];
      if (hw > 0.001) {
        let th = b.theta[i] / TAU;
        th -= Math.floor(th);
        const fk = th * K;
        const k0 = Math.floor(fk) % K;
        const k1 = (k0 + 1) % K;
        const t = fk - Math.floor(fk);
        px += hw * (off[k0 * 3] * (1 - t) + off[k1 * 3] * t);
        py += hw * (off[k0 * 3 + 1] * (1 - t) + off[k1 * 3 + 1] * t);
        pz += hw * (off[k0 * 3 + 2] * (1 - t) + off[k1 * 3 + 2] * t);
      }
      if (boxBack !== null && boxBack !== undefined && pz < boxBack && py > -0.2 && Math.abs(px) < 0.17) pz = boxBack;
      if (b.vv[i] > 0.3) {
        const r = pushCaps(px, py, pz, caps, b.theta[i]);
        px = r[0];
        py = r[1];
        pz = r[2];
      }
      pos[i3] = px;
      pos[i3 + 1] = py;
      pos[i3 + 2] = pz;
    }
    b.geo.attributes.position.needsUpdate = true;
    b.geo.computeVertexNormals();

    // --- 袖
    for (let s = 0; s < 2; s++) {
      const sl = this.sleeves[s];
      const sp = sl.geo.attributes.position.array;
      const u = U[s];
      const f = F[s];
      const o = this.sleeveOff[s];
      for (let i = 0; i < sl.count; i++) {
        const i3 = i * 3;
        const x = sl.rest[i3];
        const y = sl.rest[i3 + 1];
        const z = sl.rest[i3 + 2];
        const l = sl.lam[i];
        const wf = smooth((l - 0.42) / 0.36);
        const wu = 1 - wf;
        let px = wu * (u[0] * x + u[4] * y + u[8] * z + u[12]) + wf * (f[0] * x + f[4] * y + f[8] * z + f[12]);
        let py = wu * (u[1] * x + u[5] * y + u[9] * z + u[13]) + wf * (f[1] * x + f[5] * y + f[9] * z + f[13]);
        let pz = wu * (u[2] * x + u[6] * y + u[10] * z + u[14]) + wf * (f[2] * x + f[6] * y + f[10] * z + f[14]);
        const h = sl.hang[i];
        if (h > 0.001) {
          px += o[0] * h;
          py += o[1] * h;
          pz += o[2] * h;
        }
        sp[i3] = px;
        sp[i3 + 1] = py;
        sp[i3 + 2] = pz;
      }
      sl.geo.attributes.position.needsUpdate = true;
      sl.geo.computeVertexNormals();
    }
  }
}

const _r = [0, 0, 0];
function pushCaps(px, py, pz, caps, theta) {
  for (let c = 0; c < caps.length; c++) {
    const cap = caps[c];
    const ax = cap.a.x;
    const ay = cap.a.y;
    const az = cap.a.z;
    const bx = cap.b.x - ax;
    const by = cap.b.y - ay;
    const bz = cap.b.z - az;
    const bb = bx * bx + by * by + bz * bz;
    let t = ((px - ax) * bx + (py - ay) * by + (pz - az) * bz) / (bb || 1);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + bx * t;
    const qy = ay + by * t;
    const qz = az + bz * t;
    let dx = px - qx;
    let dy = py - qy;
    let dz = pz - qz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < cap.r * cap.r) {
      let d = Math.sqrt(d2);
      if (d < 1e-5) {
        dx = Math.sin(theta);
        dy = 0;
        dz = Math.cos(theta);
        d = 1;
      }
      const k = cap.r / d;
      px = qx + dx * k;
      py = qy + dy * k;
      pz = qz + dz * k;
    }
  }
  _r[0] = px;
  _r[1] = py;
  _r[2] = pz;
  return _r;
}
