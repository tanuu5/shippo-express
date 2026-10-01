import * as THREE from 'three';
import { dampAngle, damp } from '../core/math.js';

// 光の柱・足元のリング・案内の矢印
export function beamMaterial(color, strength = 0.55) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uStrength: { value: strength } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        float fade = pow(max(1.0 - vUv.y, 0.0), 1.6);
        float band = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 6.0);
        float edge = 0.55 + 0.45 * pow(max(abs(sin(vUv.x * 3.14159)), 1e-4), 0.5);
        float a = fade * band * edge * uStrength;
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
  });
}

export function ringMaterial(color) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide, fog: false });
}

const beamGeo = new THREE.CylinderGeometry(0.45, 0.45, 1, 14, 1, true).translate(0, 0.5, 0);
const ringGeo = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2);
const discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);

export class Marker {
  constructor(color, { radius = 2.2, height = 26, beamWidth = 1 } = {}) {
    this.group = new THREE.Group();
    this.beamMat = beamMaterial(color);
    this.beam = new THREE.Mesh(beamGeo, this.beamMat);
    this.beam.scale.set(beamWidth, height, beamWidth);
    this.beam.renderOrder = 5;
    this.ring = new THREE.Mesh(ringGeo, ringMaterial(color));
    this.ring.scale.setScalar(radius);
    this.ring.position.y = 0.03;
    this.ring.renderOrder = 4;
    this.disc = new THREE.Mesh(discGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false, fog: false }));
    this.disc.scale.setScalar(radius);
    this.disc.position.y = 0.02;
    this.group.add(this.beam, this.ring, this.disc);
    this.radius = radius;
    this.t = Math.random() * 10;
  }

  setColor(c) {
    this.beamMat.uniforms.uColor.value.set(c);
    this.ring.material.color.set(c);
    this.disc.material.color.set(c);
  }

  update(dt, near = 0) {
    this.t += dt;
    this.beamMat.uniforms.uTime.value = this.t;
    const p = 1 + Math.sin(this.t * 4) * 0.06 + near * 0.1;
    this.ring.scale.setScalar(this.radius * p);
    this.ring.material.opacity = 0.65 + 0.3 * Math.sin(this.t * 4) * 0.5 + near * 0.2;
  }

  dispose() {
    this.beamMat.dispose();
    this.ring.material.dispose();
    this.disc.material.dispose();
  }
}

// 頭上の案内矢印
export class GuideArrow {
  constructor() {
    const s = new THREE.Shape();
    s.moveTo(0, 0.62);
    s.lineTo(0.42, 0.08);
    s.lineTo(0.16, 0.08);
    s.lineTo(0.16, -0.46);
    s.lineTo(-0.16, -0.46);
    s.lineTo(-0.16, 0.08);
    s.lineTo(-0.42, 0.08);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.035, bevelSegments: 2 });
    geo.translate(0, 0, -0.06);
    geo.rotateX(-Math.PI / 2); // 形の +y を -z（前）へ
    geo.rotateY(Math.PI); // 前を +z に
    this.mat = new THREE.MeshStandardMaterial({ color: 0x55d27a, emissive: 0x2a8a45, emissiveIntensity: 0.55, roughness: 0.35 });
    this.mesh = new THREE.Mesh(geo, this.mat);
    const outline = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }));
    outline.scale.setScalar(1.12);
    this.group = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.add(this.mesh, outline);
    this.group.add(this.pivot);
    this.group.visible = false;
    this.yaw = 0;
    this.t = 0;
    this.scale = 0;
  }

  setUrgency(r) {
    // r: 1=余裕(緑) → 0=ぎりぎり(赤)
    const c = new THREE.Color().setHSL(0.02 + 0.3 * Math.max(0, Math.min(1, r)), 0.72, 0.56);
    this.mat.color.copy(c);
    this.mat.emissive.copy(c).multiplyScalar(0.45);
  }

  update(dt, playerPos, target, visible) {
    this.t += dt;
    const want = visible ? 1 : 0;
    this.scale = damp(this.scale, want, 10, dt);
    this.group.visible = this.scale > 0.02;
    if (!this.group.visible) return;
    this.group.position.set(playerPos.x, playerPos.y + 2.05 + Math.sin(this.t * 3) * 0.05, playerPos.z);
    if (target) {
      const yaw = Math.atan2(target.x - playerPos.x, target.z - playerPos.z);
      this.yaw = dampAngle(this.yaw, yaw, 9, dt);
    }
    this.pivot.rotation.set(0.42, this.yaw, 0, 'YXZ');
    this.pivot.scale.setScalar(this.scale * 0.9 * (1 + Math.sin(this.t * 6) * 0.03));
  }
}
