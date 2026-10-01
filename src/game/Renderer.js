import * as THREE from 'three';
import { SKY } from '../world/sky.js';

// レンダラ・シーン・ライト（太陽の影はプレイヤーの周りだけを高解像度で）
export class Stage {
  constructor(container) {
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
    this.mobile = mobile;
    this.renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance', preserveDrawingBuffer: !!import.meta.env.DEV });
    this.maxPR = mobile ? 1.5 : 1.75;
    this.renderer.setPixelRatio(this.pickPixelRatio());
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(SKY.haze, 160, 820);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2400);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x9c8a70, 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.35);
    this.sun.castShadow = true;
    const S = mobile ? 38 : 48;
    this.shadowSize = S;
    this.sun.shadow.mapSize.set(mobile ? 1024 : 2048, mobile ? 1024 : 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -S;
    sc.right = S;
    sc.top = S;
    sc.bottom = -S;
    sc.near = 1;
    sc.far = 260;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    window.addEventListener('resize', () => this.resize());
  }

  setEnvironment(skyMesh) {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    envScene.add(skyMesh.clone());
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8a9a84 }));
    ground.position.y = -30;
    envScene.add(ground);
    this.scene.environment = pm.fromScene(envScene, 0.03).texture;
    this.scene.environmentIntensity = 0.4;
    pm.dispose();
  }

  // 影のカメラをプレイヤーに合わせる（テクセル単位にそろえてチラつきを防ぐ）
  followShadow(x, y, z) {
    const d = SKY.sunDir;
    const S = this.shadowSize;
    const texel = (S * 2) / this.sun.shadow.mapSize.x;
    // 光の向きに垂直な面でスナップ
    const lightRight = new THREE.Vector3(0, 1, 0).cross(d).normalize();
    const lightUp = new THREE.Vector3().crossVectors(d, lightRight).normalize();
    const p = new THREE.Vector3(x, y, z);
    const r = Math.round(p.dot(lightRight) / texel) * texel;
    const u = Math.round(p.dot(lightUp) / texel) * texel;
    const f = p.dot(d);
    const c = new THREE.Vector3().addScaledVector(lightRight, r).addScaledVector(lightUp, u).addScaledVector(d, f);
    this.sun.target.position.copy(c);
    this.sun.position.copy(c).addScaledVector(d, 120);
    this.sun.target.updateMatrixWorld();
  }

  // 画質の切り替え：high / mid / low（low は影なし）
  setQuality(q) {
    this.quality = q;
    this.maxPR = q === 'high' ? (this.mobile ? 1.5 : 1.75) : q === 'mid' ? 1.25 : 1.0;
    const shadows = q !== 'low';
    const size = q === 'high' && !this.mobile ? 2048 : 1024;
    if (this.renderer.shadowMap.enabled !== shadows || this.sun.shadow.mapSize.x !== size) {
      this.renderer.shadowMap.enabled = shadows;
      this.sun.castShadow = shadows;
      this.sun.shadow.mapSize.set(size, size);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
      this.scene.traverse((o) => {
        if (o.material) for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
      });
    }
    this.resize();
  }

  // 大きな画面では描画ピクセル数が約 420 万を超えないよう解像度を下げる
  pickPixelRatio() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const byArea = Math.sqrt(4.2e6 / Math.max(1, w * h));
    return Math.max(0.75, Math.min(window.devicePixelRatio || 1, this.maxPR, byArea));
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(this.pickPixelRatio());
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
