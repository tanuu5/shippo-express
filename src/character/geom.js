import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _c = new THREE.Color();

// [[t, r], ...] の半径プロファイルをなめらかに補間する
export function sampleProfile(profile, t) {
  if (t <= profile[0][0]) return profile[0][1];
  for (let i = 1; i < profile.length; i++) {
    const [t1, r1] = profile[i];
    const [t0, r0] = profile[i - 1];
    if (t <= t1) {
      const u = (t - t0) / Math.max(1e-6, t1 - t0);
      const s = u * u * (3 - 2 * u);
      return r0 + (r1 - r0) * s;
    }
  }
  return profile[profile.length - 1][1];
}

// 原点から -Y 方向へ伸びる、両端が丸い先細りの手足
export function limbGeometry(L, profile, radial = 16, capScale = 0.7) {
  const pts = [];
  const r0 = profile[0][1];
  const r1 = profile[profile.length - 1][1];
  const cap = 5;
  for (let i = 0; i <= cap; i++) {
    const a = (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r0 * Math.sin(a), r0 * Math.cos(a) * capScale));
  }
  const N = 18;
  for (let i = 1; i < N; i++) {
    const t = i / N;
    pts.push(new THREE.Vector2(sampleProfile(profile, t), -t * L));
  }
  for (let i = 0; i <= cap; i++) {
    const a = Math.PI / 2 + (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, r1 * Math.sin(a)), -L + r1 * Math.cos(a) * capScale));
  }
  pts.reverse(); // LatheGeometry は下→上の順で外向きの面になる
  return new THREE.LatheGeometry(pts, radial);
}

export function ellipsoid(rx, ry, rz, w = 24, h = 16) {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz);
  return g;
}

export function colorize(geo, color) {
  _c.set(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// position / normal / color だけにそろえて結合する
export function mergeColored(list) {
  const prepared = list.map((g) => {
    let geo = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(geo.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'color') geo.deleteAttribute(k);
    }
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (!geo.attributes.color) colorize(geo, 0xffffff);
    return geo;
  });
  return mergeGeometries(prepared, false);
}

// 髪の毛束：断面が平たい楕円のチューブ。平たい面が center から外を向くように向きを決める
export function lockGeometry(points, o) {
  const segs = o.segs || 20;
  const radial = o.radial || 8;
  const center = o.center || new THREE.Vector3();
  const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5);
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  const P = new THREE.Vector3();
  const T = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  const R = new THREE.Vector3();
  const prevN = new THREE.Vector3(0, 0, 1);
  const cRoot = new THREE.Color(o.colorRoot);
  const cTip = new THREE.Color(o.colorTip);
  const cMid = new THREE.Color(o.colorMid || o.colorTip);
  const cInner = new THREE.Color(o.colorInner || o.colorRoot);
  const tmp = new THREE.Color();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    curve.getTangentAt(t, T);
    R.subVectors(P, center);
    if (o.flatAxis) R.copy(o.flatAxis(t, P));
    N.copy(R).addScaledVector(T, -R.dot(T));
    if (N.lengthSq() < 1e-10) N.copy(prevN);
    N.normalize();
    if (N.dot(prevN) < 0 && i > 0) N.negate();
    prevN.copy(N);
    B.crossVectors(T, N).normalize();
    N.crossVectors(B, T).normalize();
    const w = o.width(t);
    const h = o.thick(t);
    if (t < 0.5) tmp.copy(cRoot).lerp(cMid, t / 0.5);
    else tmp.copy(cMid).lerp(cTip, (t - 0.5) / 0.5);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      pos.push(P.x + B.x * ca * w + N.x * sa * h, P.y + B.y * ca * w + N.y * sa * h, P.z + B.z * ca * w + N.z * sa * h);
      let nx = B.x * ca * h + N.x * sa * w;
      let ny = B.y * ca * h + N.y * sa * w;
      let nz = B.z * ca * h + N.z * sa * w;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / nl, ny / nl, nz / nl);
      // 頭に向いた側（内側）は影色へ寄せて、束の重なりに奥行きを出す
      const inner = Math.max(0, -sa);
      const r = tmp.r + (cInner.r - tmp.r) * inner * 0.8;
      const g = tmp.g + (cInner.g - tmp.g) * inner * 0.8;
      const b = tmp.b + (cInner.b - tmp.b) * inner * 0.8;
      col.push(r, g, b);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return geo;
}

// 細いひも（一定の太さ）
export function cordGeometry(points, radius, color, segs = 16, radial = 6) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, segs, radius, radial, false);
  return colorize(g, color);
}

// オオカミ耳：外側（毛）と内側（ピンクのくぼみ）を持つ、先のとがった殻
// 原点が耳の付け根、+Y が先端、+Z が耳の正面（内側）
export function earGeometry(o) {
  const H = o.height;
  const W = o.width;
  const D = o.depth;
  const ns = 12;
  const nt = 14;
  const outer = new THREE.Color(o.outer);
  const inner = new THREE.Color(o.inner);
  const rim = new THREE.Color(o.rim || o.outer);
  const pos = [];
  const col = [];
  const idx = [];
  const halfW = (t) => (W / 2) * Math.pow(1 - t, 0.85) * (1 + 0.22 * Math.sin(Math.PI * Math.min(1, t * 1.4)));
  const lean = (t) => o.lean * t * t; // 先端を少し後ろへ
  const tmp = new THREE.Color();
  // 面 0: 背面（毛）, 面 1: 前面（内側）
  for (let face = 0; face < 2; face++) {
    const base = pos.length / 3;
    for (let i = 0; i <= nt; i++) {
      const t = i / nt;
      for (let j = 0; j <= ns; j++) {
        const s = (j / ns) * 2 - 1;
        const x = s * halfW(t);
        const y = t * H;
        const bulge = (1 - s * s) * Math.pow(1 - t, 0.6);
        let z;
        if (face === 0) {
          z = -0.004 - D * bulge;
          tmp.copy(outer);
        } else {
          z = 0.004 - D * 0.55 * bulge * (1 - t * 0.5);
          const k = THREE.MathUtils.smoothstep(Math.abs(s), 0.55, 0.9);
          tmp.copy(inner).lerp(rim, Math.max(k, THREE.MathUtils.smoothstep(t, 0.82, 1)));
        }
        pos.push(x, y, z - lean(t));
        col.push(tmp.r, tmp.g, tmp.b);
      }
    }
    for (let i = 0; i < nt; i++) {
      for (let j = 0; j < ns; j++) {
        const a = base + i * (ns + 1) + j;
        const b = a + ns + 1;
        // 背面（毛）は -Z、前面（内側）は +Z が表
        if (face === 0) idx.push(a, b, a + 1, b, b + 1, a + 1);
        else idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  // ふち：前面と背面の端をつなぐ細い帯
  const rows = nt + 1;
  const cols = ns + 1;
  for (const edgeJ of [0, ns]) {
    for (let i = 0; i < nt; i++) {
      const a0 = i * cols + edgeJ;
      const a1 = (i + 1) * cols + edgeJ;
      const b0 = rows * cols + i * cols + edgeJ;
      const b1 = rows * cols + (i + 1) * cols + edgeJ;
      if (edgeJ === 0) idx.push(a0, b0, a1, a1, b0, b1);
      else idx.push(a0, a1, b0, a1, b1, b0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// 足の裏の輪郭（上から見た形）を押し出した靴底などに使う
export function footOutline(len, width, heel, toeRound = 0.45) {
  const s = new THREE.Shape();
  const hw = width / 2;
  const back = -heel;
  const front = len - heel;
  s.moveTo(-hw * 0.82, back + hw * 0.6);
  s.quadraticCurveTo(-hw * 0.85, back, 0, back);
  s.quadraticCurveTo(hw * 0.85, back, hw * 0.82, back + hw * 0.6);
  s.lineTo(hw, front - hw * (1 + toeRound));
  s.quadraticCurveTo(hw * 1.02, front, 0, front);
  s.quadraticCurveTo(-hw * 1.02, front, -hw, front - hw * (1 + toeRound));
  s.closePath();
  return s;
}

// Shape を Y 方向に押し出す（Shape の x→X, y→Z）
export function extrudeUp(shape, height, bevel, color, curveSegs = 10) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, height - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: curveSegs,
  });
  // Extrude は +Z 方向へ伸びる。X 軸まわりに -90° 回して +Y へ、shape の y は -Z になるので反転
  g.rotateX(-Math.PI / 2);
  g.scale(1, 1, -1);
  // scale の反転で面の向きが裏返るので index を反転
  flipWinding(g);
  g.translate(0, bevel, 0);
  g.computeVertexNormals();
  return colorize(g, color);
}

export function flipWinding(g) {
  if (g.index) {
    const a = g.index.array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    g.index.needsUpdate = true;
  } else {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      for (let k = 0; k < p.itemSize; k++) {
        const t = p.array[(i + 1) * p.itemSize + k];
        p.array[(i + 1) * p.itemSize + k] = p.array[(i + 2) * p.itemSize + k];
        p.array[(i + 2) * p.itemSize + k] = t;
      }
    }
    p.needsUpdate = true;
  }
}
