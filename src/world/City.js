import * as THREE from 'three';
import { makeCityPlan, QUAY_Z } from './cityPlan.js';
import { CollisionWorld } from './Collision.js';
import { MeshBuilder } from './MeshBuilder.js';
import { buildGround, finishGround, buildBuildings, SignAtlas, addFreeSign } from './cityBuild.js';
import { PropSystem, buildHedges, merge } from './props.js';
import { buildLandmarks } from './landmarks.js';
import { makeBuildingMaterial, vcolMat } from './materials.js';
import { makeSkyDome, makeClouds, makeHills, makeFarGround, makeSea } from './sky.js';

// 街全体：設計図→メッシュ・当たり判定・動くもの（観覧車・列車・時計）
export class City {
  constructor(scene) {
    this.scene = scene;
    this.plan = makeCityPlan();
    this.col = new CollisionWorld(8);
    this.group = new THREE.Group();
    this.group.name = 'city';
    scene.add(this.group);
    this.anim = [];
    this.water = [];
    this.pools = [];
    this.fountains = [];

    const groundMB = new MeshBuilder({ uv: 2, aKind: 2 });
    buildGround(this.plan, this.col, groundMB);

    this.props = new PropSystem(this.group, this.col);
    this.props.fromPlan(this.plan);

    this.signAtlas = new SignAtlas();
    const { meshes, signs } = buildBuildings(this.plan, this.col, this.signAtlas);
    for (const m of meshes) this.group.add(m);

    const ctx = {
      g: groundMB,
      b: new MeshBuilder({ uv: 2, color: 3, aWin: 4 }),
      v: [],
      col: this.col,
      props: this.props,
      group: this.group,
      anim: this.anim,
      water: this.water,
      pools: this.pools,
      fountains: this.fountains,
      signs: [],
    };
    buildLandmarks(this.plan, ctx);

    this.group.add(finishGround(groundMB));
    if (ctx.b.count) {
      const lm = new THREE.Mesh(ctx.b.build(), makeBuildingMaterial());
      lm.castShadow = true;
      lm.receiveShadow = true;
      lm.name = 'landmarkBuildings';
      this.group.add(lm);
    }
    if (ctx.v.length) {
      const vm = new THREE.Mesh(merge(ctx.v), vcolMat());
      vm.castShadow = true;
      vm.receiveShadow = true;
      vm.name = 'landmarkParts';
      this.group.add(vm);
    }
    const hedges = buildHedges(this.plan, this.col);
    if (hedges) this.group.add(hedges);
    this.props.build();

    for (const s of ctx.signs) addFreeSign(signs, this.signAtlas, s);
    if (signs.count) {
      const sm = new THREE.Mesh(signs.build(), new THREE.MeshStandardMaterial({ map: this.signAtlas.texture, roughness: 0.7, emissive: 0xffffff, emissiveMap: this.signAtlas.texture, emissiveIntensity: 0.18, polygonOffset: true, polygonOffsetFactor: -1 }));
      sm.name = 'signs';
      this.group.add(sm);
    }
    // フォントが読み込まれたら看板を描き直す
    if (document.fonts && document.fonts.load) {
      document.fonts.load('800 48px "M PLUS Rounded 1c"').then(() => this.signAtlas.redraw()).catch(() => {});
    }

    // 空・遠景
    this.sky = makeSkyDome();
    scene.add(this.sky);
    this.clouds = makeClouds();
    scene.add(this.clouds);
    scene.add(makeHills());
    scene.add(makeFarGround());
    this.sea = makeSea();
    scene.add(this.sea);
    this.water.push(this.sea);

    this.destinations = this.plan.destinations;
    this.spots = this.plan.spots;
    this.time = 0;
  }

  // 水の中（池・噴水・海）か
  waterAt(x, z) {
    for (const p of this.pools) {
      const dx = (x - p.x) / (p.sx || 1);
      const dz = z - p.z;
      if (dx * dx + dz * dz < p.r * p.r) return p;
    }
    return null;
  }

  isSea(x, z) {
    return z > QUAY_Z;
  }

  update(dt, camera) {
    this.time += dt;
    for (const f of this.anim) f(this.time, dt);
    for (const w of this.water) {
      const u = w.material.userData.uniforms;
      if (u) u.uTime.value = this.time;
    }
    if (camera) {
      this.sky.position.copy(camera.position);
      this.clouds.position.set(camera.position.x * 0.7, 0, camera.position.z * 0.7);
      this.clouds.rotation.y = this.time * 0.002;
    }
  }
}
