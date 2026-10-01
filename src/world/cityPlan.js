import { Rng } from '../core/rng.js';

// 街の設計図（決定的に生成）。メッシュや当たり判定は cityBuild.js がこれを元に作る。
// 座標：x=東, z=南, y=上。道路の中心線は x,z = O + k*P（k=0..N）。

export const N = 9; // ブロック数（一辺）
export const P = 44; // ブロックの間隔 (m)
export const RH = 4; // 車道の半幅
export const SW = 2.5; // 歩道の幅
export const CURB = 0.15; // 歩道・敷地の高さ
export const O = (-N * P) / 2;
export const line = (k) => O + k * P;
export const QUAY_Z = line(N) + RH + 12; // 岸壁（ここから南は海）
export const WORLD = { minX: line(0) - 16, maxX: line(N) + 16, minZ: line(0) - 16, maxZ: QUAY_Z + 70 };

// 行 j（北→南）× 列 i（西→東）
// P=公園 R=住宅 S=駅 D=オフィス街 C=商店街 H=クリニック F=神社 Z=時計塔広場 M=美術館 L=図書館 K=学校 A=港
const MAP = [
  'PPRSSDDDD',
  'PPRCCDDDD',
  'RRRCCCDDH',
  'RRCCCCCDD',
  'RFCCZCCML',
  'RRCCCCRKK',
  'RRRCCRRKK',
  'RRRRRRRRR',
  'AAAAAAAAA',
];
const GROUPED = { P: 'park', S: 'station', K: 'school' };

const WALLS = ['#f4e6d4', '#f6d9c8', '#e9ecd8', '#d9e6ea', '#f3e1ea', '#f5ecc9', '#e6dccf', '#dfe9df', '#f0d4bf', '#e8e0f0', '#fbeee2', '#dde3ec'];
const ROOFS = ['#b8664f', '#9c5a4a', '#5f7384', '#6c8a6e', '#8a6a5a', '#c47f5a', '#4f6272', '#a0564b'];
const AWNINGS = [
  ['#e0655a', '#fff6ee'],
  ['#5b9b7e', '#fff6ee'],
  ['#4f7fb0', '#fff6ee'],
  ['#e8b44d', '#fff6ee'],
  ['#9b6fb0', '#fff6ee'],
  ['#d9826a', '#f6e9d8'],
  ['#6fa3a0', '#f6e9d8'],
];
const OFFICE = ['#dfe4ea', '#c9d3dd', '#e8e2d8', '#d4dbe0', '#b8c4cf', '#e3ddd3', '#cfd8d4'];

const FAMILY = ['たなか', 'すずき', 'もり', 'こばやし', 'やまだ', 'いのうえ', 'ささき', 'はやし', 'くどう', 'しみず', 'おがわ', 'まつもと', 'いしい', 'あおき', 'のむら', 'きむら', 'さかい', 'ふじた', 'おかだ', 'ほしの'];

export function makeCityPlan(seed = 20261001) {
  const rng = new Rng(seed);
  const plan = {
    blocks: [],
    nodes: [],
    segments: [],
    buildings: [],
    props: [],
    destinations: [],
    spots: [],
    grounds: [],
    specials: [],
    walls: [],
  };

  // --- ブロック
  const blockAt = [];
  for (let j = 0; j < N; j++) {
    blockAt.push([]);
    for (let i = 0; i < N; i++) {
      const t = MAP[j][i];
      const b = { i, j, type: t, group: GROUPED[t] || `b${i}_${j}` };
      blockAt[j].push(b);
      plan.blocks.push(b);
    }
  }
  const sameGroup = (i1, j1, i2, j2) => {
    if (i1 < 0 || j1 < 0 || i2 < 0 || j2 < 0 || i1 >= N || i2 >= N || j1 >= N || j2 >= N) return false;
    return blockAt[j1][i1].group === blockAt[j2][i2].group;
  };

  // --- 道路網：縦の区間 V(k,j) は x=line(k) の z=line(j)..line(j+1)、横の区間 H(k,i) は z=line(k) の x=line(i)..line(i+1)
  const nodeId = (i, k) => k * (N + 1) + i;
  for (let k = 0; k <= N; k++) {
    for (let i = 0; i <= N; i++) {
      plan.nodes.push({ id: nodeId(i, k), i, k, x: line(i), z: line(k), links: [], exists: false });
    }
  }
  const addSeg = (a, b, axis) => {
    const A = plan.nodes[a];
    const B = plan.nodes[b];
    const s = { id: plan.segments.length, a, b, axis, x0: A.x, z0: A.z, x1: B.x, z1: B.z, cars: true };
    plan.segments.push(s);
    A.links.push({ to: b, seg: s.id });
    B.links.push({ to: a, seg: s.id });
    A.exists = true;
    B.exists = true;
    return s;
  };
  for (let k = 0; k <= N; k++) {
    for (let j = 0; j < N; j++) {
      // 縦：x=line(k) は ブロック (k-1, j) と (k, j) の間
      if (!sameGroup(k - 1, j, k, j)) addSeg(nodeId(k, j), nodeId(k, j + 1), 'z');
    }
    for (let i = 0; i < N; i++) {
      if (!sameGroup(i, k - 1, i, k)) addSeg(nodeId(i, k), nodeId(i + 1, k), 'x');
    }
  }

  // --- 敷地（歩道込みの台）：グループごとにまとめる
  const groupsDone = new Set();
  for (const b of plan.blocks) {
    if (groupsDone.has(b.group)) continue;
    groupsDone.add(b.group);
    const members = plan.blocks.filter((o) => o.group === b.group);
    const i0 = Math.min(...members.map((m) => m.i));
    const i1 = Math.max(...members.map((m) => m.i)) + 1;
    const j0 = Math.min(...members.map((m) => m.j));
    const j1 = Math.max(...members.map((m) => m.j)) + 1;
    const lot = {
      type: b.type,
      group: b.group,
      i0,
      i1,
      j0,
      j1,
      x0: line(i0) + RH,
      x1: line(i1) - RH,
      z0: line(j0) + RH,
      z1: line(j1) - RH,
    };
    lot.ix0 = lot.x0 + SW;
    lot.ix1 = lot.x1 - SW;
    lot.iz0 = lot.z0 + SW;
    lot.iz1 = lot.z1 - SW;
    lot.cx = (lot.x0 + lot.x1) / 2;
    lot.cz = (lot.z0 + lot.z1) / 2;
    plan.grounds.push(lot);
  }

  // --- 建物の生成
  const B = (o) => {
    const b = {
      y0: CURB,
      roof: 'flat',
      style: 'plain',
      floorH: 3.2,
      winW: 2.6,
      ...o,
    };
    b.id = plan.buildings.length;
    plan.buildings.push(b);
    return b;
  };
  const faceToward = (x0, z0, x1, z1, lot) => {
    // 敷地のどの辺に近いかで正面の向きを決める
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const d = [
      ['n', cz - lot.iz0],
      ['s', lot.iz1 - cz],
      ['w', cx - lot.ix0],
      ['e', lot.ix1 - cx],
    ];
    d.sort((a, b) => a[1] - b[1]);
    return d[0][0];
  };

  const houses = [];
  const shops = [];
  const offices = [];

  for (const lot of plan.grounds) {
    const w = lot.ix1 - lot.ix0;
    const d = lot.iz1 - lot.iz0;
    if (lot.type === 'R') {
      lot.ground = 'garden';
      const apt = rng.chance(0.28);
      const half = [
        [lot.ix0, lot.iz0, lot.ix0 + w / 2, lot.iz0 + d / 2],
        [lot.ix0 + w / 2, lot.iz0, lot.ix1, lot.iz0 + d / 2],
        [lot.ix0, lot.iz0 + d / 2, lot.ix0 + w / 2, lot.iz1],
        [lot.ix0 + w / 2, lot.iz0 + d / 2, lot.ix1, lot.iz1],
      ];
      if (apt) {
        // 北半分をアパートに
        const north = rng.chance(0.5);
        const z0 = north ? lot.iz0 + 1.5 : lot.iz0 + d / 2 + 1;
        const z1 = north ? lot.iz0 + d / 2 - 1 : lot.iz1 - 1.5;
        const floors = rng.int(3, 5);
        const b = B({ x0: lot.ix0 + 2, x1: lot.ix1 - 2, z0, z1, h: floors * 3.1 + 0.6, wall: rng.pick(WALLS), roofColor: rng.pick(ROOFS), style: 'apartment', floorH: 3.1, winW: 3.2, front: north ? 'n' : 's', balcony: true });
        houses.push(b);
        half.splice(north ? 0 : 2, 2);
      }
      for (const [x0, z0, x1, z1] of half) {
        const lw = x1 - x0;
        const ld = z1 - z0;
        const hw = rng.float(8, Math.min(11, lw - 3.5));
        const hd = rng.float(7.5, Math.min(10.5, ld - 3.5));
        const front = faceToward(x0, z0, x1, z1, lot);
        // 正面側を道路に寄せ、前庭 2.5〜3.5m
        const set = rng.float(2.5, 3.5);
        let hx0;
        let hz0;
        if (front === 'n') {
          hz0 = z0 + set;
          hx0 = x0 + (lw - hw) / 2 + rng.float(-0.8, 0.8);
        } else if (front === 's') {
          hz0 = z1 - set - hd;
          hx0 = x0 + (lw - hw) / 2 + rng.float(-0.8, 0.8);
        } else if (front === 'w') {
          hx0 = x0 + set;
          hz0 = z0 + (ld - hd) / 2;
        } else {
          hx0 = x1 - set - hw;
          hz0 = z0 + (ld - hd) / 2;
        }
        const floors = rng.chance(0.75) ? 2 : 3;
        const eave = floors * 3.0 + 0.4;
        const b = B({
          x0: hx0,
          x1: hx0 + hw,
          z0: hz0,
          z1: hz0 + hd,
          h: eave,
          wall: rng.pick(WALLS),
          roofColor: rng.pick(ROOFS),
          roof: 'gable',
          ridgeAxis: hw >= hd ? 'x' : 'z',
          roofRise: rng.float(2.3, 3.2),
          style: 'house',
          floorH: 3.0,
          winW: 2.8,
          front,
          family: rng.pick(FAMILY),
        });
        houses.push(b);
        // 庭木
        const tx = front === 'e' ? x0 + 1.8 : x1 - 1.8;
        const tz = front === 's' ? z0 + 1.8 : z1 - 1.8;
        plan.props.push({ type: rng.chance(0.25) ? 'sakura' : 'tree', x: tx, z: tz, s: rng.float(0.75, 1.0), y: CURB });
      }
      // 生け垣（歩道との境、門のすき間を空ける）
      plan.props.push({ type: 'hedgeRing', lot });
    } else if (lot.type === 'C') {
      lot.ground = 'plaza';
      const D = 11;
      const strips = [];
      // 北と南の帯：3 分割
      for (const side of ['n', 's']) {
        const z0 = side === 'n' ? lot.iz0 : lot.iz1 - D;
        let x = lot.ix0;
        const cuts = [rng.float(9, 11.5), rng.float(9, 11.5)];
        const widths = [cuts[0], cuts[1], w - cuts[0] - cuts[1]];
        for (const ww of widths) {
          strips.push({ x0: x, x1: x + ww, z0, z1: z0 + D, front: side });
          x += ww;
        }
      }
      for (const side of ['w', 'e']) {
        const x0 = side === 'w' ? lot.ix0 : lot.ix1 - D;
        strips.push({ x0, x1: x0 + D, z0: lot.iz0 + D, z1: lot.iz1 - D, front: side });
      }
      for (const s of strips) {
        const floors = rng.pick([2, 2, 3, 3, 3, 4]);
        const aw = rng.chance(0.8) ? rng.pick(AWNINGS) : null;
        // 低めの店は 3 割ほど切妻屋根（棟は通りと平行）にして、屋根並みに変化をつける
        const gable = floors <= 3 && rng.chance(0.32);
        const b = B({
          ...s,
          x0: s.x0 + 0.05,
          x1: s.x1 - 0.05,
          z0: s.z0 + 0.05,
          z1: s.z1 - 0.05,
          h: floors * 3.3 + 0.5,
          wall: rng.pick(WALLS),
          roofColor: gable ? rng.pick(ROOFS) : rng.pick(['#c4bab0', '#b7aea5', '#cbb9a6', '#aab2b6', '#bfb3a3']),
          roof: gable ? 'gable' : 'flat',
          ridgeAxis: s.front === 'n' || s.front === 's' ? 'x' : 'z',
          roofRise: rng.float(1.8, 2.6),
          style: 'shop',
          floorH: 3.3,
          winW: 2.5,
          awning: aw,
          shop: true,
        });
        shops.push(b);
        if (!gable && rng.chance(0.6)) plan.props.push({ type: 'roofUnit', b });
        if (!gable && rng.chance(0.3)) plan.props.push({ type: 'roofUnit', b });
      }
      // 中庭の木
      plan.props.push({ type: 'tree', x: lot.cx, z: lot.cz, s: 0.9, y: CURB });
    } else if (lot.type === 'D') {
      lot.ground = 'tiles';
      const kind = rng.int(0, 2);
      if (kind === 0) {
        // 大きなタワー 1 本
        const m = 3.5;
        const h = rng.float(34, 62);
        offices.push(B({ x0: lot.ix0 + m, x1: lot.ix1 - m, z0: lot.iz0 + m, z1: lot.iz1 - m, h, wall: rng.pick(OFFICE), style: 'glass', floorH: 3.6, winW: 2.2, tower: true }));
      } else if (kind === 1) {
        // 低層部＋タワー
        offices.push(B({ x0: lot.ix0 + 1, x1: lot.ix1 - 1, z0: lot.iz0 + 1, z1: lot.iz1 - 1, h: 8.2, wall: rng.pick(OFFICE), style: 'office', floorH: 4.0, winW: 3.0 }));
        const h = rng.float(28, 52);
        offices.push(B({ x0: lot.ix0 + 7, x1: lot.ix1 - 7, z0: lot.iz0 + 7, z1: lot.iz1 - 7, y0: CURB + 8.2, h, wall: rng.pick(OFFICE), style: 'glass', floorH: 3.6, winW: 2.2, tower: true }));
      } else {
        // 2 棟
        const split = lot.ix0 + w * rng.float(0.42, 0.58);
        offices.push(B({ x0: lot.ix0 + 1.5, x1: split - 1.5, z0: lot.iz0 + 2, z1: lot.iz1 - 2, h: rng.float(18, 36), wall: rng.pick(OFFICE), style: 'office', floorH: 3.6, winW: 2.6 }));
        offices.push(B({ x0: split + 1.5, x1: lot.ix1 - 1.5, z0: lot.iz0 + 2, z1: lot.iz1 - 2, h: rng.float(22, 44), wall: rng.pick(OFFICE), style: 'glass', floorH: 3.6, winW: 2.2 }));
      }
    } else if (lot.type === 'A') {
      lot.ground = 'concrete';
      // 倉庫とコンテナ。5 列目は魚市場、8 列目は観覧車が敷地を使うので倉庫を建てない（魚市場はコンテナも置かない）。
      // 置かない区画でも乱数は同じだけ引く（ほかの区画の配置を変えないため）
      const market = lot.i0 === 5;
      const ferris = lot.i0 === 8;
      const wall = rng.pick(['#c9d6de', '#d9c9b8', '#b7c9c0', '#e0d0c0']);
      const roofColor = rng.pick(['#6d7f8c', '#8a6a5a', '#5f7a6a']);
      if (!market && !ferris) {
        const wz0 = lot.iz0 + 2;
        const wz1 = lot.iz0 + 2 + 16;
        const b = B({ x0: lot.ix0 + 2, x1: lot.ix1 - 2, z0: wz0, z1: wz1, h: 8.5, wall, roofColor, roof: 'gable', ridgeAxis: 'x', roofRise: 2.4, style: 'warehouse', floorH: 8.5, winW: 6, front: 'n' });
        houses.push(b);
      }
      // コンテナの山
      const cols = ['#d4553f', '#3f7fae', '#e2a93b', '#4f9a6c', '#8a5aa0', '#e07a4f'];
      const baseZ = lot.iz1 - 7;
      for (let k = 0; k < 3; k++) {
        const x = lot.ix0 + 3 + k * 9 + rng.float(-0.5, 0.5);
        const stack = rng.int(1, 3);
        for (let s = 0; s < stack; s++) {
          const c = { type: 'container', x, z: baseZ + rng.float(-0.4, 0.4), y: CURB + s * 2.6, rot: rng.chance(0.5) ? 0 : 0.02, color: rng.pick(cols) };
          if (!market) plan.props.push(c);
        }
      }
    }
  }

  // --- 特別な場所（landmark）
  const lotOf = (type) => plan.grounds.find((g) => g.type === type);
  const park = lotOf('P');
  park.ground = 'park';
  plan.specials.push({ type: 'park', lot: park });
  const station = lotOf('S');
  station.ground = 'tiles';
  plan.specials.push({ type: 'station', lot: station });
  const plaza = lotOf('Z');
  plaza.ground = 'plazaRound';
  plan.specials.push({ type: 'clocktower', lot: plaza, x: plaza.cx, z: plaza.cz });
  const shrine = lotOf('F');
  shrine.ground = 'forest';
  plan.specials.push({ type: 'shrine', lot: shrine });
  const museum = lotOf('M');
  museum.ground = 'tiles';
  plan.specials.push({ type: 'museum', lot: museum });
  const library = lotOf('L');
  library.ground = 'garden';
  plan.specials.push({ type: 'library', lot: library });
  const clinic = lotOf('H');
  clinic.ground = 'garden';
  plan.specials.push({ type: 'clinic', lot: clinic });
  const school = lotOf('K');
  school.ground = 'garden';
  plan.specials.push({ type: 'school', lot: school });
  plan.specials.push({ type: 'harbor' });

  // --- 目的地（名前つき）
  const dest = (id, name, x, z, dir, icon) => plan.destinations.push({ id, name, x, z, dir, icon });
  // 建物の正面の歩道上の点
  const frontPoint = (b) => {
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const f = b.front || 'n';
    // 敷地の外周（歩道の中央）まで出す
    const lot = plan.grounds.find((g) => cx >= g.x0 && cx <= g.x1 && cz >= g.z0 && cz <= g.z1);
    if (!lot) return { x: cx, z: cz };
    if (f === 'n') return { x: cx, z: lot.z0 + SW * 0.5 };
    if (f === 's') return { x: cx, z: lot.z1 - SW * 0.5 };
    if (f === 'w') return { x: lot.x0 + SW * 0.5, z: cz };
    return { x: lot.x1 - SW * 0.5, z: cz };
  };
  const pickShop = (bi, bj, name, icon, id) => {
    const cand = shops.filter((s) => {
      const cx = (s.x0 + s.x1) / 2;
      const cz = (s.z0 + s.z1) / 2;
      return cx > line(bi) && cx < line(bi + 1) && cz > line(bj) && cz < line(bj + 1) && !s.sign;
    });
    if (!cand.length) return;
    const s = cand[Math.floor(rng.next() * cand.length)];
    s.sign = name;
    s.signIcon = icon;
    if (!s.awning) s.awning = rng.pick(AWNINGS);
    const p = frontPoint(s);
    dest(id, name, p.x, p.z, s.front, icon);
  };
  pickShop(3, 1, 'パン屋「こむぎ」', '🥐', 'bakery');
  pickShop(2, 3, '花屋「すずらん」', '💐', 'flower');
  pickShop(5, 3, '喫茶「まどろみ」', '☕', 'cafe');
  pickShop(3, 5, '本屋「しおり堂」', '📚', 'books');
  pickShop(5, 2, '郵便局', '📮', 'post');
  pickShop(6, 3, '映画館「ほしぞら座」', '🎬', 'cinema');
  pickShop(4, 5, 'ゲームセンター', '🎮', 'arcade');
  pickShop(2, 4, '八百屋「みどり」', '🥕', 'grocer');
  pickShop(5, 5, 'おもちゃ屋「ぽこぽこ」', '🧸', 'toys');
  pickShop(3, 6, 'ケーキ屋「いちご」', '🍰', 'cake');
  pickShop(4, 1, '文具店「えんぴつ」', '✏️', 'stationery');
  pickShop(6, 4, 'ラーメン「こぎつね」', '🍜', 'ramen');
  // 目的地ではない店にも看板（街のにぎわい用）
  const GENERIC = [
    ['コンビニ', '🏪'], ['くすり', '💊'], ['クリーニング', '👕'], ['おにぎり', '🍙'], ['和菓子', '🍡'], ['写真館', '📷'],
    ['美容室', '✂️'], ['お茶', '🍵'], ['楽器店', '🎵'], ['スイーツ', '🧁'], ['精肉店', '🍖'], ['そば', '🍜'], ['カレー', '🍛'],
    ['手芸店', '🧶'], ['古本', '📚'], ['パン工房', '🍞'], ['くだもの', '🍎'], ['帽子店', '🎩'], ['雑貨', '🎁'], ['時計店', '⌚'],
    ['メガネ', '👓'], ['靴屋', '👟'], ['喫茶', '☕'], ['文房具', '✏️'], ['花屋', '🌷'], ['金物店', '🔧'], ['豆腐', '🥢'], ['ペット', '🐾'],
  ];
  let gi = 0;
  for (const sh of shops) {
    if (sh.sign || !sh.awning || !rng.chance(0.55)) continue;
    const [name, icon] = GENERIC[gi++ % GENERIC.length];
    sh.sign = name;
    sh.signIcon = icon;
  }
  // オフィス街
  const pickOffice = (bi, bj, name, icon, id) => {
    const o = offices.find((s) => {
      const cx = (s.x0 + s.x1) / 2;
      const cz = (s.z0 + s.z1) / 2;
      return cx > line(bi) && cx < line(bi + 1) && cz > line(bj) && cz < line(bj + 1) && s.y0 <= CURB + 0.01;
    });
    if (!o) return;
    const lot = plan.grounds.find((g) => g.i0 === bi && g.j0 === bj);
    o.front = 's';
    o.sign = name;
    o.signIcon = icon;
    dest(id, name, (o.x0 + o.x1) / 2, lot.z1 - SW * 0.5, 's', icon);
  };
  pickOffice(6, 1, '市役所', '🏛️', 'cityhall');
  pickOffice(7, 0, 'ホテル「つきあかり」', '🏨', 'hotel');
  pickOffice(8, 1, 'テレビ局', '📺', 'tv');
  pickOffice(6, 2, '銀行', '🏦', 'bank');
  // 特別な場所
  dest('clock', '時計塔広場', plaza.cx, plaza.cz + 9, 's', '🕰️');
  dest('station', 'しっぽ駅', station.cx, station.z1 - SW * 0.5, 's', '🚉');
  dest('park', 'ひだまり公園', park.x1 - SW * 0.5, park.cz, 'e', '⛲');
  dest('shrine', 'こぎつね神社', shrine.x1 - SW * 0.5, shrine.cz, 'e', '⛩️');
  dest('museum', '美術館', museum.cx, museum.z1 - SW * 0.5, 's', '🖼️');
  dest('library', '図書館', library.cx, library.z1 - SW * 0.5, 's', '📖');
  dest('clinic', 'こもれびクリニック', clinic.x0 + SW * 0.5, clinic.cz, 'w', '🏥');
  dest('school', 'ひだまり学園', school.x0 + SW * 0.5, school.cz, 'w', '🏫');
  dest('market', '魚市場', line(5) + P / 2, QUAY_Z - 5, 's', '🐟');
  dest('warehouse', '港の倉庫', line(2) + P / 2, line(8) + RH + SW * 0.5, 'n', '📦');
  dest('ferris', '観覧車', line(8) + P / 2, QUAY_Z - 4, 's', '🎡');
  dest('lighthouse', '灯台', LIGHTHOUSE.x, LIGHTHOUSE.z - 7, 'n', '🗼');
  // 防波堤の入口を経由しないと海に落ちるので、道順に経由点を足す
  plan.destinations[plan.destinations.length - 1].via = [
    { x: LIGHTHOUSE.x, z: line(N) + RH + 4 },
    { x: LIGHTHOUSE.x, z: QUAY_Z + 6 },
  ];
  // 住宅（〇〇さんの家）
  for (const h of houses) {
    if (h.style !== 'house' || !h.family) continue;
    if (!rng.chance(0.45)) continue;
    const p = frontPoint(h);
    dest('home' + h.id, `${h.family}さんの家`, p.x, p.z, h.front, '🏠');
  }
  for (const a of houses) {
    if (a.style !== 'apartment') continue;
    const p = frontPoint(a);
    a.sign = rng.pick(['ことり荘', 'さくら荘', 'ひばり荘', 'こかげ荘']);
    dest('apt' + a.id, a.sign, p.x, p.z, a.front, '🏢');
  }

  // --- お客さんが立つ場所（歩道上）
  for (const g of plan.grounds) {
    if (g.type === 'A') continue;
    const add = (x, z) => plan.spots.push({ x, z });
    for (let x = g.x0 + 5; x < g.x1 - 5; x += 9) {
      add(x, g.z0 + 1.2);
      add(x, g.z1 - 1.2);
    }
    for (let z = g.z0 + 5; z < g.z1 - 5; z += 9) {
      add(g.x0 + 1.2, z);
      add(g.x1 - 1.2, z);
    }
  }
  for (let x = line(0) + 6; x < line(N) - 6; x += 12) plan.spots.push({ x, z: line(N) + RH + 6 });

  // ジャンプ台（屋根への近道）
  const pads = [
    [line(3) + RH + 1.3, line(3) + 20],
    [line(5) - RH - 1.3, line(2) + 24],
    [line(2) + 22, line(6) - RH - 1.3],
    [line(6) + 22, line(5) + RH + 1.3],
    [line(4) + 30, line(1) - RH - 1.3],
    [line(7) - RH - 1.3, line(3) + 14],
    [line(1) + 22, line(8) - RH - 1.3],
    [line(8) - RH - 1.3, line(4) + 30],
  ];
  const nearPad = (x, z) => pads.some(([px, pz]) => Math.hypot(x - px, z - pz) < 3);

  // --- 街路の小物：街灯・街路樹・ベンチ・自販機・ポスト
  // ジャンプ台のまわりには置かない（乱数は同じだけ引いて、ほかの場所の配置を変えない）
  for (const g of plan.grounds) {
    const edge = (x, z, rot) => {
      const r = rng.next();
      let p = null;
      if (r < 0.34) p = { type: 'lamp', x, z, rot, y: CURB };
      else if (r < 0.62 && g.type !== 'D') p = { type: 'streetTree', x, z, y: CURB, s: rng.float(0.85, 1.05) };
      else if (r < 0.7) p = { type: 'bench', x, z, rot, y: CURB };
      else if (r < 0.76 && (g.type === 'C' || g.type === 'R')) p = { type: 'vending', x, z, rot, y: CURB, color: rng.pick(['#e05a4e', '#3f7fae', '#f2f2f2', '#5aa06a']) };
      else if (r < 0.79) p = { type: 'mailbox', x, z, rot, y: CURB };
      else if (r < 0.83) p = { type: 'planter', x, z, rot, y: CURB };
      if (p && !nearPad(x, z)) plan.props.push(p);
    };
    const inset = 0.7;
    for (let x = g.x0 + 7; x < g.x1 - 6; x += 11 + rng.float(-1, 2)) {
      edge(x, g.z0 + inset, 0);
      edge(x, g.z1 - inset, Math.PI);
    }
    for (let z = g.z0 + 7; z < g.z1 - 6; z += 11 + rng.float(-1, 2)) {
      edge(g.x0 + inset, z, -Math.PI / 2);
      edge(g.x1 - inset, z, Math.PI / 2);
    }
  }
  for (const [x, z] of pads) plan.props.push({ type: 'jumpPad', x, z, y: CURB });

  plan.houses = houses;
  plan.shops = shops;
  plan.offices = offices;
  return plan;
}

export const LIGHTHOUSE = { x: line(7) - 8, z: QUAY_Z + 58 };
export const FERRIS = { x: line(8) + P / 2 + 2, z: line(8) + P / 2 + 2 };
