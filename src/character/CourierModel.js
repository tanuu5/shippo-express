import * as THREE from 'three';
import { toonMat } from './materials.js';
import { PALETTE } from './palette.js';
import { limbGeometry, ellipsoid, colorize, mergeColored, earGeometry, lockGeometry, cordGeometry } from './geom.js';
import { createFaceTextures, FACE_UV } from './faceTexture.js';
import { buildHair } from './Hair.js';
import { Poncho } from './Poncho.js';
import { Tail } from './Tail.js';
import { buildBootGeometry } from './Boots.js';

// 参照画像の子（ケモ耳・ポンチョの配達員）をコードだけで組んだモデル。
// 単位は m、足元が原点、正面が +Z。全身 1.46m（耳先 1.52m）。
// 比率は参照画像の実測（頭身 約5.9、股下 0.68m、ブーツ 0.24m など）に合わせている。

const HEAD_C = new THREE.Vector3(0, 0.128, 0.006); // 頭ジョイントから見た頭の中心

function skullDeform(x, y, z) {
  // 単位球 → アニメ調の丸顔（丸い頭蓋、ふっくらした頬、小さく丸いあご）
  let X = x * 0.084;
  let Y = y * 0.104;
  let Z = z * 0.09;
  if (y < 0) {
    const d = -y;
    // あごへのすぼまりは弱く、いちばん下だけ丸める（V 字にしない）
    X *= 1 - 0.08 * Math.pow(d, 2.6);
    Z *= 1 - 0.08 * d * d;
    const backness = THREE.MathUtils.smoothstep(0.45 - z, 0, 1.1);
    Y += 0.104 * 0.42 * d * d * backness;
    // あご先は前へ少しだけ（とがらせない）。顔の下半分をわずかに詰めて幼い丸顔に
    Y -= 0.004 * d * d * Math.max(0, z);
    Y *= 1 - 0.05 * d * d * Math.max(0, z);
    Z += 0.008 * d * d * Math.max(0, z);
  }
  if (z > 0) Z *= 1 - 0.07 * z * z * (1 - Math.abs(y));
  // 頬のふくらみ：目の下〜口の横を、横と前にふっくら
  const cheek = Math.exp(-(((y + 0.6) / 0.27) ** 2)) * THREE.MathUtils.smoothstep(z, -0.25, 0.35);
  X *= 1 + 0.22 * cheek;
  Z *= 1 + 0.045 * cheek;
  return [X, Y, Z];
}

function skullGeometry(phiStart, phiLen, thetaStart, thetaLen, grow = 0) {
  const g = new THREE.SphereGeometry(1, 56, 44, phiStart, phiLen, thetaStart, thetaLen);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [X, Y, Z] = skullDeform(p.getX(i), p.getY(i), p.getZ(i));
    const L = Math.hypot(X, Y, Z) || 1;
    const k = 1 + grow / L;
    p.setXYZ(i, HEAD_C.x + X * k, HEAD_C.y + Y * k, HEAD_C.z + Z * k);
  }
  g.computeVertexNormals();
  return g;
}

function makeHand(side) {
  const parts = [];
  const palm = ellipsoid(0.024, 0.03, 0.012, 14, 10);
  palm.translate(0, -0.03, 0.002);
  parts.push(colorize(palm, PALETTE.skin));
  const fingers = [
    [-0.014, 0.024],
    [-0.005, 0.028],
    [0.005, 0.027],
    [0.014, 0.022],
  ];
  for (const [x, len] of fingers) {
    const f = limbGeometry(len, [
      [0, 0.0062],
      [1, 0.0052],
    ], 8);
    f.rotateX(-0.25);
    f.translate(x, -0.052, 0.004);
    parts.push(colorize(f, PALETTE.skin));
  }
  const th = limbGeometry(0.022, [
    [0, 0.0068],
    [1, 0.0056],
  ], 8);
  th.rotateZ(side * 0.9);
  th.rotateX(-0.4);
  th.translate(side * -0.018, -0.03, 0.01);
  parts.push(colorize(th, PALETTE.skin));
  return mergeColored(parts);
}

export class CourierModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'courier';
    this.mats = {
      skin: toonMat(PALETTE.skin),
      vcol: toonMat(0xffffff, { vertexColors: true }),
      tights: toonMat(PALETTE.tights),
      shorts: toonMat(PALETTE.shorts),
      coat: toonMat(PALETTE.coat),
      under: toonMat(PALETTE.undershirt),
      hair: toonMat(0xffffff, { vertexColors: true }),
    };
    this.faceTextures = createFaceTextures();
    this.expression = 'smug';
    this._buildRig();
    this._buildBody();
    this._buildHead();
    this._buildCoat();
    this._buildExtras();

    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = o.castShadow || false;
        if (o.userData.noShadow !== true && o.name !== 'face') o.castShadow = true;
      }
    });

    // 二次運動の状態
    this._prevChest = new THREE.Vector3();
    this._prevVel = new THREE.Vector3();
    this._accel = new THREE.Vector3();
    this._first = true;
    this.spring = {
      hairBack: { x: 0, vx: 0, z: 0, vz: 0 },
      hairL: { x: 0, vx: 0 },
      hairR: { x: 0, vx: 0 },
      ahoge: { x: 0, vx: 0, z: 0, vz: 0 },
      cordL: { x: 0, vx: 0, z: 0, vz: 0 },
      cordR: { x: 0, vx: 0, z: 0, vz: 0 },
    };
    this._m1 = new THREE.Matrix4();
    this._m2 = new THREE.Matrix4();
    this._inv = new THREE.Matrix4();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._restUp = [new THREE.Matrix4(), new THREE.Matrix4()];
    this._restFo = [new THREE.Matrix4(), new THREE.Matrix4()];
    this._computePonchoRest();
    this.armDelta = [
      { up: new THREE.Matrix4(), fore: new THREE.Matrix4() },
      { up: new THREE.Matrix4(), fore: new THREE.Matrix4() },
    ];
    this.capsules = [
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.078 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.062 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.078 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.062 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.07 },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.07 },
    ];

    this.root.userData.sculptRuntime = {
      nodes: this.j,
      meshes: this.meshList(),
      sockets: { back: this.packageSocket, handL: this.j.wristL, handR: this.j.wristR },
    };
  }

  meshList() {
    const list = [];
    this.root.traverse((o) => {
      if (o.isMesh) list.push(o.name);
    });
    return list;
  }

  _joint(name, parent, x, y, z) {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    parent.add(g);
    this.j[name] = g;
    return g;
  }

  _buildRig() {
    this.j = {};
    const r = this.root;
    const pivot = this._joint('pivot', r, 0, 0.72, 0);
    const hips = this._joint('hips', pivot, 0, -0.02, 0);
    const spine = this._joint('spine', hips, 0, 0.08, 0);
    const chest = this._joint('chest', spine, 0, 0.17, 0);
    const neck = this._joint('neck', chest, 0, 0.18, -0.005);
    this._joint('head', neck, 0, 0.07, 0.005);
    for (const [s, sg] of [
      ['L', 1],
      ['R', -1],
    ]) {
      const arm = this._joint('arm' + s, chest, sg * 0.115, 0.15, 0);
      const elbow = this._joint('elbow' + s, arm, 0, -0.2, 0);
      this._joint('wrist' + s, elbow, 0, -0.19, 0);
      const thigh = this._joint('thigh' + s, hips, sg * 0.08, -0.02, 0);
      const knee = this._joint('knee' + s, thigh, 0, -0.305, 0);
      this._joint('ankle' + s, knee, 0, -0.29, 0);
    }
  }

  _mesh(name, geo, mat, parent) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    parent.add(m);
    return m;
  }

  _buildBody() {
    const j = this.j;
    const M = this.mats;
    for (const s of ['L', 'R']) {
      const sg = s === 'L' ? 1 : -1;
      this._mesh('thigh' + s, limbGeometry(0.305, [
        [0, 0.056],
        [0.45, 0.048],
        [1, 0.037],
      ]), M.tights, j['thigh' + s]);
      this._mesh('shin' + s, limbGeometry(0.29, [
        [0, 0.037],
        [0.28, 0.04],
        [0.75, 0.03],
        [1, 0.027],
      ]), M.tights, j['knee' + s]);
      const boot = this._mesh('boot' + s, buildBootGeometry(sg), M.vcol, j['ankle' + s]);
      boot.userData.part = 'boot';
      // 腕（袖の中なのでコートと同じ色）＋ 手首のカフス ＋ 手
      this._mesh('upperArm' + s, limbGeometry(0.2, [
        [0, 0.04],
        [1, 0.034],
      ]), M.coat, j['arm' + s]);
      this._mesh('forearm' + s, limbGeometry(0.19, [
        [0, 0.034],
        [1, 0.029],
      ]), M.coat, j['elbow' + s]);
      const cuff = new THREE.CylinderGeometry(0.036, 0.045, 0.06, 18, 1, true);
      cuff.translate(0, -0.16, 0);
      const cm = this._mesh('cuff' + s, cuff, toonMat(PALETTE.coat, { side: THREE.DoubleSide }), j['elbow' + s]);
      cm.userData.noShadow = true;
      this._mesh('hand' + s, makeHand(sg), M.vcol, j['wrist' + s]);
      // ショートパンツの裾（ゆったりしたキュロット風）
      const leg = new THREE.CylinderGeometry(0.066, 0.072, 0.085, 20, 1, true);
      leg.translate(0, -0.035, 0);
      const lm = this._mesh('shortsLeg' + s, leg, toonMat(PALETTE.shorts, { side: THREE.DoubleSide }), j['thigh' + s]);
      lm.userData.noShadow = true;
    }
    // 腰まわり（下がふくらみすぎないよう、上下につぶした形）
    const pelvis = ellipsoid(0.1, 0.075, 0.084, 24, 16);
    pelvis.translate(0, 0.03, -0.004);
    this._mesh('shorts', pelvis, M.shorts, j.hips);
    // 胴（ほぼポンチョの中）
    const torso = ellipsoid(0.085, 0.16, 0.068, 20, 14);
    torso.translate(0, -0.01, 0);
    this._mesh('torso', torso, M.under, j.chest);
    // 首と、襟元から見えるインナー
    // 首：細く、あごの下の影になる色で
    // 上端は頭の中、下端はインナーの襟の中に隠す
    const neck = limbGeometry(0.1, [
      [0, 0.025],
      [1, 0.027],
    ], 14);
    neck.translate(0, 0.058, -0.008);
    this._mesh('neck', neck, toonMat(0xeccbc0), j.head);
    // インナーの襟：首に沿って、コートの襟ぐりとのすき間をふさぐ
    const collar = new THREE.CylinderGeometry(0.026, 0.088, 0.1, 24, 2, true);
    collar.translate(0, 0.186, 0.002);
    this._mesh('innerCollar', collar, toonMat(PALETTE.undershirt, { side: THREE.DoubleSide }), j.chest);
  }

  _buildHead() {
    const head = this.j.head;
    head.scale.setScalar(1.07);
    const M = this.mats;
    this._mesh('skull', skullGeometry(0, Math.PI * 2, 0, Math.PI), M.skin, head);
    // 顔のデカール（正面の平行投影 UV）
    const fg = skullGeometry(Math.PI / 2 - 1.15, 2.3, 0.95, Math.PI - 0.95, 0.0006);
    const p = fg.attributes.position;
    const uv = fg.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) - HEAD_C.x;
      const y = p.getY(i) - HEAD_C.y;
      uv.setXY(i, 0.5 + x / (2 * FACE_UV.halfWidth), (y - FACE_UV.bottom) / (FACE_UV.top - FACE_UV.bottom));
    }
    this.faceMat = toonMat(0xffffff, {
      map: this.faceTextures.smug,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const face = this._mesh('face', fg, this.faceMat, head);
    face.renderOrder = 2;
    face.userData.noShadow = true;

    // 髪
    const hair = buildHair(HEAD_C);
    this._mesh('hairStatic', hair.staticGeo, M.hair, head);
    this.hairBackPivot = new THREE.Group();
    this.hairBackPivot.name = 'hairBackPivot';
    this.hairBackPivot.position.set(0, HEAD_C.y + 0.06, HEAD_C.z - 0.02);
    head.add(this.hairBackPivot);
    const hb = this._mesh('hairBack', hair.backGeo, M.hair, this.hairBackPivot);
    hb.position.set(0, -(HEAD_C.y + 0.06), -(HEAD_C.z - 0.02));
    this.hairSidePivot = [];
    for (let k = 0; k < 2; k++) {
      const sg = k === 0 ? 1 : -1;
      const pv = new THREE.Group();
      pv.name = 'hairSidePivot' + (k === 0 ? 'L' : 'R');
      pv.position.set(sg * 0.075, HEAD_C.y + 0.01, HEAD_C.z);
      head.add(pv);
      const m = this._mesh('hairSide' + (k === 0 ? 'L' : 'R'), hair.sideGeo[k], M.hair, pv);
      m.position.set(-sg * 0.075, -(HEAD_C.y + 0.01), -HEAD_C.z);
      this.hairSidePivot.push(pv);
    }
    this.ahogePivot = new THREE.Group();
    this.ahogePivot.name = 'ahogePivot';
    this.ahogePivot.position.set(0, HEAD_C.y + 0.112, HEAD_C.z + 0.012);
    head.add(this.ahogePivot);
    const ah = this._mesh('ahoge', hair.ahogeGeo, M.hair, this.ahogePivot);
    ah.position.copy(this.ahogePivot.position).negate();

    // 耳
    this.ears = [];
    const earGeo = earGeometry({ height: 0.134, width: 0.096, depth: 0.033, lean: 0.02, outer: PALETTE.earOuter, inner: PALETTE.earInner, rim: PALETTE.earOuter });
    const fluffParts = [];
    const fl = [
      [-0.022, 0.0, 0.1, 0.012],
      [-0.008, 0.0, 0.0, 0.014],
      [0.008, 0.0, -0.05, 0.014],
      [0.022, 0.0, -0.12, 0.012],
      [0.0, 0.01, 0.04, 0.011],
    ];
    for (const [x, y, lean, w] of fl) {
      const pts = [
        new THREE.Vector3(x, y, -0.004),
        new THREE.Vector3(x * 1.1 + lean * 0.05, 0.03, 0.006),
        new THREE.Vector3(x * 1.25 + lean * 0.12, 0.055, 0.016),
        new THREE.Vector3(x * 1.35 + lean * 0.2, 0.072, 0.022),
      ];
      fluffParts.push(
        lockGeometry(pts, {
          center: new THREE.Vector3(x, 0.03, -0.04),
          width: (t) => w * (1 - t * 0.9),
          thick: (t) => 0.005 * (1 - t * 0.7),
          segs: 8,
          radial: 6,
          colorRoot: PALETTE.earFluff,
          colorTip: PALETTE.earFluff,
          colorInner: 0xeadfdb,
        }),
      );
    }
    const fluffGeo = mergeColored(fluffParts);
    for (const [s, sg] of [
      ['L', 1],
      ['R', -1],
    ]) {
      const pv = new THREE.Group();
      pv.name = 'ear' + s;
      pv.position.set(HEAD_C.x + sg * 0.07, HEAD_C.y + 0.07, HEAD_C.z - 0.016);
      pv.rotation.set(-0.12, sg * 0.28, -sg * 0.5, 'YXZ');
      head.add(pv);
      const e = this._mesh('earShell' + s, earGeo, M.vcol, pv);
      e.userData.part = 'ear';
      this._mesh('earFluff' + s, fluffGeo, M.vcol, pv);
      this.ears.push({ pivot: pv, side: sg, base: pv.rotation.clone() });
    }
  }

  _buildCoat() {
    const chest = this.j.chest;
    this.poncho = new Poncho({ armSpread: (44 * Math.PI) / 180 });
    chest.add(this.poncho.group);

    // フード：首まわりを大きく包むふっくらした襟（前で左右の端がファスナーへ下りる）
    const pts = [];
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const a = 0.2 + (i / n) * (Math.PI * 2 - 0.4); // 0 が正面
      const front = Math.max(0, Math.cos(a));
      const back = Math.max(0, -Math.cos(a));
      // 首の両脇では首に寄り添って高く、背中側は大きく広がる
      const r = 0.086 + 0.05 * (1 - Math.cos(a)) * 0.5;
      const y = 0.232 - 0.075 * Math.pow(front, 5) + 0.01 * back;
      pts.push(new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r * 0.95 - 0.018));
    }
    const hoodRoll = lockGeometry(pts, {
      center: new THREE.Vector3(0, 0.21, -0.02),
      flatAxis: () => new THREE.Vector3(0, 1, 0),
      width: (t) => 0.028 + 0.036 * Math.pow(Math.sin(Math.PI * t), 0.5),
      thick: (t) => 0.024 + 0.03 * Math.pow(Math.sin(Math.PI * t), 0.5),
      segs: 56,
      radial: 14,
      colorRoot: PALETTE.coat,
      colorMid: PALETTE.coat,
      colorTip: PALETTE.coat,
      colorInner: 0xd8c3ba,
    });
    const hood = this._mesh('hoodRoll', hoodRoll, this.mats.vcol, chest);
    hood.userData.part = 'hood';
    // 背中に垂れたフード本体
    const hb = new THREE.SphereGeometry(1, 30, 20, Math.PI, Math.PI, 0.2, Math.PI * 0.66);
    hb.scale(0.15, 0.15, 0.085);
    hb.rotateX(0.28);
    hb.translate(0, 0.13, -0.125);
    colorize(hb, PALETTE.coat);
    const hoodBack = this._mesh('hoodBack', hb, toonMat(0xffffff, { vertexColors: true, side: THREE.DoubleSide }), chest);
    hoodBack.userData.part = 'hood';
    // フードの口のふち（茶色）
    const rimPts = [];
    for (let i = 0; i <= 24; i++) {
      const a = Math.PI * (0.12 + (i / 24) * 0.76);
      rimPts.push(new THREE.Vector3(Math.cos(a) * 0.148, 0.262 + Math.sin(a) * 0.03, -0.06 - Math.sin(a) * 0.105));
    }
    this._mesh('hoodRim', cordGeometry(rimPts, 0.008, PALETTE.trim, 28, 6), this.mats.vcol, chest);

    // ファスナーの引き手
    const zip = new THREE.BoxGeometry(0.013, 0.032, 0.006);
    zip.translate(0, 0.135, 0.147);
    this._mesh('zipPull', colorize(zip, PALETTE.strap), this.mats.vcol, chest);

    // ドローコード（ばねで揺れる）＋金属のループ＋チューリップ形の房
    this.cords = [];
    for (const [s, sg] of [
      ['L', 1],
      ['R', -1],
    ]) {
      const pv = new THREE.Group();
      pv.name = 'cordPivot' + s;
      pv.position.set(sg * 0.05, 0.19, 0.128);
      chest.add(pv);
      const parts = [];
      parts.push(cordGeometry([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -0.07, 0.028), new THREE.Vector3(0, -0.15, 0.04), new THREE.Vector3(0, -0.19, 0.044)], 0.0055, PALETTE.cord, 14, 6));
      const grom = new THREE.TorusGeometry(0.011, 0.0028, 6, 4);
      grom.rotateZ(Math.PI / 4);
      grom.scale(1, 1.3, 1);
      grom.translate(0, -0.03, 0.017);
      parts.push(colorize(grom, PALETTE.metal));
      const cap = new THREE.CylinderGeometry(0.005, 0.014, 0.028, 12);
      cap.translate(0, -0.203, 0.045);
      parts.push(colorize(cap, PALETTE.strap));
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.3;
        const pet = ellipsoid(0.01, 0.025, 0.01, 10, 8);
        pet.rotateZ(Math.sin(a) * 0.28);
        pet.rotateX(Math.cos(a) * 0.28);
        pet.translate(Math.sin(a) * 0.007, -0.232, 0.045 + Math.cos(a) * 0.007);
        parts.push(colorize(pet, PALETTE.earFluff));
      }
      this._mesh('cord' + s, mergeColored(parts), this.mats.vcol, pv);
      this.cords.push(pv);
    }
  }

  _buildExtras() {
    // 背負う荷物（段ボール箱）
    this.packageSocket = new THREE.Group();
    this.packageSocket.name = 'packageSocket';
    this.packageSocket.position.set(0, -0.02, -0.225);
    this.j.chest.add(this.packageSocket);
    const W = 256;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = W;
    const g = cv.getContext('2d');
    g.fillStyle = '#c9a476';
    g.fillRect(0, 0, W, W);
    g.fillStyle = 'rgba(120,80,40,0.08)';
    for (let i = 0; i < 40; i++) g.fillRect(0, i * 7, W, 2);
    g.fillStyle = '#e9dcc4';
    g.fillRect(W * 0.42, 0, W * 0.16, W);
    g.fillStyle = '#fbf6ef';
    g.fillRect(W * 0.08, W * 0.62, W * 0.3, W * 0.22);
    g.fillStyle = '#a58884';
    g.beginPath();
    g.ellipse(W * 0.73, W * 0.35, 20, 16, 0, 0, Math.PI * 2);
    g.fill();
    for (const [x, y] of [
      [-22, -20],
      [-8, -30],
      [8, -30],
      [22, -20],
    ]) {
      g.beginPath();
      g.ellipse(W * 0.73 + x, W * 0.35 + y, 7, 9, 0, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const box = new THREE.BoxGeometry(0.27, 0.22, 0.17);
    this.packageMesh = this._mesh('package', box, toonMat(0xffffff, { map: tex }), this.packageSocket);
    this.packageMesh.visible = false;
    // 肩ベルト
    const strapGeo = [];
    for (const sg of [1, -1]) {
      const pts = [new THREE.Vector3(sg * 0.07, 0.11, 0.0), new THREE.Vector3(sg * 0.09, 0.21, 0.1), new THREE.Vector3(sg * 0.1, 0.24, 0.2), new THREE.Vector3(sg * 0.1, 0.19, 0.3)];
      strapGeo.push(cordGeometry(pts, 0.009, PALETTE.strap, 12, 6));
    }
    this.packageStraps = this._mesh('packageStraps', mergeColored(strapGeo), this.mats.vcol, this.packageSocket);
    this.packageStraps.visible = false;
    this.tail = new Tail();
    this.root.add(this.tail.mesh);
  }

  setCarrying(on) {
    this.packageMesh.visible = on;
    this.packageStraps.visible = on;
    this.carrying = on;
  }

  setExpression(name) {
    if (this.expression === name || !this.faceTextures[name]) return;
    this.expression = name;
    this.faceMat.map = this.faceTextures[name];
  }

  _computePonchoRest() {
    // ポンチョの基準姿勢（腕を 44° 開いた A ポーズ）での、胸から見た腕の行列
    for (let k = 0; k < 2; k++) {
      const sg = k === 0 ? 1 : -1;
      const up = new THREE.Matrix4().compose(new THREE.Vector3(sg * 0.115, 0.15, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, sg * this.poncho.armSpread)), new THREE.Vector3(1, 1, 1));
      const el = new THREE.Matrix4().makeTranslation(0, -0.2, 0);
      this._restUp[k].copy(up).invert();
      this._restFo[k].multiplyMatrices(up, el).invert();
    }
  }

  // env: { dt, velocity:Vector3(ワールド), wind?:Vector3, flutter?:number, wag?, wagSpeed?, tailLift?, time }
  update(dt, env = {}) {
    dt = Math.min(dt, 1 / 20);
    const j = this.j;
    this.root.updateMatrixWorld(true);

    // 胸の加速度（ポンチョの慣性用）
    const chestW = this._v1.setFromMatrixPosition(j.chest.matrixWorld);
    if (this._first) {
      this._prevChest.copy(chestW);
      this._first = false;
    }
    const vel = this._v2.subVectors(chestW, this._prevChest).divideScalar(Math.max(dt, 1e-3));
    this._prevChest.copy(chestW);
    const accW = vel.clone().sub(this._prevVel).divideScalar(Math.max(dt, 1e-3));
    this._prevVel.lerp(vel, 0.5);
    this._accel.lerp(accW.clampLength(0, 60), 0.2);

    // 胸ローカルへ
    const chestInv = this._inv.copy(j.chest.matrixWorld).invert();
    const rot = new THREE.Matrix4().extractRotation(chestInv);
    const accelLocal = this._accel.clone().applyMatrix4(rot);
    const wind = (env.wind ? env.wind.clone() : new THREE.Vector3()).sub(env.velocity || vel);
    const windLocal = wind.applyMatrix4(rot);

    // 腕の差分行列
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? 'L' : 'R';
      const arm = j['arm' + s];
      const elbow = j['elbow' + s];
      arm.updateMatrix();
      elbow.updateMatrix();
      this.armDelta[k].up.multiplyMatrices(arm.matrix, this._restUp[k]);
      this._m1.multiplyMatrices(arm.matrix, elbow.matrix);
      this.armDelta[k].fore.multiplyMatrices(this._m1, this._restFo[k]);
    }
    // 脚・しっぽのカプセル
    const P = (obj, out) => out.setFromMatrixPosition(obj.matrixWorld).applyMatrix4(chestInv);
    P(j.thighL, this.capsules[0].a);
    P(j.kneeL, this.capsules[0].b);
    P(j.kneeL, this.capsules[1].a);
    P(j.ankleL, this.capsules[1].b);
    P(j.thighR, this.capsules[2].a);
    P(j.kneeR, this.capsules[2].b);
    P(j.kneeR, this.capsules[3].a);
    P(j.ankleR, this.capsules[3].b);
    const tp = this.tail.capsulePoints();
    this.capsules[4].a.copy(tp[0]).applyMatrix4(chestInv);
    this.capsules[4].b.copy(tp[1]).applyMatrix4(chestInv);
    this.capsules[5].a.copy(tp[1]).applyMatrix4(chestInv);
    this.capsules[5].b.copy(tp[2]).applyMatrix4(chestInv);

    this.poncho.update({
      dt,
      armDelta: this.armDelta,
      accelLocal,
      windLocal,
      capsules: this.capsules,
      boxBack: this.carrying ? -0.13 : null,
      flutter: env.flutter || 0,
    });

    // しっぽ
    const rootInv = this._m2.copy(this.root.matrixWorld).invert();
    this.tail.update(dt, j.hips.matrixWorld, rootInv, { wag: env.wag || 0, wagSpeed: env.wagSpeed || 7, lift: env.tailLift || 0 });

    // 髪・アホ毛・ドローコードのばね（頭／胸の加速度に遅れてついてくる）
    const sp = this.spring;
    const ax = accelLocal.x;
    const az = accelLocal.z;
    const ay = accelLocal.y;
    const stepSpring = (s, key, target, k = 120, d = 10) => {
      const vk = 'v' + key;
      s[vk] += ((target - s[key]) * k - s[vk] * d) * dt;
      s[key] += s[vk] * dt;
    };
    // 回転の向き：下に垂れた部位は +X 回転で後ろ(-Z)へ、上に立つアホ毛は -X 回転で後ろへ倒れる
    const windBack = Math.max(0, -windLocal.z);
    const windUp = Math.max(0, windLocal.y);
    stepSpring(sp.hairBack, 'x', THREE.MathUtils.clamp(az * 0.006 + windBack * 0.012 + ay * 0.002, -0.25, 0.4));
    stepSpring(sp.hairBack, 'z', THREE.MathUtils.clamp(-ax * 0.006, -0.2, 0.2));
    this.hairBackPivot.rotation.set(sp.hairBack.x * 0.6, 0, sp.hairBack.z * 0.6);
    stepSpring(sp.hairL, 'x', THREE.MathUtils.clamp(az * 0.006 + windBack * 0.01, -0.3, 0.4), 140, 9);
    stepSpring(sp.hairR, 'x', THREE.MathUtils.clamp(az * 0.006 + windBack * 0.01, -0.3, 0.4), 150, 9);
    this.hairSidePivot[0].rotation.x = sp.hairL.x * 0.5;
    this.hairSidePivot[1].rotation.x = sp.hairR.x * 0.5;
    stepSpring(sp.ahoge, 'x', THREE.MathUtils.clamp(az * 0.01 + ay * 0.006 + windBack * 0.02, -0.6, 0.6), 220, 7);
    stepSpring(sp.ahoge, 'z', THREE.MathUtils.clamp(ax * 0.01, -0.5, 0.5), 220, 7);
    this.ahogePivot.rotation.set(-sp.ahoge.x, 0, sp.ahoge.z);
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? sp.cordL : sp.cordR;
      stepSpring(s, 'x', THREE.MathUtils.clamp(az * 0.01 + windBack * 0.03 - windUp * 0.05, -1.2, 0.6), 90 + k * 10, 5);
      stepSpring(s, 'z', THREE.MathUtils.clamp(-ax * 0.01, -0.5, 0.5), 90 + k * 10, 5);
      // 胸より内側（+X 回転側）には入れない
      this.cords[k].rotation.set(Math.min(0.04, s.x), 0, s.z);
    }
  }
}
