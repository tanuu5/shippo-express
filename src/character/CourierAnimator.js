import * as THREE from 'three';

// 手続き的アニメーション：ポーズ関数で各関節の角度を計算し、重みでクロスフェードする。
// 角度の向き（下に伸びる手足）：rotation.x が負で前へ振る。左腕(+X)は rotation.z が正で外へ開く。
// 膝は +x で曲がる（すねが後ろへ）、肘は -x で曲がる（前腕が前へ）。胴の +x は前傾。

const CH = [
  'pivotY', 'pivotRx', 'pivotRy', 'pivotRz',
  'hipsRx', 'hipsRy', 'hipsRz',
  'spineRx', 'spineRy', 'spineRz',
  'chestRx', 'chestRy', 'chestRz',
  'neckRx', 'headRx', 'headRy', 'headRz',
  'armLx', 'armLy', 'armLz', 'elbowLx', 'elbowLy', 'wristLx', 'wristLz',
  'armRx', 'armRy', 'armRz', 'elbowRx', 'elbowRy', 'wristRx', 'wristRz',
  'thighLx', 'thighLy', 'thighLz', 'kneeLx', 'ankleLx',
  'thighRx', 'thighRy', 'thighRz', 'kneeRx', 'ankleRx',
  'earL', 'earR', 'earSpread',
];

function zero() {
  const o = {};
  for (const c of CH) o[c] = 0;
  return o;
}

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;

export class CourierAnimator {
  constructor(model) {
    this.model = model;
    this.time = 0;
    this.phase = 0;
    this.weights = { ref: 0, idle: 1, run: 0, sprint: 0, air: 0, glide: 0, slide: 0, hit: 0, cheer: 0, wave: 0 };
    this.out = zero();
    this.tmp = zero();
    this.land = 0; // 着地のしゃがみ
    this.twirl = 0; // 2段ジャンプの回転（0..1 で一周）
    this.twirlActive = false;
    this.flip = 0;
    this.blinkT = 2 + Math.random() * 2;
    this.blinkOn = 0;
    this.faceOverride = null;
    this.faceTimer = 0;
    this.earTwitch = 0;
    this.earTwitchT = 3;
  }

  triggerLand(strength) {
    this.land = Math.max(this.land, clamp(strength, 0, 1));
  }

  triggerTwirl() {
    this.twirl = 0;
    this.twirlActive = true;
  }

  flashFace(name, sec) {
    this.faceOverride = name;
    this.faceTimer = sec;
  }

  // s: { mode, speed, runSpeed, vy, sprint, grounded, turn, carry, lookYaw }
  update(dt, s) {
    this.time += dt;
    const t = this.time;
    // --- 目標の重み
    const target = { ref: 0, idle: 0, run: 0, sprint: 0, air: 0, glide: 0, slide: 0, hit: 0, cheer: 0, wave: 0 };
    const k = clamp((s.speed || 0) / (s.runSpeed || 8), 0, 1.6);
    switch (s.mode) {
      case 'ref':
        target.ref = 1;
        break;
      case 'wave':
        target.wave = 1;
        break;
      case 'cheer':
        target.cheer = 1;
        break;
      case 'hit':
        target.hit = 1;
        break;
      case 'slide':
        target.slide = 1;
        break;
      case 'glide':
        target.glide = 1;
        break;
      case 'air':
        target.air = 1;
        break;
      default: {
        const moving = clamp(k * 3, 0, 1);
        target.idle = 1 - moving;
        if (s.sprint) target.sprint = moving;
        else target.run = moving;
      }
    }
    const rate = s.mode === 'hit' || s.mode === 'cheer' ? 16 : 12;
    const a = 1 - Math.exp(-rate * dt);
    let sum = 0;
    for (const key in this.weights) {
      this.weights[key] += (target[key] - this.weights[key]) * a;
      sum += this.weights[key];
    }
    // 走りの位相（歩幅で進める）
    const stride = s.sprint ? 2.25 : 1.75;
    this.phase = (this.phase + ((s.speed || 0) * dt * TAU) / (stride * 2)) % TAU;
    if (this.weights.idle > 0.9 && (s.speed || 0) < 0.3) {
      // 止まったら脚をそろえる方向へ位相を寄せる
      this.phase += (Math.round(this.phase / Math.PI) * Math.PI - this.phase) * Math.min(1, dt * 4);
    }

    const out = this.out;
    for (const c of CH) out[c] = 0;
    const add = (name, w, fn) => {
      if (w < 0.002) return;
      const p = this.tmp;
      for (const c of CH) p[c] = 0;
      fn(p);
      for (const c of CH) out[c] += p[c] * w;
    };
    const W = this.weights;
    const inv = 1 / Math.max(1e-4, sum);
    add('ref', W.ref * inv, (p) => this.poseRef(p));
    add('idle', W.idle * inv, (p) => this.poseIdle(p, t, s));
    add('run', W.run * inv, (p) => this.poseRun(p, this.phase, k, s, false));
    add('sprint', W.sprint * inv, (p) => this.poseRun(p, this.phase, k, s, true));
    add('air', W.air * inv, (p) => this.poseAir(p, s, t));
    add('glide', W.glide * inv, (p) => this.poseGlide(p, t, s));
    add('slide', W.slide * inv, (p) => this.poseSlide(p, t));
    add('hit', W.hit * inv, (p) => this.poseHit(p, t));
    add('cheer', W.cheer * inv, (p) => this.poseCheer(p, t));
    add('wave', W.wave * inv, (p) => this.poseWave(p, t));

    // --- 加算レイヤー
    // 着地のしゃがみ
    if (this.land > 0.001) {
      const l = this.land;
      out.pivotY -= 0.09 * l;
      out.thighLx -= 0.55 * l;
      out.thighRx -= 0.55 * l;
      out.kneeLx += 1.0 * l;
      out.kneeRx += 1.0 * l;
      out.ankleLx -= 0.45 * l;
      out.ankleRx -= 0.45 * l;
      out.spineRx += 0.25 * l;
      out.armLz += 0.3 * l;
      out.armRz -= 0.3 * l;
      this.land = Math.max(0, this.land - dt * 5);
    }
    // 2段ジャンプのくるりん
    if (this.twirlActive) {
      this.twirl += dt / 0.5;
      if (this.twirl >= 1) {
        this.twirl = 1;
        this.twirlActive = false;
      }
      const e = 1 - Math.pow(1 - this.twirl, 2.2);
      out.pivotRy += e * TAU;
      const open = Math.sin(this.twirl * Math.PI);
      out.armLz += 0.8 * open;
      out.armRz -= 0.8 * open;
      out.thighLx -= 0.5 * open;
      out.kneeLx += 0.9 * open;
      out.kneeRx += 0.6 * open;
    }
    // 旋回で体を内側へ傾ける
    if (s.turn) out.pivotRz += clamp(-s.turn * 0.08 * Math.min(1, k), -0.3, 0.3);
    // 視線
    if (s.lookYaw) out.headRy += clamp(s.lookYaw, -0.7, 0.7);

    // 耳のぴくぴく
    this.earTwitchT -= dt;
    if (this.earTwitchT < 0) {
      this.earTwitch = 1;
      this.earTwitchT = 2 + Math.random() * 4;
    }
    this.earTwitch = Math.max(0, this.earTwitch - dt * 6);
    out.earL += Math.sin(this.earTwitch * Math.PI) * 0.25;

    this.apply(out);
    this.updateFace(dt, s);
  }

  poseRef(p) {
    p.armLz = 0.84;
    p.armRz = -0.84;
    p.thighLz = 0.035;
    p.thighRz = -0.035;
    p.elbowLx = -0.04;
    p.elbowRx = -0.04;
  }

  poseIdle(p, t, s) {
    const br = Math.sin(t * 2.1);
    p.chestRx = 0.015 * br;
    p.pivotY = 0.004 * br;
    p.armLz = 0.34 + 0.02 * br;
    p.armRz = -0.34 - 0.02 * br;
    p.armLx = -0.05;
    p.armRx = -0.05;
    p.elbowLx = -0.25;
    p.elbowRx = -0.25;
    p.headRz = 0.07 * Math.sin(t * 0.6);
    p.headRx = 0.03 * Math.sin(t * 0.43);
    const sway = Math.sin(t * 0.8) * 0.02;
    p.hipsRz = sway;
    p.thighLz = 0.035 - sway;
    p.thighRz = -0.035 - sway;
    p.earSpread = 0.05 * Math.sin(t * 0.9);
    if (s.carry) {
      p.armLx = -0.25;
      p.armRx = -0.25;
      p.elbowLx = -0.9;
      p.elbowRx = -0.9;
    }
  }

  poseRun(p, ph, k, s, sprint) {
    const kk = Math.min(1.25, k);
    const A = (sprint ? 0.95 : 0.78) * Math.min(1, kk);
    const sn = Math.sin(ph);
    const cs = Math.cos(ph);
    p.thighLx = -sn * A - 0.12 * kk;
    p.thighRx = sn * A - 0.12 * kk;
    const knee = (c) => 0.2 + (sprint ? 1.45 : 1.25) * Math.pow(Math.max(0, c), 1.3) * Math.min(1, kk) + 0.15 * Math.max(0, -c);
    p.kneeLx = knee(cs);
    p.kneeRx = knee(-cs);
    p.ankleLx = 0.35 * Math.max(0, -cs) - 0.1;
    p.ankleRx = 0.35 * Math.max(0, cs) - 0.1;
    p.thighLz = 0.03;
    p.thighRz = -0.03;
    p.pivotY = -0.045 * Math.abs(cs) * kk + 0.02 * kk;
    p.spineRx = (sprint ? 0.32 : 0.16) * Math.min(1, kk);
    p.chestRy = sn * 0.14 * kk;
    p.hipsRy = -sn * 0.12 * kk;
    p.headRx = -(sprint ? 0.26 : 0.12) * Math.min(1, kk);
    p.headRy = -sn * 0.06 * kk;
    if (sprint) {
      // 忍者走り：腕を後ろへ流す（ポンチョの袖が翼のようになびく）
      p.armLx = 1.05 + 0.08 * sn;
      p.armRx = 1.05 - 0.08 * sn;
      p.armLz = 0.42;
      p.armRz = -0.42;
      p.elbowLx = -0.12;
      p.elbowRx = -0.12;
      p.earL = -0.5;
      p.earR = -0.5;
    } else {
      p.armLx = sn * 0.62 * kk;
      p.armRx = -sn * 0.62 * kk;
      p.armLz = 0.3;
      p.armRz = -0.3;
      p.elbowLx = -1.05;
      p.elbowRx = -1.05;
      p.earL = -0.22 * kk;
      p.earR = -0.22 * kk;
    }
    if (s.carry && !sprint) {
      p.armLx = -0.1 + sn * 0.25;
      p.armRx = -0.1 - sn * 0.25;
      p.elbowLx = -1.2;
      p.elbowRx = -1.2;
    }
  }

  poseAir(p, s, t) {
    const vy = s.vy || 0;
    const up = clamp(vy / 8, -1, 1);
    // 上昇中は脚をたたみ腕を上げ、落下中は脚を伸ばし腕を広げる
    const r = (up + 1) / 2;
    p.thighLx = -0.75 * r - 0.25;
    p.thighRx = -0.2 * r + 0.05;
    p.kneeLx = 1.1 * r + 0.35;
    p.kneeRx = 0.7 * r + 0.45;
    p.ankleLx = 0.2;
    p.ankleRx = 0.3;
    p.armLz = 0.9 + 0.35 * r;
    p.armRz = -0.9 - 0.35 * r;
    p.armLx = -0.35 * r + 0.2 * (1 - r);
    p.armRx = -0.2 * r + 0.25 * (1 - r);
    p.elbowLx = -0.45;
    p.elbowRx = -0.35;
    p.spineRx = 0.06 - 0.1 * r;
    p.headRx = -0.12 * r + 0.08 * (1 - r);
    p.earL = 0.15 * r - 0.3 * (1 - r);
    p.earR = 0.15 * r - 0.3 * (1 - r);
    p.pivotRx = 0.1 * (1 - r);
    void t;
  }

  poseGlide(p, t) {
    const f = Math.sin(t * 3.2);
    p.pivotRx = 0.42;
    p.armLz = 1.45 + 0.05 * f;
    p.armRz = -1.45 - 0.05 * f;
    p.armLx = 0.18;
    p.armRx = 0.18;
    p.elbowLx = -0.08;
    p.elbowRx = -0.08;
    p.wristLz = 0.2;
    p.wristRz = -0.2;
    p.thighLx = 0.18;
    p.thighRx = 0.28;
    p.kneeLx = 0.55;
    p.kneeRx = 0.8;
    p.ankleLx = 0.3;
    p.ankleRx = 0.3;
    p.spineRx = -0.12;
    p.headRx = -0.42;
    p.earL = -0.55;
    p.earR = -0.55;
    p.chestRz = 0.04 * f;
  }

  poseSlide(p, t) {
    p.pivotY = -0.36;
    p.pivotRx = -0.62;
    p.thighLx = -1.25;
    p.kneeLx = 0.12;
    p.thighRx = -0.55;
    p.kneeRx = 1.55;
    p.thighRz = -0.12;
    p.armLz = 0.95;
    p.armRz = -0.95;
    p.armLx = -0.45;
    p.armRx = 0.2;
    p.elbowLx = -0.3;
    p.elbowRx = -0.5;
    p.spineRx = 0.35;
    p.headRx = 0.25;
    p.earL = -0.4;
    p.earR = -0.4;
    p.pivotRz = 0.06 * Math.sin(t * 30);
  }

  poseHit(p, t) {
    const w = Math.sin(t * 18);
    p.pivotRx = -0.35;
    p.spineRx = -0.25;
    p.armLz = 1.6 + 0.3 * w;
    p.armRz = -1.6 + 0.3 * w;
    p.armLx = -0.6;
    p.armRx = -0.5;
    p.elbowLx = -0.6;
    p.elbowRx = -0.6;
    p.thighLx = -0.7;
    p.thighRx = -0.2;
    p.kneeLx = 0.8;
    p.kneeRx = 0.5;
    p.headRz = 0.25 * Math.sin(t * 7);
    p.earL = -0.8;
    p.earR = -0.8;
    p.earSpread = 0.3;
  }

  poseCheer(p, t) {
    const b = Math.abs(Math.sin(t * 7));
    p.pivotY = 0.06 * b;
    p.armLz = 2.55;
    p.armRz = -2.55;
    p.armLx = -0.25 + 0.15 * Math.sin(t * 14);
    p.armRx = -0.25 - 0.15 * Math.sin(t * 14);
    p.elbowLx = -0.3;
    p.elbowRx = -0.3;
    p.thighLx = -0.25 * b;
    p.kneeLx = 0.5 * b;
    p.thighRx = 0.1;
    p.kneeRx = 0.3 * b;
    p.spineRx = -0.12;
    p.headRx = -0.18;
    p.earL = 0.25;
    p.earR = 0.25;
  }

  poseWave(p, t) {
    const w = Math.sin(t * 7);
    p.armRz = -2.45;
    p.armRx = -0.35;
    p.elbowRx = -0.55;
    p.elbowRy = 0.3 * w;
    p.wristRz = 0.35 * w;
    p.armLz = 0.32;
    p.armLx = -0.1;
    p.elbowLx = -0.3;
    p.headRz = -0.12;
    p.headRy = 0.1;
    p.hipsRz = 0.03;
    p.thighLz = 0.01;
    p.thighRz = -0.06;
    p.chestRz = -0.04;
    p.earR = 0.15;
    p.earL = 0.05;
  }

  apply(o) {
    const j = this.model.j;
    j.pivot.position.y = 0.72 + o.pivotY;
    j.pivot.rotation.set(o.pivotRx, o.pivotRy, o.pivotRz, 'YXZ');
    j.hips.rotation.set(o.hipsRx, o.hipsRy, o.hipsRz);
    j.spine.rotation.set(o.spineRx, o.spineRy, o.spineRz);
    j.chest.rotation.set(o.chestRx, o.chestRy, o.chestRz);
    j.neck.rotation.set(o.neckRx, 0, 0);
    // 前傾ぶんだけ頭を起こして前を見る
    j.head.rotation.set(o.headRx - (o.spineRx + o.chestRx) * 0.55, o.headRy, o.headRz);
    j.armL.rotation.set(o.armLx, o.armLy, o.armLz);
    j.armR.rotation.set(o.armRx, o.armRy, o.armRz);
    j.elbowL.rotation.set(o.elbowLx, o.elbowLy, 0);
    j.elbowR.rotation.set(o.elbowRx, o.elbowRy, 0);
    j.wristL.rotation.set(o.wristLx, 0, o.wristLz);
    j.wristR.rotation.set(o.wristRx, 0, o.wristRz);
    j.thighL.rotation.set(o.thighLx, o.thighLy, o.thighLz);
    j.thighR.rotation.set(o.thighRx, o.thighRy, o.thighRz);
    j.kneeL.rotation.set(o.kneeLx, 0, 0);
    j.kneeR.rotation.set(o.kneeRx, 0, 0);
    j.ankleL.rotation.set(o.ankleLx, 0, 0);
    j.ankleR.rotation.set(o.ankleRx, 0, 0);
    for (const e of this.model.ears) {
      const v = e.side > 0 ? o.earL : o.earR;
      e.pivot.rotation.x = e.base.x + v;
      e.pivot.rotation.z = e.base.z - e.side * o.earSpread;
    }
  }

  updateFace(dt, s) {
    const m = this.model;
    if (this.faceTimer > 0) {
      this.faceTimer -= dt;
      m.setExpression(this.faceOverride);
      return;
    }
    let base = 'smug';
    if (s.mode === 'hit') base = 'dizzy';
    else if (s.mode === 'cheer') base = 'happy';
    else if (s.mode === 'wave') base = 'open';
    else if (s.mode === 'glide') base = 'open';
    else if (s.sprint && (s.speed || 0) > 1) base = 'determined';
    else if (s.mode === 'air' && (s.vy || 0) < -9) base = 'surprised';
    // まばたき
    this.blinkT -= dt;
    if (this.blinkT < 0) {
      this.blinkOn = 0.13;
      this.blinkT = 2.2 + Math.random() * 3;
    }
    if (this.blinkOn > 0) {
      this.blinkOn -= dt;
      if (base === 'smug' || base === 'determined' || base === 'open') base = 'blink';
    }
    m.setExpression(base);
  }
}
