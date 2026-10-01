import * as THREE from 'three';
import { box, cyl, ball, paint, merge } from './props.js';
import { vcolMat } from './materials.js';

// 街の住人（いろいろなケモ耳のちびキャラ）：体・頭をまとめた 1 メッシュ＋両脚＋両腕
const SKINS = ['#f8e2d6', '#f3d6c2', '#e8c3a4', '#fbe9df', '#d9ae8e'];
const HAIRS = ['#6b4a3a', '#2f2a2e', '#c98a4b', '#e8d3a8', '#8a5a44', '#f1eee9', '#a9533f', '#4a5a78', '#d8a1b4'];
const SHIRTS = ['#e0655a', '#5b9b7e', '#4f7fb0', '#e8b44d', '#9b6fb0', '#f4efe6', '#6fa3a0', '#f08aa0', '#8aa05a', '#ffffff'];
const BOTTOMS = ['#3f4a5c', '#5b4a3f', '#2f3a4a', '#7a6a5a', '#b9a58c', '#4a3f5c'];
export const EAR_TYPES = ['cat', 'dog', 'bunny', 'bear', 'fox', 'mouse'];

function ears(type, hair, inner) {
  const parts = [];
  const H = 1.4;
  for (const s of [-1, 1]) {
    if (type === 'cat' || type === 'fox') {
      const g = new THREE.ConeGeometry(type === 'fox' ? 0.075 : 0.065, type === 'fox' ? 0.17 : 0.13, 4);
      g.rotateZ(-s * 0.35);
      g.translate(s * 0.1, H + 0.2, 0);
      parts.push(paint(g, hair));
      const gi = new THREE.ConeGeometry(0.035, 0.09, 4);
      gi.rotateZ(-s * 0.35);
      gi.translate(s * 0.098, H + 0.19, 0.03);
      parts.push(paint(gi, inner));
    } else if (type === 'dog') {
      const g = new THREE.SphereGeometry(0.07, 8, 6).scale(0.6, 1.4, 0.5);
      g.rotateZ(s * 0.5);
      g.translate(s * 0.15, H + 0.08, -0.01);
      parts.push(paint(g, hair));
    } else if (type === 'bunny') {
      const g = new THREE.CapsuleGeometry(0.035, 0.2, 4, 8);
      g.rotateZ(-s * 0.15);
      g.translate(s * 0.06, H + 0.3, -0.01);
      parts.push(paint(g, hair));
    } else if (type === 'bear') {
      parts.push(paint(new THREE.SphereGeometry(0.055, 10, 8).translate(s * 0.12, H + 0.15, -0.01), hair));
    } else {
      parts.push(paint(new THREE.SphereGeometry(0.07, 10, 8).scale(1, 1, 0.4).translate(s * 0.13, H + 0.15, 0), hair));
    }
  }
  return parts;
}

export function makeTownsfolk(rng, opts = {}) {
  const skin = rng.pick(SKINS);
  const hair = rng.pick(HAIRS);
  const shirt = opts.shirt || rng.pick(SHIRTS);
  const bottom = rng.pick(BOTTOMS);
  const type = opts.ears || rng.pick(EAR_TYPES);
  const skirt = rng.chance(0.4);
  const inner = '#f0b8b0';
  const parts = [];
  // 胴
  if (skirt) {
    parts.push(cyl(0.13, 0.24, 0.42, 0, 0.62, 0, shirt, 12));
    parts.push(cyl(0.12, 0.13, 0.12, 0, 1.0, 0, shirt, 12));
  } else {
    parts.push(cyl(0.14, 0.16, 0.5, 0, 0.62, 0, shirt, 12));
    parts.push(cyl(0.155, 0.155, 0.12, 0, 0.56, 0, bottom, 12));
  }
  parts.push(cyl(0.05, 0.05, 0.08, 0, 1.1, 0, skin, 8));
  // 頭
  parts.push(ball(0.2, 0, 1.36, 0, skin, 2));
  // 髪：頭頂と後ろ
  const hg = new THREE.SphereGeometry(0.215, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
  hg.rotateX(-0.35);
  hg.translate(0, 1.38, -0.02);
  parts.push(paint(hg, hair));
  // 目（小さな黒い点）
  for (const s of [-1, 1]) parts.push(paint(new THREE.SphereGeometry(0.028, 8, 6).scale(0.8, 1.2, 0.5).translate(s * 0.07, 1.35, 0.185), '#2a2426'));
  // ほっぺ
  for (const s of [-1, 1]) parts.push(paint(new THREE.SphereGeometry(0.03, 8, 6).scale(1.3, 0.8, 0.4).translate(s * 0.11, 1.29, 0.17), '#f2a6a0'));
  parts.push(...ears(type, hair, inner));
  // しっぽ
  if (type === 'fox' || type === 'dog' || type === 'cat') {
    const tg = new THREE.CapsuleGeometry(type === 'fox' ? 0.07 : 0.035, 0.26, 4, 8);
    tg.rotateX(0.9);
    tg.translate(0, 0.58, -0.22);
    parts.push(paint(tg, hair));
  }
  const body = merge(parts);
  const legGeo = merge([cyl(0.05, 0.045, 0.52, 0, -0.52, 0, skirt ? skin : bottom, 8), box(0.1, 0.07, 0.17, 0, -0.56, 0.03, '#4a3a34')]);
  const armGeo = merge([cyl(0.04, 0.035, 0.38, 0, -0.38, 0, shirt, 8), ball(0.045, 0, -0.41, 0, skin, 1)]);
  return { body, legGeo, armGeo, type, shirt };
}

export class TownsfolkMesh {
  constructor(parts, mat) {
    this.root = new THREE.Group();
    const m = mat || vcolMat();
    this.body = new THREE.Mesh(parts.body, m);
    this.body.castShadow = true;
    this.root.add(this.body);
    this.legs = [];
    this.arms = [];
    for (const s of [-1, 1]) {
      const l = new THREE.Mesh(parts.legGeo, m);
      l.position.set(s * 0.07, 0.56, 0);
      l.castShadow = true;
      this.root.add(l);
      this.legs.push(l);
      const a = new THREE.Mesh(parts.armGeo, m);
      a.position.set(s * 0.17, 1.02, 0);
      a.rotation.z = s * 0.15;
      a.castShadow = true;
      this.root.add(a);
      this.arms.push(a);
    }
    this.phase = Math.random() * 10;
  }

  dispose() {
    this.body.geometry.dispose();
    this.legs[0].geometry.dispose();
    this.arms[0].geometry.dispose();
  }

  walk(dt, speed) {
    this.phase += dt * speed * 4.2;
    const s = Math.sin(this.phase) * Math.min(1, speed) * 0.6;
    this.legs[0].rotation.x = s;
    this.legs[1].rotation.x = -s;
    this.arms[0].rotation.x = -s * 0.8;
    this.arms[1].rotation.x = s * 0.8;
    this.arms[0].rotation.z = -0.15;
    this.arms[1].rotation.z = 0.15;
    this.body.position.y = Math.abs(Math.cos(this.phase)) * 0.03 * Math.min(1, speed);
  }

  wave(t) {
    this.legs[0].rotation.x = 0;
    this.legs[1].rotation.x = 0;
    this.arms[1].rotation.z = 2.6 + Math.sin(t * 9) * 0.35;
    this.arms[1].rotation.x = 0;
    this.arms[0].rotation.z = -0.15;
    this.arms[0].rotation.x = 0;
    this.body.position.y = Math.abs(Math.sin(t * 4.5)) * 0.05;
  }

  idle(t) {
    this.legs[0].rotation.x = 0;
    this.legs[1].rotation.x = 0;
    this.arms[0].rotation.set(0, 0, -0.15);
    this.arms[1].rotation.set(0, 0, 0.15);
    this.body.position.y = Math.sin(t * 2) * 0.008;
  }

  hop(t) {
    this.body.position.y = Math.abs(Math.sin(t * 10)) * 0.15;
    this.arms[0].rotation.z = -2.2;
    this.arms[1].rotation.z = 2.2;
  }
}
