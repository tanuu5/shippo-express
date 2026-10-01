import { N, line } from './cityPlan.js';

// 道路網の経路探索（交差点をノードにした A*）
export class RoadGraph {
  constructor(plan) {
    this.plan = plan;
    this.nodes = plan.nodes;
  }

  nearestNode(x, z, filter) {
    let best = null;
    let bd = Infinity;
    for (const n of this.nodes) {
      if (!n.exists) continue;
      if (filter && !filter(n)) continue;
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    return best;
  }

  // 点が載っている区間の両端のうち、近いほう／遠いほうの候補（目的地の直前ノードを選ぶため）
  candidates(x, z) {
    const out = [];
    for (const n of this.nodes) {
      if (!n.exists) continue;
      const d = Math.hypot(n.x - x, n.z - z);
      if (d < 80) out.push({ n, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.slice(0, 4).map((o) => o.n);
  }

  path(from, to) {
    if (!from || !to) return [];
    if (from.id === to.id) return [from];
    const open = new Map();
    const came = new Map();
    const g = new Map();
    const h = (n) => Math.abs(n.x - to.x) + Math.abs(n.z - to.z);
    g.set(from.id, 0);
    open.set(from.id, h(from));
    while (open.size) {
      let cur = null;
      let cf = Infinity;
      for (const [id, f] of open) {
        if (f < cf) {
          cf = f;
          cur = id;
        }
      }
      if (cur === to.id) {
        const out = [to];
        let c = cur;
        while (came.has(c)) {
          c = came.get(c);
          out.unshift(this.nodes[c]);
        }
        return out;
      }
      open.delete(cur);
      const node = this.nodes[cur];
      for (const l of node.links) {
        const nb = this.nodes[l.to];
        const ng = g.get(cur) + Math.abs(nb.x - node.x) + Math.abs(nb.z - node.z);
        if (ng < (g.has(nb.id) ? g.get(nb.id) : Infinity)) {
          came.set(nb.id, cur);
          g.set(nb.id, ng);
          open.set(nb.id, ng + h(nb));
        }
      }
    }
    return [];
  }

  // 点に最も近い道路区間（中心線から 9.5m 以内）
  segmentNear(x, z) {
    let best = null;
    let bd = 9.5;
    for (const s of this.plan.segments) {
      const vx = s.x1 - s.x0;
      const vz = s.z1 - s.z0;
      const L2 = vx * vx + vz * vz;
      let t = ((x - s.x0) * vx + (z - s.z0) * vz) / L2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(x - (s.x0 + vx * t), z - (s.z0 + vz * t));
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  // プレイヤー位置 → 目的地の経路（点列）と道のりの長さ
  route(px, pz, dx, dz, via) {
    if (via && via.length) {
      // 経由点の列（防波堤など）の上にすでにいるなら、残りの経由点だけをたどる
      const onPath = Math.abs(px - via[0].x) < 4 && pz > via[0].z - 2;
      const pts = [];
      let len = 0;
      let prev = { x: px, z: pz };
      if (!onPath) {
        const first = this.route(px, pz, via[0].x, via[0].z);
        pts.push(...first.points);
        len = first.length;
        prev = via[0];
      }
      for (let i = onPath ? 0 : 1; i < via.length; i++) {
        if (onPath && via[i].z < pz + 1) continue;
        pts.push({ x: via[i].x, z: via[i].z });
        len += Math.hypot(via[i].x - prev.x, via[i].z - prev.z);
        prev = via[i];
      }
      pts.push({ x: dx, z: dz });
      len += Math.hypot(dx - prev.x, dz - prev.z);
      return { points: pts, length: len };
    }
    const direct = Math.hypot(dx - px, dz - pz);
    // 同じ通りの上にいるなら、そのまま通りに沿って進めばよい
    const sp = this.segmentNear(px, pz);
    const sd = this.segmentNear(dx, dz);
    if (sp && sp === sd) return { points: [{ x: dx, z: dz }], length: direct };
    // 出発・到着のノード候補：通りの上なら、その通りの両端（通りに沿った距離で）
    const ends = (seg, x, z) => {
      if (!seg) return this.candidates(x, z).map((n) => ({ n, cost: Math.hypot(n.x - x, n.z - z) }));
      const A = this.nodes[seg.a];
      const B = this.nodes[seg.b];
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      const t = Math.max(0, Math.min(1, ((x - A.x) * (B.x - A.x) + (z - A.z) * (B.z - A.z)) / (L * L)));
      return [
        { n: A, cost: t * L },
        { n: B, cost: (1 - t) * L },
      ];
    };
    const starts = ends(sp, px, pz);
    const goals = ends(sd, dx, dz);
    let best = null;
    let bestLen = Infinity;
    const pathLen = (p) => {
      let l = 0;
      for (let i = 1; i < p.length; i++) l += Math.abs(p[i].x - p[i - 1].x) + Math.abs(p[i].z - p[i - 1].z);
      return l;
    };
    for (const a of starts) {
      for (const b of goals) {
        const p = this.path(a.n, b.n);
        if (!p.length) continue;
        const len = a.cost + pathLen(p) + b.cost;
        if (len < bestLen) {
          bestLen = len;
          best = p;
        }
      }
    }
    if (!best) return { points: [{ x: dx, z: dz }], length: direct };
    const pts = best.map((n) => ({ x: n.x, z: n.z }));
    pts.push({ x: dx, z: dz });
    return { points: pts, length: Math.max(bestLen, direct) };
  }
}

export { N, line };
