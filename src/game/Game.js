import * as THREE from 'three';
import { Stage } from './Renderer.js';
import { City } from '../world/City.js';
import { CourierModel } from '../character/CourierModel.js';
import { CourierAnimator } from '../character/CourierAnimator.js';
import { Player } from './Player.js';
import { FollowCamera } from './FollowCamera.js';
import { Input } from '../core/Input.js';
import { RoadGraph } from '../world/RoadGraph.js';
import { Traffic } from '../world/Traffic.js';
import { Pedestrians } from '../world/Pedestrians.js';
import { Delivery, CLS } from './Delivery.js';
import { GuideArrow } from './Markers.js';
import { Effects } from './Effects.js';
import { Hud } from '../ui/Hud.js';
import { Minimap } from '../ui/Minimap.js';
import { Screens } from '../ui/Screens.js';
import { TouchControls } from '../ui/TouchControls.js';
import { Sound } from '../audio/Sound.js';
import { clamp } from '../core/math.js';

const START_TIME = 70;
const SPAWN = { x: 0, y: 0.15, z: 11, yaw: 0 };

function loadBest() {
  try {
    return Number(localStorage.getItem('shippo-express-best') || 0);
  } catch {
    return 0;
  }
}
function saveBest(v) {
  try {
    localStorage.setItem('shippo-express-best', String(v));
  } catch {
    /* 保存できない環境では何もしない */
  }
}
function loadVolumes() {
  try {
    const v = JSON.parse(localStorage.getItem('shippo-express-vol') || 'null');
    if (v && typeof v.music === 'number') return v;
  } catch {
    /* 既定値を使う */
  }
  return { music: 0.5, sfx: 0.8 };
}

export class Game {
  constructor(container, uiRoot) {
    this.stage = new Stage(container);
    this.input = new Input(this.stage.renderer.domElement);
    this.city = new City(this.stage.scene);
    this.stage.setEnvironment(this.city.sky);
    this.graph = new RoadGraph(this.city.plan);
    this.model = new CourierModel();
    this.stage.scene.add(this.model.root);
    this.anim = new CourierAnimator(this.model);
    this.player = new Player(this.city, this.model, this.anim);
    this.cam = new FollowCamera(this.stage.camera, this.city.col);
    this.fx = new Effects(this.stage.scene, this.stage.camera, this.stage.renderer);
    this.traffic = new Traffic(this.city, this.stage.scene, this.stage.mobile ? 22 : 30);
    this.peds = new Pedestrians(this.city, this.stage.scene, this.stage.mobile ? 24 : 38);
    this.player.roofProvider = (x, z, y) => this.traffic.roofAt(x, z, y);
    this.arrow = new GuideArrow();
    this.stage.scene.add(this.arrow.group);
    this.sound = new Sound();
    this.volumes = loadVolumes();
    this.quality = 'high';
    try {
      this.quality = localStorage.getItem('shippo-express-quality') || (this.stage.mobile ? 'mid' : 'high');
    } catch {
      this.quality = this.stage.mobile ? 'mid' : 'high';
    }
    this.stage.setQuality(this.quality);
    this.hud = new Hud(uiRoot);
    this.minimap = new Minimap(document.getElementById('minimap'), this.city);
    this.delivery = new Delivery(this);
    this.touch = new TouchControls(uiRoot, this.input);
    this.touch.onPause = () => this.togglePause();
    this.screens = new Screens(uiRoot, {
      arcade: () => this.startGame('arcade'),
      free: () => this.startGame('free'),
      resume: () => this.togglePause(false),
      quit: () => this.toTitle(),
      retry: () => this.startGame(this.mode),
      onUi: () => {
        this.sound.init();
        this.sound.setVolumes(this.volumes.music, this.volumes.sfx);
        if (this.state === 'title') this.sound.startMusic(0);
        this.sound.play('ui');
      },
      volumes: () => this.volumes,
      quality: () => this.quality,
      setQuality: (q) => {
        this.quality = q;
        this.stage.setQuality(q);
        this.fx.resize();
        try {
          localStorage.setItem('shippo-express-quality', q);
        } catch {
          /* 無視 */
        }
      },
      setVolumes: (m, s) => {
        this.volumes = { music: m, sfx: s };
        this.sound.setVolumes(m, s);
        try {
          localStorage.setItem('shippo-express-vol', JSON.stringify(this.volumes));
        } catch {
          /* 無視 */
        }
      },
    });
    this.best = loadBest();
    this.time = 0;
    this.last = performance.now();
    this.fps = 60;
    this.state = 'title';
    this.mode = 'arcade';
    this.playing = false;
    this.timeLeft = START_TIME;
    this.hurry = false;
    this.fx.resize();
    window.addEventListener('resize', () => this.fx.resize());
    window.addEventListener('blur', () => {
      if (this.state === 'playing' || this.state === 'countdown') this.togglePause(true);
    });
    // iOS などで音が止められたままにならないよう、操作のたびに再開を試みる
    window.addEventListener('pointerdown', () => {
      const c = this.sound.ctx;
      if (c && c.state !== 'running') c.resume().catch(() => {});
    });
    // 最初の操作で音を有効化
    const unlock = () => {
      this.sound.init();
      this.sound.setVolumes(this.volumes.music, this.volumes.sfx);
      if (this.state === 'title') this.sound.startMusic(0);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    this.toTitle(true);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  sfx(name, opts = {}) {
    if (opts.x !== undefined) {
      const d = Math.hypot(opts.x - this.player.pos.x, opts.z - this.player.pos.z);
      if (d > 45) return;
      opts.vol = clamp(1 - d / 45, 0.1, 1);
    }
    this.sound.play(name, opts);
  }

  // ---- 状態遷移
  toTitle(first) {
    this.state = 'title';
    this.screens.countdown('');
    this.goHideT = 0;
    this.playing = false;
    this.screens.showPause(false);
    this.screens.hideResult();
    this.screens.showTitle(true, this.best);
    this.hud.show(false);
    this.touch.setVisible(false);
    this.delivery.reset();
    this.player.spawn(SPAWN.x, SPAWN.y, SPAWN.z, SPAWN.yaw);
    this.player.controlEnabled = false;
    this.cam.mode = 'hero';
    this.cam.first = true;
    Object.assign(this.cam.orbit, { cx: SPAWN.x, cz: SPAWN.z, r: 3.3, h: 1.3, lookY: 0.98, phase: -0.15, shift: 0.62 });
    if (!first) this.sound.startMusic(0);
  }

  startGame(mode) {
    this.mode = mode;
    this.screens.showTitle(false);
    this.screens.hideResult();
    this.screens.showPause(false);
    this.delivery.reset();
    this.player.spawn(SPAWN.x, SPAWN.y, SPAWN.z, Math.PI);
    this.player.stamina = 1;
    this.player.distance = 0;
    this.cam.mode = 'follow';
    this.cam.snapBehind(this.player);
    this.cam.pitch = 0.26;
    this.timeLeft = START_TIME;
    this.hurry = false;
    this.hud.show(true);
    this.hud.setMode(mode);
    this.hud.resetMoney();
    this.hud.setDeliveries(0);
    this.hud.setJob(null);
    this.hud.setTimer(this.timeLeft);
    this.hud.showKeys(!this.touch.enabled);
    this.hud.keys.classList.remove('faded');
    this.keysT = 0;
    this.touch.setVisible(true);
    this.state = 'countdown';
    this.playing = false;
    this.player.controlEnabled = false;
    this.countT = 0;
    this.countStep = -1;
    this.sound.startMusic(1);
    this.sound.setMusicLevel(1);
    // 最初のお客さんを近くに
    for (let i = 0; i < 3; i++) this.delivery.spawnCustomer(true);
  }

  togglePause(force) {
    if (this.state !== 'playing' && this.state !== 'paused' && this.state !== 'countdown') return;
    const on = force !== undefined ? force : this.state !== 'paused';
    if (on && (this.state === 'playing' || this.state === 'countdown')) {
      this.pausedFrom = this.state;
      this.state = 'paused';
      this.screens.countdown('');
      this.goHideT = 0;
      this.screens.showPause(true);
      this.sound.stopMusic();
    } else if (!on && this.state === 'paused') {
      this.state = this.pausedFrom || 'playing';
      this.screens.showPause(false);
      this.sound.startMusic(this.hurry ? 2 : 1);
    }
  }

  endGame() {
    this.state = 'ending';
    this.screens.countdown('');
    this.goHideT = 0;
    this.playing = false;
    this.player.controlEnabled = false;
    if (this.delivery.job) this.delivery.endJob();
    this.hud.message('<span class="big">タイムアップ！</span>', 'timeup', 1600);
    this.sound.play('timeup');
    this.sound.stopMusic();
    this.endT = 2.0;
  }

  showResults() {
    this.state = 'result';
    this.resultAt = this.time;
    const d = this.delivery;
    const money = d.money;
    const newBest = this.mode === 'arcade' && money > this.best;
    if (newBest) {
      this.best = money;
      saveBest(money);
    }
    this.hud.show(false);
    this.touch.setVisible(false);
    this.screens.showResult({ money, deliveries: d.deliveries, speedy: d.speedyCount, tips: d.totalTips, combo: d.bestCombo, newBest, distance: this.player.distance });
    this.sound.jingle('result');
    this.cam.mode = 'orbit';
    this.cam.first = true;
    Object.assign(this.cam.orbit, { cx: this.player.pos.x, cz: this.player.pos.z, r: 4.2, h: this.player.pos.y + 1.6, speed: 0.15, lookY: this.player.pos.y + 1.0, phase: this.player.yaw });
  }

  // ---- ゲーム内のできごと
  onDelivered(r) {
    if (this.mode === 'arcade') {
      this.timeLeft += r.timeBonus;
      this.hud.addTime(r.timeBonus);
    }
    this.hud.setMoney(this.delivery.money);
    this.hud.setDeliveries(this.delivery.deliveries);
    this.sound.play('deliver');
    this.player.cheer(1.1);
    this.anim.flashFace('happy', 1.6);
    this.cam.addShake(0.2);
  }

  onCarHit() {
    this.sound.play('hit');
    this.cam.addShake(0.9);
    this.fx.stars(this.player.pos.x, this.player.pos.y + 1.5, this.player.pos.z);
    this.delivery.breakCombo();
  }

  onNearMiss() {
    if (this.player.mode === 'hit') return;
    this.sound.play('nearmiss');
    this.delivery.trick('nearMiss');
  }

  onBumpPedestrian() {
    this.sound.play('bump');
  }

  handlePlayerEvents() {
    const p = this.player;
    for (const e of p.events) {
      this.delivery.onPlayerEvent(e);
      switch (e.type) {
        case 'jump':
          this.sfx('jump');
          this.fx.dust(p.pos.x, p.pos.y, p.pos.z, 5, 0.8);
          break;
        case 'doublejump':
          this.sfx('doublejump');
          this.fx.burst(p.pos.x, p.pos.y + 0.8, p.pos.z, '#fff3c4', 10);
          break;
        case 'wallkick':
          this.sfx('wallkick');
          this.fx.burst(p.pos.x, p.pos.y + 0.9, p.pos.z, '#ffffff', 8);
          break;
        case 'glide':
          this.sfx('glide');
          break;
        case 'slide':
          this.sfx('slide');
          this.fx.dust(p.pos.x, p.pos.y, p.pos.z, 10, 1.2);
          break;
        case 'bounce':
          this.sfx('bounce');
          this.fx.burst(p.pos.x, p.pos.y, p.pos.z, e.kind === 'car' ? '#ffd166' : '#ff9ec4', 10);
          this.cam.addShake(0.15);
          break;
        case 'land': {
          const pw = clamp(e.impact / 14, 0.25, 1.2);
          this.sfx('land', { power: pw });
          this.fx.dust(p.pos.x, p.pos.y, p.pos.z, Math.round(4 + pw * 8), pw);
          if (e.impact > 14) this.cam.addShake(0.35 * pw);
          break;
        }
        case 'step':
          this.sfx('step', { water: e.water });
          if (e.water) this.fx.splash(p.pos.x, p.pos.y + 0.2, p.pos.z, false);
          else if (e.speed > 11) this.fx.dust(p.pos.x, p.pos.y, p.pos.z, 2, 0.6);
          break;
        case 'splash':
          this.sfx('splash', { big: e.big });
          this.fx.splash(e.x, e.y, e.z, e.big);
          if (e.big) this.cam.addShake(0.3);
          break;
        case 'fellInSea':
          this.hud.message('<span class="big">ざぶーん！</span><small>岸へもどります</small>', 'fail', 1200);
          this.delivery.breakCombo();
          if (this.mode === 'arcade') this.timeLeft = Math.max(0, this.timeLeft - 2);
          break;
        case 'bonk':
          this.sfx('bonk');
          this.cam.addShake(0.25);
          break;
        case 'hit':
          this.anim.flashFace('dizzy', 1.2);
          break;
        default:
          break;
      }
    }
  }

  // ---- ループ
  loop(now) {
    const rawDt = (now - this.last) / 1000;
    this.last = now;
    const dt = Math.min(rawDt, 1 / 20);
    this.fps = this.fps * 0.95 + (1 / Math.max(rawDt, 1e-3)) * 0.05;
    this.step(dt);
    this.stage.render();
    requestAnimationFrame(this.loop);
  }

  step(dt) {
    this.input.update(dt);
    const inp = this.input;
    if (inp.pausePressed) {
      // ポーズ中に「設定」「あそびかた」を開いているときは、まずそれだけを閉じる
      if (this.state === 'paused' && this.screens.modalStack.length > 1) this.screens.closeModal();
      else if (this.state === 'playing' || this.state === 'paused' || this.state === 'countdown') this.togglePause();
      else if (this.screens.anyModal() && this.state === 'title') this.screens.closeModal();
    }
    if (this.state === 'result' && this.time - this.resultAt > 1.0) {
      if (inp.confirmPressed) this.startGame(this.mode);
      else if (inp.pausePressed) this.toTitle();
    }
    if (this.state === 'title' && inp.confirmPressed && !this.screens.anyModal()) {
      this.sound.init();
      this.sound.setVolumes(this.volumes.music, this.volumes.sfx);
      this.startGame('arcade');
    }
    if (this.state === 'paused') {
      inp.endFrame();
      return;
    }
    this.time += dt;

    if (this.state === 'countdown') {
      this.countT += dt;
      const s = Math.floor(this.countT / 0.75);
      if (s !== this.countStep) {
        this.countStep = s;
        if (s < 3) {
          this.screens.countdown(String(3 - s));
          this.sound.play('count');
        } else if (s === 3) {
          this.screens.countdown('スタート！', 'go');
          this.sound.play('go');
          this.state = 'playing';
          this.playing = true;
          this.player.controlEnabled = true;
          this.goHideT = 1.1;
        }
      }
    }
    // 「スタート！」の表示は、状態にかかわらず少したったら消す
    if (this.goHideT > 0) {
      this.goHideT -= dt;
      if (this.goHideT <= 0) this.screens.countdown('');
    }

    if (this.state === 'playing') {
      // 操作説明は 25 秒たつか、最初のお届けで消す
      this.keysT += dt;
      if ((this.keysT > 25 || this.delivery.deliveries > 0) && !this.hud.keys.classList.contains('faded')) this.hud.keys.classList.add('faded');
    }
    if (this.state === 'playing' && this.mode === 'arcade') {
      this.timeLeft -= dt;
      const prev = Math.ceil(this.timeLeft + dt);
      if (this.timeLeft <= 10 && Math.ceil(this.timeLeft) !== prev) this.sound.play('tick');
      if (this.timeLeft <= 10 && !this.hurry) {
        this.hurry = true;
        this.sound.setMusicLevel(2);
      } else if (this.timeLeft > 12 && this.hurry) {
        this.hurry = false;
        this.sound.setMusicLevel(1);
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.endGame();
      }
      this.hud.setTimer(this.timeLeft);
    }
    if (this.state === 'ending') {
      this.endT -= dt;
      if (this.endT <= 0) this.showResults();
    }

    // タイトルでは手を振る
    if (this.state === 'title' || this.state === 'result') {
      this.anim.update(dt, { mode: this.state === 'result' ? 'cheer' : 'wave', speed: 0, runSpeed: 8 });
      this.model.update(dt, { velocity: new THREE.Vector3(), wag: 0.8, wagSpeed: 9 });
      this.player.events.length = 0;
    } else {
      this.player.update(dt, inp, this.cam.yaw);
      this.handlePlayerEvents();
    }
    this.delivery.update(dt);
    this.traffic.update(dt, this.player, this);
    this.peds.update(dt, this.player, this);
    this.cam.update(dt, this.player, inp);
    this.stage.followShadow(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    this.city.update(dt, this.stage.camera);
    // 近くの桜から花びらが舞う
    if (this.sakura === undefined) this.sakura = this.city.props.groups.get('sakuraCanopy') || [];
    if (Math.random() < dt * 9) {
      const p = this.player.pos;
      const near = this.sakura.filter((t) => Math.abs(t.x - p.x) < 28 && Math.abs(t.z - p.z) < 28);
      if (near.length) {
        const t = near[Math.floor(Math.random() * near.length)];
        this.fx.petal(t.x + (Math.random() - 0.5) * 3, t.y + 3.2 + Math.random() * 1.2, t.z + (Math.random() - 0.5) * 3);
      }
    }
    this.fx.update(dt);

    // 案内矢印
    const d = this.delivery;
    let target = null;
    let show = false;
    if (this.state === 'playing') {
      if (d.job) {
        target = d.guideTarget();
        show = true;
        this.arrow.setUrgency(d.job.timeLeft / d.job.timeLimit);
      } else {
        const g = d.guideToCustomer(dt);
        if (g && g.d > 14) {
          target = g.target;
          show = true;
          this.arrow.mat.color.set(CLS[g.c.cls].color);
          this.arrow.mat.emissive.set(CLS[g.c.cls].color).multiplyScalar(0.4);
        }
      }
    }
    this.arrow.update(dt, this.player.pos, target, show);

    // HUD
    if (this.state === 'playing' || this.state === 'countdown' || this.state === 'ending') {
      const p = this.player;
      this.hud.setStamina(p.stamina, p.dashLock);
      if (!d.job) {
        const n = d.nearestCustomer();
        this.hud.setHint(n ? `光の柱のお客さんから荷物を受け取ろう（いちばん近い人まで ${Math.round(n.d)}m）` : 'お客さんを探そう！');
      } else this.hud.setHint('');
      const hs = Math.hypot(p.vel.x, p.vel.z);
      const speedFx = clamp((hs - 9.5) / 4, 0, 1) + (p.mode === 'glide' ? 0.35 : 0);
      this.hud.update(dt, speedFx);
      this.minimap.draw(
        {
          px: p.pos.x,
          pz: p.pos.z,
          yaw: this.cam.yaw,
          heading: p.yaw,
          customers: d.job ? [] : d.customers.filter((c) => !c.leaving).map((c) => ({ x: c.x, z: c.z, color: CLS[c.cls].color })),
          dest: d.job ? d.job.dest : null,
          route: d.job ? d.route.points : null,
        },
        dt,
      );
      // 滑空中のきらきら
      if (p.mode === 'glide' && Math.random() < dt * 20) this.fx.trail(p.pos.x, p.pos.y + 0.6, p.pos.z, '#fff6e0');
    }
    inp.endFrame();
  }
}
