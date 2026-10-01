import * as THREE from 'three';
import { clamp, damp, dampAngle } from '../core/math.js';

// 三人称の追従カメラ：走る向きへ自動で回り込み、マウス／右スティックで手動回転。壁の手前に寄る。
export class FollowCamera {
  constructor(camera, col) {
    this.camera = camera;
    this.col = col;
    this.yaw = 0;
    this.pitch = 0.3;
    this.dist = 4.0;
    this.target = new THREE.Vector3();
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shake = 0;
    this.fovBase = 60;
    this.fovKick = 0;
    this.time = 0;
    this.first = true;
    this.mode = 'follow'; // follow | orbit（タイトル） | fixed
    this.orbit = { cx: 0, cz: 0, r: 7, h: 2.2, speed: 0.12, lookY: 1.1 };
  }

  snapBehind(player) {
    this.yaw = player.yaw;
    this.first = true;
  }

  addShake(a) {
    this.shake = Math.min(1.2, this.shake + a);
  }

  update(dt, player, input) {
    this.time += dt;
    const cam = this.camera;
    if (this.mode === 'hero') {
      // タイトル：正面寄りから、ゆっくり左右に揺れながら。キャラは画面の右寄りに
      const o = this.orbit;
      const a = (o.phase || 0) + Math.sin(this.time * 0.25) * 0.35;
      const px = o.cx + Math.sin(a) * o.r;
      const pz = o.cz + Math.cos(a) * o.r;
      const p = new THREE.Vector3(px, o.h + Math.sin(this.time * 0.4) * 0.05, pz);
      if (this.first) {
        this.pos.copy(p);
        this.first = false;
      }
      this.pos.lerp(p, 1 - Math.exp(-3 * dt));
      cam.position.copy(this.pos);
      const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a));
      const aspect = cam.aspect || 1.6;
      const shift = aspect > 1.1 ? o.shift : 0;
      cam.lookAt(o.cx - right.x * shift, o.lookY, o.cz - right.z * shift);
      cam.fov = damp(cam.fov, aspect > 1.1 ? 38 : 46, 4, dt);
      cam.updateProjectionMatrix();
      return;
    }
    if (this.mode === 'orbit') {
      const o = this.orbit;
      const a = this.time * o.speed + (o.phase || 0);
      const p = new THREE.Vector3(o.cx + Math.sin(a) * o.r, o.h, o.cz + Math.cos(a) * o.r);
      if (this.first) {
        this.pos.copy(p);
        this.first = false;
      }
      this.pos.lerp(p, 1 - Math.exp(-3 * dt));
      cam.position.copy(this.pos);
      cam.lookAt(o.cx, o.lookY, o.cz);
      cam.fov = damp(cam.fov, 45, 4, dt);
      cam.updateProjectionMatrix();
      return;
    }
    const v = player.vel;
    const hs = Math.hypot(v.x, v.z);
    // 手動
    this.yaw += input.camDX;
    this.pitch = clamp(this.pitch + input.camDY, -0.15, 1.05);
    // 自動で背後へ（手動操作の直後は待つ）
    const idle = input.camIdleTime();
    if (idle > 1.1 && hs > 1.5 && player.mode !== 'hit') {
      const want = Math.atan2(v.x, v.z);
      const k = (0.9 + hs * 0.2) * clamp((idle - 1.1) / 0.8, 0, 1);
      this.yaw = dampAngle(this.yaw, want, k, dt);
    }
    // 滑空・高所ではやや上から
    const gliding = player.mode === 'glide';
    const wantPitch = gliding ? 0.4 : 0.24;
    if (idle > 1.5) this.pitch = damp(this.pitch, wantPitch, 1.2, dt);
    const wantDist = 3.9 + clamp(hs / 13, 0, 1) * 1.1 + (gliding ? 1.1 : 0);
    this.dist = damp(this.dist, wantDist, 2.5, dt);

    // 注視点：少し先読み
    const tx = player.pos.x + v.x * 0.12;
    const ty = player.pos.y + 1.2 + (player.mode === 'slide' ? -0.4 : 0);
    const tz = player.pos.z + v.z * 0.12;
    if (this.first) this.target.set(tx, ty, tz);
    this.target.x = damp(this.target.x, tx, 14, dt);
    this.target.z = damp(this.target.z, tz, 14, dt);
    // 縦はゆっくり（ジャンプで画面が揺れすぎないように）
    this.target.y = damp(this.target.y, ty, player.grounded ? 9 : 3.5, dt);

    const cp = Math.cos(this.pitch);
    const ox = -Math.sin(this.yaw) * cp * this.dist;
    const oy = Math.sin(this.pitch) * this.dist + 0.3;
    const oz = -Math.cos(this.yaw) * cp * this.dist;
    let px = this.target.x + ox;
    let py = this.target.y + oy;
    let pz = this.target.z + oz;
    // 壁・建物に遮られたら手前へ
    const t = this.col.segment(this.target.x, this.target.y, this.target.z, px, py, pz, 0.25);
    if (t < 1) {
      const k = Math.max(0.12, t - 0.04);
      px = this.target.x + ox * k;
      py = this.target.y + oy * k;
      pz = this.target.z + oz * k;
    }
    py = Math.max(py, this.col.baseGround(px, pz) + 0.35);
    if (this.first) {
      this.pos.set(px, py, pz);
      this.first = false;
    }
    // 遮られて近づくときは速く、離れるときはゆっくり
    const lam = t < 1 ? 20 : 10;
    this.pos.x = damp(this.pos.x, px, lam, dt);
    this.pos.y = damp(this.pos.y, py, lam, dt);
    this.pos.z = damp(this.pos.z, pz, lam, dt);

    cam.position.copy(this.pos);
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 0.25;
      cam.position.x += (Math.sin(this.time * 71) + Math.sin(this.time * 43)) * s * 0.5;
      cam.position.y += (Math.sin(this.time * 59) + Math.sin(this.time * 37)) * s * 0.5;
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }
    this.look.set(this.target.x, this.target.y + 0.1, this.target.z);
    cam.lookAt(this.look);
    // スピード感：FOV を広げる
    const fov = this.fovBase + clamp((hs - 8) / 6, 0, 1) * 10 + (gliding ? 4 : 0) + this.fovKick;
    cam.fov = damp(cam.fov, fov, 4, dt);
    this.fovKick = damp(this.fovKick, 0, 3, dt);
    cam.updateProjectionMatrix();
  }
}
