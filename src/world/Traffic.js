import * as THREE from 'three';
import { box, cyl, merge, paint } from './props.js';
import { vcolMat } from './materials.js';
import { RH } from './cityPlan.js';
import { Rng } from '../core/rng.js';

// 車（左側通行）。交差点ごとに 1 台ずつ通す簡単な信号代わりの予約つき。
const LANE = 1.95;
const TYPES = {
  kei: { L: 3.4, W: 1.55, H: 1.7, speed: 9.5 },
  sedan: { L: 4.3, W: 1.76, H: 1.45, speed: 10.5 },
  van: { L: 4.6, W: 1.82, H: 1.98, speed: 9.5 },
  truck: { L: 5.6, W: 2.0, H: 2.65, speed: 8.5 },
  bus: { L: 9.0, W: 2.4, H: 2.95, speed: 7.8 },
};
const COLORS = ['#e05a4e', '#f2f0ea', '#4f7fb0', '#f2b33d', '#5b9b7e', '#e98fa6', '#8fc3d9', '#9b6fb0', '#3f4a5c', '#f0d6a8', '#c9d1d6'];

function carGeometry(type, color) {
  const T = TYPES[type];
  const { L, W, H } = T;
  const parts = [];
  const glass = '#3f5163';
  const dark = '#2f3134';
  const wheelR = type === 'bus' || type === 'truck' ? 0.45 : 0.32;
  // 車輪
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const wz = sz * (L / 2 - (type === 'bus' ? 1.6 : L * 0.2));
      const g = new THREE.CylinderGeometry(wheelR, wheelR, 0.26, 14);
      g.rotateZ(Math.PI / 2);
      g.translate(sx * (W / 2 - 0.1), wheelR, wz);
      parts.push(paint(g, dark));
      const hub = new THREE.CylinderGeometry(wheelR * 0.45, wheelR * 0.45, 0.28, 10);
      hub.rotateZ(Math.PI / 2);
      hub.translate(sx * (W / 2 - 0.09), wheelR, wz);
      parts.push(paint(hub, '#c9cdd1'));
    }
  }
  const base = wheelR * 0.9;
  if (type === 'bus') {
    parts.push(box(W, H - base - 0.05, L, 0, base, 0, '#f4ecd8'));
    parts.push(box(W + 0.02, 0.7, L + 0.02, 0, base, 0, color));
    parts.push(box(W + 0.03, 0.9, L - 1.6, 0, base + 1.1, -0.3, glass));
    parts.push(box(W - 0.3, 1.0, 0.04, 0, base + 1.0, L / 2 + 0.01, glass));
    parts.push(box(W + 0.02, 0.18, L + 0.02, 0, H - 0.2, 0, color));
    parts.push(box(1.2, 0.3, 0.05, 0, H - 0.55, L / 2 + 0.02, '#2a2a2a'));
  } else if (type === 'truck') {
    // キャブ
    parts.push(box(W, 1.35, 1.7, 0, base, L / 2 - 0.85, color));
    parts.push(box(W - 0.1, 0.62, 1.4, 0, base + 1.35, L / 2 - 0.9, color));
    parts.push(box(W - 0.2, 0.5, 0.04, 0, base + 1.4, L / 2 - 0.18, glass));
    for (const sx of [-1, 1]) parts.push(box(0.04, 0.45, 0.9, sx * (W / 2 - 0.03), base + 1.4, L / 2 - 0.85, glass));
    // 荷台（しっぽ便の箱）
    parts.push(box(W + 0.06, H - base - 0.15, L - 1.9, 0, base + 0.15, -0.95, '#f7f3ec'));
    parts.push(box(W + 0.08, 0.3, L - 1.88, 0, base + 0.55, -0.95, '#a38681'));
  } else {
    const lowH = type === 'van' ? 0.7 : 0.62;
    parts.push(box(W, lowH, L, 0, base, 0, color));
    // 丸みを出す段
    parts.push(box(W - 0.08, 0.08, L - 0.1, 0, base + lowH, 0, color));
    const cabL = type === 'van' ? L * 0.78 : type === 'kei' ? L * 0.66 : L * 0.52;
    const cabZ = type === 'van' ? -L * 0.08 : type === 'kei' ? -L * 0.06 : -L * 0.06;
    const cabH = H - base - lowH - 0.08;
    parts.push(box(W - 0.14, cabH, cabL, 0, base + lowH + 0.08, cabZ, color));
    // 窓
    parts.push(box(W - 0.1, cabH * 0.72, cabL - 0.3, 0, base + lowH + 0.12, cabZ, glass));
    parts.push(box(W - 0.3, cabH * 0.7, 0.04, 0, base + lowH + 0.12, cabZ + cabL / 2 + 0.005, glass));
    parts.push(box(W - 0.3, cabH * 0.6, 0.04, 0, base + lowH + 0.16, cabZ - cabL / 2 - 0.005, glass));
    parts.push(box(W - 0.12, 0.06, cabL - 0.02, 0, H - 0.06, cabZ, color));
  }
  // ライト・バンパー
  for (const sx of [-1, 1]) {
    parts.push(box(0.28, 0.14, 0.05, sx * (W / 2 - 0.26), base + 0.35, L / 2 + 0.01, '#fff6d8'));
    parts.push(box(0.26, 0.12, 0.05, sx * (W / 2 - 0.24), base + 0.38, -L / 2 - 0.01, '#e0443a'));
  }
  parts.push(box(W + 0.04, 0.16, 0.12, 0, base - 0.05, L / 2, '#9aa0a6'));
  parts.push(box(W + 0.04, 0.16, 0.12, 0, base - 0.05, -L / 2, '#9aa0a6'));
  return merge(parts);
}

export class Traffic {
  constructor(city, scene, count = 30) {
    this.city = city;
    this.plan = city.plan;
    this.scene = scene;
    this.rng = new Rng(555);
    this.cars = [];
    this.nodeBusy = new Map();
    this.time = 0;
    this.mat = vcolMat({ roughness: 0.45, envMapIntensity: 0.9 });
    const segs = this.plan.segments.filter((s) => s.cars);
    const used = new Set();
    for (let i = 0; i < count; i++) {
      let s;
      for (let k = 0; k < 20; k++) {
        s = segs[Math.floor(this.rng.next() * segs.length)];
        if (!used.has(s.id)) break;
      }
      used.add(s.id);
      const r = this.rng.next();
      const type = r < 0.32 ? 'kei' : r < 0.62 ? 'sedan' : r < 0.8 ? 'van' : r < 0.92 ? 'truck' : 'bus';
      const color = type === 'bus' ? '#5b9b7e' : type === 'truck' ? '#f4efe6' : this.rng.pick(COLORS);
      const mesh = new THREE.Mesh(carGeometry(type, color), this.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'car';
      scene.add(mesh);
      const forward = this.rng.chance(0.5);
      const car = { id: i, type, T: TYPES[type], mesh, speed: 0, want: TYPES[type].speed, pts: [], acc: [], s: 0, x: 0, z: 0, yaw: 0, from: forward ? s.a : s.b, to: forward ? s.b : s.a, seg: s, hold: null, honkT: 0, nearT: 0, wait: 0 };
      this.buildLeg(car, null);
      car.s = this.rng.float(0, car.len * 0.6);
      this.cars.push(car);
    }
  }

  laneEnd(fromNode, toNode, atStart) {
    // from→to の車線上で、交差点の縁の点
    const A = this.plan.nodes[fromNode];
    const B = this.plan.nodes[toNode];
    const dx = Math.sign(B.x - A.x);
    const dz = Math.sign(B.z - A.z);
    const lx = dz * LANE;
    const lz = -dx * LANE;
    if (atStart) return { x: A.x + dx * (RH + 0.5) + lx, z: A.z + dz * (RH + 0.5) + lz, dx, dz };
    return { x: B.x - dx * (RH + 0.5) + lx, z: B.z - dz * (RH + 0.5) + lz, dx, dz };
  }

  // 1 区間ぶんの経路：（前の区間からの曲がり）＋ 直線
  buildLeg(car, prevFrom) {
    const pts = [];
    const start = this.laneEnd(car.from, car.to, true);
    const end = this.laneEnd(car.from, car.to, false);
    if (prevFrom !== null) {
      const inEnd = this.laneEnd(prevFrom, car.from, false);
      // 2 次ベジェで交差点を曲がる
      const cx = Math.abs(inEnd.dx) > 0 ? start.x : inEnd.x;
      const cz = Math.abs(inEnd.dx) > 0 ? inEnd.z : start.z;
      const straight = inEnd.dx === start.dx && inEnd.dz === start.dz;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        if (straight) pts.push({ x: inEnd.x + (start.x - inEnd.x) * t, z: inEnd.z + (start.z - inEnd.z) * t });
        else {
          const u = 1 - t;
          pts.push({ x: u * u * inEnd.x + 2 * u * t * cx + t * t * start.x, z: u * u * inEnd.z + 2 * u * t * cz + t * t * start.z });
        }
      }
      car.turnLen = 0;
    } else pts.push({ x: start.x, z: start.z });
    const turnCount = pts.length;
    pts.push({ x: end.x, z: end.z });
    car.pts = pts;
    car.acc = [0];
    for (let i = 1; i < pts.length; i++) car.acc.push(car.acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    car.len = car.acc[car.acc.length - 1];
    car.turnEnd = car.acc[Math.max(0, turnCount - 1)];
    car.s = 0;
    car.laneKey = car.from + '>' + car.to;
  }

  nextSegment(car) {
    const node = this.plan.nodes[car.to];
    const opts = node.links.filter((l) => l.to !== car.from && this.plan.segments[l.seg].cars);
    const pick = opts.length ? opts[Math.floor(this.rng.next() * opts.length)] : node.links[0];
    const prevFrom = car.from;
    car.from = car.to;
    car.to = pick.to;
    car.seg = this.plan.segments[pick.seg];
    this.buildLeg(car, prevFrom);
  }

  sample(car, s, out) {
    const acc = car.acc;
    let i = 1;
    while (i < acc.length - 1 && acc[i] < s) i++;
    const a = car.pts[i - 1];
    const b = car.pts[i];
    const t = Math.min(1, Math.max(0, (s - acc[i - 1]) / Math.max(1e-6, acc[i] - acc[i - 1])));
    out.x = a.x + (b.x - a.x) * t;
    out.z = a.z + (b.z - a.z) * t;
    out.yaw = Math.atan2(b.x - a.x, b.z - a.z);
    return out;
  }

  // 車の屋根（プレイヤーが上から乗る）
  roofAt(x, z, feetY) {
    for (const c of this.cars) {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz > 40) continue;
      const s = Math.sin(c.yaw);
      const co = Math.cos(c.yaw);
      const f = dx * s + dz * co;
      const r = dx * co - dz * s;
      if (Math.abs(f) < c.T.L / 2 - 0.05 && Math.abs(r) < c.T.W / 2 + 0.05 && feetY >= c.T.H - 0.45) return { y: c.T.H, car: c };
    }
    return null;
  }

  update(dt, player, game) {
    this.time += dt;
    const p = player.pos;
    const tmp = { x: 0, z: 0, yaw: 0 };
    // 車線ごとの前後関係
    const lanes = new Map();
    for (const c of this.cars) {
      let arr = lanes.get(c.laneKey);
      if (!arr) lanes.set(c.laneKey, (arr = []));
      arr.push(c);
    }
    for (const arr of lanes.values()) arr.sort((a, b) => a.s - b.s);
    for (const c of this.cars) {
      let target = c.want;
      // 前の車
      const arr = lanes.get(c.laneKey);
      const idx = arr.indexOf(c);
      const ahead = arr[idx + 1];
      if (ahead) {
        const gap = ahead.s - c.s - (ahead.T.L + c.T.L) / 2;
        if (gap < 9) target = Math.min(target, Math.max(0, (gap - 2.5) * 1.3));
      } else {
        // 次の区間の最後尾も見る（交差点のすぐ先で詰まっている場合）
        const remain = c.len - c.s;
        if (remain < 12) {
          const node = c.to;
          for (const o of this.cars) {
            if (o === c || o.from !== node) continue;
            if (o.s < o.turnEnd + o.T.L && Math.hypot(o.x - c.x, o.z - c.z) < 14 && o.speed < 2) target = Math.min(target, Math.max(0, remain - 3));
          }
        }
      }
      // 交差点の予約（停止線の手前で）
      const remain = c.len - c.s;
      if (remain < 3.5 && !c.hold) {
        const busy = this.nodeBusy.get(c.to);
        if (busy && busy.car !== c && this.time - busy.t < 2.6) target = Math.min(target, Math.max(0, (remain - 0.8) * 2));
        else {
          this.nodeBusy.set(c.to, { car: c, t: this.time });
          c.hold = c.to;
        }
      }
      // 曲がるときは減速
      if (c.s < c.turnEnd) target = Math.min(target, 5.5);
      // プレイヤーが前にいたらブレーキ
      const s = Math.sin(c.yaw);
      const co = Math.cos(c.yaw);
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const f = dx * s + dz * co;
      const r = dx * co - dz * s;
      if (f > 0 && f < c.T.L / 2 + 7 && Math.abs(r) < c.T.W / 2 + 0.9 && p.y < c.T.H + 0.5 && player.mode !== 'hit') {
        target = Math.min(target, Math.max(0, (f - c.T.L / 2 - 2) * 1.2));
        if (c.honkT <= 0 && c.speed > 3) {
          c.honkT = 2.5;
          game.sfx('honk', { x: c.x, z: c.z });
        }
      }
      c.honkT -= dt;
      c.nearT -= dt;
      const accel = target > c.speed ? 4 : 9;
      c.speed += Math.max(-accel * dt, Math.min(accel * dt, target - c.speed));
      c.s += c.speed * dt;
      if (c.s >= c.len) {
        if (c.hold !== null) {
          const b = this.nodeBusy.get(c.hold);
          if (b && b.car === c) b.t = this.time; // 曲がり終わるまで保持
        }
        this.nextSegment(c);
      }
      if (c.hold !== null && c.s > c.turnEnd + 0.5 && c.from === c.hold) {
        const b = this.nodeBusy.get(c.hold);
        if (b && b.car === c) this.nodeBusy.delete(c.hold);
        c.hold = null;
      }
      this.sample(c, c.s, tmp);
      c.x = tmp.x;
      c.z = tmp.z;
      c.yaw += Math.atan2(Math.sin(tmp.yaw - c.yaw), Math.cos(tmp.yaw - c.yaw)) * Math.min(1, dt * 10);
      c.mesh.position.set(c.x, 0, c.z);
      c.mesh.rotation.y = c.yaw;

      // プレイヤーとの接触
      if (player.mode === 'hit') continue;
      const hl = c.T.L / 2 + 0.3;
      const hw = c.T.W / 2 + 0.3;
      if (Math.abs(f) < hl && Math.abs(r) < hw && p.y < c.T.H - 0.4) {
        // 押し出す
        const pushR = (hw - Math.abs(r)) * Math.sign(r || 1);
        const pushF = (hl - Math.abs(f)) * Math.sign(f || 1);
        if (Math.abs(pushR) < Math.abs(pushF)) {
          p.x += co * pushR;
          p.z += -s * pushR;
        } else {
          p.x += s * pushF;
          p.z += co * pushF;
        }
        if (c.speed > 3.5) {
          const kx = s * c.speed * 0.6 + co * Math.sign(r || 1) * 4;
          const kz = co * c.speed * 0.6 - s * Math.sign(r || 1) * 4;
          player.hit(kx, kz, Math.min(1.3, 0.7 + c.speed / 14));
          game.onCarHit(c);
          c.speed *= 0.3;
        }
      } else if (Math.abs(f) < hl + 1.3 && Math.abs(r) < hw + 1.2 && c.speed > 5 && Math.hypot(player.vel.x, player.vel.z) > 5 && c.nearT <= 0 && p.y < c.T.H + 1.2) {
        c.nearT = 3;
        game.onNearMiss(c);
      }
    }
  }
}
