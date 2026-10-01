// 当たり判定の世界：軸に平行な箱（建物・小物）と切妻屋根。一様グリッドで近傍だけを調べる。
// kind: 'solid'（壁と上面）, 'platform'（上に乗れるだけ）, 'bounce'（乗るとはねる）, 'gable'（切妻屋根：壁は軒まで、上面は斜面）
export class CollisionWorld {
  constructor(cell = 8) {
    this.cell = cell;
    this.cells = new Map();
    this.list = [];
    this.stamp = 0;
    this.baseGround = () => 0;
  }

  _key(ix, iz) {
    return ix * 73856093 + iz * 19349663;
  }

  add(c) {
    c.kind = c.kind || 'solid';
    c._s = 0;
    c.id = this.list.length;
    this.list.push(c);
    const s = this.cell;
    const x0 = Math.floor(c.minX / s);
    const x1 = Math.floor(c.maxX / s);
    const z0 = Math.floor(c.minZ / s);
    const z1 = Math.floor(c.maxZ / s);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this._key(ix, iz);
        let arr = this.cells.get(k);
        if (!arr) {
          arr = [];
          this.cells.set(k, arr);
        }
        arr.push(c);
      }
    }
    return c;
  }

  box(minX, minY, minZ, maxX, maxY, maxZ, extra = {}) {
    return this.add({ minX, minY, minZ, maxX, maxY, maxZ, ...extra });
  }

  // 範囲に重なる候補を集める（重複なし）
  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const s = this.cell;
    const st = ++this.stamp;
    const x0 = Math.floor(minX / s);
    const x1 = Math.floor(maxX / s);
    const z0 = Math.floor(minZ / s);
    const z1 = Math.floor(maxZ / s);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const arr = this.cells.get(this._key(ix, iz));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const c = arr[i];
          if (c._s === st) continue;
          c._s = st;
          if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
          out.push(c);
        }
      }
    }
    return out;
  }

  // 上面の高さ（切妻は斜面）
  topAt(c, x, z) {
    if (c.kind !== 'gable') return c.maxY;
    const g = c.gable;
    const d = g.axis === 'x' ? Math.abs(z - g.ridge) : Math.abs(x - g.ridge);
    const t = Math.max(0, 1 - d / g.half);
    return g.eave + (c.maxY - g.eave) * t;
  }

  // 足元の地面：足の高さ + stepUp 以下で最も高い上面
  groundAt(x, z, r, feetY, stepUp, info) {
    let best = this.baseGround(x, z);
    let bestC = null;
    const rr = r * 0.55;
    const arr = this.query(x - rr, z - rr, x + rr, z + rr, this._q1 || (this._q1 = []));
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i];
      // 円と箱が重なるか
      const qx = x < c.minX ? c.minX : x > c.maxX ? c.maxX : x;
      const qz = z < c.minZ ? c.minZ : z > c.maxZ ? c.maxZ : z;
      if ((qx - x) * (qx - x) + (qz - z) * (qz - z) > rr * rr) continue;
      const top = this.topAt(c, qx, qz);
      if (top <= feetY + stepUp && top > best) {
        best = top;
        bestC = c;
      }
    }
    if (info) info.collider = bestC;
    return best;
  }

  // 水平方向の押し出し。pos は {x, z} を書き換える。当たった壁の法線を返す
  resolve(pos, r, feetY, height, stepUp, hitOut) {
    let hit = false;
    let nx = 0;
    let nz = 0;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const arr = this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, this._q2 || (this._q2 = []));
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (c.kind === 'platform' || c.kind === 'bounce') continue;
        const qx = pos.x < c.minX ? c.minX : pos.x > c.maxX ? c.maxX : pos.x;
        const qz = pos.z < c.minZ ? c.minZ : pos.z > c.maxZ ? c.maxZ : pos.z;
        // 切妻は接触点での屋根の高さまでが壁（妻側の三角の面も壁になる）
        const top = c.kind === 'gable' ? this.topAt(c, qx, qz) : c.maxY;
        if (top <= feetY + stepUp || c.minY >= feetY + height) continue;
        let dx = pos.x - qx;
        let dz = pos.z - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = r - d;
          dx /= d;
          dz /= d;
          pos.x += dx * push;
          pos.z += dz * push;
          nx = dx;
          nz = dz;
        } else {
          // 中心が箱の中：いちばん浅い面から出す
          const pl = pos.x - c.minX;
          const pr = c.maxX - pos.x;
          const pb = pos.z - c.minZ;
          const pf = c.maxZ - pos.z;
          const m = Math.min(pl, pr, pb, pf);
          if (m === pl) {
            pos.x = c.minX - r;
            nx = -1;
            nz = 0;
          } else if (m === pr) {
            pos.x = c.maxX + r;
            nx = 1;
            nz = 0;
          } else if (m === pb) {
            pos.z = c.minZ - r;
            nx = 0;
            nz = -1;
          } else {
            pos.z = c.maxZ + r;
            nx = 0;
            nz = 1;
          }
        }
        hit = true;
        moved = true;
        if (hitOut) hitOut.collider = c;
      }
      if (!moved) break;
    }
    if (hitOut) {
      hitOut.hit = hit;
      hitOut.nx = nx;
      hitOut.nz = nz;
    }
    return hit;
  }

  // 頭上の天井（下面）の高さ
  ceilingAt(x, z, r, feetY, headY) {
    let best = Infinity;
    const rr = r * 0.5;
    const arr = this.query(x - rr, z - rr, x + rr, z + rr, this._q3 || (this._q3 = []));
    for (const c of arr) {
      if (c.kind === 'platform' || c.kind === 'bounce') continue;
      if (c.minY > feetY + 0.2 && c.minY < best && c.minY < headY + 2) {
        const qx = Math.max(c.minX, Math.min(x, c.maxX));
        const qz = Math.max(c.minZ, Math.min(z, c.maxZ));
        if ((qx - x) ** 2 + (qz - z) ** 2 <= rr * rr) best = c.minY;
      }
    }
    return best;
  }

  // 線分と箱の交差（カメラの壁抜け防止）。最初に当たる t (0..1) を返す
  segment(ax, ay, az, bx, by, bz, pad = 0.2) {
    const minX = Math.min(ax, bx) - pad;
    const maxX = Math.max(ax, bx) + pad;
    const minZ = Math.min(az, bz) - pad;
    const maxZ = Math.max(az, bz) + pad;
    const arr = this.query(minX, minZ, maxX, maxZ, this._q4 || (this._q4 = []));
    let best = 1;
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    for (const c of arr) {
      if (c.kind === 'platform' || c.noCamera) continue;
      let t0 = 0;
      let t1 = best;
      const slab = (o, d, mn, mx) => {
        if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
        let ta = (mn - o) / d;
        let tb = (mx - o) / d;
        if (ta > tb) [ta, tb] = [tb, ta];
        if (ta > t0) t0 = ta;
        if (tb < t1) t1 = tb;
        return t0 <= t1;
      };
      if (!slab(ax, dx, c.minX - pad, c.maxX + pad)) continue;
      if (!slab(ay, dy, c.minY - pad, c.maxY + pad)) continue;
      if (!slab(az, dz, c.minZ - pad, c.maxZ + pad)) continue;
      if (t0 < best) best = Math.max(0, t0);
    }
    return best;
  }
}
