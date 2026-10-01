import * as THREE from 'three';

// 頂点を積み上げて BufferGeometry を作る小さな道具
export class MeshBuilder {
  constructor(attrs = {}) {
    this.pos = [];
    this.nor = [];
    this.idx = [];
    this.attrs = {};
    for (const [k, size] of Object.entries(attrs)) this.attrs[k] = { size, data: [] };
    this.count = 0;
  }

  // v: {x,y,z}, n: {x,y,z}, extra: { uv:[..], color:[..], ... }
  vert(x, y, z, nx, ny, nz, extra) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    for (const [k, a] of Object.entries(this.attrs)) {
      const v = extra[k];
      if (v === undefined) for (let i = 0; i < a.size; i++) a.data.push(0);
      else for (let i = 0; i < a.size; i++) a.data.push(v[i]);
    }
    return this.count++;
  }

  // 4 点（反時計回りで表）の四角形
  quad(p, n, extras) {
    const e = Array.isArray(extras) ? extras : [extras, extras, extras, extras];
    const a = this.vert(p[0][0], p[0][1], p[0][2], n[0], n[1], n[2], e[0]);
    const b = this.vert(p[1][0], p[1][1], p[1][2], n[0], n[1], n[2], e[1]);
    const c = this.vert(p[2][0], p[2][1], p[2][2], n[0], n[1], n[2], e[2]);
    const d = this.vert(p[3][0], p[3][1], p[3][2], n[0], n[1], n[2], e[3]);
    this.idx.push(a, b, c, a, c, d);
  }

  tri(p, n, extras) {
    const e = Array.isArray(extras) ? extras : [extras, extras, extras];
    const a = this.vert(p[0][0], p[0][1], p[0][2], n[0], n[1], n[2], e[0]);
    const b = this.vert(p[1][0], p[1][1], p[1][2], n[0], n[1], n[2], e[1]);
    const c = this.vert(p[2][0], p[2][1], p[2][2], n[0], n[1], n[2], e[2]);
    this.idx.push(a, b, c);
  }

  // 水平な長方形（上向き）
  hrect(x0, z0, x1, z1, y, extraFn) {
    const p = [
      [x0, y, z1],
      [x1, y, z1],
      [x1, y, z0],
      [x0, y, z0],
    ];
    this.quad(p, [0, 1, 0], p.map((q) => extraFn(q[0], q[2])));
  }

  // 軸に平行な箱（上・側面、底なし）。faceFn(face, corners) で各面の extra を返す
  box(x0, y0, z0, x1, y1, z1, extraFn, opts = {}) {
    const faces = [
      // [名前, 法線, 4 点]
      ['s', [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
      ['n', [0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
      ['e', [1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
      ['w', [-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
      ['t', [0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
    ];
    if (opts.bottom) faces.push(['b', [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]]);
    for (const [name, n, p] of faces) {
      if (opts.skip && opts.skip.includes(name)) continue;
      const ex = extraFn(name, p);
      if (ex === null) continue;
      this.quad(p, n, ex);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    for (const [k, a] of Object.entries(this.attrs)) g.setAttribute(k, new THREE.Float32BufferAttribute(a.data, a.size));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const _c = new THREE.Color();
export function rgb(hex) {
  _c.set(hex);
  return [_c.r, _c.g, _c.b];
}
