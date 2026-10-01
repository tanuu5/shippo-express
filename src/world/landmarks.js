import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, ball, paint, merge } from './props.js';
import { vcolMat, makeWaterMaterial, GK } from './materials.js';
import { rgb } from './MeshBuilder.js';
import { N, P, RH, SW, CURB, line, QUAY_Z, LIGHTHOUSE, FERRIS } from './cityPlan.js';
import { Rng } from '../core/rng.js';

// 名所：時計塔・駅・神社・美術館・図書館・クリニック・学校・公園・港（魚市場・桟橋・灯台・観覧車）
// ctx = { g: 地面 MeshBuilder, b: 建物 MeshBuilder, v: 頂点色ジオメトリの配列, col, props, group, anim: [], water: [] }

const K = (k, u, v) => ({ uv: [u, v], aKind: [k, 0] });
const W0 = { aWin: [0, 0, 0, 0] };

// 建物用 MeshBuilder に窓つきの箱を足す
function bbox(ctx, x0, y0, z0, x1, y1, z1, color, style = 1, floorH = 3.4, winW = 2.8, skipTop = false) {
  const c = rgb(color);
  const faces = {
    s: [x1 - x0, 0],
    n: [x1 - x0, 0],
    e: [z1 - z0, 0],
    w: [z1 - z0, 0],
  };
  ctx.b.box(
    x0,
    y0,
    z0,
    x1,
    y1,
    z1,
    (face, p) => {
      if (face === 't') return skipTop ? null : { uv: [0, 0], color: rgb(shadeHex(color, 0.9)), aWin: [0, 0, -1, 1] };
      const L = faces[face][0];
      const sp = L / Math.max(1, Math.round(L / winW));
      return [
        { uv: [0, 0], color: c, aWin: [floorH, sp, style, x0 * 0.1] },
        { uv: [L, 0], color: c, aWin: [floorH, sp, style, x0 * 0.1] },
        { uv: [L, y1 - y0], color: c, aWin: [floorH, sp, style, x0 * 0.1] },
        { uv: [0, y1 - y0], color: c, aWin: [floorH, sp, style, x0 * 0.1] },
      ];
    },
    {},
  );
}

function shadeHex(hex, k) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return '#' + c.getHexString();
}

// 切妻屋根（頂点色）。屋根は厚み t の板として作り、軒下や吹き抜けの中から見上げても下面が見えるようにする。
// 上面の形（当たり判定の gable と合わせてある）は変えず、下面・小口・妻の内側・妻と下面のすき間をふさぐ帯を足す
function gableRoof(v, x0, z0, x1, z1, y, rise, color, axis = 'x', ov = 0.5, underColor = null) {
  // ローカル座標：u＝棟の向き、w＝棟と直角。axis 'z' は x と z を入れ替えて置く
  const [u0, u1, w0, w1] = axis === 'x' ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
  const W = axis === 'x' ? (u, yy, w) => [u, yy, w] : (u, yy, w) => [w, yy, u];
  const t = 0.12;
  const wm = (w0 + w1) / 2;
  const hw = (w1 - w0) / 2 + ov;
  const ua = u0 - ov;
  const ub = u1 + ov;
  const yr = y + rise;
  // 壁の線（w0・w1）での屋根の下面の高さ
  const yu = Math.max(y, y + (rise * ov) / hw - t);
  const outer = [];
  const inner = [];
  // 凸多角形を扇形に分け、各三角形の表が法線 n（ローカル座標）を向くように積む
  const face = (arr, pts, n) => {
    const P = pts.map((q) => W(...q));
    const N = W(...n);
    for (let i = 1; i + 1 < P.length; i++) {
      const a = P[0];
      const b = P[i];
      const c = P[i + 1];
      const ex = b[0] - a[0], ey = b[1] - a[1], ez = b[2] - a[2];
      const fx = c[0] - a[0], fy = c[1] - a[1], fz = c[2] - a[2];
      const cx = ey * fz - ez * fy;
      const cy = ez * fx - ex * fz;
      const cz = ex * fy - ey * fx;
      if (cx * cx + cy * cy + cz * cz < 1e-10) continue;
      if (cx * N[0] + cy * N[1] + cz * N[2] >= 0) arr.push(...a, ...b, ...c);
      else arr.push(...a, ...c, ...b);
    }
  };
  // 上面（2 枚の斜面）と、その t 下の下面
  for (const [we, s] of [[w1 + ov, 1], [w0 - ov, -1]]) {
    face(outer, [[ua, y, we], [ub, y, we], [ub, yr, wm], [ua, yr, wm]], [0, 1, s]);
    face(inner, [[ua, y - t, we], [ub, y - t, we], [ub, yr - t, wm], [ua, yr - t, wm]], [0, -1, -s]);
    // 軒先の小口
    face(outer, [[ua, y - t, we], [ub, y - t, we], [ub, y, we], [ua, y, we]], [0, 0, s]);
    // 妻側の傾いた縁
    for (const [uu, su] of [[ua, -1], [ub, 1]]) face(outer, [[uu, y - t, we], [uu, yr - t, wm], [uu, yr, wm], [uu, y, we]], [su, 0, 0]);
  }
  // 妻（屋根の下面まで届く五角形）。外側は屋根の色、内側は暗い色
  for (const [uu, su] of [[u0, -1], [u1, 1]]) {
    const pent = [[uu, y, w0], [uu, y, w1], [uu, yu, w1], [uu, yr - t, wm], [uu, yu, w0]];
    face(outer, pent, [su, 0, 0]);
    face(inner, pent, [-su, 0, 0]);
  }
  // 長辺側：壁の線から屋根の下面までのすき間をふさぐ帯（両面）
  if (yu > y + 1e-3) {
    for (const [ww, s] of [[w0, -1], [w1, 1]]) {
      const band = [[u0, y, ww], [u1, y, ww], [u1, yu, ww], [u0, yu, ww]];
      face(inner, band, [0, 0, s]);
      face(inner, band, [0, 0, -s]);
    }
  }
  const mk = (arr, hex) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return paint(g, hex);
  };
  // 下面は日が当たらず暗く沈むので、色は屋根より明るめ（指定がなければ屋根の色を白っぽく寄せる）
  const under = underColor || '#' + new THREE.Color(color).lerp(new THREE.Color('#f2ece2'), 0.62).getHexString();
  v.push(mk(outer, color), mk(inner, under));
}

export function buildLandmarks(plan, ctx) {
  const rng = new Rng(4242);
  for (const s of plan.specials) {
    if (s.type === 'clocktower') clockTower(s, ctx);
    else if (s.type === 'station') station(s, ctx);
    else if (s.type === 'shrine') shrine(s, ctx, rng);
    else if (s.type === 'museum') museum(s, ctx);
    else if (s.type === 'library') library(s, ctx);
    else if (s.type === 'clinic') clinic(s, ctx);
    else if (s.type === 'school') school(s, ctx, rng);
    else if (s.type === 'park') park(s, ctx, rng);
    else if (s.type === 'harbor') harbor(plan, ctx, rng);
  }
  railFence(ctx);
}

// ---- 時計塔広場
function clockTower(s, ctx) {
  const { x, z } = s;
  const lot = s.lot;
  const v = ctx.v;
  const stone = '#eadfcd';
  const stoneDark = '#cdbfa9';
  // 円い水盤（浅い水）
  const R0 = 6.2;
  const R1 = 6.8;
  const seg = 28;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const len = R1 * (a1 - a0) + 0.05;
    const g = new THREE.BoxGeometry(len, 0.5, R1 - R0);
    g.rotateY(-am + Math.PI / 2);
    g.translate(x + Math.cos(am) * ((R0 + R1) / 2), CURB + 0.25, z + Math.sin(am) * ((R0 + R1) / 2));
    v.push(paint(g, stoneDark));
    const cx = x + Math.cos(am) * ((R0 + R1) / 2);
    const cz = z + Math.sin(am) * ((R0 + R1) / 2);
    ctx.col.box(cx - 0.45, 0, cz - 0.45, cx + 0.45, CURB + 0.5, cz + 0.45, { tag: 'rim' });
  }
  const water = new THREE.Mesh(new THREE.CircleGeometry(R0, 40).rotateX(-Math.PI / 2), makeWaterMaterial({ color: 0x66b8c8 }));
  water.position.set(x, CURB + 0.33, z);
  water.receiveShadow = true;
  ctx.group.add(water);
  ctx.water.push(water);
  ctx.pools.push({ x, z, r: R0, y: CURB + 0.33 });
  // 塔：石の基壇 → 角柱つきの塔身 → 時計の段 → 鐘楼 → 銅ぶきの屋根
  const base = CURB;
  const trim = '#d9c8ad';
  const shadowC = '#6f5f58';
  v.push(box(6.6, 0.45, 6.6, x, base, z, stoneDark));
  v.push(box(6.0, 0.7, 6.0, x, base + 0.45, z, stoneDark));
  v.push(box(5.2, 14.6, 5.2, x, base + 1.15, z, stone));
  // 四隅の付け柱
  for (const [dx, dz] of [
    [-2.55, -2.55],
    [2.55, -2.55],
    [-2.55, 2.55],
    [2.55, 2.55],
  ]) v.push(box(0.75, 14.6, 0.75, x + dx, base + 1.15, z + dz, trim));
  // 帯
  for (const yy of [1.15, 5.6, 10.4]) v.push(box(5.6, 0.32, 5.6, x, base + yy, z, stoneDark));
  // アーチ窓（各面 2 段）
  for (const [dx, dz, rx] of [
    [0, 2.61, 0],
    [0, -2.61, 0],
    [2.61, 0, 1],
    [-2.61, 0, 1],
  ]) {
    for (const yy of [2.6, 7.2]) {
      const w = rx ? new THREE.BoxGeometry(0.06, 2.4, 1.0) : new THREE.BoxGeometry(1.0, 2.4, 0.06);
      w.translate(x + dx, base + yy + 1.2, z + dz);
      v.push(paint(w, '#51606e'));
      const arch = new THREE.CylinderGeometry(0.5, 0.5, 0.07, 14, 1, false, 0, Math.PI);
      // 半円（弧が上）を壁の外向きに立てる
      if (rx) arch.rotateZ(Math.PI / 2);
      else arch.rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
      arch.translate(x + dx, base + yy + 2.4, z + dz);
      v.push(paint(arch, '#51606e'));
      // 窓台
      const sill = rx ? new THREE.BoxGeometry(0.2, 0.12, 1.3) : new THREE.BoxGeometry(1.3, 0.12, 0.2);
      sill.translate(x + dx * 1.02, base + yy - 0.06, z + dz * 1.02);
      v.push(paint(sill, trim));
    }
  }
  // 時計の段
  v.push(box(6.1, 0.35, 6.1, x, base + 15.4, z, stoneDark));
  v.push(box(5.8, 4.2, 5.8, x, base + 15.75, z, stone));
  for (const [dx, dz] of [
    [-2.85, -2.85],
    [2.85, -2.85],
    [-2.85, 2.85],
    [2.85, 2.85],
  ]) v.push(box(0.6, 4.2, 0.6, x + dx, base + 15.75, z + dz, trim));
  v.push(box(6.3, 0.4, 6.3, x, base + 19.95, z, stoneDark));
  // 鐘楼（柱と鐘）
  for (const [dx, dz] of [
    [-2.35, -2.35],
    [2.35, -2.35],
    [-2.35, 2.35],
    [2.35, 2.35],
  ]) v.push(box(0.7, 3.0, 0.7, x + dx, base + 20.35, z + dz, stone));
  v.push(box(4.0, 0.2, 4.0, x, base + 20.35, z, stoneDark));
  const bell = new THREE.CylinderGeometry(0.45, 0.85, 1.2, 16, 1, true);
  bell.translate(x, base + 21.9, z);
  v.push(paint(bell, '#c9a24a'));
  v.push(ball(0.45, x, base + 22.5, z, '#c9a24a', 1));
  v.push(box(5.4, 0.35, 5.4, x, base + 23.35, z, stoneDark));
  // とんがり屋根
  const roof = new THREE.ConeGeometry(4.3, 6.6, 4, 1);
  roof.rotateY(Math.PI / 4);
  roof.translate(x, base + 23.7 + 3.3, z);
  v.push(paint(roof, '#5f9a8c'));
  v.push(ball(0.35, x, base + 30.4, z, '#e8c35a', 1));
  v.push(cyl(0.05, 0.05, 1.3, x, base + 30.4, z, '#e8c35a', 6));
  void shadowC;
  ctx.col.box(x - 3.3, 0, z - 3.3, x + 3.3, base + 24, z + 3.3, { tag: 'tower' });
  // 時計の文字盤（4 面、キャンバスを 1 秒ごとに描き直す）
  const cv = document.createElement('canvas');
  cv.width = 256;
  cv.height = 256;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const drawClock = (d) => {
    const g = cv.getContext('2d');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#fbf6ea';
    g.beginPath();
    g.arc(128, 128, 120, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = '#7f6866';
    g.stroke();
    g.fillStyle = '#5b4540';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.save();
      g.translate(128 + Math.sin(a) * 96, 128 - Math.cos(a) * 96);
      g.rotate(a);
      g.fillRect(-4, -12, 8, 24);
      g.restore();
    }
    const h = d.getHours() % 12;
    const m = d.getMinutes();
    const sec = d.getSeconds();
    const hand = (ang, len, w, c) => {
      g.save();
      g.translate(128, 128);
      g.rotate(ang);
      g.fillStyle = c;
      g.fillRect(-w / 2, -len, w, len + 12);
      g.restore();
    };
    hand(((h + m / 60) / 12) * Math.PI * 2, 58, 12, '#4a3632');
    hand(((m + sec / 60) / 60) * Math.PI * 2, 88, 8, '#4a3632');
    hand((sec / 60) * Math.PI * 2, 92, 3, '#c9573f');
    g.fillStyle = '#4a3632';
    g.beginPath();
    g.arc(128, 128, 10, 0, Math.PI * 2);
    g.fill();
    tex.needsUpdate = true;
  };
  drawClock(new Date());
  const faceGeo = [];
  const r = 1.75;
  const yc = base + 17.85;
  for (const [dx, dz, ry] of [
    [0, 2.93, 0],
    [2.93, 0, Math.PI / 2],
    [0, -2.93, Math.PI],
    [-2.93, 0, -Math.PI / 2],
  ]) {
    const g = new THREE.CircleGeometry(r, 36);
    g.rotateY(ry);
    g.translate(x + dx, yc, z + dz);
    faceGeo.push(g);
  }
  const faces = new THREE.Mesh(mergeGeometries(faceGeo), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 }));
  ctx.group.add(faces);
  let last = -1;
  ctx.anim.push(() => {
    const d = new Date();
    const s2 = d.getSeconds();
    if (s2 !== last) {
      last = s2;
      drawClock(d);
    }
  });
  // 広場の植え込みと木・ベンチ・街灯
  for (const [dx, dz] of [
    [-11, -11],
    [11, -11],
    [-11, 11],
    [11, 11],
  ]) {
    const px = x + dx;
    const pz = z + dz;
    v.push(cyl(2.4, 2.5, 0.45, px, CURB, pz, '#cdbfa9', 20));
    v.push(cyl(2.2, 2.2, 0.08, px, CURB + 0.45, pz, '#6d9a52', 20));
    ctx.col.box(px - 2.2, 0, pz - 2.2, px + 2.2, CURB + 0.5, pz + 2.2, { tag: 'planter' });
    ctx.props.add('trunk', px, CURB + 0.5, pz, dx, 1.05);
    ctx.props.add('sakuraCanopy', px, CURB + 0.5, pz, dz, 1.05, '#f6c6d4');
    ctx.col.box(px - 0.3, 0, pz - 0.3, px + 0.3, CURB + 3, pz + 0.3, { tag: 'tree', noCamera: true });
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const px = x + Math.cos(a) * 9.2;
    const pz = z + Math.sin(a) * 9.2;
    if (i % 2 === 0) {
      ctx.props.add('bench', px, CURB, pz, -a - Math.PI / 2);
      ctx.col.box(px - 0.7, 0, pz - 0.7, px + 0.7, CURB + 0.5, pz + 0.7, { tag: 'bench' });
    } else {
      ctx.props.add('lamp', px, CURB, pz, -a);
      ctx.col.box(px - 0.15, 0, pz - 0.15, px + 0.15, CURB + 4.4, pz + 0.15, { tag: 'lamp', noCamera: true });
    }
  }
  void lot;
}


// ---- 駅
function station(s, ctx) {
  const L = s.lot;
  const v = ctx.v;
  const x0 = L.ix0 + 8;
  const x1 = L.ix1 - 8;
  const z0 = L.iz0 + 1;
  const z1 = L.iz0 + 15;
  const h = 8.5;
  bbox(ctx, x0, CURB, z0, x1, CURB + h, z1, '#f1e4cf', 1, 4.2, 3.2);
  gableRoof(v, x0, z0, x1, z1, CURB + h, 3.2, '#4f6b5e', 'x', 0.8);
  ctx.col.add({ kind: 'gable', minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: 0, maxY: CURB + h + 3.2, gable: { axis: 'x', ridge: (z0 + z1) / 2, half: (z1 - z0) / 2, eave: CURB + h }, tag: 'building' });
  // 中央の時計台
  const cx = (x0 + x1) / 2;
  bbox(ctx, cx - 5, CURB, z1 - 3, cx + 5, CURB + 13.5, z1 + 1.5, '#f6ead6', 1, 4.5, 3.3);
  gableRoof(v, cx - 5, z1 - 3, cx + 5, z1 + 1.5, CURB + 13.5, 3, '#4f6b5e', 'z', 0.5);
  ctx.col.box(cx - 5, 0, z1 - 3, cx + 5, CURB + 13.5, z1 + 1.5, { tag: 'building' });
  v.push(paint(new THREE.CircleGeometry(1.5, 28).translate(cx, CURB + 10.5, z1 + 1.52), '#fbf6ea'));
  v.push(paint(new THREE.RingGeometry(1.5, 1.75, 28).translate(cx, CURB + 10.5, z1 + 1.53), '#7f6866'));
  v.push(box(0.12, 1.1, 0.04, cx, CURB + 10.4, z1 + 1.56, '#4a3632'));
  v.push(box(0.9, 0.12, 0.04, cx + 0.35, CURB + 10.5, z1 + 1.57, '#4a3632'));
  // 入口のひさし
  v.push(box(14, 0.35, 4, cx, CURB + 4.2, z1 + 3, '#6d7f76'));
  for (const dx of [-6.5, 6.5]) {
    v.push(cyl(0.18, 0.18, 4.2, cx + dx, CURB, z1 + 4.6, '#6d7f76', 8));
    ctx.col.box(cx + dx - 0.2, 0, z1 + 4.4, cx + dx + 0.2, CURB + 4.2, z1 + 4.8, { tag: 'pillar' });
  }
  ctx.col.add({ kind: 'platform', minX: cx - 7, maxX: cx + 7, minZ: z1 + 1, maxZ: z1 + 5, minY: CURB + 4.2, maxY: CURB + 4.55, tag: 'canopy' });
  // 看板
  ctx.signs.push({ text: 'しっぽ駅', icon: '🚉', x: cx, y: CURB + 6.6, z: z1 + 1.56, dir: 's', w: 7 });
  // 駅前ロータリー：花壇とバス停
  v.push(cyl(3.2, 3.3, 0.5, cx, CURB, L.iz1 - 6, '#cdbfa9', 24));
  v.push(cyl(3.0, 3.0, 0.1, cx, CURB + 0.5, L.iz1 - 6, '#e59aae', 24));
  ctx.col.box(cx - 3, 0, L.iz1 - 9, cx + 3, CURB + 0.55, L.iz1 - 3, { tag: 'planter' });
  busStop(ctx, x0 - 3, L.iz1 - 3.5, 0);
  busStop(ctx, x1 + 3, L.iz1 - 3.5, 0);
  // 列車（街の北側の線路を走る）
  const train = makeTrain();
  train.position.set(-400, CURB, line(0) - RH - SW - 6);
  ctx.group.add(train);
  let tx = -300;
  ctx.anim.push((t, dt) => {
    tx += dt * 16;
    if (tx > 320) tx = -320;
    train.position.x = tx;
  });
}

function makeTrain() {
  const g = new THREE.Group();
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const x = i * 13.2;
    parts.push(box(12.6, 3.1, 3.0, x, 0.55, 0, '#f4ecdc'));
    parts.push(box(12.62, 0.45, 3.02, x, 1.2, 0, '#c9573f'));
    parts.push(box(12.62, 0.9, 3.04, x, 2.0, 0, '#5b6f80'));
    parts.push(box(12.4, 0.25, 2.7, x, 3.65, 0, '#dcd2c2'));
    for (const dx of [-4.5, 4.5]) parts.push(box(2.2, 0.55, 2.6, x + dx, 0.0, 0, '#3f4247'));
  }
  // 先頭の丸み
  const nose = new THREE.SphereGeometry(1.55, 16, 10, 0, Math.PI);
  nose.rotateY(-Math.PI / 2);
  nose.scale(1.0, 1.05, 1);
  nose.translate(2 * 13.2 + 6.3, 2.05, 0);
  parts.push(paint(nose, '#f4ecdc'));
  const m = new THREE.Mesh(merge(parts), vcolMat());
  m.castShadow = true;
  g.add(m);
  return g;
}

function busStop(ctx, x, z, rot) {
  const v = ctx.v;
  v.push(box(3.2, 0.12, 1.5, x, CURB + 2.5, z, '#5f7f8a'));
  for (const dx of [-1.4, 1.4]) v.push(box(0.1, 2.5, 0.1, x + dx, CURB, z - 0.6, '#5f7f8a'));
  v.push(box(3.0, 1.9, 0.05, x, CURB + 0.4, z - 0.68, '#bcd6de'));
  v.push(box(2.6, 0.08, 0.45, x, CURB + 0.45, z - 0.35, '#b07a52'));
  ctx.col.box(x - 1.6, 0, z - 0.75, x + 1.6, CURB + 2.3, z - 0.6, { tag: 'busstop' });
  ctx.col.add({ kind: 'platform', minX: x - 1.6, maxX: x + 1.6, minZ: z - 0.75, maxZ: z + 0.75, minY: CURB + 2.45, maxY: CURB + 2.62, tag: 'busstopRoof' });
  void rot;
}

// ---- 神社（小高い丘・石段・鳥居・狐の像）
function shrine(s, ctx, rng) {
  const L = s.lot;
  const v = ctx.v;
  const top = 3.9;
  const hx0 = L.ix0 + 1.5;
  const hx1 = L.ix1 - 11;
  const hz0 = L.iz0 + 2.5;
  const hz1 = L.iz1 - 2.5;
  // 丘（石垣）
  ctx.g.hrect(hx0, hz0, hx1, hz1, top, (x, z) => K(GK.FOREST, x, z));
  const wall = (p, n) => ctx.g.quad(p, n, K(GK.STONE, 0, 0));
  wall([[hx1, CURB, hz1], [hx1, CURB, hz0], [hx1, top, hz0], [hx1, top, hz1]], [1, 0, 0]);
  wall([[hx0, CURB, hz0], [hx0, CURB, hz1], [hx0, top, hz1], [hx0, top, hz0]], [-1, 0, 0]);
  wall([[hx0, CURB, hz1], [hx1, CURB, hz1], [hx1, top, hz1], [hx0, top, hz1]], [0, 0, 1]);
  wall([[hx1, CURB, hz0], [hx0, CURB, hz0], [hx0, top, hz0], [hx1, top, hz0]], [0, 0, -1]);
  ctx.col.box(hx0, 0, hz0, hx1, top, hz1, { tag: 'hill' });
  // 石段（東側）
  const steps = 10;
  const stepD = (L.ix1 - 1 - hx1) / steps;
  for (let i = 0; i < steps; i++) {
    const y = CURB + ((top - CURB) * (i + 1)) / steps;
    const sx1 = L.ix1 - 1 - i * stepD;
    const sx0 = hx1;
    ctx.g.hrect(sx1 - stepD, -2.2, sx1, 2.2, y, (x, z) => K(GK.STONE, x, z));
    ctx.g.quad([[sx1, y - (top - CURB) / steps, 2.2], [sx1, y - (top - CURB) / steps, -2.2], [sx1, y, -2.2], [sx1, y, 2.2]], [1, 0, 0], K(GK.STONE, 0, 0));
    // 段の横の面（地面から踏み面まで石で埋める。ないと横から段の下が透けて見える）
    const xa = sx1 - stepD;
    ctx.g.quad([[xa, CURB, 2.2], [sx1, CURB, 2.2], [sx1, y, 2.2], [xa, y, 2.2]], [0, 0, 1], K(GK.STONE, 0, 0));
    ctx.g.quad([[sx1, CURB, -2.2], [xa, CURB, -2.2], [xa, y, -2.2], [sx1, y, -2.2]], [0, 0, -1], K(GK.STONE, 0, 0));
    ctx.col.box(sx1 - stepD, 0, -2.2, sx1, y, 2.2, { tag: 'step' });
    void sx0;
  }
  // 石段の横の土手
  for (const zz of [-2.2, 2.2]) {
    const sgn = zz < 0 ? -1 : 1;
    ctx.v.push(box(L.ix1 - 1 - hx1, 0.6, 0.4, (L.ix1 - 1 + hx1) / 2, CURB, zz + sgn * 0.2, '#a9a49b'));
  }
  // 鳥居（下と上）
  torii(v, ctx, L.ix1 + 0.4, 0, CURB, 4.2);
  torii(v, ctx, hx1 - 1.5, 0, top, 3.6);
  // 参道の石畳は丘の上の地面で表現、社殿
  const sx = hx0 + 5;
  const sz = 0;
  v.push(box(9, 0.8, 8, sx, top, sz, '#b9b2a6'));
  v.push(box(7, 3.2, 6, sx, top + 0.8, sz, '#8a5a3c'));
  for (const dz of [-2.9, 2.9]) for (const dx of [-3.4, 3.4]) v.push(box(0.35, 3.2, 0.35, sx + dx, top + 0.8, sz + dz, '#b8412f'));
  gableRoof(v, sx - 3.8, sz - 3.6, sx + 3.8, sz + 3.6, top + 4.0, 2.6, '#4b4f55', 'z', 1.1, '#b07a52');
  v.push(box(1.6, 0.8, 0.9, sx + 4.6, top + 0.8, sz, '#6b4a33'));
  ctx.col.box(sx - 4.5, 0, sz - 4, sx + 4.5, top + 4.0, sz + 4, { tag: 'building' });
  ctx.col.add({ kind: 'gable', minX: sx - 3.8, maxX: sx + 3.8, minZ: sz - 3.6, maxZ: sz + 3.6, minY: top + 3.9, maxY: top + 6.6, gable: { axis: 'z', ridge: sx, half: 3.8, eave: top + 4.0 }, tag: 'roof' });
  // 狐の像
  for (const dz of [-2.8, 2.8]) {
    const fx = hx1 - 4;
    v.push(box(1.1, 1.0, 1.1, fx, top, dz, '#b9b2a6'));
    v.push(paint(new THREE.SphereGeometry(0.34, 12, 10).scale(1, 1.25, 0.9).translate(fx, top + 1.45, dz), '#fbf7f0'));
    v.push(paint(new THREE.SphereGeometry(0.22, 12, 10).translate(fx + 0.12, top + 2.0, dz), '#fbf7f0'));
    v.push(paint(new THREE.ConeGeometry(0.08, 0.26, 6).translate(fx + 0.1, top + 2.28, dz - 0.1), '#fbf7f0'));
    v.push(paint(new THREE.ConeGeometry(0.08, 0.26, 6).translate(fx + 0.1, top + 2.28, dz + 0.1), '#fbf7f0'));
    v.push(paint(new THREE.ConeGeometry(0.07, 0.22, 6).rotateZ(-Math.PI / 2).translate(fx + 0.36, top + 1.97, dz), '#fbf7f0'));
    v.push(paint(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10).translate(fx + 0.02, top + 1.72, dz), '#d9412f'));
    ctx.col.box(fx - 0.55, 0, dz - 0.55, fx + 0.55, top + 1.0, dz + 0.55, { tag: 'statue' });
  }
  // 石灯籠
  for (const dz of [-3.2, 3.2]) {
    const lx = L.ix1 - 0.5;
    v.push(box(0.5, 0.9, 0.5, lx, CURB, dz + Math.sign(dz) * 0.3, '#a9a49b'));
    v.push(box(0.8, 0.6, 0.8, lx, CURB + 0.9, dz + Math.sign(dz) * 0.3, '#bdb8ae'));
    v.push(paint(new THREE.ConeGeometry(0.7, 0.5, 4).rotateY(Math.PI / 4).translate(lx, CURB + 1.75, dz + Math.sign(dz) * 0.3), '#8f8a80'));
  }
  // 鎮守の森
  for (let i = 0; i < 26; i++) {
    const a = rng.float(0, Math.PI * 2);
    let tx = rng.float(hx0 + 1, hx1 - 1);
    let tz = rng.float(hz0 + 1, hz1 - 1);
    if (Math.abs(tz) < 5 && tx > hx0 + 1 && tx < hx1) tz += Math.sign(tz || 1) * 5;
    if (Math.abs(tx - sx) < 5.5 && Math.abs(tz) < 5.5) continue;
    ctx.props.add('trunk', tx, top, tz, a, rng.float(1.0, 1.3));
    ctx.props.add('canopy', tx, top, tz, a, rng.float(1.1, 1.45), rng.pick(['#4f8a4c', '#5c9650', '#3f7a45', '#6aa15a']));
    ctx.col.box(tx - 0.3, top, tz - 0.3, tx + 0.3, top + 2.6, tz + 0.3, { tag: 'tree', noCamera: true });
  }
}

function torii(v, ctx, x, z, y, h) {
  const red = '#d4432f';
  const w = 4.6;
  for (const dz of [-1.7, 1.7]) {
    v.push(cyl(0.22, 0.26, h, x, y, z + dz, red, 10));
    v.push(cyl(0.3, 0.3, 0.3, x, y, z + dz, '#2f2f2f', 10));
    ctx.col.box(x - 0.25, 0, z + dz - 0.25, x + 0.25, y + h, z + dz + 0.25, { tag: 'torii' });
  }
  v.push(box(0.5, 0.32, w + 1.2, x, y + h, z, '#2f2f2f'));
  v.push(box(0.46, 0.3, w + 0.8, x, y + h - 0.28, z, red));
  v.push(box(0.3, 0.26, w - 0.4, x, y + h - 1.0, z, red));
  v.push(box(0.2, 0.7, 0.5, x, y + h - 0.95, z, '#2f2f2f'));
}

// ---- 美術館（基壇＋列柱）
function museum(s, ctx) {
  const L = s.lot;
  const v = ctx.v;
  const pz0 = L.iz0 + 4;
  const pz1 = L.iz1 - 5;
  const px0 = L.ix0 + 2.5;
  const px1 = L.ix1 - 2.5;
  const podium = 1.2;
  v.push(box(px1 - px0, podium - CURB, pz1 - pz0, (px0 + px1) / 2, CURB, (pz0 + pz1) / 2, '#e2d8c6'));
  ctx.col.box(px0, 0, pz0, px1, podium, pz1, { tag: 'podium' });
  // 正面の階段
  for (let i = 0; i < 3; i++) {
    const y = CURB + ((podium - CURB) * (i + 1)) / 3;
    const z = pz1 + (3 - i) * 0.8;
    v.push(box(px1 - px0 - 4, y - CURB, 0.8, (px0 + px1) / 2, CURB, z - 0.4, '#e9e0d0'));
    ctx.col.box(px0 + 2, 0, z - 0.8, px1 - 2, y, z, { tag: 'step' });
  }
  const bx0 = px0 + 2;
  const bx1 = px1 - 2;
  const bz0 = pz0 + 1.5;
  const bz1 = pz1 - 4.2;
  bbox(ctx, bx0, podium, bz0, bx1, podium + 8.5, bz1, '#f1e8d8', 1, 4.25, 3.6);
  ctx.col.box(bx0, 0, bz0, bx1, podium + 8.5, bz1, { tag: 'building' });
  // 列柱と破風
  const cols = 6;
  for (let i = 0; i < cols; i++) {
    const cx = bx0 + 2 + (i * (bx1 - bx0 - 4)) / (cols - 1);
    v.push(cyl(0.45, 0.5, 6.6, cx, podium, pz1 - 1.2, '#f7f1e6', 14));
    v.push(box(1.2, 0.3, 1.2, cx, podium, pz1 - 1.2, '#e2d8c6'));
    v.push(box(1.2, 0.3, 1.2, cx, podium + 6.6, pz1 - 1.2, '#e2d8c6'));
    ctx.col.box(cx - 0.5, 0, pz1 - 1.7, cx + 0.5, podium + 6.9, pz1 - 0.7, { tag: 'column' });
  }
  v.push(box(bx1 - bx0 + 0.4, 0.8, 4.4, (bx0 + bx1) / 2, podium + 6.9, pz1 - 2.1, '#efe6d6'));
  const ped = new THREE.BufferGeometry();
  const yb = podium + 7.7;
  ped.setAttribute('position', new THREE.Float32BufferAttribute([bx0 - 0.2, yb, pz1 + 0.12, bx1 + 0.2, yb, pz1 + 0.12, (bx0 + bx1) / 2, yb + 2.4, pz1 + 0.12], 3));
  ped.computeVertexNormals();
  v.push(paint(ped, '#f7f1e6'));
  gableRoof(v, bx0 - 0.2, bz0, bx1 + 0.2, pz1 + 0.1, podium + 8.5, 2.4, '#9aa6a4', 'z', 0.3);
  ctx.signs.push({ text: '美術館', icon: '🖼️', x: (bx0 + bx1) / 2, y: podium + 7.3, z: pz1 + 0.16, dir: 's', w: 4.2 });
  ctx.col.add({ kind: 'platform', minX: bx0, maxX: bx1, minZ: pz1 - 4.2, maxZ: pz1, minY: podium + 6.9, maxY: podium + 7.7, tag: 'portico' });
}

function library(s, ctx) {
  const L = s.lot;
  const v = ctx.v;
  const x0 = L.ix0 + 3;
  const x1 = L.ix1 - 3;
  const z0 = L.iz0 + 5;
  const z1 = L.iz1 - 6;
  bbox(ctx, x0, CURB, z0, x1 - 9, CURB + 8, z1, '#e3e8e6', 4, 4, 2.4);
  ctx.col.box(x0, 0, z0, x1 - 9, CURB + 8, z1, { tag: 'building' });
  // 円筒の閲覧室＋ドーム
  const cx = x1 - 6;
  const cz = (z0 + z1) / 2;
  v.push(cyl(6, 6, 10, cx, CURB, cz, '#f0ebe0', 28));
  v.push(paint(new THREE.SphereGeometry(6.2, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2).translate(cx, CURB + 10, cz), '#6f9c9a'));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    v.push(paint(new THREE.BoxGeometry(0.1, 5, 1.1).rotateY(-a).translate(cx + Math.cos(a) * 6.02, CURB + 5.5, cz + Math.sin(a) * 6.02), '#6b8296'));
  }
  ctx.col.box(cx - 6, 0, cz - 6, cx + 6, CURB + 10.5, cz + 6, { tag: 'building' });
  ctx.signs.push({ text: '図書館', icon: '📖', x: (x0 + x1 - 9) / 2, y: CURB + 5.4, z: z1 + 0.12, dir: 's', w: 4.4 });
  for (let i = 0; i < 4; i++) ctx.props.add('trunk', x0 + 3 + i * 5, CURB, z1 + 3, i, 0.9), ctx.props.add('canopy', x0 + 3 + i * 5, CURB, z1 + 3, i, 0.85, '#7fb163');
}

function clinic(s, ctx) {
  const L = s.lot;
  const v = ctx.v;
  const x0 = L.ix0 + 4;
  const x1 = L.ix1 - 3;
  const z0 = L.iz0 + 4;
  const z1 = L.iz1 - 4;
  bbox(ctx, x0, CURB, z0, x1, CURB + 10.5, z1, '#f6f6f2', 1, 3.5, 2.6);
  ctx.col.box(x0, 0, z0, x1, CURB + 10.5, z1, { tag: 'building' });
  // 緑の十字
  const cz = (z0 + z1) / 2;
  v.push(box(0.2, 2.4, 0.8, x0 - 0.1, CURB + 7.5, cz, '#3faa6a'));
  v.push(box(0.2, 0.8, 2.4, x0 - 0.1, CURB + 8.3, cz, '#3faa6a'));
  ctx.signs.push({ text: 'こもれびクリニック', icon: '🏥', x: x0 - 0.12, y: CURB + 4.2, z: cz, dir: 'w', w: 5.6 });
  v.push(box(1.6, 0.25, 5, x0 - 0.8, CURB + 3, cz, '#9fc9b0'));
}

// ---- 学校
function school(s, ctx, rng) {
  const L = s.lot;
  const v = ctx.v;
  const wall = '#f3ead8';
  // 本校舎（L 字）
  const ax0 = L.ix0 + 4;
  const ax1 = L.ix0 + 60;
  const az0 = L.iz0 + 3;
  const az1 = L.iz0 + 15;
  bbox(ctx, ax0, CURB, az0, ax1, CURB + 11, az1, wall, 5, 3.6, 3.2);
  ctx.col.box(ax0, 0, az0, ax1, CURB + 11, az1, { tag: 'building' });
  bbox(ctx, ax0, CURB, az1, ax0 + 12, CURB + 11, az1 + 26, wall, 5, 3.6, 3.2);
  ctx.col.box(ax0, 0, az1, ax0 + 12, CURB + 11, az1 + 26, { tag: 'building' });
  // 時計
  const cx = (ax0 + ax1) / 2;
  v.push(box(5, 3.2, 1, cx, CURB + 11, az1 - 0.6, wall));
  v.push(paint(new THREE.CircleGeometry(1.1, 24).translate(cx, CURB + 12.6, az1 + 0.02), '#fbf6ea'));
  v.push(box(0.1, 0.8, 0.05, cx, CURB + 12.6, az1 + 0.06, '#4a3632'));
  // 体育館
  const gx0 = L.ix0 + 4;
  const gz0 = L.iz1 - 26;
  bbox(ctx, gx0, CURB, gz0, gx0 + 16, CURB + 8, L.iz1 - 3, '#e8dccb', 6, 8, 5);
  gableRoof(v, gx0, gz0, gx0 + 16, L.iz1 - 3, CURB + 8, 3.2, '#5d7f96', 'z', 0.4);
  ctx.col.add({ kind: 'gable', minX: gx0, maxX: gx0 + 16, minZ: gz0, maxZ: L.iz1 - 3, minY: 0, maxY: CURB + 11.2, gable: { axis: 'z', ridge: gx0 + 8, half: 8, eave: CURB + 8 }, tag: 'building' });
  // 運動場
  const fx0 = L.ix0 + 22;
  const fx1 = L.ix1 - 3;
  const fz0 = L.iz0 + 22;
  const fz1 = L.iz1 - 3;
  ctx.g.hrect(fx0, fz0, fx1, fz1, CURB + 0.003, (x, z) => K(GK.FIELD, x - (fx0 + fx1) / 2, z - (fz0 + fz1) / 2));
  // サッカーゴール
  for (const gx of [fx0 + 2, fx1 - 2]) {
    const zc = (fz0 + fz1) / 2;
    v.push(box(0.12, 2.2, 0.12, gx, CURB, zc - 3.2, '#ffffff'));
    v.push(box(0.12, 2.2, 0.12, gx, CURB, zc + 3.2, '#ffffff'));
    v.push(box(0.12, 0.12, 6.5, gx, CURB + 2.2, zc, '#ffffff'));
  }
  // 桜並木
  for (let i = 0; i < 9; i++) {
    const tx = L.ix0 + 22 + i * 7.5;
    const tz = L.iz0 + 18.5;
    if (tx > L.ix1 - 2) break;
    ctx.props.add('trunk', tx, CURB, tz, i, 1.1);
    ctx.props.add('sakuraCanopy', tx, CURB, tz, i * 2, 1.1, rng.pick(['#f6c6d4', '#f3b8c8', '#f9d3de']));
    ctx.col.box(tx - 0.3, 0, tz - 0.3, tx + 0.3, CURB + 2.6, tz + 0.3, { tag: 'tree', noCamera: true });
  }
  // 校門
  const gz = L.iz0 + 16;
  for (const dz of [-3, 3]) {
    v.push(box(0.9, 2.2, 0.9, L.ix0 + 0.6, CURB, gz + dz, '#cfc4b4'));
    ctx.col.box(L.ix0 + 0.15, 0, gz + dz - 0.45, L.ix0 + 1.05, CURB + 2.2, gz + dz + 0.45, { tag: 'gate' });
  }
  ctx.signs.push({ text: 'ひだまり学園', icon: '🏫', x: ax0 - 0.12, y: CURB + 7.5, z: (az0 + az1) / 2, dir: 'w', w: 5 });
}

// ---- 公園
function park(s, ctx, rng) {
  const L = s.lot;
  const v = ctx.v;
  const cx = L.cx;
  const cz = L.cz;
  // 遊歩道（十字＋外周）
  const path = (x0, z0, x1, z1) => ctx.g.hrect(x0, z0, x1, z1, CURB + 0.004, (x, z) => K(GK.DIRT, x, z));
  path(L.ix0, cz - 1.6, L.ix1, cz + 1.6);
  path(cx - 1.6, L.iz0, cx + 1.6, L.iz1);
  path(L.ix0 + 4, L.iz0 + 4, L.ix1 - 4, L.iz0 + 6.5);
  path(L.ix0 + 4, L.iz1 - 6.5, L.ix1 - 4, L.iz1 - 4);
  path(L.ix0 + 4, L.iz0 + 6.5, L.ix0 + 6.5, L.iz1 - 6.5);
  path(L.ix1 - 6.5, L.iz0 + 6.5, L.ix1 - 4, L.iz1 - 6.5);
  // 噴水
  const R = 6;
  ctx.g.hrect(cx - 9, cz - 9, cx + 9, cz + 9, CURB + 0.006, (x, z) => K(GK.PLAZA_ROUND, x - cx, z - cz));
  for (let i = 0; i < 24; i++) {
    const a0 = (i / 24) * Math.PI * 2;
    const a1 = ((i + 1) / 24) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const g = new THREE.BoxGeometry(R * (a1 - a0) + 0.1, 0.55, 0.6);
    g.rotateY(-am + Math.PI / 2);
    g.translate(cx + Math.cos(am) * R, CURB + 0.275, cz + Math.sin(am) * R);
    v.push(paint(g, '#d8cfc0'));
    const px = cx + Math.cos(am) * R;
    const pz = cz + Math.sin(am) * R;
    ctx.col.box(px - 0.5, 0, pz - 0.5, px + 0.5, CURB + 0.55, pz + 0.5, { tag: 'rim' });
  }
  v.push(cyl(1.0, 1.3, 1.6, cx, CURB, cz, '#d8cfc0', 16));
  v.push(cyl(2.0, 1.6, 0.35, cx, CURB + 1.6, cz, '#d8cfc0', 20));
  v.push(cyl(0.3, 0.4, 1.2, cx, CURB + 1.95, cz, '#d8cfc0', 12));
  ctx.col.box(cx - 1.3, 0, cz - 1.3, cx + 1.3, CURB + 2.0, cz + 1.3, { tag: 'fountain' });
  const water = new THREE.Mesh(new THREE.CircleGeometry(R - 0.3, 40).rotateX(-Math.PI / 2), makeWaterMaterial({ color: 0x6cc0cf }));
  water.position.set(cx, CURB + 0.36, cz);
  ctx.group.add(water);
  ctx.water.push(water);
  ctx.pools.push({ x: cx, z: cz, r: R - 0.3, y: CURB + 0.36 });
  ctx.fountains.push({ x: cx, y: CURB + 3.2, z: cz });
  // 池と太鼓橋
  const px = L.ix0 + 17;
  const pz = L.iz0 + 18;
  const pond = new THREE.Mesh(new THREE.CircleGeometry(9, 36).scale(1.3, 1, 1).rotateX(-Math.PI / 2), makeWaterMaterial({ color: 0x5aa7b3 }));
  pond.position.set(px, CURB + 0.02, pz);
  ctx.group.add(pond);
  ctx.water.push(pond);
  ctx.pools.push({ x: px, z: pz, r: 9, sx: 1.3, y: CURB + 0.02 });
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    v.push(ball(rng.float(0.35, 0.6), px + Math.cos(a) * 9.4 * 1.3, CURB + 0.1, pz + Math.sin(a) * 9.4, '#a9a49b', 0));
  }
  const bridge = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const bx = px - 6 + t * 12;
    const by = CURB + 0.2 + Math.sin(t * Math.PI) * 1.4;
    bridge.push(box(1.25, 0.18, 2.4, bx, by, pz, '#b8412f'));
    ctx.col.box(bx - 0.62, 0, pz - 1.2, bx + 0.62, by + 0.18, pz + 1.2, { tag: 'bridge' });
  }
  v.push(...bridge);
  // 東屋（小さな丘の上）
  const ax = L.ix1 - 16;
  const az = L.iz0 + 16;
  v.push(cyl(6, 7, 1.4, ax, CURB, az, '#8fbf6a', 18));
  ctx.col.box(ax - 5.2, 0, az - 5.2, ax + 5.2, CURB + 1.4, az + 5.2, { tag: 'mound' });
  for (const [dx, dz] of [
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ]) v.push(cyl(0.14, 0.14, 2.6, ax + dx, CURB + 1.4, az + dz, '#8a5a3c', 8));
  const roof = new THREE.ConeGeometry(3.6, 1.8, 4);
  roof.rotateY(Math.PI / 4);
  roof.translate(ax, CURB + 1.4 + 2.6 + 0.9, az);
  v.push(paint(roof, '#6b5043'));
  ctx.col.add({ kind: 'platform', minX: ax - 2.6, maxX: ax + 2.6, minZ: az - 2.6, maxZ: az + 2.6, minY: CURB + 3.9, maxY: CURB + 4.4, tag: 'gazeboRoof' });
  // 遊具：すべり台
  const sx = L.ix0 + 14;
  const sz = L.iz1 - 16;
  v.push(box(1.6, 2.6, 1.6, sx, CURB, sz, '#f2b33d'));
  const slide = new THREE.BoxGeometry(1.2, 0.12, 5.2);
  slide.rotateX(0.5);
  slide.translate(sx, CURB + 1.35, sz + 3.2);
  v.push(paint(slide, '#e05a4e'));
  ctx.col.box(sx - 0.8, 0, sz - 0.8, sx + 0.8, CURB + 2.6, sz + 0.8, { tag: 'slide' });
  // 木とベンチ
  for (let i = 0; i < 44; i++) {
    const tx = rng.float(L.ix0 + 2, L.ix1 - 2);
    const tz = rng.float(L.iz0 + 2, L.iz1 - 2);
    if (Math.abs(tx - cx) < 3.5 || Math.abs(tz - cz) < 3.5) continue;
    if (Math.hypot(tx - cx, tz - cz) < 11) continue;
    if (Math.hypot((tx - px) / 1.3, tz - pz) < 11) continue;
    if (Math.hypot(tx - ax, tz - az) < 8) continue;
    if (Math.hypot(tx - sx, tz - sz - 2) < 6) continue;
    const onPath = (Math.abs(tz - (L.iz0 + 5.2)) < 2 || Math.abs(tz - (L.iz1 - 5.2)) < 2 || Math.abs(tx - (L.ix0 + 5.2)) < 2 || Math.abs(tx - (L.ix1 - 5.2)) < 2);
    if (onPath) continue;
    const sak = rng.chance(0.4);
    ctx.props.add('trunk', tx, CURB, tz, i, rng.float(0.95, 1.25));
    ctx.props.add(sak ? 'sakuraCanopy' : 'canopy', tx, CURB, tz, i * 1.7, rng.float(0.95, 1.3), sak ? rng.pick(['#f6c6d4', '#f3b8c8', '#f9d3de']) : rng.pick(['#6fa35a', '#7fb163', '#5f9650', '#8cbc6b']));
    ctx.col.box(tx - 0.3, 0, tz - 0.3, tx + 0.3, CURB + 2.6, tz + 0.3, { tag: 'tree', noCamera: true });
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const bx = cx + Math.cos(a) * 8;
    const bz = cz + Math.sin(a) * 8;
    ctx.props.add('bench', bx, CURB, bz, -a - Math.PI / 2);
    ctx.col.box(bx - 0.7, 0, bz - 0.7, bx + 0.7, CURB + 0.5, bz + 0.7, { tag: 'bench' });
  }
}

// ---- 港
function harbor(plan, ctx, rng) {
  const v = ctx.v;
  const Q = QUAY_Z;
  // 岸壁の柵（桟橋の入口は空ける）
  const piers = [line(1) + 6, line(3) + 20, line(5) + 10];
  const gaps = [...piers.map((x) => [x - 3.2, x + 3.2]), [LIGHTHOUSE.x - 3.2, LIGHTHOUSE.x + 3.2]];
  let x = line(0) - RH - SW;
  const xEnd = line(N) + RH + SW;
  const railParts = [];
  while (x < xEnd) {
    const g = gaps.find((q) => x + 4 > q[0] && x < q[1]);
    let x2 = Math.min(x + 4, xEnd);
    if (g) {
      if (x < g[0]) x2 = g[0];
      else {
        x = g[1];
        continue;
      }
    }
    railParts.push(box(x2 - x, 0.08, 0.08, (x + x2) / 2, CURB + 1.0, Q - 0.25, '#e8e4dc'));
    railParts.push(box(x2 - x, 0.06, 0.06, (x + x2) / 2, CURB + 0.55, Q - 0.25, '#e8e4dc'));
    railParts.push(box(0.1, 1.05, 0.1, x + 0.05, CURB, Q - 0.25, '#e8e4dc'));
    ctx.col.box(x, 0, Q - 0.35, x2, CURB + 1.05, Q - 0.15, { tag: 'rail', noCamera: true });
    x = x2;
  }
  v.push(...railParts);
  // 桟橋
  for (const px of piers) {
    const len = 30;
    ctx.g.hrect(px - 3, Q, px + 3, Q + len, CURB, (xx, zz) => K(GK.WOOD, xx, zz));
    ctx.g.quad([[px - 3, -1.2, Q + len], [px + 3, -1.2, Q + len], [px + 3, CURB, Q + len], [px - 3, CURB, Q + len]], [0, 0, 1], K(GK.WOOD, 0, 0));
    ctx.g.quad([[px + 3, -1.2, Q + len], [px + 3, -1.2, Q], [px + 3, CURB, Q], [px + 3, CURB, Q + len]], [1, 0, 0], K(GK.WOOD, 0, 0));
    ctx.g.quad([[px - 3, -1.2, Q], [px - 3, -1.2, Q + len], [px - 3, CURB, Q + len], [px - 3, CURB, Q]], [-1, 0, 0], K(GK.WOOD, 0, 0));
    ctx.col.box(px - 3, -2, Q - 0.1, px + 3, CURB, Q + len, { tag: 'pier', noCamera: true });
    for (let z = Q + 3; z < Q + len; z += 6) for (const dx of [-2.9, 2.9]) v.push(cyl(0.18, 0.18, 1.1, px + dx, CURB - 1.3, z, '#6b4a33', 8));
    // 係留ビット
    v.push(cyl(0.22, 0.25, 0.5, px + 2.4, CURB, Q + len - 1, '#3f4247', 10));
    // 小舟
    const boat = makeBoat(rng.pick(['#e05a4e', '#3f7fae', '#f2f2f2', '#5aa06a', '#e2a93b']));
    boat.position.set(px + rng.pick([-6.5, 6.5]), -0.9, Q + 10 + rng.float(0, 12));
    boat.rotation.y = rng.float(-0.2, 0.2);
    ctx.group.add(boat);
    const ph = rng.float(0, 6);
    ctx.anim.push((t) => {
      boat.position.y = -0.95 + Math.sin(t * 1.3 + ph) * 0.08;
      boat.rotation.z = Math.sin(t * 1.1 + ph) * 0.04;
    });
  }
  // 防波堤と灯台
  const bx = LIGHTHOUSE.x;
  ctx.g.hrect(bx - 3, Q, bx + 3, LIGHTHOUSE.z - 5, CURB, (xx, zz) => K(GK.CONCRETE, xx, zz));
  ctx.col.box(bx - 3, -2, Q - 0.1, bx + 3, CURB, LIGHTHOUSE.z - 5, { tag: 'pier', noCamera: true });
  ctx.g.quad([[bx + 3, -1.4, LIGHTHOUSE.z - 5], [bx + 3, -1.4, Q], [bx + 3, CURB, Q], [bx + 3, CURB, LIGHTHOUSE.z - 5]], [1, 0, 0], K(GK.CONCRETE, 0, 0));
  ctx.g.quad([[bx - 3, -1.4, Q], [bx - 3, -1.4, LIGHTHOUSE.z - 5], [bx - 3, CURB, LIGHTHOUSE.z - 5], [bx - 3, CURB, Q]], [-1, 0, 0], K(GK.CONCRETE, 0, 0));
  v.push(cyl(7, 7.4, 1.6, bx, CURB - 1.45, LIGHTHOUSE.z, '#bdb8ae', 28));
  ctx.g.hrect(bx - 5, LIGHTHOUSE.z - 5, bx + 5, LIGHTHOUSE.z + 5, CURB + 0.15, (xx, zz) => K(GK.CONCRETE, xx, zz));
  ctx.col.box(bx - 5, -2, LIGHTHOUSE.z - 5, bx + 5, CURB + 0.15, LIGHTHOUSE.z + 5, { tag: 'pier', noCamera: true });
  const lh = LIGHTHOUSE;
  const tower = [];
  for (let i = 0; i < 6; i++) {
    const r0 = 2.3 - i * 0.12;
    const r1 = 2.3 - (i + 1) * 0.12;
    tower.push(cyl(r1, r0, 3, lh.x, CURB + 0.15 + i * 3, lh.z, i % 2 ? '#d8403a' : '#f7f4ee', 20));
  }
  tower.push(cyl(1.9, 1.9, 0.3, lh.x, CURB + 18.15, lh.z, '#3f4247', 20));
  tower.push(cyl(1.3, 1.3, 2.0, lh.x, CURB + 18.45, lh.z, '#cfe6ee', 16));
  tower.push(paint(new THREE.ConeGeometry(1.7, 1.6, 16).translate(lh.x, CURB + 21.25, lh.z), '#d8403a'));
  tower.push(ball(0.25, lh.x, CURB + 22.2, lh.z, '#3f4247', 1));
  v.push(...tower);
  ctx.col.box(lh.x - 2.3, 0, lh.z - 2.3, lh.x + 2.3, CURB + 21, lh.z + 2.3, { tag: 'lighthouse' });
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 26, 16, 1, true).rotateZ(Math.PI / 2).translate(13, 0, 0), new THREE.MeshBasicMaterial({ color: 0xfff2c0, transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false }));
  const beamPivot = new THREE.Group();
  beamPivot.position.set(lh.x, CURB + 19.4, lh.z);
  beamPivot.add(beam);
  ctx.group.add(beamPivot);
  ctx.anim.push((t) => {
    beamPivot.rotation.y = t * 0.7;
  });
  // 魚市場（ブロック 5,8）
  const mg = plan.grounds.find((g) => g.type === 'A' && g.i0 === 5);
  if (mg) {
    const x0 = mg.ix0 + 3;
    const x1 = mg.ix1 - 3;
    const z0 = mg.iz0 + 8;
    const z1 = mg.iz1 - 2;
    for (let px = x0; px <= x1 + 0.01; px += (x1 - x0) / 5) {
      for (const pz of [z0, z1]) {
        v.push(box(0.35, 5.2, 0.35, px, CURB, pz, '#5f7384'));
        ctx.col.box(px - 0.2, 0, pz - 0.2, px + 0.2, CURB + 5.2, pz + 0.2, { tag: 'pillar' });
      }
    }
    gableRoof(v, x0, z0, x1, z1, CURB + 5.2, 2.2, '#4f7fa8', 'x', 0.8);
    ctx.col.add({ kind: 'gable', minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: CURB + 5.1, maxY: CURB + 7.4, gable: { axis: 'x', ridge: (z0 + z1) / 2, half: (z1 - z0) / 2, eave: CURB + 5.2 }, tag: 'roof' });
    const goods = ['#e05a4e', '#f2b33d', '#6cbf6a', '#4f9fd8', '#f4f1ea'];
    for (let i = 0; i < 6; i++) {
      const sx = x0 + 2.5 + i * ((x1 - x0 - 5) / 5);
      v.push(box(3.2, 0.9, 1.6, sx, CURB, z1 - 3, '#8a6a52'));
      for (let k = 0; k < 4; k++) v.push(box(0.6, 0.25, 0.9, sx - 1.1 + k * 0.72, CURB + 0.9, z1 - 3, rng.pick(goods)));
      ctx.col.box(sx - 1.6, 0, z1 - 3.8, sx + 1.6, CURB + 1.1, z1 - 2.2, { tag: 'stall' });
    }
    ctx.signs.push({ text: '魚市場', icon: '🐟', x: (x0 + x1) / 2, y: CURB + 4.3, z: z1 + 0.25, dir: 's', w: 4.6 });
  }
  // 観覧車（ブロック 8,8）
  ferris(ctx, rng);
  // クレーン
  for (const cx of [line(2) + 4, line(6) + 30]) crane(ctx, cx, Q - 5);
}

function makeBoat(color) {
  const parts = [];
  const hull = new THREE.CylinderGeometry(1.4, 1.0, 5.5, 12, 1, false, 0, Math.PI);
  hull.rotateZ(Math.PI / 2);
  hull.rotateX(Math.PI);
  hull.scale(1, 0.7, 1);
  parts.push(paint(hull, color));
  parts.push(box(4.8, 0.12, 2.3, 0, 0.0, 0, '#d9c4a8'));
  parts.push(box(1.6, 1.1, 1.4, -0.6, 0.1, 0, '#f4f1ea'));
  parts.push(box(1.7, 0.1, 1.5, -0.6, 1.2, 0, color));
  const m = new THREE.Mesh(merge(parts), vcolMat());
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  g.rotation.order = 'YXZ';
  const wrap = new THREE.Group();
  wrap.add(g);
  m.rotation.y = Math.PI / 2;
  return wrap;
}

function ferris(ctx, rng) {
  const { x, z } = FERRIS;
  const v = ctx.v;
  const R = 15;
  const H = R + 3.5;
  // 支柱（A 字）
  for (const dz of [-2.2, 2.2]) {
    for (const dx of [-7, 7]) {
      const len = Math.hypot(dx, H);
      const g = new THREE.CylinderGeometry(0.35, 0.45, len, 10);
      g.translate(0, len / 2, 0);
      g.rotateZ(Math.atan2(dx, H));
      g.translate(x - dx, CURB, z + dz);
      v.push(paint(g, '#f4f1ea'));
      ctx.col.box(x - dx - 0.6, 0, z + dz - 0.6, x - dx + 0.6, CURB + 2.5, z + dz + 0.6, { tag: 'ferrisLeg' });
    }
  }
  v.push(cyl(3.2, 3.6, 0.6, x, CURB, z, '#cdbfa9', 20));
  ctx.col.box(x - 3, 0, z - 3, x + 3, CURB + 0.6, z + 3, { tag: 'ferrisBase' });
  const wheel = new THREE.Group();
  wheel.position.set(x, CURB + H, z);
  const parts = [];
  for (const dz of [-1.6, 1.6]) {
    parts.push(paint(new THREE.TorusGeometry(R, 0.22, 8, 64).translate(0, 0, dz), '#f4f1ea'));
    parts.push(paint(new THREE.TorusGeometry(R * 0.55, 0.14, 6, 48).translate(0, 0, dz), '#f4f1ea'));
  }
  const spokes = 16;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    for (const dz of [-1.6, 1.6]) {
      const g = new THREE.CylinderGeometry(0.08, 0.08, R, 6);
      g.translate(0, R / 2, 0);
      g.rotateZ(a);
      g.translate(0, 0, dz);
      parts.push(paint(g, '#e9e2d6'));
    }
  }
  parts.push(paint(new THREE.CylinderGeometry(0.6, 0.6, 4.4, 14).rotateX(Math.PI / 2), '#b9aea2'));
  const wm = new THREE.Mesh(merge(parts), vcolMat());
  wm.castShadow = true;
  wheel.add(wm);
  const cabins = [];
  const colors = ['#e05a4e', '#f2b33d', '#4f9fd8', '#6cbf6a', '#b07ad0', '#f08aa0', '#5fc0c0', '#f39a5a'];
  const cabGeo = merge([box(1.9, 1.8, 1.9, 0, -2.2, 0, '#ffffff'), box(2.1, 0.25, 2.1, 0, -0.4, 0, '#ffffff'), box(0.12, 0.6, 0.12, 0, -0.4, 0, '#8a8a8a'), box(1.6, 0.7, 1.95, 0, -1.6, 0, '#b9d9e6')]);
  for (let i = 0; i < spokes; i++) {
    const m = new THREE.Mesh(cabGeo, vcolMat({ color: colors[i % colors.length] }));
    m.castShadow = true;
    const a = (i / spokes) * Math.PI * 2;
    m.userData.a = a;
    wheel.add(m);
    cabins.push(m);
  }
  ctx.group.add(wheel);
  ctx.anim.push((t) => {
    const rot = t * 0.06;
    wm.rotation.z = rot;
    for (const c of cabins) {
      const a = c.userData.a + rot;
      c.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    }
  });
  ctx.signs.push({ text: '観覧車', icon: '🎡', x, y: CURB + 2.2, z: z + 3.3, dir: 's', w: 3.6 });
  void rng;
}

function crane(ctx, x, z) {
  const v = ctx.v;
  const red = '#d9573f';
  for (const dx of [-3, 3]) {
    for (const dz of [-2.5, 2.5]) {
      v.push(box(0.5, 12, 0.5, x + dx, CURB, z + dz, red));
      ctx.col.box(x + dx - 0.3, 0, z + dz - 0.3, x + dx + 0.3, CURB + 12, z + dz + 0.3, { tag: 'crane' });
    }
  }
  v.push(box(7, 1.2, 6, x, CURB + 12, z, red));
  v.push(box(1.2, 1.0, 26, x, CURB + 14, z + 8, red));
  v.push(box(3, 2.4, 3, x, CURB + 13.2, z - 1, '#f4f1ea'));
  v.push(box(0.06, 8, 0.06, x, CURB + 6, z + 18, '#3f4247'));
  v.push(box(1.4, 0.5, 1.2, x, CURB + 5.6, z + 18, '#f2b33d'));
}

function railFence(ctx) {
  // 線路の手前の柵（北の外周）
  const z = line(0) - RH - SW - 0.15;
  const x0 = line(0) - RH - SW;
  const x1 = line(N) + RH + SW;
  const parts = [];
  for (let x = x0; x < x1; x += 3) {
    parts.push(box(0.08, 1.3, 0.08, x, CURB, z, '#8c9aa3'));
  }
  parts.push(box(x1 - x0, 0.08, 0.06, (x0 + x1) / 2, CURB + 1.25, z, '#8c9aa3'));
  parts.push(box(x1 - x0, 0.06, 0.04, (x0 + x1) / 2, CURB + 0.7, z, '#8c9aa3'));
  ctx.v.push(...parts);
  ctx.col.box(x0, 0, z - 0.1, x1, CURB + 1.4, z + 0.1, { tag: 'fence', noCamera: true });
}

export { P };
