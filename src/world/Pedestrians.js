import { Rng } from '../core/rng.js';
import { makeTownsfolk, TownsfolkMesh } from './Townsfolk.js';
import { vcolMat } from './materials.js';
import { CURB } from './cityPlan.js';

// 歩道を歩く住人：敷地のまわりを一周するように歩く。ぶつかると「わっ」とよける。
export class Pedestrians {
  constructor(city, scene, count = 36) {
    this.city = city;
    this.rng = new Rng(808);
    this.list = [];
    const mat = vcolMat();
    const lots = city.plan.grounds.filter((g) => g.type !== 'A');
    for (let i = 0; i < count; i++) {
      const lot = lots[Math.floor(this.rng.next() * lots.length)];
      const parts = makeTownsfolk(this.rng);
      const m = new TownsfolkMesh(parts, mat);
      scene.add(m.root);
      // 歩道の中央（縁石から 1.1m）を一周
      const inset = 1.1;
      const x0 = lot.x0 + inset;
      const x1 = lot.x1 - inset;
      const z0 = lot.z0 + inset;
      const z1 = lot.z1 - inset;
      const perim = 2 * (x1 - x0 + z1 - z0);
      this.list.push({ m, x0, x1, z0, z1, perim, s: this.rng.float(0, perim), dir: this.rng.chance(0.5) ? 1 : -1, speed: this.rng.float(1.0, 1.6), x: 0, z: 0, yaw: 0, dodge: 0, dodgeX: 0, dodgeZ: 0, pause: 0 });
    }
  }

  posAt(p, s) {
    const w = p.x1 - p.x0;
    const h = p.z1 - p.z0;
    s = ((s % p.perim) + p.perim) % p.perim;
    if (s < w) return [p.x0 + s, p.z0];
    s -= w;
    if (s < h) return [p.x1, p.z0 + s];
    s -= h;
    if (s < w) return [p.x1 - s, p.z1];
    s -= w;
    return [p.x0, p.z1 - s];
  }

  update(dt, player, game) {
    const pp = player.pos;
    for (const p of this.list) {
      const dxp = p.x - pp.x;
      const dzp = p.z - pp.z;
      const dp = Math.hypot(dxp, dzp);
      // 遠くのものは間引き
      if (dp > 110) {
        p.s += p.dir * p.speed * dt;
        const [x, z] = this.posAt(p, p.s);
        p.x = x;
        p.z = z;
        p.m.root.position.set(x, CURB, z);
        p.m.root.visible = false;
        continue;
      }
      p.m.root.visible = true;
      if (p.dodge > 0) {
        p.dodge -= dt;
        p.m.hop(p.dodge * 3);
        p.x += p.dodgeX * dt;
        p.z += p.dodgeZ * dt;
        p.m.root.position.set(p.x, CURB, p.z);
        if (p.dodge <= 0) {
          // 元の道に戻す
          p.s = this.closestS(p);
        }
        continue;
      }
      if (p.pause > 0) {
        p.pause -= dt;
        p.m.idle(game.time);
      } else {
        p.s += p.dir * p.speed * dt;
        if (this.rng.next() < dt * 0.02) p.pause = this.rng.float(1, 3);
        p.m.walk(dt, p.speed);
      }
      const [x, z] = this.posAt(p, p.s);
      const [x2, z2] = this.posAt(p, p.s + p.dir * 0.5);
      const yaw = Math.atan2(x2 - x, z2 - z);
      p.yaw += Math.atan2(Math.sin(yaw - p.yaw), Math.cos(yaw - p.yaw)) * Math.min(1, dt * 8);
      p.x = x;
      p.z = z;
      p.m.root.position.set(x, CURB, z);
      p.m.root.rotation.y = p.yaw;
      // プレイヤーが近い → よける
      const hs = Math.hypot(player.vel.x, player.vel.z);
      if (dp < 1.3 && Math.abs(pp.y - CURB) < 1.2 && player.mode !== 'hit') {
        const l = dp || 1;
        p.dodge = 0.45;
        p.dodgeX = (dxp / l) * 3;
        p.dodgeZ = (dzp / l) * 3;
        if (hs > 4) {
          player.vel.x *= 0.75;
          player.vel.z *= 0.75;
          game.onBumpPedestrian(p);
        }
      }
    }
  }

  closestS(p) {
    let best = 0;
    let bd = Infinity;
    for (let s = 0; s < p.perim; s += 1) {
      const [x, z] = this.posAt(p, s);
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }
}
