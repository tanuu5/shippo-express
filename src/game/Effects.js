import * as THREE from 'three';

// 粒子（砂ぼこり・きらきら・紙吹雪・水しぶき・星）を 1 回の描画でまとめて出す
const MAX = 1600;

export class Effects {
  constructor(scene, camera, renderer) {
    this.camera = camera;
    this.renderer = renderer;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.size = new Float32Array(MAX);
    this.alpha = new Float32Array(MAX);
    this.shape = new Float32Array(MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 800 } },
      vertexShader: /* glsl */ `
        attribute float aSize;
        attribute float aAlpha;
        attribute float aShape;
        attribute vec3 color;
        uniform float uScale;
        varying vec3 vColor;
        varying float vAlpha;
        varying float vShape;
        void main() {
          vColor = color;
          vAlpha = aAlpha;
          vShape = aShape;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor;
        varying float vAlpha;
        varying float vShape;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float a;
          if (vShape < 0.5) {
            a = smoothstep(0.5, 0.25, length(p));
          } else if (vShape < 1.5) {
            // 星
            float r = length(p);
            float ang = r > 1e-4 ? atan(p.y, p.x) : 0.0;
            float star = 0.32 + 0.14 * cos(ang * 5.0);
            a = smoothstep(star, star - 0.08, r);
          } else {
            // 四角（紙吹雪）
            a = step(abs(p.x), 0.32) * step(abs(p.y), 0.2);
          }
          if (a * vAlpha < 0.01) discard;
          gl_FragColor = vec4(vColor, a * vAlpha);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 8;
    scene.add(this.points);
    this.geo = g;
    this.parts = [];
    this._c = new THREE.Color();
  }

  resize() {
    const h = this.renderer.domElement.height;
    this.mat.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
  }

  add(x, y, z, vx, vy, vz, life, size, color, opts = {}) {
    if (this.parts.length >= MAX) this.parts.shift();
    this._c.set(color);
    this.parts.push({ x, y, z, vx, vy, vz, life, max: life, size, r: this._c.r, g: this._c.g, b: this._c.b, grav: opts.grav ?? 6, drag: opts.drag ?? 1.5, shape: opts.shape || 0, grow: opts.grow || 0, soft: opts.soft ? 0.32 : 1 });
  }

  dust(x, y, z, n = 6, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (0.8 + Math.random() * 1.6) * power;
      this.add(x + Math.cos(a) * 0.2, y + 0.06, z + Math.sin(a) * 0.2, Math.cos(a) * s, 0.3 + Math.random() * 0.6 * power, Math.sin(a) * s, 0.35 + Math.random() * 0.3, 0.07 + Math.random() * 0.06, '#efe6da', { grav: -0.4, drag: 3.5, grow: 1.6, soft: true });
    }
  }

  burst(x, y, z, color, n = 14) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 2 - 0.3;
      const s = 2.5 + Math.random() * 3;
      this.add(x, y, z, Math.cos(a) * s, e * 2 + 2, Math.sin(a) * s, 0.5 + Math.random() * 0.35, 0.1 + Math.random() * 0.08, i % 3 ? color : '#ffffff', { grav: 5, drag: 2, shape: 1 });
    }
  }

  confetti(x, y, z) {
    const cols = ['#ff6b6b', '#ffc93c', '#5fd07a', '#4fa3e0', '#c47ae0', '#ff9ec4', '#ffffff'];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 1.5 + Math.random() * 4;
      this.add(x, y + 0.5, z, Math.cos(a) * s, 5 + Math.random() * 5, Math.sin(a) * s, 1.4 + Math.random() * 0.8, 0.16 + Math.random() * 0.1, cols[i % cols.length], { grav: 7, drag: 1.4, shape: 2 });
    }
    this.burst(x, y, z, '#fff3a0', 16);
  }

  splash(x, y, z, big) {
    const n = big ? 60 : 8;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (big ? 2 : 1) * (0.6 + Math.random() * 2);
      this.add(x + Math.cos(a) * 0.3, y + 0.05, z + Math.sin(a) * 0.3, Math.cos(a) * s, (big ? 6 : 2.2) + Math.random() * (big ? 3 : 1.5), Math.sin(a) * s, 0.5 + Math.random() * 0.4, (big ? 0.16 : 0.07) + Math.random() * 0.06, i % 2 ? '#e8f7ff' : '#9fd6ea', { grav: 14, drag: 0.6 });
    }
  }

  stars(x, y, z) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.add(x + Math.cos(a) * 0.3, y, z + Math.sin(a) * 0.3, Math.cos(a) * 2, 2.5, Math.sin(a) * 2, 0.8, 0.3, '#ffe066', { grav: 3, drag: 1.2, shape: 1 });
    }
  }

  petal(x, y, z) {
    const a = Math.random() * Math.PI * 2;
    this.add(x, y, z, Math.cos(a) * 0.5 + 0.3, -0.2, Math.sin(a) * 0.5, 4 + Math.random() * 2, 0.07, Math.random() < 0.5 ? '#f8c8d6' : '#fbe0e8', { grav: 0.35, drag: 0.4, shape: 2 });
  }

  trail(x, y, z, color) {
    this.add(x + (Math.random() - 0.5) * 0.3, y + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.3, 0, 0.3, 0, 0.5, 0.14, color, { grav: -0.3, drag: 2, shape: 1 });
  }

  update(dt) {
    this.resize();
    const P = this.parts;
    let n = 0;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) {
        P.splice(i, 1);
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vz *= k;
      p.vy = p.vy * k - p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
    }
    for (const p of P) {
      const t = p.life / p.max;
      this.pos[n * 3] = p.x;
      this.pos[n * 3 + 1] = p.y;
      this.pos[n * 3 + 2] = p.z;
      this.col[n * 3] = p.r;
      this.col[n * 3 + 1] = p.g;
      this.col[n * 3 + 2] = p.b;
      this.size[n] = p.size * (1 + p.grow * (1 - t));
      this.alpha[n] = Math.min(1, t * 2.5) * p.soft;
      this.shape[n] = p.shape;
      n++;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'color', 'aSize', 'aAlpha', 'aShape']) this.geo.attributes[k].needsUpdate = true;
  }
}
