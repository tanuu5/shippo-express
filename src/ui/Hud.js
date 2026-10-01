// 画面上の表示（DOM）：お金・残り時間・配達先・トリック・メッセージ・しっぽゲージ
export class Hud {
  constructor(root) {
    this.root = root;
    root.insertAdjacentHTML(
      'beforeend',
      `
<div id="hud" class="hidden">
  <div class="hud-money">
    <div class="money-main"><span class="yen">¥</span><span id="money">0</span></div>
    <div class="hud-sub"><span id="deliv">0</span> 件お届け<span id="comboBest"></span></div>
  </div>
  <div class="hud-timer" id="timerBox">
    <div class="hud-timer-label">のこり時間</div>
    <div class="hud-timer-num" id="timer">60</div>
    <div class="hud-timer-add" id="timerAdd"></div>
  </div>
  <div class="hud-map"><canvas id="minimap"></canvas><div class="map-n">N</div></div>
  <div class="hud-job hidden" id="job">
    <div class="job-icon" id="jobIcon">📦</div>
    <div class="job-body">
      <div class="job-to">お届け先</div>
      <div class="job-name" id="jobName"></div>
      <div class="job-bar"><i id="jobBar"></i></div>
    </div>
    <div class="job-dist" id="jobDist"></div>
  </div>
  <div class="hud-hint" id="hint"></div>
  <div class="hud-tricks" id="tricks"></div>
  <div class="hud-center" id="center"></div>
  <div class="hud-stamina"><div class="st-label">ダッシュ</div><div class="st-bar"><i id="stBar"></i></div></div>
  <div class="hud-keys" id="keys"><b>WASD</b> 移動　<b>Space</b> ジャンプ・2段・長押しで滑空　<b>Shift</b> ダッシュ　<b>C</b> スライディング　<b>マウス</b> 視点　<b>Esc</b> ポーズ</div>
  <canvas id="speedlines"></canvas>
</div>`,
    );
    this.el = (id) => document.getElementById(id);
    this.hud = this.el('hud');
    this.money = this.el('money');
    this.deliv = this.el('deliv');
    this.timer = this.el('timer');
    this.timerBox = this.el('timerBox');
    this.timerAdd = this.el('timerAdd');
    this.job = this.el('job');
    this.jobIcon = this.el('jobIcon');
    this.jobName = this.el('jobName');
    this.jobBar = this.el('jobBar');
    this.jobDist = this.el('jobDist');
    this.hint = this.el('hint');
    this.tricks = this.el('tricks');
    this.center = this.el('center');
    this.stBar = this.el('stBar');
    this.keys = this.el('keys');
    this.speed = this.el('speedlines');
    this.speedCtx = this.speed.getContext('2d');
    this.shownMoney = 0;
    this.targetMoney = 0;
    this.lastTimer = '';
    this.centerTimer = null;
    this.lines = [];
  }

  show(on) {
    this.hud.classList.toggle('hidden', !on);
  }

  setMode(mode) {
    this.timerBox.classList.toggle('hidden', mode !== 'arcade');
  }

  setMoney(v) {
    this.targetMoney = v;
  }

  resetMoney() {
    this.targetMoney = 0;
    this.shownMoney = 0;
    this.money.textContent = '0';
  }

  setDeliveries(n) {
    this.deliv.textContent = n;
  }

  setTimer(sec) {
    const s = Math.max(0, Math.ceil(sec));
    const txt = String(s);
    if (txt !== this.lastTimer) {
      this.timer.textContent = txt;
      this.lastTimer = txt;
      this.timerBox.classList.toggle('danger', s <= 10);
      if (s <= 10) {
        this.timerBox.classList.remove('tick');
        void this.timerBox.offsetWidth;
        this.timerBox.classList.add('tick');
      }
    }
  }

  addTime(sec) {
    this.timerAdd.textContent = `+${sec}秒`;
    this.timerAdd.classList.remove('pop');
    void this.timerAdd.offsetWidth;
    this.timerAdd.classList.add('pop');
  }

  setJob(job) {
    if (!job) {
      this.job.classList.add('hidden');
      return;
    }
    this.job.classList.remove('hidden');
    this.jobIcon.textContent = job.dest.icon || '📦';
    this.jobName.textContent = job.dest.name;
    this.job.dataset.cls = job.cls;
  }

  updateJob(job, dist) {
    if (!job) return;
    const r = Math.max(0, job.timeLeft / job.timeLimit);
    this.jobBar.style.transform = `scaleX(${r})`;
    this.jobBar.classList.toggle('low', r < 0.25);
    this.jobDist.textContent = `${Math.round(dist)}m`;
  }

  setHint(text) {
    if (this.hint.textContent !== text) this.hint.textContent = text;
    this.hint.classList.toggle('hidden', !text);
  }

  // 中央の大きなメッセージ
  message(html, cls = '', ms = 1500) {
    const d = document.createElement('div');
    d.className = 'center-msg ' + cls;
    d.innerHTML = html;
    this.center.appendChild(d);
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 500);
  }

  trick(name, tip, combo) {
    const d = document.createElement('div');
    d.className = 'trick';
    d.innerHTML = `<span class="t-name">${name}</span>${tip ? `<span class="t-tip">+¥${tip}</span>` : ''}${combo > 1 ? `<span class="t-combo">×${combo}</span>` : ''}`;
    this.tricks.prepend(d);
    while (this.tricks.children.length > 4) this.tricks.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 1300);
    setTimeout(() => d.remove(), 1800);
  }

  setStamina(v, locked) {
    this.stBar.style.transform = `scaleX(${Math.max(0, Math.min(1, v))})`;
    this.stBar.classList.toggle('locked', locked);
  }

  showKeys(on) {
    this.keys.classList.toggle('hidden', !on);
  }

  update(dt, speedFx) {
    // お金のカウントアップ
    if (this.shownMoney !== this.targetMoney) {
      const d = this.targetMoney - this.shownMoney;
      this.shownMoney += Math.sign(d) * Math.max(1, Math.ceil(Math.abs(d) * Math.min(1, dt * 6)));
      if (Math.abs(this.targetMoney - this.shownMoney) < 1) this.shownMoney = this.targetMoney;
      this.money.textContent = this.shownMoney.toLocaleString('ja-JP');
    }
    this.drawSpeedLines(dt, speedFx);
  }

  // スピード線（画面の外周から中心へ流れる線）
  drawSpeedLines(dt, amt) {
    const c = this.speed;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const g = this.speedCtx;
    g.clearRect(0, 0, w, h);
    if (amt < 0.05 && this.lines.length === 0) return;
    const want = Math.floor(amt * 34);
    while (this.lines.length < want) {
      this.lines.push({ a: Math.random() * Math.PI * 2, r: 0.55 + Math.random() * 0.5, len: 0.08 + Math.random() * 0.14, life: 0, max: 0.18 + Math.random() * 0.2 });
    }
    const cx = w / 2;
    const cy = h * 0.46;
    const R = Math.hypot(w, h) * 0.5;
    g.lineCap = 'round';
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.life += dt;
      if (l.life > l.max) {
        this.lines.splice(i, 1);
        continue;
      }
      const t = l.life / l.max;
      const r0 = R * (l.r + 0.1 - t * 0.25);
      const r1 = r0 - R * l.len;
      const ca = Math.cos(l.a);
      const sa = Math.sin(l.a);
      g.strokeStyle = `rgba(255,255,255,${0.55 * Math.sin(t * Math.PI) * Math.min(1, amt * 1.5)})`;
      g.lineWidth = 2 + 2 * (1 - t);
      g.beginPath();
      g.moveTo(cx + ca * r0, cy + sa * r0 * 0.8);
      g.lineTo(cx + ca * r1, cy + sa * r1 * 0.8);
      g.stroke();
    }
  }
}
