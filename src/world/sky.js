import * as THREE from 'three';
import { makeWaterMaterial, vcolMat } from './materials.js';
import { paint, merge } from './props.js';
import { Rng } from '../core/rng.js';
import { QUAY_Z } from './cityPlan.js';

// 空・雲・遠くの山・海
export const SKY = {
  zenith: new THREE.Color('#5aa8e6'),
  horizon: new THREE.Color('#cfe5f1'),
  haze: new THREE.Color('#dcecf2'),
  sunDir: new THREE.Vector3(-0.45, 0.62, 0.64).normalize(),
};

export function makeSkyDome() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: SKY.zenith },
      uHorizon: { value: SKY.horizon },
      uSun: { value: SKY.sunDir },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uSun;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 c = mix(uHorizon, uZenith, pow(h, 0.55));
        // 地平線の下はうす明るく
        c = mix(c, uHorizon * 1.02, smoothstep(0.02, -0.12, d.y));
        float sd = max(dot(d, normalize(uSun)), 0.0);
        c += vec3(1.0, 0.92, 0.75) * (pow(sd, 400.0) * 1.6 + pow(sd, 16.0) * 0.18 + pow(sd, 3.0) * 0.06);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  m.name = 'sky';
  return m;
}

export function makeClouds() {
  const rng = new Rng(77);
  const parts = [];
  for (let i = 0; i < 26; i++) {
    const a = rng.float(0, Math.PI * 2);
    const r = rng.float(250, 900);
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    const cy = rng.float(120, 220);
    const s = rng.float(14, 30);
    const n = rng.int(4, 7);
    for (let k = 0; k < n; k++) {
      const g = new THREE.IcosahedronGeometry(1, 2);
      const sx = s * rng.float(0.7, 1.3);
      g.scale(sx, s * rng.float(0.45, 0.65), s * rng.float(0.6, 1.0));
      g.translate(cx + (k - n / 2) * s * 0.9 + rng.float(-4, 4), cy + rng.float(-3, 5), cz + rng.float(-8, 8));
      paint(g, '#ffffff');
      // 下側を少し青く
      const pos = g.attributes.position;
      const col = g.attributes.color;
      for (let j = 0; j < pos.count; j++) {
        const t = THREE.MathUtils.clamp((pos.getY(j) - (cy - s * 0.3)) / (s * 0.6), 0, 1);
        col.setXYZ(j, 0.86 + 0.14 * t, 0.9 + 0.1 * t, 0.96 + 0.04 * t);
      }
      parts.push(g);
    }
  }
  const mesh = new THREE.Mesh(merge(parts), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, opacity: 0.95 }));
  mesh.name = 'clouds';
  return mesh;
}

// 遠くの山並み（街の西・北・東）
export function makeHills() {
  const rng = new Rng(31);
  const parts = [];
  for (let i = 0; i < 46; i++) {
    const a = -Math.PI * 1.05 + (i / 45) * Math.PI * 1.1 + rng.float(-0.03, 0.03);
    const r = rng.float(430, 650);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.9 - 40;
    if (z > 150) continue;
    const h = rng.float(40, 110);
    const w = rng.float(80, 160);
    const g = new THREE.ConeGeometry(w, h, 7, 1);
    g.translate(x, h / 2 - 2, z);
    paint(g, rng.pick(['#8fb58f', '#86ad8a', '#98bd96', '#7fa487']));
    parts.push(g);
  }
  // 手前のなだらかな丘と森
  for (let i = 0; i < 80; i++) {
    const a = -Math.PI * 1.02 + (i / 79) * Math.PI * 1.04;
    const r = rng.float(260, 330);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r - 20;
    if (z > 190) continue;
    const g = new THREE.IcosahedronGeometry(rng.float(8, 16), 0);
    g.scale(1, rng.float(0.8, 1.4), 1);
    g.translate(x, rng.float(3, 7), z);
    paint(g, rng.pick(['#5f9650', '#6fa35a', '#548a4a']));
    parts.push(g);
  }
  const geo = merge(parts);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, vcolMat({ flatShading: true, roughness: 1 }));
  mesh.name = 'hills';
  return mesh;
}

export function makeFarGround() {
  const g = new THREE.PlaneGeometry(3000, 3000);
  g.rotateX(-Math.PI / 2);
  g.translate(0, -0.05, -1500 + QUAY_Z - 0.5);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x86b56a, roughness: 1 }));
  m.receiveShadow = true;
  m.name = 'farGround';
  return m;
}

export function makeSea() {
  const g = new THREE.PlaneGeometry(3200, 1800, 1, 1);
  g.rotateX(-Math.PI / 2);
  g.translate(0, -1.0, QUAY_Z - 2 + 900);
  const mat = makeWaterMaterial({ color: 0x3a93b0 });
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  m.name = 'sea';
  return m;
}
