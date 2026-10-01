import * as THREE from 'three';
import { MeshBuilder, rgb } from './MeshBuilder.js';
import { makeBuildingMaterial, makeGroundMaterial, GK, vcolMat } from './materials.js';
import { N, P, RH, SW, CURB, O, line, QUAY_Z, WORLD } from './cityPlan.js';

// 設計図 → 地面・建物のメッシュと当たり判定
const STYLE = { plain: 0, house: 1, shop: 2, office: 3, glass: 4, apartment: 5, warehouse: 6 };

export function buildGround(plan, col, mb) {
  const K = (k, u, v) => ({ uv: [u, v], aKind: [k, 0] });

  // 道路（区間）
  for (const s of plan.segments) {
    if (s.axis === 'z') {
      const x = s.x0;
      const za = s.z0 + RH;
      const zb = s.z1 - RH;
      mb.quad(
        [
          [x - RH, 0, zb],
          [x + RH, 0, zb],
          [x + RH, 0, za],
          [x - RH, 0, za],
        ],
        [0, 1, 0],
        [K(GK.ROAD, -RH, zb - za), K(GK.ROAD, RH, zb - za), K(GK.ROAD, RH, 0), K(GK.ROAD, -RH, 0)],
      );
      // 横断歩道（両端）
      for (const [z0, z1] of [
        [za, za + 3],
        [zb - 3, zb],
      ]) {
        mb.quad(
          [
            [x - RH, 0.004, z1],
            [x + RH, 0.004, z1],
            [x + RH, 0.004, z0],
            [x - RH, 0.004, z0],
          ],
          [0, 1, 0],
          [K(GK.CROSS, -RH, 0), K(GK.CROSS, RH, 0), K(GK.CROSS, RH, 0), K(GK.CROSS, -RH, 0)],
        );
      }
    } else {
      const z = s.z0;
      const xa = s.x0 + RH;
      const xb = s.x1 - RH;
      mb.quad(
        [
          [xa, 0, z + RH],
          [xb, 0, z + RH],
          [xb, 0, z - RH],
          [xa, 0, z - RH],
        ],
        [0, 1, 0],
        [K(GK.ROAD, RH, 0), K(GK.ROAD, RH, xb - xa), K(GK.ROAD, -RH, xb - xa), K(GK.ROAD, -RH, 0)],
      );
      for (const [x0, x1] of [
        [xa, xa + 3],
        [xb - 3, xb],
      ]) {
        mb.quad(
          [
            [x0, 0.004, z + RH],
            [x1, 0.004, z + RH],
            [x1, 0.004, z - RH],
            [x0, 0.004, z - RH],
          ],
          [0, 1, 0],
          [K(GK.CROSS, RH, 0), K(GK.CROSS, RH, 0), K(GK.CROSS, -RH, 0), K(GK.CROSS, -RH, 0)],
        );
      }
    }
  }
  // 交差点
  for (const n of plan.nodes) {
    if (!n.exists) continue;
    mb.hrect(n.x - RH, n.z - RH, n.x + RH, n.z + RH, 0, (x, z) => K(GK.JUNCTION, x, z));
  }
  // 交差点の角（道路が途切れた所）を歩道でふさぐ：存在しない区間の車道部分
  // （公園などグループ内部の区間は敷地が覆うので不要）

  // 敷地（歩道込みの台）
  const kindOf = { garden: GK.GARDEN, plaza: GK.TILES, tiles: GK.TILES, concrete: GK.CONCRETE, park: GK.GRASS, plazaRound: GK.PLAZA_ROUND, forest: GK.FOREST };
  for (const g of plan.grounds) {
    const y = CURB;
    // 歩道の帯（4 辺）
    const walk = (x0, z0, x1, z1) => mb.hrect(x0, z0, x1, z1, y, (x, z) => K(GK.WALK, x, z));
    walk(g.x0, g.z0, g.x1, g.iz0);
    walk(g.x0, g.iz1, g.x1, g.z1);
    walk(g.x0, g.iz0, g.ix0, g.iz1);
    walk(g.ix1, g.iz0, g.x1, g.iz1);
    const k = kindOf[g.ground] ?? GK.TILES;
    if (k === GK.PLAZA_ROUND) mb.hrect(g.ix0, g.iz0, g.ix1, g.iz1, y, (x, z) => K(k, x - g.cx, z - g.cz));
    else if (!g.customInterior) mb.hrect(g.ix0, g.iz0, g.ix1, g.iz1, y, (x, z) => K(k, x, z));
    // 縁石（側面）
    curbSides(mb, g.x0, g.z0, g.x1, g.z1, 0, y, K);
    col.box(g.x0, -1, g.z0, g.x1, y, g.z1, { tag: 'lot', noCamera: true });
  }

  // 街の外周：歩道＋緑地（北は線路）
  const outer = 60;
  const x0 = line(0) - RH;
  const x1 = line(N) + RH;
  const z0 = line(0) - RH;
  const z1 = line(N) + RH;
  // 北
  mb.hrect(x0 - SW, z0 - SW, x1 + SW, z0, CURB, (x, z) => K(GK.WALK, x, z));
  curbSides(mb, x0 - SW, z0 - SW, x1 + SW, z0, 0, CURB, K, 's');
  col.box(x0 - SW, -1, z0 - SW - 30, x1 + SW, CURB, z0, { noCamera: true });
  mb.hrect(x0 - SW, z0 - SW - 12, x1 + SW, z0 - SW, CURB, (x, z) => K(GK.RAIL, x, z - (z0 - SW - 6)));
  mb.hrect(x0 - outer, z0 - outer, x1 + outer, z0 - SW - 12, CURB, (x, z) => K(GK.GRASS, x, z));
  // 西・東
  for (const side of [-1, 1]) {
    const xa = side < 0 ? x0 - SW : x1;
    const xb = side < 0 ? x0 : x1 + SW;
    mb.hrect(xa, z0, xb, z1, CURB, (x, z) => K(GK.WALK, x, z));
    curbSides(mb, xa, z0, xb, z1, 0, CURB, K, side < 0 ? 'e' : 'w');
    col.box(Math.min(xa, xb) - (side < 0 ? 30 : 0), -1, z0, Math.max(xa, xb) + (side > 0 ? 30 : 0), CURB, z1, { noCamera: true });
    const ga = side < 0 ? x0 - outer : x1 + SW;
    const gb = side < 0 ? x0 - SW : x1 + outer;
    mb.hrect(ga, z0 - SW - 12, gb, QUAY_Z, CURB, (x, z) => K(GK.GRASS, x, z));
  }
  // 南：海沿いの遊歩道（岸壁まで）
  mb.hrect(x0 - SW, z1, x1 + SW, QUAY_Z, CURB, (x, z) => K(z < z1 + SW ? GK.WALK : GK.TILES, x, z));
  curbSides(mb, x0 - SW, z1, x1 + SW, z1 + 0.001, 0, CURB, K, 'n');
  col.box(x0 - SW - 30, -1, z1, x1 + SW + 30, CURB, QUAY_Z, { noCamera: true, tag: 'promenade' });
  // 岸壁の側面
  mb.quad(
    [
      [x0 - outer, -1.6, QUAY_Z],
      [x1 + outer, -1.6, QUAY_Z],
      [x1 + outer, CURB, QUAY_Z],
      [x0 - outer, CURB, QUAY_Z],
    ],
    [0, 0, 1],
    K(GK.CONCRETE, 0, 0),
  );

  // 見えない外壁
  const H = 60;
  col.box(WORLD.minX - 5, -2, WORLD.minZ - 5, WORLD.minX, H, WORLD.maxZ + 5, { noCamera: true, tag: 'bound' });
  col.box(WORLD.maxX, -2, WORLD.minZ - 5, WORLD.maxX + 5, H, WORLD.maxZ + 5, { noCamera: true, tag: 'bound' });
  col.box(WORLD.minX - 5, -2, WORLD.minZ - 5, WORLD.maxX + 5, H, WORLD.minZ, { noCamera: true, tag: 'bound' });
  col.box(WORLD.minX - 5, -2, WORLD.maxZ, WORLD.maxX + 5, H, WORLD.maxZ + 5, { noCamera: true, tag: 'bound' });

  // 海の上は地面なし（落ちたら水しぶき→岸へ戻す）
  col.baseGround = (x, z) => (z > QUAY_Z ? -30 : 0);

}

export function finishGround(mb) {
  const mesh = new THREE.Mesh(mb.build(), makeGroundMaterial());
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  return mesh;
}

function curbSides(mb, x0, z0, x1, z1, ya, yb, K, only) {
  const sides = {
    n: [[x1, ya, z0], [x0, ya, z0], [x0, yb, z0], [x1, yb, z0], [0, 0, -1]],
    s: [[x0, ya, z1], [x1, ya, z1], [x1, yb, z1], [x0, yb, z1], [0, 0, 1]],
    w: [[x0, ya, z0], [x0, ya, z1], [x0, yb, z1], [x0, yb, z0], [-1, 0, 0]],
    e: [[x1, ya, z1], [x1, ya, z0], [x1, yb, z0], [x1, yb, z1], [1, 0, 0]],
  };
  for (const [k, s] of Object.entries(sides)) {
    if (only && only !== k) continue;
    mb.quad(s.slice(0, 4), s[4], K(GK.CURB, 0, 0));
  }
}

// ---- 建物
export function buildBuildings(plan, col, signAtlas) {
  const chunkSize = 110;
  const chunks = new Map();
  const getChunk = (x, z) => {
    const k = Math.floor((x - WORLD.minX) / chunkSize) + ',' + Math.floor((z - WORLD.minZ) / chunkSize);
    let c = chunks.get(k);
    if (!c) {
      c = new MeshBuilder({ uv: 2, color: 3, aWin: 4 });
      chunks.set(k, c);
    }
    return c;
  };
  const awning = new MeshBuilder({ color: 3 });
  const signs = new MeshBuilder({ uv: 2 });
  let seed = 0;

  for (const b of plan.buildings) {
    const mb = getChunk((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
    seed = (seed + 0.618) % 1;
    addBuilding(mb, b, seed * 10);
    // 当たり判定
    const top = b.y0 + b.h;
    // 見た目は 5cm ずつ内側に寄せてあるので、当たり判定は少し広げて隣とのすき間をふさぐ
    const e = 0.06;
    if (b.roof === 'gable') {
      const axis = b.ridgeAxis;
      const ridge = axis === 'x' ? (b.z0 + b.z1) / 2 : (b.x0 + b.x1) / 2;
      const half = axis === 'x' ? (b.z1 - b.z0) / 2 + e : (b.x1 - b.x0) / 2 + e;
      col.add({ kind: 'gable', minX: b.x0 - e, maxX: b.x1 + e, minZ: b.z0 - e, maxZ: b.z1 + e, minY: 0, maxY: top + b.roofRise, gable: { axis, ridge, half, eave: top }, tag: 'building', b });
    } else {
      col.box(b.x0 - e, b.y0 > CURB + 0.1 ? b.y0 - 0.2 : 0, b.z0 - e, b.x1 + e, top, b.z1 + e, { tag: 'building', b });
    }
    if (b.awning) addAwning(awning, b, col);
    if (b.sign && signAtlas) addSign(signs, b, signAtlas);
    if (b.balcony) addBalconies(mb, b, col);
  }

  const mat = makeBuildingMaterial();
  const meshes = [];
  for (const mb of chunks.values()) {
    const m = new THREE.Mesh(mb.build(), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    m.name = 'buildings';
    meshes.push(m);
  }
  const aw = new THREE.Mesh(awning.build(), vcolMat({ side: THREE.DoubleSide, roughness: 0.9 }));
  aw.castShadow = true;
  aw.receiveShadow = true;
  aw.name = 'awnings';
  meshes.push(aw);
  return { meshes, signs };
}

function faceInfo(b) {
  // 各面の [名前, 始点x,z, 終点x,z, 法線]（外から見て左→右）
  return {
    s: { a: [b.x0, b.z1], c: [b.x1, b.z1], n: [0, 0, 1] },
    n: { a: [b.x1, b.z0], c: [b.x0, b.z0], n: [0, 0, -1] },
    e: { a: [b.x1, b.z1], c: [b.x1, b.z0], n: [1, 0, 0] },
    w: { a: [b.x0, b.z0], c: [b.x0, b.z1], n: [-1, 0, 0] },
  };
}

function addBuilding(mb, b, seed) {
  const wall = rgb(b.wall);
  const y0 = b.y0;
  const y1 = b.y0 + b.h;
  const styleOf = (face) => {
    if (b.style === 'shop') return face === b.front ? STYLE.shop : STYLE.house;
    return STYLE[b.style] ?? STYLE.plain;
  };
  const faces = faceInfo(b);
  for (const [name, f] of Object.entries(faces)) {
    const L = Math.hypot(f.c[0] - f.a[0], f.c[1] - f.a[1]);
    const st = styleOf(name);
    const sp = L / Math.max(1, Math.round(L / b.winW));
    const e = (u, v) => ({ uv: [u, v], color: wall, aWin: [b.floorH, sp, st, seed] });
    mb.quad(
      [
        [f.a[0], y0 - (y0 <= CURB + 0.01 ? CURB : 0), f.a[1]],
        [f.c[0], y0 - (y0 <= CURB + 0.01 ? CURB : 0), f.c[1]],
        [f.c[0], y1, f.c[1]],
        [f.a[0], y1, f.a[1]],
      ],
      f.n,
      [e(0, 0), e(L, 0), e(L, b.h), e(0, b.h)],
    );
    // ドア（住宅・アパート・倉庫）
    if (name === b.front && (b.style === 'house' || b.style === 'apartment')) {
      const mx = (f.a[0] + f.c[0]) / 2;
      const mz = (f.a[1] + f.c[1]) / 2;
      const tx = (f.c[0] - f.a[0]) / L;
      const tz = (f.c[1] - f.a[1]) / L;
      const hw = 0.55;
      const out = 0.06;
      const dc = rgb('#8a5f47');
      const de = { uv: [0, 0], color: dc, aWin: [0, 0, 0, 0] };
      const ox = f.n[0] * out;
      const oz = f.n[2] * out;
      mb.quad(
        [
          [mx - tx * hw + ox, y0, mz - tz * hw + oz],
          [mx + tx * hw + ox, y0, mz + tz * hw + oz],
          [mx + tx * hw + ox, y0 + 2.1, mz + tz * hw + oz],
          [mx - tx * hw + ox, y0 + 2.1, mz - tz * hw + oz],
        ],
        f.n,
        de,
      );
      // ひさし
      const ce = { uv: [0, 0], color: rgb(b.roofColor || '#8a6a5a'), aWin: [0, 0, 0, 0] };
      const d = 0.7;
      mb.quad(
        [
          [mx - tx * (hw + 0.3) + f.n[0] * d, y0 + 2.45, mz - tz * (hw + 0.3) + f.n[2] * d],
          [mx + tx * (hw + 0.3) + f.n[0] * d, y0 + 2.45, mz + tz * (hw + 0.3) + f.n[2] * d],
          [mx + tx * (hw + 0.3), y0 + 2.7, mz + tz * (hw + 0.3)],
          [mx - tx * (hw + 0.3), y0 + 2.7, mz - tz * (hw + 0.3)],
        ],
        [f.n[0] * 0.33, 0.94, f.n[2] * 0.33],
        ce,
      );
    }
  }
  // 屋根
  if (b.roof === 'gable') {
    addGableRoof(mb, b, seed);
  } else {
    const rc = rgb(b.roofColor || '#b8b0a6');
    mb.hrect(b.x0, b.z0, b.x1, b.z1, y1, (x, z) => ({ uv: [x, z], color: rc, aWin: [0, 0, -1, seed] }));
    // 軒じまい（屋上のふち）
    const cc = rgb(shade(b.wall, 0.86));
    const o = 0.14;
    const t = 0.32;
    mb.box(b.x0 - o, y1 - t, b.z0 - o, b.x1 + o, y1 + 0.12, b.z1 + o, (face) => (face === 't' ? null : { uv: [0, 0], color: cc, aWin: [0, 0, 0, 0] }));
    // ふちの上面（外周だけ）
    const top = (x0, z0, x1, z1) => mb.hrect(x0, z0, x1, z1, y1 + 0.12, () => ({ uv: [0, 0], color: cc, aWin: [0, 0, 0, 0] }));
    top(b.x0 - o, b.z0 - o, b.x1 + o, b.z0 + 0.12);
    top(b.x0 - o, b.z1 - 0.12, b.x1 + o, b.z1 + o);
    top(b.x0 - o, b.z0 + 0.12, b.x0 + 0.12, b.z1 - 0.12);
    top(b.x1 - 0.12, b.z0 + 0.12, b.x1 + o, b.z1 - 0.12);
  }
}

function addGableRoof(mb, b, seed) {
  const y1 = b.y0 + b.h;
  const rise = b.roofRise;
  const ov = 0.4;
  const rc = rgb(b.roofColor);
  const under = rgb(shade(b.roofColor, 0.55));
  const wall = rgb(b.wall);
  const E = (u, v) => ({ uv: [u, v], color: rc, aWin: [0, 0, -2, seed] });
  if (b.ridgeAxis === 'x') {
    const zm = (b.z0 + b.z1) / 2;
    const hz = (b.z1 - b.z0) / 2 + ov;
    const drop = (ov * rise) / ((b.z1 - b.z0) / 2);
    const x0 = b.x0 - ov;
    const x1 = b.x1 + ov;
    const ye = y1 - drop;
    const slope = Math.hypot(hz, rise + drop);
    const ny = hz / slope;
    const nz = (rise + drop) / slope;
    // 南斜面・北斜面
    mb.quad([[x0, ye, zm + hz], [x1, ye, zm + hz], [x1, y1 + rise, zm], [x0, y1 + rise, zm]], [0, ny, nz], [E(0, 0), E(x1 - x0, 0), E(x1 - x0, slope), E(0, slope)]);
    mb.quad([[x1, ye, zm - hz], [x0, ye, zm - hz], [x0, y1 + rise, zm], [x1, y1 + rise, zm]], [0, ny, -nz], [E(0, 0), E(x1 - x0, 0), E(x1 - x0, slope), E(0, slope)]);
    // 軒裏
    const U = { uv: [0, 0], color: under, aWin: [0, 0, 0, 0] };
    mb.quad([[x0, ye, zm + hz], [x0, ye, b.z1], [x1, ye, b.z1], [x1, ye, zm + hz]], [0, -1, 0], U);
    mb.quad([[x1, ye, zm - hz], [x1, ye, b.z0], [x0, ye, b.z0], [x0, ye, zm - hz]], [0, -1, 0], U);
    // 妻面（三角）
    const W = { uv: [0, 0], color: wall, aWin: [0, 0, 0, 0] };
    mb.tri([[b.x1, y1, b.z1], [b.x1, y1, b.z0], [b.x1, y1 + rise, zm]], [1, 0, 0], W);
    mb.tri([[b.x0, y1, b.z0], [b.x0, y1, b.z1], [b.x0, y1 + rise, zm]], [-1, 0, 0], W);
  } else {
    const xm = (b.x0 + b.x1) / 2;
    const hx = (b.x1 - b.x0) / 2 + ov;
    const drop = (ov * rise) / ((b.x1 - b.x0) / 2);
    const z0 = b.z0 - ov;
    const z1 = b.z1 + ov;
    const ye = y1 - drop;
    const slope = Math.hypot(hx, rise + drop);
    const ny = hx / slope;
    const nx = (rise + drop) / slope;
    mb.quad([[xm + hx, ye, z1], [xm + hx, ye, z0], [xm, y1 + rise, z0], [xm, y1 + rise, z1]], [nx, ny, 0], [E(0, 0), E(z1 - z0, 0), E(z1 - z0, slope), E(0, slope)]);
    mb.quad([[xm - hx, ye, z0], [xm - hx, ye, z1], [xm, y1 + rise, z1], [xm, y1 + rise, z0]], [-nx, ny, 0], [E(0, 0), E(z1 - z0, 0), E(z1 - z0, slope), E(0, slope)]);
    const U = { uv: [0, 0], color: under, aWin: [0, 0, 0, 0] };
    mb.quad([[xm + hx, ye, z1], [b.x1, ye, z1], [b.x1, ye, z0], [xm + hx, ye, z0]], [0, -1, 0], U);
    mb.quad([[xm - hx, ye, z0], [b.x0, ye, z0], [b.x0, ye, z1], [xm - hx, ye, z1]], [0, -1, 0], U);
    const W = { uv: [0, 0], color: wall, aWin: [0, 0, 0, 0] };
    mb.tri([[b.x0, y1, b.z1], [b.x1, y1, b.z1], [xm, y1 + rise, b.z1]], [0, 0, 1], W);
    mb.tri([[b.x1, y1, b.z0], [b.x0, y1, b.z0], [xm, y1 + rise, b.z0]], [0, 0, -1], W);
  }
}

function addAwning(mb, b, col) {
  const f = faceInfo(b)[b.front];
  const L = Math.hypot(f.c[0] - f.a[0], f.c[1] - f.a[1]);
  const tx = (f.c[0] - f.a[0]) / L;
  const tz = (f.c[1] - f.a[1]) / L;
  const nx = f.n[0];
  const nz = f.n[2];
  const inset = 0.5;
  const depth = 1.55;
  const yTop = b.y0 + 3.25;
  const yLow = b.y0 + 2.75;
  const n = Math.max(2, Math.round((L - inset * 2) / 0.55));
  const w = (L - inset * 2) / n;
  const c1 = rgb(b.awning[0]);
  const c2 = rgb(b.awning[1]);
  const sl = Math.hypot(depth, yTop - yLow);
  const nrm = [nx * ((yTop - yLow) / sl), depth / sl, nz * ((yTop - yLow) / sl)];
  for (let i = 0; i < n; i++) {
    const s0 = inset + i * w;
    const s1 = s0 + w;
    const c = { color: i % 2 ? c2 : c1 };
    const ax = f.a[0] + tx * s0;
    const az = f.a[1] + tz * s0;
    const bx = f.a[0] + tx * s1;
    const bz = f.a[1] + tz * s1;
    mb.quad([[ax + nx * depth, yLow, az + nz * depth], [bx + nx * depth, yLow, bz + nz * depth], [bx, yTop, bz], [ax, yTop, az]], nrm, c);
    // 垂れ（前のひらひら）
    mb.quad([[ax + nx * depth, yLow - 0.28, az + nz * depth], [bx + nx * depth, yLow - 0.28, bz + nz * depth], [bx + nx * depth, yLow, bz + nz * depth], [ax + nx * depth, yLow, az + nz * depth]], [nx, 0, nz], c);
  }
  // はねる当たり判定（薄い板）
  const px0 = f.a[0] + tx * inset;
  const pz0 = f.a[1] + tz * inset;
  const px1 = f.c[0] - tx * inset + nx * depth;
  const pz1 = f.c[1] - tz * inset + nz * depth;
  col.add({ kind: 'bounce', minX: Math.min(px0, px1), maxX: Math.max(px0, px1), minZ: Math.min(pz0, pz1), maxZ: Math.max(pz0, pz1), minY: yLow - 0.3, maxY: yLow + 0.18, bounce: 14.5, tag: 'awning' });
}

function addBalconies(mb, b, col) {
  const f = faceInfo(b)[b.front];
  const L = Math.hypot(f.c[0] - f.a[0], f.c[1] - f.a[1]);
  const tx = (f.c[0] - f.a[0]) / L;
  const tz = (f.c[1] - f.a[1]) / L;
  const nx = f.n[0];
  const nz = f.n[2];
  const floors = Math.round(b.h / b.floorH);
  const slab = rgb('#e8e2da');
  const rail = rgb('#8c8680');
  for (let k = 1; k < floors; k++) {
    const y = b.y0 + k * b.floorH;
    const d = 1.1;
    const x0 = f.a[0] + tx * 0.8;
    const z0 = f.a[1] + tz * 0.8;
    const x1 = f.c[0] - tx * 0.8 + nx * d;
    const z1 = f.c[1] - tz * 0.8 + nz * d;
    const bx0 = Math.min(x0, x1);
    const bx1 = Math.max(x0, x1);
    const bz0 = Math.min(z0, z1);
    const bz1 = Math.max(z0, z1);
    mb.box(bx0, y - 0.12, bz0, bx1, y + 0.02, bz1, () => ({ uv: [0, 0], color: slab, aWin: [0, 0, 0, 0] }), { bottom: true });
    // 手すり（外側の面だけ）
    const ox = nx * d;
    const oz = nz * d;
    const ax = f.a[0] + tx * 0.8 + ox;
    const az = f.a[1] + tz * 0.8 + oz;
    const cx = f.c[0] - tx * 0.8 + ox;
    const cz = f.c[1] - tz * 0.8 + oz;
    mb.quad([[ax, y + 0.02, az], [cx, y + 0.02, cz], [cx, y + 1.0, cz], [ax, y + 1.0, az]], [nx, 0, nz], { uv: [0, 0], color: rail, aWin: [0, 0, 0, 0] });
    mb.quad([[cx, y + 0.02, cz], [ax, y + 0.02, az], [ax, y + 1.0, az], [cx, y + 1.0, cz]], [-nx, 0, -nz], { uv: [0, 0], color: rail, aWin: [0, 0, 0, 0] });
    col.add({ kind: 'platform', minX: bx0, maxX: bx1, minZ: bz0, maxZ: bz1, minY: y - 0.12, maxY: y + 0.02, tag: 'balcony' });
  }
}

export function addFreeSign(mb, atlas, s) {
  const r = atlas.rect(s.text, s.icon);
  const w = s.w || 4;
  const h = w / r.aspect;
  const dirs = { s: [1, 0, 0, 1], n: [-1, 0, 0, -1], e: [0, -1, 1, 0], w: [0, 1, -1, 0] };
  const [tx, tz, nx, nz] = dirs[s.dir || 's'];
  const y0 = s.y - h / 2;
  const y1 = s.y + h / 2;
  mb.quad(
    [
      [s.x - tx * (w / 2), y0, s.z - tz * (w / 2)],
      [s.x + tx * (w / 2), y0, s.z + tz * (w / 2)],
      [s.x + tx * (w / 2), y1, s.z + tz * (w / 2)],
      [s.x - tx * (w / 2), y1, s.z - tz * (w / 2)],
    ],
    [nx, 0, nz],
    [{ uv: [r.u0, r.v0] }, { uv: [r.u1, r.v0] }, { uv: [r.u1, r.v1] }, { uv: [r.u0, r.v1] }],
  );
}

function addSign(mb, b, atlas) {
  const f = faceInfo(b)[b.front || 's'];
  const L = Math.hypot(f.c[0] - f.a[0], f.c[1] - f.a[1]);
  const tx = (f.c[0] - f.a[0]) / L;
  const tz = (f.c[1] - f.a[1]) / L;
  const r = atlas.rect(b.sign, b.signIcon, b.style);
  const w = Math.min(L - 1.2, 5.6);
  const h = w / r.aspect;
  const mx = (f.a[0] + f.c[0]) / 2 + f.n[0] * 0.09;
  const mz = (f.a[1] + f.c[1]) / 2 + f.n[2] * 0.09;
  const yc = b.style === 'shop' ? b.y0 + 3.95 : b.style === 'glass' || b.style === 'office' ? b.y0 + 5.2 : b.y0 + 3.2;
  const y0 = yc - h / 2;
  const y1 = yc + h / 2;
  mb.quad(
    [
      [mx - tx * (w / 2), y0, mz - tz * (w / 2)],
      [mx + tx * (w / 2), y0, mz + tz * (w / 2)],
      [mx + tx * (w / 2), y1, mz + tz * (w / 2)],
      [mx - tx * (w / 2), y1, mz - tz * (w / 2)],
    ],
    f.n,
    [{ uv: [r.u0, r.v0] }, { uv: [r.u1, r.v0] }, { uv: [r.u1, r.v1] }, { uv: [r.u0, r.v1] }],
  );
}

export function shade(hex, k) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(k);
  return '#' + c.getHexString();
}

// 看板の文字をまとめたテクスチャ
export class SignAtlas {
  constructor() {
    this.W = 2048;
    this.H = 2048;
    this.cellW = 512;
    this.cellH = 128;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    this.ctx = this.canvas.getContext('2d');
    this.map = new Map();
    this.n = 0;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }
  redraw() {
    this.ctx.clearRect(0, 0, this.W, this.H);
    const entries = [...this.map.entries()];
    this.map.clear();
    this.n = 0;
    for (const [key, r] of entries) this.rect(key, r.icon);
  }
  rect(text, icon, style) {
    const key = text;
    if (this.map.has(key)) return this.map.get(key);
    const cols = this.W / this.cellW;
    const i = this.n++;
    const cx = (i % cols) * this.cellW;
    const cy = Math.floor(i / cols) * this.cellH;
    const g = this.ctx;
    const pal = [
      ['#fff7ec', '#6b4a3c', '#c98b6b'],
      ['#5b3f35', '#fff4e6', '#e7b08a'],
      ['#f3efe6', '#35536b', '#88a9c0'],
      ['#2f4a44', '#f4f1e6', '#9cc7b0'],
      ['#fbe9e4', '#8a3f45', '#e59aa0'],
    ];
    const [bg, fg, ac] = pal[i % pal.length];
    g.save();
    g.translate(cx, cy);
    g.fillStyle = ac;
    roundRect(g, 4, 6, this.cellW - 8, this.cellH - 12, 22);
    g.fill();
    g.fillStyle = bg;
    roundRect(g, 12, 14, this.cellW - 24, this.cellH - 28, 16);
    g.fill();
    g.fillStyle = fg;
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    let size = 54;
    const label = (icon ? icon + ' ' : '') + text;
    g.font = `800 ${size}px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif`;
    while (g.measureText(label).width > this.cellW - 48 && size > 20) {
      size -= 2;
      g.font = `800 ${size}px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif`;
    }
    g.fillText(label, this.cellW / 2, this.cellH / 2 + 2);
    g.restore();
    const r = {
      u0: cx / this.W,
      u1: (cx + this.cellW) / this.W,
      v1: 1 - cy / this.H,
      v0: 1 - (cy + this.cellH) / this.H,
      aspect: this.cellW / this.cellH,
      icon,
    };
    this.map.set(key, r);
    this.texture.needsUpdate = true;
    void style;
    return r;
  }
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export { N, P, RH, SW, CURB, O, line };
