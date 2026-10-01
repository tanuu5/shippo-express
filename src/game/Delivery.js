import * as THREE from 'three';
import { Rng } from '../core/rng.js';
import { Marker } from './Markers.js';
import { makeTownsfolk, TownsfolkMesh } from '../world/Townsfolk.js';
import { box, merge } from '../world/props.js';
import { vcolMat } from '../world/materials.js';

// 配達の仕組み：お客さん（距離で色分け）→ 受け取り → 目的地へ → 評価・料金・チップ・時間ボーナス
export const CLS = {
  near: { color: '#ff6b6b', min: 55, max: 125, bonus: 8, label: 'ちかい' },
  mid: { color: '#ffc93c', min: 125, max: 225, bonus: 11, label: 'ふつう' },
  far: { color: '#5fd07a', min: 225, max: 460, bonus: 15, label: 'とおい' },
};

const TRICKS = {
  bigJump: ['ビッグジャンプ', 30],
  doubleJump: ['くるりん', 20],
  glide: ['ポンチョ滑空', 0],
  wallKick: ['カベキック', 45],
  awning: ['ぽよん', 40],
  pad: ['ばねジャンプ', 30],
  car: ['くるまジャンプ', 80],
  nearMiss: ['ニアミス', 60],
  roof: ['屋根づたい', 50],
  slide: ['スライディング', 20],
  bigDrop: ['スーパー着地', 40],
  splash: ['水しぶき', 10],
};

export class Delivery {
  constructor(game) {
    this.game = game;
    this.city = game.city;
    this.scene = game.stage.scene;
    this.rng = new Rng((Date.now() % 100000) + 17);
    this.customers = [];
    this.maxCustomers = 7;
    this.job = null;
    this.spawnT = 0;
    this.routeT = 0;
    this.route = { points: [], length: 0 };
    this.combo = 0;
    this.comboT = 0;
    this.glideAcc = 0;
    this.nearMissCool = new Map();
    this.destMarker = new Marker('#ff5d8f', { radius: 3.2, height: 60, beamWidth: 2.2 });
    this.destMarker.group.visible = false;
    this.scene.add(this.destMarker.group);
    this.recipient = null;
    this.pkgGeo = merge([box(0.46, 0.36, 0.36, 0, -0.18, 0, '#c9a476'), box(0.47, 0.37, 0.08, 0, -0.185, 0, '#e9dcc4'), box(0.08, 0.37, 0.37, 0, -0.185, 0, '#e9dcc4')]);
    this.pkgMat = vcolMat();
    this.folkMat = vcolMat();
    this.reset();
  }

  reset() {
    for (const c of this.customers) this.removeCustomer(c);
    this.customers = [];
    this.job = null;
    this.money = 0;
    this.deliveries = 0;
    this.bestCombo = 0;
    this.totalTips = 0;
    this.fails = 0;
    this.combo = 0;
    this.comboT = 0;
    this.speedyCount = 0;
    this.glideAcc = 0;
    this.lastBounce = null;
    this.lastGuide = null;
    this.freeRoute = null;
    this.freeRouteFor = null;
    this.destMarker.group.visible = false;
    this.game.model.setCarrying(false);
    this.removeFolk(this.recipient);
    this.recipient = null;
    if (this.leavingRecipient) this.removeFolk(this.leavingRecipient.r);
    this.leavingRecipient = null;
    this.lastDestIds = [];
  }

  // ---- お客さん
  spawnCustomer(force) {
    const p = this.game.player.pos;
    const rng = this.rng;
    const spots = this.city.spots;
    for (let tries = 0; tries < 40; tries++) {
      const s = spots[Math.floor(rng.next() * spots.length)];
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      const minD = force ? 12 : 26;
      const maxD = force ? 48 : 170;
      if (d < minD || d > maxD) continue;
      if (this.customers.some((c) => Math.hypot(c.x - s.x, c.z - s.z) < 18)) continue;
      const r = rng.next();
      const order = r < 0.34 ? ['near', 'mid', 'far'] : r < 0.74 ? ['mid', 'far', 'near'] : ['far', 'mid', 'near'];
      for (const cls of order) {
        const C = CLS[cls];
        const cands = this.city.destinations.filter((dd) => {
          const dist = Math.hypot(dd.x - s.x, dd.z - s.z) * 1.15;
          return dist >= C.min && dist <= C.max && !this.lastDestIds.includes(dd.id);
        });
        if (!cands.length) continue;
        const dest = cands[Math.floor(rng.next() * cands.length)];
        this.addCustomer(s, dest, cls);
        return true;
      }
    }
    return false;
  }

  addCustomer(spot, dest, cls) {
    const parts = makeTownsfolk(this.rng);
    const mesh = new TownsfolkMesh(parts, this.folkMat);
    // 道路のほうを向く（一番近い敷地の辺の外側）
    const face = this.faceRoad(spot.x, spot.z);
    mesh.root.position.set(spot.x, 0.15, spot.z);
    mesh.root.rotation.y = face;
    this.scene.add(mesh.root);
    const marker = new Marker(CLS[cls].color, { radius: 1.9, height: 22, beamWidth: 0.9 });
    marker.group.position.set(spot.x, 0.15, spot.z);
    this.scene.add(marker.group);
    const pkg = new THREE.Mesh(this.pkgGeo, this.pkgMat);
    pkg.position.set(spot.x, 2.35, spot.z);
    pkg.castShadow = true;
    this.scene.add(pkg);
    // 近づくと行き先の吹き出しが出る
    const label = this.makeLabel(dest, cls);
    label.position.set(spot.x, 3.05, spot.z);
    this.scene.add(label);
    this.customers.push({ x: spot.x, z: spot.z, dest, cls, mesh, marker, pkg, label, t: this.rng.float(0, 5), leaving: 0 });
  }

  makeLabel(dest, cls) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 128;
    const g = cv.getContext('2d');
    const col = CLS[cls].color;
    g.fillStyle = 'rgba(251,244,236,0.95)';
    g.strokeStyle = '#7f6866';
    g.lineWidth = 8;
    const r = 40;
    g.beginPath();
    g.moveTo(r + 4, 4);
    g.arcTo(508, 4, 508, 104, r);
    g.arcTo(508, 104, 4, 104, r);
    g.arcTo(4, 104, 4, 4, r);
    g.arcTo(4, 4, 508, 4, r);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = col;
    g.beginPath();
    g.arc(52, 54, 24, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#5b4744';
    g.textBaseline = 'middle';
    let size = 44;
    const text = `${dest.icon} ${dest.name}`;
    g.font = `800 ${size}px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif`;
    while (g.measureText(text).width > 410 && size > 22) {
      size -= 2;
      g.font = `800 ${size}px "M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif`;
    }
    g.fillText(text, 90, 56);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    sp.scale.set(2.6, 0.65, 1);
    sp.renderOrder = 6;
    sp.visible = false;
    return sp;
  }

  faceRoad(x, z) {
    let best = 0;
    let bd = Infinity;
    for (const g of this.city.plan.grounds) {
      if (x < g.x0 - 0.5 || x > g.x1 + 0.5 || z < g.z0 - 0.5 || z > g.z1 + 0.5) continue;
      const cands = [
        [z - g.z0, Math.PI],
        [g.z1 - z, 0],
        [x - g.x0, -Math.PI / 2],
        [g.x1 - x, Math.PI / 2],
      ];
      for (const [d, a] of cands) {
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
    }
    if (bd === Infinity) return Math.PI; // 海沿いは北（街）向き…ではなく海を背に
    return best;
  }

  removeCustomer(c) {
    this.scene.remove(c.mesh.root);
    this.scene.remove(c.marker.group);
    this.scene.remove(c.pkg);
    this.scene.remove(c.label);
    c.label.material.map.dispose();
    c.label.material.dispose();
    c.marker.dispose();
    c.mesh.dispose();
  }

  removeFolk(r) {
    if (!r) return;
    this.scene.remove(r.root);
    r.dispose();
  }

  // ---- 仕事
  startJob(c) {
    const p = this.game.player.pos;
    const route = this.game.graph.route(p.x, p.z, c.dest.x, c.dest.z, c.dest.via);
    const len = route.length;
    const timeLimit = Math.round(9 + len / 7.3);
    this.job = {
      dest: c.dest,
      cls: c.cls,
      len,
      timeLimit,
      timeLeft: timeLimit,
      fare: Math.round((90 + len * 2.1) / 10) * 10,
      tips: 0,
      start: this.game.time,
    };
    this.lastDestIds.push(c.dest.id);
    if (this.lastDestIds.length > 4) this.lastDestIds.shift();
    this.route = route;
    this.destMarker.group.visible = true;
    this.destMarker.group.position.set(c.dest.x, this.groundY(c.dest.x, c.dest.z), c.dest.z);
    this.game.model.setCarrying(true);
    this.game.hud.setJob(this.job);
    this.game.hud.message(`<small>受け取り！</small>${c.dest.icon} ${c.dest.name}<small>まで ${timeLimit}秒以内に！</small>`, 'pickup', 1700);
    this.game.sfx('pickup');
    this.game.fx.burst(c.x, 1.4, c.z, CLS[c.cls].color, 18);
    // 受取人
    const parts = makeTownsfolk(this.rng);
    const r = new TownsfolkMesh(parts, this.folkMat);
    const face = this.faceRoad(c.dest.x, c.dest.z);
    const back = 1.2;
    r.root.position.set(c.dest.x - Math.sin(face) * back, this.groundY(c.dest.x, c.dest.z), c.dest.z - Math.cos(face) * back);
    r.root.rotation.y = face;
    this.scene.add(r.root);
    this.recipient = r;
    this.recipientT = 0;
  }

  groundY(x, z) {
    // 高いところから探すと日よけ（はねる板）や自販機の上を拾うので、歩道の高さから探す
    return this.city.col.groundAt(x, z, 0.3, 0.15, 0.5);
  }

  finishJob() {
    const job = this.job;
    const r = job.timeLeft / job.timeLimit;
    let rating;
    let mult;
    let extra;
    if (r >= 0.5) {
      rating = 'すごくはやい！';
      mult = 1.5;
      extra = 5;
      this.speedyCount++;
    } else if (r >= 0.25) {
      rating = 'はやい！';
      mult = 1.2;
      extra = 3;
    } else {
      rating = 'まにあった！';
      mult = 1.0;
      extra = 0;
    }
    const fare = Math.round((job.fare * mult) / 10) * 10;
    const total = fare + job.tips;
    this.money += total;
    this.totalTips += job.tips;
    this.deliveries++;
    const add = CLS[job.cls].bonus + extra;
    this.game.onDelivered({ total, fare, tips: job.tips, rating, timeBonus: add });
    this.game.hud.message(`<span class="big">お届け完了！</span><span class="rate">${rating}</span><small>料金 ¥${fare.toLocaleString()}${job.tips ? ` ＋ チップ ¥${job.tips.toLocaleString()}` : ''}</small>`, 'deliver', 2000);
    this.game.fx.confetti(this.game.player.pos.x, this.game.player.pos.y + 1.2, this.game.player.pos.z);
    this.endJob();
    // 次のお客さんをすぐ近くに 1 人
    if (!this.customers.some((c) => !c.leaving && Math.hypot(c.x - this.game.player.pos.x, c.z - this.game.player.pos.z) < 45)) this.spawnCustomer(true);
  }

  failJob() {
    this.fails++;
    this.combo = 0;
    this.game.hud.message('<span class="big">時間切れ…</span><small>荷物は営業所に戻ります</small>', 'fail', 1800);
    this.game.sfx('fail');
    this.game.anim.flashFace('surprised', 1.2);
    this.endJob();
  }

  endJob() {
    this.job = null;
    this.route = { points: [], length: 0 };
    this.destMarker.group.visible = false;
    this.game.model.setCarrying(false);
    this.game.hud.setJob(null);
    if (this.recipient) {
      if (this.leavingRecipient) this.removeFolk(this.leavingRecipient.r);
      this.leavingRecipient = { r: this.recipient, t: 2.5 };
      this.recipient = null;
    }
  }

  // ---- トリック（チップ）
  trick(key, extraTip = 0, label, needSpeed = false) {
    const [name, tip0] = TRICKS[key];
    const t = this.game.time;
    // 走りながらの技だけチップになる（その場ジャンプの連打では稼げない）
    const v = this.game.player.vel;
    if (needSpeed && Math.hypot(v.x, v.z) < 4) {
      this.game.hud.trick(label || name, 0, 0);
      return;
    }
    if (this.comboT > 0) this.combo++;
    else this.combo = 1;
    this.comboT = 2.4;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    let tip = 0;
    if (this.job) {
      tip = Math.round(((tip0 + extraTip) * (1 + 0.25 * Math.min(this.combo - 1, 8))) / 5) * 5;
      this.job.tips += tip;
    }
    this.game.hud.trick(label || name, tip, this.combo);
    void t;
  }

  breakCombo() {
    this.combo = 0;
    this.comboT = 0;
  }

  // プレイヤーのイベント → トリック判定
  onPlayerEvent(e) {
    switch (e.type) {
      case 'doublejump':
        this.trick('doubleJump', 0, undefined, true);
        break;
      case 'wallkick':
        this.trick('wallKick');
        break;
      case 'slide':
        this.trick('slide');
        break;
      case 'bounce': {
        // 同じ日よけ・同じ車で跳ね続けてチップを稼ぎ続けないよう、同じ相手は 3 秒あける（別の相手へ渡り跳ぶのは OK）
        const now = this.game.time;
        if (this.lastBounce && this.lastBounce.src === e.src && now - this.lastBounce.t < 3) {
          this.lastBounce.t = now;
          break;
        }
        this.lastBounce = { src: e.src, t: now };
        if (e.kind === 'awning') this.trick('awning');
        else if (e.kind === 'pad') this.trick('pad');
        else if (e.kind === 'car') this.trick('car');
        break;
      }
      case 'land': {
        if (this.glideAcc > 0.6) {
          const sec = this.glideAcc;
          this.trick('glide', Math.round(sec * 12), `ポンチョ滑空 ${sec.toFixed(1)}秒`);
        }
        this.glideAcc = 0;
        // 屋根づたいは「別の建物へ」渡ったときだけ。ビッグジャンプは 2 段ジャンプなしの大ジャンプだけ
        if (e.onRoof && e.collider !== e.from && e.drop < 20) this.trick('roof', 0, undefined, true);
        else if (e.drop > 5.5) this.trick('bigDrop', Math.round(e.drop * 3), undefined, true);
        else if (e.airTime > 1.0 && !e.doubled) this.trick('bigJump', 0, undefined, true);
        break;
      }
      case 'hit':
        this.breakCombo();
        if (this.job) {
          const lost = Math.min(this.job.tips, 50);
          this.job.tips -= lost;
        }
        break;
      default:
        break;
    }
  }

  update(dt) {
    const game = this.game;
    const p = game.player.pos;
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }
    if (game.player.mode === 'glide') this.glideAcc += dt;

    // お客さんの補充・整理
    this.spawnT -= dt;
    if (this.spawnT <= 0 && game.playing) {
      this.spawnT = 0.35;
      for (let i = this.customers.length - 1; i >= 0; i--) {
        const c = this.customers[i];
        if (Math.hypot(c.x - p.x, c.z - p.z) > 240 && !c.leaving) {
          this.removeCustomer(c);
          this.customers.splice(i, 1);
        }
      }
      const want = this.job ? 4 : this.maxCustomers;
      if (this.customers.filter((c) => !c.leaving).length < want) this.spawnCustomer(this.customers.length < 2);
    }

    // お客さんの見た目と受け取り
    for (let i = this.customers.length - 1; i >= 0; i--) {
      const c = this.customers[i];
      c.t += dt;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (c.leaving) {
        c.label.visible = false;
        c.leaving -= dt;
        c.mesh.hop(c.t);
        c.marker.group.scale.setScalar(Math.max(0.01, c.leaving / 0.8));
        if (c.leaving <= 0) {
          this.removeCustomer(c);
          this.customers.splice(i, 1);
        }
        continue;
      }
      if (d < 30) c.mesh.wave(c.t);
      else c.mesh.idle(c.t);
      // 近づいたらこちらを向く
      if (d < 12) {
        const want = Math.atan2(p.x - c.x, p.z - c.z);
        c.mesh.root.rotation.y += Math.atan2(Math.sin(want - c.mesh.root.rotation.y), Math.cos(want - c.mesh.root.rotation.y)) * Math.min(1, dt * 6);
      }
      c.marker.update(dt, d < 6 ? 1 : 0);
      c.marker.group.visible = !this.job;
      c.pkg.visible = !this.job;
      c.label.visible = !this.job && d < 28;
      c.label.position.y = 3.05 + Math.sin(c.t * 2.5) * 0.05;
      c.pkg.position.y = 2.35 + Math.sin(c.t * 2.5) * 0.12;
      c.pkg.rotation.y = c.t * 1.5;
      if (!this.job && game.playing && d < 2.3 && Math.abs(p.y - 0.15) < 2.5 && game.player.mode !== 'hit') {
        this.startJob(c);
        c.leaving = 0.8;
      }
    }

    // 仕事中
    if (this.job) {
      const job = this.job;
      job.timeLeft -= dt;
      this.routeT -= dt;
      if (this.routeT <= 0) {
        this.routeT = 0.4;
        this.route = game.graph.route(p.x, p.z, job.dest.x, job.dest.z, job.dest.via);
      }
      const dd = Math.hypot(job.dest.x - p.x, job.dest.z - p.z);
      this.destMarker.update(dt, dd < 10 ? 1 : 0);
      game.hud.updateJob(job, dd);
      if (this.recipient) {
        this.recipientT += dt;
        if (dd < 40) this.recipient.wave(this.recipientT);
        else this.recipient.idle(this.recipientT);
      }
      if (dd < 3.3 && Math.abs(p.y - this.destMarker.group.position.y) < 3.2 && game.player.mode !== 'hit') {
        this.finishJob();
      } else if (job.timeLeft <= 0) {
        this.failJob();
      }
    }
    if (this.leavingRecipient) {
      const L = this.leavingRecipient;
      L.t -= dt;
      L.r.hop(L.t * 1.3);
      if (L.t <= 0) {
        this.removeFolk(L.r);
        this.leavingRecipient = null;
      }
    }
  }

  // 案内矢印の向け先：目的地が見通せればそのまま、見えなければ道順の点のうち見通せるいちばん先
  guideTarget() {
    if (!this.job) return null;
    return this.guideAlong(this.job.dest, this.route.points);
  }

  // 荷物がないとき：いちばん近いお客さんへの道順（0.5 秒ごとに更新）
  guideToCustomer(dt) {
    const n = this.nearestCustomer();
    if (!n) return null;
    const p = this.game.player.pos;
    this.freeRouteT = (this.freeRouteT || 0) - dt;
    if (this.freeRouteT <= 0 || this.freeRouteFor !== n.c) {
      this.freeRouteT = 0.5;
      this.freeRouteFor = n.c;
      this.freeRoute = this.game.graph.route(p.x, p.z, n.c.x, n.c.z);
    }
    return { c: n.c, d: n.d, target: this.guideAlong(n.c, this.freeRoute ? this.freeRoute.points : []) };
  }

  guideAlong(dest, pts) {
    const p = this.game.player.pos;
    const col = this.city.col;
    // 生け垣など腰の高さの障害物もさえぎるよう、低めの高さで見通しを調べる
    const y = p.y + 0.6;
    const visible = (q) => col.segment(p.x, y, p.z, q.x, y, q.z, 0.2) >= 0.999;
    const now = this.game.time;
    const pick = (q) => {
      this.lastGuide = { q, t: now, dest };
      return q;
    };
    // 直前に選んだ点は、着くか 0.8 秒たつまで保つ（行ったり来たりを防ぐ）
    const L = this.lastGuide;
    if (L && L.dest === dest && now - L.t < 0.8 && Math.hypot(L.q.x - p.x, L.q.z - p.z) > 5) return L.q;
    if (Math.hypot(dest.x - p.x, dest.z - p.z) < 60 && visible(dest)) return pick(dest);
    if (!pts || !pts.length) return pick(dest);
    let best = null;
    let n = 0;
    for (const q of pts) {
      if (Math.hypot(q.x - p.x, q.z - p.z) < 6) continue;
      if (n++ >= 3) break;
      if (visible(q)) best = q;
      else break;
    }
    if (best) return pick(best);
    for (const q of pts) if (Math.hypot(q.x - p.x, q.z - p.z) > 6) return pick(q);
    return pick(dest);
  }

  nearestCustomer() {
    const p = this.game.player.pos;
    let best = null;
    let bd = Infinity;
    for (const c of this.customers) {
      if (c.leaving) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best ? { c: best, d: bd } : null;
  }
}
