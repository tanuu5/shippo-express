import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vcolMat } from './materials.js';
import { Rng } from '../core/rng.js';

// 街の小物：種類ごとに 1 つの形（頂点色）を作り、InstancedMesh で大量に置く
const _c = new THREE.Color();
export function paint(geo, hex) {
  _c.set(hex);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = _c.r;
    a[i * 3 + 1] = _c.g;
    a[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
export function merge(list) {
  const prepared = list.map((g) => {
    let geo = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.color) paint(geo, 0xffffff);
    return geo;
  });
  return mergeGeometries(prepared, false);
}
export const box = (w, h, d, x, y, z, hex) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), hex);
export const cyl = (r0, r1, h, x, y, z, hex, seg = 12) => paint(new THREE.CylinderGeometry(r0, r1, h, seg).translate(x, y + h / 2, z), hex);
export const ball = (r, x, y, z, hex, detail = 1) => paint(new THREE.IcosahedronGeometry(r, detail).translate(x, y, z), hex);

function flatShade(g) {
  const ng = g.index ? g.toNonIndexed() : g;
  ng.computeVertexNormals();
  return ng;
}

export const PROP_GEO = {
  trunk: () => merge([cyl(0.14, 0.2, 2.4, 0, 0, 0, '#7a5a44', 8)]),
  canopy: () => {
    const parts = [ball(1.55, 0, 3.6, 0, '#ffffff'), ball(1.15, 0.9, 3.1, 0.3, '#f4f4f4'), ball(1.1, -0.8, 3.2, -0.4, '#ededed'), ball(0.95, 0.1, 4.6, -0.2, '#ffffff'), ball(0.9, -0.3, 3.0, 0.9, '#e8e8e8')];
    return flatShade(merge(parts));
  },
  sakuraCanopy: () => {
    const parts = [ball(1.7, 0, 3.7, 0, '#ffffff'), ball(1.2, 1.1, 3.3, 0.2, '#f6f0f2'), ball(1.2, -1.0, 3.4, -0.3, '#fbf4f6'), ball(1.0, 0.2, 4.7, 0.1, '#ffffff'), ball(1.0, -0.2, 3.1, 1.0, '#f0e8ea')];
    return flatShade(merge(parts));
  },
  treeGrate: () => merge([box(1.3, 0.03, 1.3, 0, 0, 0, '#5d5a55')]),
  lamp: () =>
    merge([
      cyl(0.16, 0.2, 0.35, 0, 0, 0, '#3b4146', 10),
      cyl(0.06, 0.08, 4.2, 0, 0.3, 0, '#3b4146', 8),
      box(0.8, 0.06, 0.08, 0.3, 4.3, 0, '#3b4146'),
      cyl(0.2, 0.12, 0.38, 0.62, 4.0, 0, '#3b4146', 8),
      paint(new THREE.SphereGeometry(0.16, 10, 8).translate(0.62, 3.98, 0), '#fff1c9'),
    ]),
  bench: () => {
    const parts = [];
    for (let i = 0; i < 3; i++) parts.push(box(1.6, 0.05, 0.13, 0, 0.44, -0.17 + i * 0.16, '#b07a52'));
    for (let i = 0; i < 2; i++) parts.push(box(1.6, 0.13, 0.05, 0, 0.62 + i * 0.17, -0.27, '#b07a52'));
    for (const x of [-0.7, 0.7]) {
      parts.push(box(0.06, 0.44, 0.5, x, 0, 0, '#3b4146'));
      parts.push(box(0.06, 0.45, 0.06, x, 0.44, -0.27, '#3b4146'));
    }
    return merge(parts);
  },
  vendingBody: () => merge([box(1.0, 1.85, 0.8, 0, 0, 0, '#ffffff'), box(1.04, 0.1, 0.84, 0, 1.85, 0, '#dddddd')]),
  vendingPanel: () => {
    const parts = [box(0.86, 0.9, 0.02, 0, 0.82, 0.41, '#eaf4ff')];
    const cols = ['#e05a4e', '#f2b33d', '#4f9fd8', '#6cbf6a', '#b07ad0', '#f08aa0'];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 6; c++) parts.push(box(0.09, 0.2, 0.03, -0.33 + c * 0.13, 0.86 + r * 0.29, 0.42, cols[(r * 2 + c) % cols.length]));
    parts.push(box(0.4, 0.18, 0.03, -0.15, 0.3, 0.41, '#3a3a3a'));
    return merge(parts);
  },
  mailbox: () =>
    merge([
      box(0.28, 0.5, 0.28, 0, 0, 0, '#4a4a4a'),
      paint(new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16).translate(0, 0.9, 0), '#d8352c'),
      paint(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.3, 0), '#d8352c'),
      box(0.34, 0.05, 0.1, 0, 1.08, 0.27, '#3a2a2a'),
    ]),
  planter: () => {
    const parts = [box(1.4, 0.5, 0.7, 0, 0, 0, '#c9b6a0'), box(1.3, 0.05, 0.6, 0, 0.5, 0, '#6b5a47')];
    const rng = new Rng(7);
    const cols = ['#f06a7a', '#ffd35a', '#ffffff', '#b98ae0', '#ff9e5a'];
    for (let i = 0; i < 14; i++) parts.push(ball(0.13, rng.float(-0.55, 0.55), 0.6 + rng.float(0, 0.12), rng.float(-0.22, 0.22), i % 3 ? '#5f9b4f' : rng.pick(cols), 0));
    return flatShade(merge(parts));
  },
  container: () => {
    const parts = [box(6.0, 2.55, 2.4, 0, 0, 0, '#ffffff')];
    for (let i = 0; i < 13; i++) {
      parts.push(box(0.08, 2.35, 2.44, -2.8 + i * 0.466, 0.1, 0, '#d9d9d9'));
    }
    parts.push(box(0.05, 2.3, 2.3, 3.0, 0.12, 0, '#cfcfcf'));
    return merge(parts);
  },
  jumpPad: () => {
    const parts = [cyl(0.95, 1.05, 0.22, 0, 0, 0, '#7f6866', 24), cyl(0.82, 0.88, 0.14, 0, 0.22, 0, '#f3e3d6', 24)];
    // 肉球
    parts.push(paint(new THREE.CylinderGeometry(0.34, 0.36, 0.05, 20).scale(1, 1, 0.82).translate(0, 0.37, 0.12), '#e98f8f'));
    for (const [x, z] of [
      [-0.38, -0.22],
      [-0.14, -0.42],
      [0.14, -0.42],
      [0.38, -0.22],
    ]) {
      parts.push(paint(new THREE.CylinderGeometry(0.12, 0.13, 0.05, 14).translate(x, 0.37, z), '#e98f8f'));
    }
    return merge(parts);
  },
  roofAC: () => merge([box(1.4, 0.9, 0.9, 0, 0, 0, '#d9d6d0'), paint(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 16).rotateX(Math.PI / 2).translate(0.2, 0.45, 0.46), '#6b6b6b')]),
  roofTank: () => merge([cyl(0.9, 0.9, 1.6, 0, 0.8, 0, '#9fb4c0', 14), ...[-0.6, 0.6].flatMap((x) => [box(0.1, 0.8, 0.1, x, 0, -0.6, '#6b6b6b'), box(0.1, 0.8, 0.1, x, 0, 0.6, '#6b6b6b')])]),
  hydrant: () => merge([cyl(0.14, 0.16, 0.7, 0, 0, 0, '#d8352c', 10), ball(0.15, 0, 0.72, 0, '#d8352c', 1)]),
  bollard: () => merge([cyl(0.1, 0.12, 0.8, 0, 0, 0, '#5a5f66', 10)]),
};

// 回転（0, ±π/2, π）に合わせて箱の当たり判定を回す
function rotBox(w, d, rot) {
  const q = Math.round(rot / (Math.PI / 2)) & 1;
  return q ? [d, w] : [w, d];
}

export class PropSystem {
  constructor(scene, col) {
    this.scene = scene;
    this.col = col;
    this.groups = new Map();
    this.meshes = [];
    this.pads = [];
  }

  add(type, x, y, z, rot = 0, scale = 1, color = null) {
    let g = this.groups.get(type);
    if (!g) {
      g = [];
      this.groups.set(type, g);
    }
    g.push({ x, y, z, rot, scale, color });
  }

  // 設計図の小物を配置
  fromPlan(plan) {
    const rng = new Rng(99);
    const greens = ['#6fa35a', '#7fb163', '#5f9650', '#8cbc6b', '#72a860', '#94c07a'];
    const pinks = ['#f6c6d4', '#f3b8c8', '#f9d3de', '#f5bfd0'];
    const col = this.col;
    for (const p of plan.props) {
      const y = p.y ?? 0.15;
      switch (p.type) {
        case 'tree':
        case 'streetTree': {
          const s = p.s || 1;
          this.add('trunk', p.x, y, p.z, rng.float(0, 6.28), s);
          this.add('canopy', p.x, y, p.z, rng.float(0, 6.28), s * (p.type === 'streetTree' ? 0.85 : 1), rng.pick(greens));
          if (p.type === 'streetTree') this.add('treeGrate', p.x, y + 0.005, p.z, 0, 1);
          col.box(p.x - 0.25 * s, 0, p.z - 0.25 * s, p.x + 0.25 * s, y + 2.3 * s, p.z + 0.25 * s, { tag: 'tree', noCamera: true });
          break;
        }
        case 'sakura': {
          const s = p.s || 1;
          this.add('trunk', p.x, y, p.z, rng.float(0, 6.28), s);
          this.add('sakuraCanopy', p.x, y, p.z, rng.float(0, 6.28), s, rng.pick(pinks));
          col.box(p.x - 0.25 * s, 0, p.z - 0.25 * s, p.x + 0.25 * s, y + 2.3 * s, p.z + 0.25 * s, { tag: 'tree', noCamera: true });
          break;
        }
        case 'lamp':
          this.add('lamp', p.x, y, p.z, (p.rot || 0) + Math.PI / 2);
          col.box(p.x - 0.15, 0, p.z - 0.15, p.x + 0.15, y + 4.4, p.z + 0.15, { tag: 'lamp', noCamera: true });
          break;
        case 'bench': {
          this.add('bench', p.x, y, p.z, p.rot || 0);
          const [w, d] = rotBox(1.7, 0.6, p.rot || 0);
          col.box(p.x - w / 2, 0, p.z - d / 2, p.x + w / 2, y + 0.5, p.z + d / 2, { tag: 'bench' });
          break;
        }
        case 'vending': {
          this.add('vendingBody', p.x, y, p.z, p.rot || 0, 1, p.color);
          this.add('vendingPanel', p.x, y, p.z, p.rot || 0);
          const [w, d] = rotBox(1.0, 0.8, p.rot || 0);
          col.box(p.x - w / 2, 0, p.z - d / 2, p.x + w / 2, y + 1.9, p.z + d / 2, { tag: 'vending' });
          break;
        }
        case 'mailbox':
          this.add('mailbox', p.x, y, p.z, p.rot || 0);
          col.box(p.x - 0.3, 0, p.z - 0.3, p.x + 0.3, y + 1.55, p.z + 0.3, { tag: 'mailbox' });
          break;
        case 'planter': {
          this.add('planter', p.x, y, p.z, p.rot || 0);
          const [w, d] = rotBox(1.4, 0.7, p.rot || 0);
          col.box(p.x - w / 2, 0, p.z - d / 2, p.x + w / 2, y + 0.55, p.z + d / 2, { tag: 'planter' });
          break;
        }
        case 'container': {
          this.add('container', p.x, y, p.z, p.rot || 0, 1, p.color);
          col.box(p.x - 3.0, y - 0.01, p.z - 1.2, p.x + 3.0, y + 2.55, p.z + 1.2, { tag: 'container' });
          break;
        }
        case 'jumpPad': {
          this.add('jumpPad', p.x, y, p.z, 0);
          const c = col.add({ kind: 'bounce', minX: p.x - 0.95, maxX: p.x + 0.95, minZ: p.z - 0.95, maxZ: p.z + 0.95, minY: 0, maxY: y + 0.4, bounce: 23, tag: 'pad' });
          this.pads.push({ x: p.x, z: p.z, y, collider: c });
          break;
        }
        case 'roofUnit': {
          const b = p.b;
          const top = b.y0 + b.h;
          const cx = (b.x0 + b.x1) / 2 + rng.float(-2, 2);
          const cz = (b.z0 + b.z1) / 2 + rng.float(-2, 2);
          if (rng.chance(0.5)) {
            this.add('roofAC', cx, top, cz, 0);
            col.box(cx - 0.7, top, cz - 0.45, cx + 0.7, top + 0.9, cz + 0.45, { tag: 'roof' });
          } else {
            this.add('roofTank', cx, top, cz, 0);
            col.box(cx - 0.9, top, cz - 0.9, cx + 0.9, top + 2.4, cz + 0.9, { tag: 'roof' });
          }
          break;
        }
        default:
          break;
      }
    }
  }

  build() {
    const mat = vcolMat();
    const panelMat = vcolMat({ emissive: 0xffffff, emissiveIntensity: 0.25 });
    const CH = 110; // 視錐台カリング（影のカメラも）が効くよう、場所ごとに分けて描く
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const sc = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    for (const [type, list] of this.groups) {
      const geoFn = PROP_GEO[type];
      if (!geoFn) continue;
      const geo = geoFn();
      const chunks = new Map();
      for (const it of list) {
        const k = Math.floor(it.x / CH) + ',' + Math.floor(it.z / CH);
        let arr = chunks.get(k);
        if (!arr) chunks.set(k, (arr = []));
        arr.push(it);
      }
      for (const arr of chunks.values()) {
        const mesh = new THREE.InstancedMesh(geo, type === 'vendingPanel' ? panelMat : mat, arr.length);
        mesh.name = 'props-' + type;
        arr.forEach((it, i) => {
          e.set(0, it.rot, 0);
          q.setFromEuler(e);
          sc.setScalar(it.scale);
          p.set(it.x, it.y, it.z);
          m.compose(p, q, sc);
          mesh.setMatrixAt(i, m);
          c.set(it.color || '#ffffff');
          mesh.setColorAt(i, c);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.castShadow = ['trunk', 'canopy', 'sakuraCanopy', 'lamp', 'container', 'vendingBody', 'roofTank'].includes(type);
        mesh.receiveShadow = true;
        mesh.computeBoundingSphere();
        this.scene.add(mesh);
        this.meshes.push(mesh);
      }
    }
  }
}

// 生け垣（住宅地の敷地の内周。家の正面の前は門として空ける）
export function buildHedges(plan, col) {
  const parts = [];
  const green = '#5d8f4c';
  const hw = 0.3;
  for (const p of plan.props) {
    if (p.type !== 'hedgeRing') continue;
    const g = p.lot;
    const gaps = [];
    for (const h of plan.houses) {
      const cx = (h.x0 + h.x1) / 2;
      const cz = (h.z0 + h.z1) / 2;
      if (cx < g.x0 || cx > g.x1 || cz < g.z0 || cz > g.z1) continue;
      gaps.push({ side: h.front, c: h.front === 'n' || h.front === 's' ? cx : cz });
    }
    const run = (side, a0, a1, fixed) => {
      // a0..a1 を門のすき間（幅 2.4m）を除いて分割
      const gs = gaps
        .filter((q) => q.side === side)
        .map((q) => q.c)
        .sort((a, b) => a - b);
      let s = a0;
      const segs = [];
      for (const c of gs) {
        if (c - 1.2 > s) segs.push([s, c - 1.2]);
        s = c + 1.2;
      }
      if (a1 > s) segs.push([s, a1]);
      for (const [u0, u1] of segs) {
        if (u1 - u0 < 0.5) continue;
        if (side === 'n' || side === 's') {
          parts.push(box(u1 - u0, 0.85, hw * 2, (u0 + u1) / 2, 0.15, fixed, green));
          col.box(u0, 0, fixed - hw, u1, 1.0, fixed + hw, { tag: 'hedge' });
        } else {
          parts.push(box(hw * 2, 0.85, u1 - u0, fixed, 0.15, (u0 + u1) / 2, green));
          col.box(fixed - hw, 0, u0, fixed + hw, 1.0, u1, { tag: 'hedge' });
        }
      }
    };
    run('n', g.ix0, g.ix1, g.iz0 + hw);
    run('s', g.ix0, g.ix1, g.iz1 - hw);
    run('w', g.iz0 + hw * 2, g.iz1 - hw * 2, g.ix0 + hw);
    run('e', g.iz0 + hw * 2, g.iz1 - hw * 2, g.ix1 - hw);
  }
  if (!parts.length) return null;
  const mesh = new THREE.Mesh(merge(parts), vcolMat({ roughness: 0.95 }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'hedges';
  return mesh;
}
