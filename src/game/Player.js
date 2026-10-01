import * as THREE from 'three';
import { clamp, damp, dampAngle, angleDiff } from '../core/math.js';

// プレイヤーの操作と物理：走る・ダッシュ・ジャンプ・2段ジャンプ（くるりん）・ポンチョ滑空・スライディング・壁キック
export const TUNE = {
  runSpeed: 8.6,
  dashSpeed: 13.2,
  accel: 38,
  decel: 30,
  airAccel: 15,
  gravity: 27,
  jumpVel: 9.4,
  doubleJumpVel: 8.8,
  glideFall: 2.3,
  glideSpeed: 10.5,
  slideSpeed: 12.5,
  slideTime: 0.62,
  radius: 0.32,
  height: 1.45,
  slideHeight: 0.85,
  stepUp: 0.48,
  stepDown: 0.55,
  coyote: 0.12,
  buffer: 0.13,
};

export class Player {
  constructor(city, model, animator) {
    this.city = city;
    this.col = city.col;
    this.model = model;
    this.anim = animator;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.grounded = true;
    this.mode = 'ground'; // ground | air | glide | slide | hit | cheer
    this.jumpCount = 0;
    this.coyote = 0;
    this.buffer = 0;
    this.airTime = 0;
    this.slideT = 0;
    this.hitT = 0;
    this.cheerT = 0;
    this.stamina = 1;
    this.dashLock = false;
    this.dashing = false;
    this.wall = { t: 10, nx: 0, nz: 0 };
    this.groundInfo = {};
    this.hitInfo = {};
    this.events = []; // ゲーム側へ：{type, ...}
    this.maxAirY = 0;
    this.turn = 0;
    this.inWater = null;
    this.roofProvider = null; // 車の屋根
    this.controlEnabled = true;
    this.lastSafe = new THREE.Vector3();
    this.respawnT = 0;
    this.stepPhase = 0;
    this.distance = 0;
  }

  spawn(x, y, z, yaw = 0) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.grounded = true;
    this.mode = 'ground';
    this.respawnT = 0;
    this.hitT = 0;
    this.slideT = 0;
    this.cheerT = 0;
    this.jumpCount = 0;
    this.buffer = 0;
    this.coyote = 0;
    this.airTime = 0;
    this.inWater = null;
    this.wall.t = 10;
    this.takeoff = null;
    this.doubled = false;
    this.lastSafe.copy(this.pos);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = yaw;
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  hit(dx, dz, power = 1) {
    if (this.mode === 'hit') return;
    const l = Math.hypot(dx, dz) || 1;
    this.vel.set((dx / l) * 8 * power, 6.5 * power, (dz / l) * 8 * power);
    this.mode = 'hit';
    this.hitT = 1.15;
    this.grounded = false;
    this.emit('hit');
  }

  cheer(sec = 0.9) {
    this.cheerT = sec;
  }

  // 空中で弾かれる（車の屋根など）
  bounce(v, kind, src = null) {
    this.vel.y = v;
    this.grounded = false;
    this.mode = 'air';
    this.jumpCount = 1;
    this.airTime = 0;
    this.maxAirY = this.pos.y;
    this.emit('bounce', { kind, src });
  }

  update(dt, input, camYaw) {
    const T = TUNE;
    const col = this.col;
    this.events.length = 0;

    // --- 入力 → 目標速度
    let mx = 0;
    let mz = 0;
    let mag = 0;
    if (this.controlEnabled && this.mode !== 'hit') {
      const ix = input.move.x;
      const iy = input.move.y;
      mag = Math.min(1, Math.hypot(ix, iy));
      const s = Math.sin(camYaw);
      const c = Math.cos(camYaw);
      mx = s * iy - c * ix;
      mz = c * iy + s * ix;
      const l = Math.hypot(mx, mz);
      if (l > 1e-4) {
        mx /= l;
        mz /= l;
      }
    }

    // ダッシュ（しっぽゲージ）
    const wantDash = this.controlEnabled && input.dashDown && mag > 0.2 && this.mode !== 'hit';
    if (this.stamina <= 0.001) this.dashLock = true;
    if (this.dashLock && this.stamina > 0.3) this.dashLock = false;
    this.dashing = wantDash && !this.dashLock && (this.mode === 'ground' || this.mode === 'slide' || this.mode === 'air');
    if (this.dashing) this.stamina = Math.max(0, this.stamina - dt * 0.22);
    else this.stamina = Math.min(1, this.stamina + dt * (this.grounded ? 0.16 : 0.08));

    // タイマー
    this.coyote -= dt;
    this.buffer -= dt;
    this.wall.t += dt;
    if (this.controlEnabled && input.jumpPressed) this.buffer = T.buffer;
    if (this.cheerT > 0) this.cheerT -= dt;

    // --- 状態ごとの処理
    if (this.mode === 'hit') {
      this.hitT -= dt;
      this.vel.x = damp(this.vel.x, 0, this.grounded ? 6 : 0.8, dt);
      this.vel.z = damp(this.vel.z, 0, this.grounded ? 6 : 0.8, dt);
      if (this.hitT <= 0 && this.grounded) this.mode = 'ground';
    } else if (this.mode === 'slide') {
      this.slideT -= dt;
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      if (mag > 0.2) this.yaw = dampAngle(this.yaw, Math.atan2(mx, mz), 2.5, dt);
      const ns = Math.max(0, sp - dt * 7);
      this.vel.x = fx * ns;
      this.vel.z = fz * ns;
      if (this.slideT <= 0 || ns < 3) this.mode = this.grounded ? 'ground' : 'air';
      if (!this.grounded) this.mode = 'air';
    } else {
      const onGround = this.grounded;
      const maxSp = (this.dashing ? T.dashSpeed : T.runSpeed) * (this.inWater ? 0.72 : 1);
      if (this.mode === 'glide') {
        // 滑空：ゆっくり落ち、前へ進み続ける。旋回はゆるやか
        const sp = Math.max(Math.hypot(this.vel.x, this.vel.z), 7);
        if (mag > 0.2) this.yaw = dampAngle(this.yaw, Math.atan2(mx, mz), 2.2, dt);
        const target = Math.max(T.glideSpeed * (this.dashing ? 1.2 : 1), 0);
        const ns = damp(sp, target, 1.2, dt);
        this.vel.x = Math.sin(this.yaw) * ns;
        this.vel.z = Math.cos(this.yaw) * ns;
        this.vel.y = damp(this.vel.y, -T.glideFall, 5, dt);
        if (!input.jumpDown || onGround) this.mode = onGround ? 'ground' : 'air';
      } else {
        const tx = mx * maxSp * mag;
        const tz = mz * maxSp * mag;
        const a = onGround ? (mag > 0.05 ? T.accel : T.decel) : mag > 0.05 ? T.airAccel : 1.5;
        let dx = tx - this.vel.x;
        let dz = tz - this.vel.z;
        // 空中で入力なしなら慣性を保つ
        if (!onGround && mag < 0.05) {
          dx = 0;
          dz = 0;
        }
        const dl = Math.hypot(dx, dz);
        const step = a * dt;
        if (dl > step) {
          dx *= step / dl;
          dz *= step / dl;
        }
        this.vel.x += dx;
        this.vel.z += dz;
        // 向き
        const sp = Math.hypot(this.vel.x, this.vel.z);
        if (sp > 0.6) {
          const want = Math.atan2(this.vel.x, this.vel.z);
          const before = this.yaw;
          this.yaw = dampAngle(this.yaw, want, onGround ? 14 : 6, dt);
          this.turn = damp(this.turn, angleDiff(before, this.yaw) / Math.max(dt, 1e-3), 8, dt);
        } else this.turn = damp(this.turn, 0, 8, dt);
      }

      // ジャンプ
      if (this.buffer > 0 && this.controlEnabled) {
        if (onGround || this.coyote > 0) {
          this.vel.y = T.jumpVel + (this.dashing ? 0.6 : 0);
          this.grounded = false;
          this.mode = 'air';
          this.jumpCount = 1;
          this.buffer = 0;
          this.coyote = 0;
          this.airTime = 0;
          this.maxAirY = this.pos.y;
          this.emit('jump');
        } else if (this.wall.t < 0.18 && this.mode !== 'glide') {
          // 壁キック
          const n = this.wall;
          const sp = Math.hypot(this.vel.x, this.vel.z);
          this.vel.x = n.nx * 7.2 + this.vel.x * 0.3;
          this.vel.z = n.nz * 7.2 + this.vel.z * 0.3;
          this.vel.y = T.doubleJumpVel + 0.4;
          this.yaw = Math.atan2(this.vel.x, this.vel.z);
          this.buffer = 0;
          this.wall.t = 10;
          this.jumpCount = 1;
          this.emit('wallkick', { speed: sp });
        } else if (this.jumpCount < 2 && this.mode !== 'glide') {
          this.vel.y = T.doubleJumpVel;
          this.jumpCount = 2;
          this.buffer = 0;
          this.mode = 'air';
          this.anim.triggerTwirl();
          this.doubled = true;
          this.emit('doublejump');
        }
      }
      // 滑空の開始：空中でボタンを押し続けて落下中
      if (this.mode === 'air' && input.jumpDown && this.vel.y < -0.5 && this.airTime > 0.18 && this.controlEnabled) {
        this.mode = 'glide';
        this.emit('glide');
      }
      // スライディング
      if (this.controlEnabled && input.slidePressed && onGround && Math.hypot(this.vel.x, this.vel.z) > 4.5 && this.mode === 'ground') {
        this.mode = 'slide';
        this.slideT = T.slideTime;
        const sp = Math.max(Math.hypot(this.vel.x, this.vel.z), T.slideSpeed);
        this.vel.x = Math.sin(this.yaw) * sp;
        this.vel.z = Math.cos(this.yaw) * sp;
        this.emit('slide');
      }
    }

    // --- 移動と当たり判定（小刻みに）
    const speed = Math.hypot(this.vel.x, this.vel.z, this.vel.y);
    const steps = Math.min(8, Math.max(1, Math.ceil((speed * dt) / 0.22)));
    const h = dt / steps;
    const height = this.mode === 'slide' ? T.slideHeight : T.height;
    const wasGrounded = this.grounded;
    let landedOn = null;
    let landVy = 0;
    for (let s = 0; s < steps; s++) {
      const prevY = this.pos.y;
      this.pos.x += this.vel.x * h;
      this.pos.z += this.vel.z * h;
      if (col.resolve(this.pos, T.radius, this.pos.y, height, this.grounded ? T.stepUp : 0.12, this.hitInfo)) {
        const nx = this.hitInfo.nx;
        const nz = this.hitInfo.nz;
        const vn = this.vel.x * nx + this.vel.z * nz;
        if (vn < 0) {
          // 正面衝突に近いほど強く減速
          this.vel.x -= nx * vn;
          this.vel.z -= nz * vn;
          if (vn < -7 && this.grounded) this.emit('bonk', { v: -vn });
        }
        if (!this.grounded) {
          this.wall.t = 0;
          this.wall.nx = nx;
          this.wall.nz = nz;
        }
      }
      // 縦
      if (!this.grounded) this.vel.y -= T.gravity * h * (this.mode === 'glide' ? 0.25 : 1);
      this.pos.y += this.vel.y * h;
      const ref = Math.max(prevY, this.pos.y);
      let g = col.groundAt(this.pos.x, this.pos.z, T.radius, ref, this.grounded ? T.stepUp : 0.08, this.groundInfo);
      let gc = this.groundInfo.collider;
      // 車の屋根
      if (this.roofProvider) {
        const r = this.roofProvider(this.pos.x, this.pos.z, ref);
        if (r && r.y > g) {
          g = r.y;
          gc = { kind: 'bounce', bounce: 10.5, car: r.car, tag: 'car' };
        }
      }
      if (this.vel.y <= 0 && this.pos.y <= g + 0.001) {
        if (!this.grounded) {
          landedOn = gc;
          landVy = this.vel.y;
        }
        this.pos.y = g;
        this.vel.y = 0;
        this.grounded = true;
      } else if (this.grounded && this.vel.y <= 0 && this.pos.y - g < T.stepDown && this.pos.y - g > 0) {
        this.pos.y = g; // 段差を降りる
      } else if (this.pos.y > g + 0.001) {
        this.grounded = false;
      }
      // 天井
      if (this.vel.y > 0) {
        const ceil = col.ceilingAt(this.pos.x, this.pos.z, T.radius, this.pos.y, this.pos.y + height);
        if (this.pos.y + height > ceil) {
          this.pos.y = ceil - height;
          this.vel.y = 0;
        }
      }
      if (landedOn && (landedOn.kind === 'bounce')) break;
    }

    // 地面の上のジャンプ台に歩いて乗ったとき
    if (this.grounded && wasGrounded && !landedOn && this.groundInfo.collider && this.groundInfo.collider.kind === 'bounce') {
      landedOn = this.groundInfo.collider;
      this.bounce(landedOn.bounce || 12, landedOn.tag === 'pad' ? 'pad' : 'awning', landedOn);
    }
    // --- 着地・離陸のイベント
    if (this.grounded && !wasGrounded) {
      if (landedOn && landedOn.kind === 'bounce') {
        const kind = landedOn.car ? 'car' : landedOn.tag === 'pad' ? 'pad' : 'awning';
        this.bounce(landedOn.bounce || 12, kind, landedOn.car || landedOn);
        if (landedOn.car) this.emit('carBounce', { car: landedOn.car });
      } else {
        const impact = -landVy;
        const drop = this.maxAirY - this.pos.y;
        this.anim.triggerLand(clamp(impact / 16, 0.15, 1));
        this.emit('land', { impact, airTime: this.airTime, drop, onRoof: !!(landedOn && landedOn.tag === 'building'), collider: landedOn, from: this.takeoff, doubled: this.doubled });
        this.doubled = false;
        if (this.mode === 'air' || this.mode === 'glide') this.mode = 'ground';
        this.jumpCount = 0;
        if (this.buffer > 0) {
          // 先行入力のジャンプ
          this.vel.y = T.jumpVel;
          this.grounded = false;
          this.mode = 'air';
          this.jumpCount = 1;
          this.buffer = 0;
          this.airTime = 0;
          this.maxAirY = this.pos.y;
          this.emit('jump');
        }
      }
    }
    if (!this.grounded && wasGrounded) {
      // 離陸した床（屋根づたいの判定用）
      this.takeoff = this.groundInfo.collider || null;
      if (this.vel.y <= 0.01) this.coyote = T.coyote;
      if (this.mode === 'ground') this.mode = 'air';
      this.airTime = 0;
      this.maxAirY = this.pos.y;
    }
    if (!this.grounded) {
      this.airTime += dt;
      this.maxAirY = Math.max(this.maxAirY, this.pos.y);
    }

    // 水
    const w = this.city.waterAt(this.pos.x, this.pos.z);
    const inW = w && this.pos.y < w.y + 0.2 ? w : null;
    if (inW && !this.inWater) this.emit('splash', { x: this.pos.x, y: w.y, z: this.pos.z, big: false });
    this.inWater = inW;
    // 海に落ちた
    if (this.city.isSea(this.pos.x, this.pos.z) && this.pos.y < -0.8 && this.respawnT <= 0) {
      this.emit('splash', { x: this.pos.x, y: -1, z: this.pos.z, big: true });
      this.emit('fellInSea');
      this.respawnT = 1.1;
      this.controlEnabled = false;
    }
    if (this.respawnT > 0) {
      this.respawnT -= dt;
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
      if (this.vel.y < -3) this.vel.y = -3;
      if (this.respawnT <= 0) {
        this.spawn(this.lastSafe.x, this.lastSafe.y + 0.5, this.lastSafe.z, this.yaw);
        this.controlEnabled = true;
        this.emit('respawn');
      }
    }
    // 岸から十分内側で地面にいるときだけ、落水時の戻り先として記録
    if (this.grounded && !this.city.isSea(this.pos.x, this.pos.z + 2) && this.pos.y > -0.5 && this.mode !== 'hit') this.lastSafe.copy(this.pos);

    // 足音
    if (this.grounded && this.mode === 'ground') {
      const sp = Math.hypot(this.vel.x, this.vel.z);
      const prev = this.stepPhase;
      this.stepPhase += (sp * dt) / (this.dashing ? 1.12 : 0.88);
      if (Math.floor(this.stepPhase) !== Math.floor(prev) && sp > 1.5) this.emit('step', { speed: sp, water: !!this.inWater });
    }

    // 走った距離（結果画面用）
    if (this.controlEnabled) this.distance += Math.hypot(this.vel.x, this.vel.z) * dt;

    // --- モデルへ反映
    const root = this.model.root;
    root.position.copy(this.pos);
    root.rotation.y = this.yaw;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    let mode = this.mode;
    if (this.cheerT > 0 && this.mode === 'ground' && hs < 3) mode = 'cheer';
    this.anim.update(dt, {
      mode: mode === 'ground' ? 'ground' : mode,
      speed: hs,
      runSpeed: TUNE.runSpeed,
      vy: this.vel.y,
      sprint: this.dashing && this.mode === 'ground',
      turn: this.turn,
      carry: this.model.carrying,
    });
    this.model.update(dt, {
      velocity: this.vel,
      flutter: clamp(hs / 12, 0, 1) + (this.mode === 'glide' ? 0.6 : 0),
      wag: this.mode === 'ground' && hs < 1 ? 0.35 : this.cheerT > 0 ? 1 : 0.12,
      wagSpeed: this.cheerT > 0 ? 14 : 6,
      tailLift: this.mode === 'glide' ? 0.6 : 0,
    });
  }
}
