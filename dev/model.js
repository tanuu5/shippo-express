import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CourierModel } from '../src/character/CourierModel.js';
import { CourierAnimator } from '../src/character/CourierAnimator.js';

// 開発用：キャラクターを参照画像と同じ構図で表示し、ポーズ・表情・カメラを切り替えて撮影する
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xafafb4);

const hemi = new THREE.HemisphereLight(0xffffff, 0xb8b0b0, 1.9);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.5);
key.position.set(-1.2, 3, 3.2);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -1.2;
key.shadow.camera.right = 1.2;
key.shadow.camera.top = 2;
key.shadow.camera.bottom = -0.4;
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.01;
scene.add(key);
const rim = new THREE.DirectionalLight(0xfff4ee, 0.6);
rim.position.set(2, 2, -3);
scene.add(rim);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const model = new CourierModel();
scene.add(model.root);
const anim = new CourierAnimator(model);

const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.05, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.74, 0);

const VIEWS = {
  ref: { pos: [0, 0.76, 3.58], target: [0, 0.74, 0], fov: 25 },
  q3: { pos: [2.2, 1.0, 2.8], target: [0, 0.74, 0], fov: 25 },
  side: { pos: [3.58, 0.76, 0], target: [0, 0.74, 0], fov: 25 },
  back: { pos: [0, 0.9, -3.58], target: [0, 0.74, 0], fov: 25 },
  backHigh: { pos: [0, 2.2, -4.2], target: [0, 0.9, 0], fov: 40 },
  face: { pos: [0, 1.33, 0.9], target: [0, 1.31, 0], fov: 25 },
  faceQ: { pos: [0.55, 1.36, 0.7], target: [0, 1.31, 0], fov: 25 },
  faceLow: { pos: [0.04, 1.16, 0.85], target: [0, 1.29, 0], fov: 28 },
  faceUnder: { pos: [0.02, 1.0, 0.5], target: [0, 1.29, 0], fov: 34 },
  top: { pos: [0, 3.6, 0.6], target: [0, 0.7, 0], fov: 25 },
};
function setView(name) {
  const v = VIEWS[name];
  camera.position.set(...v.pos);
  controls.target.set(...v.target);
  camera.fov = v.fov;
  camera.updateProjectionMatrix();
  controls.update();
  state.view = name;
  refreshUI();
}

const state = { mode: 'ref', speed: 0, sprint: false, paused: false, view: 'ref', carry: false, expr: null };
const MODES = {
  ref: { mode: 'ref', speed: 0 },
  idle: { mode: 'ground', speed: 0 },
  run: { mode: 'ground', speed: 7.5 },
  sprint: { mode: 'ground', speed: 12, sprint: true },
  jump: { mode: 'air', speed: 6, vy: 5 },
  fall: { mode: 'air', speed: 6, vy: -8 },
  glide: { mode: 'glide', speed: 9, vy: -2 },
  slide: { mode: 'slide', speed: 10 },
  hit: { mode: 'hit', speed: 0 },
  cheer: { mode: 'cheer', speed: 0 },
  wave: { mode: 'wave', speed: 0 },
};
let modeName = 'ref';

const ui = document.getElementById('ui');
function btn(label, on, fn) {
  const b = document.createElement('button');
  b.textContent = label;
  if (on) b.classList.add('on');
  b.onclick = fn;
  ui.appendChild(b);
}
function refreshUI() {
  ui.innerHTML = '';
  for (const m of Object.keys(MODES)) btn(m, m === modeName, () => ((modeName = m), refreshUI()));
  btn('|', false, () => {});
  for (const v of Object.keys(VIEWS)) btn('📷' + v, v === state.view, () => setView(v));
  btn('|', false, () => {});
  for (const e of ['auto', 'smug', 'blink', 'happy', 'surprised', 'determined', 'dizzy', 'open']) {
    btn(e, (state.expr || 'auto') === e, () => {
      state.expr = e === 'auto' ? null : e;
      refreshUI();
    });
  }
  btn(state.carry ? '📦on' : '📦off', state.carry, () => {
    state.carry = !state.carry;
    model.setCarrying(state.carry);
    refreshUI();
  });
  btn(state.paused ? '▶' : '⏸', state.paused, () => {
    state.paused = !state.paused;
    refreshUI();
  });
  btn('twirl', false, () => anim.triggerTwirl());
  btn('land', false, () => anim.triggerLand(1));
}
setView('ref');

let last = performance.now();
let simTime = 0;
function step(dt) {
  simTime += dt;
  const m = MODES[modeName];
  const s = { ...m, runSpeed: 8, carry: state.carry };
  anim.update(dt, s);
  if (state.expr) model.setExpression(state.expr);
  const vel = new THREE.Vector3(0, m.vy && m.mode !== 'glide' ? 0 : 0, m.speed || 0);
  if (m.mode === 'glide') vel.y = -2;
  if (m.mode === 'air') vel.y = m.vy;
  model.update(dt, {
    velocity: vel,
    flutter: Math.min(1, (m.speed || 0) / 12),
    wag: m.mode === 'cheer' ? 1 : m.mode === 'idle' || m.mode === 'ground' ? 0.25 : 0.1,
    wagSpeed: m.mode === 'cheer' ? 14 : 5,
  });
}
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.paused) step(dt);
  controls.update();
  renderer.render(scene, camera);
  document.getElementById('info').textContent = `mode=${modeName} view=${state.view} tris=${renderer.info.render.triangles} calls=${renderer.info.render.calls}`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

// 撮影：指定サイズで描いて dev サーバーへ送る
window.__shot = async (name, w = 1086, h = 1448, opts = {}) => {
  if (opts.mode) modeName = opts.mode;
  if (opts.view) setView(opts.view);
  state.expr = opts.expr === undefined ? 'smug' : opts.expr;
  if (opts.settle) for (let i = 0; i < opts.settle; i++) step(1 / 60);
  const prevPR = renderer.getPixelRatio();
  const cw = window.innerWidth;
  const ch = window.innerHeight;
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  renderer.setPixelRatio(prevPR);
  renderer.setSize(cw, ch);
  camera.aspect = cw / ch;
  camera.updateProjectionMatrix();
  const r = await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: url });
  return r.ok ? 'saved ' + name : 'fail';
};
window.__state = state;
window.__model = model;
window.__setMode = (m) => {
  modeName = m;
  refreshUI();
};
window.__step = step;
