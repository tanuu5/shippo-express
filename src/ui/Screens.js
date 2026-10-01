// タイトル・あそびかた・ポーズ・結果・カウントダウンの画面
const PAW = `<svg class="paw" viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="42" rx="15" ry="12.5"/><ellipse cx="13.5" cy="25" rx="6.2" ry="7.5"/><ellipse cx="25" cy="14" rx="6.4" ry="7.8"/><ellipse cx="39" cy="14" rx="6.4" ry="7.8"/><ellipse cx="50.5" cy="25" rx="6.2" ry="7.5"/></svg>`;

export const RANKS = [
  { min: 15000, rank: 'S', title: '伝説のしっぽ便' },
  { min: 9000, rank: 'A', title: 'エース配達員' },
  { min: 5000, rank: 'B', title: '一人前の配達員' },
  { min: 2000, rank: 'C', title: '見習い配達員' },
  { min: 0, rank: 'D', title: '新人さん' },
];

export class Screens {
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    root.insertAdjacentHTML(
      'beforeend',
      `
<div id="title" class="screen">
  <div class="logo">
    <div class="logo-paw">${PAW}</div>
    <h1><span class="l1">しっぽ</span><span class="l2">急便</span></h1>
    <div class="logo-sub">TAIL EXPRESS</div>
    <p class="logo-tag">街を駆けて、跳んで、すべって。<br>ケモ耳配達員の、はしる配達アクション！</p>
  </div>
  <div class="menu">
    <button class="btn primary" data-act="arcade"><span class="b-main">配達スタート</span><span class="b-sub">制限時間つき・お届けで時間がのびる</span></button>
    <button class="btn" data-act="free"><span class="b-main">おさんぽモード</span><span class="b-sub">時間制限なし・のんびり街めぐり</span></button>
    <div class="row">
      <button class="btn small" data-act="howto">あそびかた</button>
      <button class="btn small" data-act="settings">設定</button>
    </div>
    <div class="best" id="bestLine"></div>
  </div>
  <div class="press">Enter / Space でスタート</div>
  <div class="copy">© 2026 たぬ</div>
</div>

<div id="howto" class="screen modal hidden">
  <div class="card">
    <h2>あそびかた</h2>
    <div class="how-grid">
      <div class="how-item"><div class="how-ico">📦</div><div><b>お客さんを見つける</b><br>光の柱の下で手をふっている人が依頼人。柱の色は届け先までの距離（<span class="c-red">赤</span>＝近い・<span class="c-yel">黄</span>＝ふつう・<span class="c-grn">緑</span>＝遠い）。</div></div>
      <div class="how-item"><div class="how-ico">🏃‍♀️</div><div><b>荷物を届ける</b><br>頭の上の矢印とミニマップの道順を見て、ピンクの光の柱まで走ろう。はやく届けるほど料金アップ。</div></div>
      <div class="how-item"><div class="how-ico">⏱️</div><div><b>時間をのばす</b><br>配達スタートは残り時間が 0 になったら終わり。お届けするたびに時間がふえる。</div></div>
      <div class="how-item"><div class="how-ico">✨</div><div><b>チップをかせぐ</b><br>荷物を持っている間のジャンプ・滑空・車ジャンプ・ニアミスなどでチップ！ 続けるとコンボ。</div></div>
    </div>
    <table class="keys">
      <tr><th>移動</th><td>WASD / 矢印キー（左スティック）</td></tr>
      <tr><th>ジャンプ</th><td>Space（A）… 空中でもう一度で <b>2段ジャンプ</b>、長押しで <b>ポンチョ滑空</b>、壁ぎわで <b>カベキック</b></td></tr>
      <tr><th>ダッシュ</th><td>Shift（RB）… しっぽゲージを使う</td></tr>
      <tr><th>スライディング</th><td>C（B）</td></tr>
      <tr><th>視点</th><td>マウスドラッグ / Q・E（右スティック）</td></tr>
      <tr><th>ポーズ</th><td>Esc / P</td></tr>
    </table>
    <p class="tip">ひさし（日よけ）や肉球マークのジャンプ台、車の屋根に乗るとはずむよ！ 屋根の上を渡り歩くのが近道。</p>
    <button class="btn primary" data-act="close">とじる</button>
  </div>
</div>

<div id="settings" class="screen modal hidden">
  <div class="card small">
    <h2>設定</h2>
    <label class="slider">BGM <input type="range" min="0" max="100" id="volMusic" /></label>
    <label class="slider">効果音 <input type="range" min="0" max="100" id="volSfx" /></label>
    <label class="slider">画質
      <select id="quality">
        <option value="high">きれい</option>
        <option value="mid">ふつう</option>
        <option value="low">かるい（影なし）</option>
      </select>
    </label>
    <button class="btn primary" data-act="close">とじる</button>
  </div>
</div>

<div id="pause" class="screen modal hidden">
  <div class="card small">
    <h2>ひとやすみ</h2>
    <button class="btn primary" data-act="resume">つづける</button>
    <button class="btn" data-act="howto">あそびかた</button>
    <button class="btn" data-act="settings">設定</button>
    <button class="btn" data-act="quit">タイトルへ</button>
  </div>
</div>

<div id="result" class="screen modal hidden">
  <div class="card result">
    <div class="res-head">おつかれさま！</div>
    <div class="res-rank"><span id="resRank">A</span><div class="res-title" id="resTitle"></div></div>
    <div class="res-money">¥<span id="resMoney">0</span></div>
    <div class="res-new hidden" id="resNew">ベスト更新！</div>
    <div class="res-stats">
      <div><span>お届け</span><b id="resDeliv">0</b>件</div>
      <div><span>すごくはやい</span><b id="resSpeedy">0</b>回</div>
      <div><span>チップ</span><b id="resTips">0</b>円</div>
      <div><span>最大コンボ</span><b id="resCombo">0</b></div>
    </div>
    <div class="res-dist">走ったきょり <b id="resDist">0</b></div>
    <div class="row">
      <button class="btn primary" data-act="retry">もう一度</button>
      <button class="btn" data-act="quit">タイトルへ</button>
    </div>
  </div>
</div>

<div id="countdown" class="countdown hidden"></div>
<div id="fade" class="fade"></div>
`,
    );
    this.$ = (id) => document.getElementById(id);
    this.title = this.$('title');
    this.howto = this.$('howto');
    this.settings = this.$('settings');
    this.pause = this.$('pause');
    this.result = this.$('result');
    this.countdownEl = this.$('countdown');
    this.fadeEl = this.$('fade');
    this.modalStack = [];
    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      // フォーカスが残ると、あとの Space キーでボタンが押されてしまうので外す
      b.blur();
      const act = b.dataset.act;
      this.h.onUi && this.h.onUi();
      if (act === 'close') this.closeModal();
      else if (act === 'howto') this.openModal(this.howto);
      else if (act === 'settings') this.openModal(this.settings);
      else if (this.h[act]) this.h[act]();
    });
    const vm = this.$('volMusic');
    const vs = this.$('volSfx');
    vm.value = Math.round((handlers.volumes ? handlers.volumes().music : 0.5) * 100);
    vs.value = Math.round((handlers.volumes ? handlers.volumes().sfx : 0.8) * 100);
    const upd = () => this.h.setVolumes && this.h.setVolumes(vm.value / 100, vs.value / 100);
    vm.addEventListener('input', upd);
    vs.addEventListener('input', upd);
    const q = this.$('quality');
    q.value = handlers.quality ? handlers.quality() : 'high';
    q.addEventListener('change', () => this.h.setQuality && this.h.setQuality(q.value));
  }

  showTitle(on, best) {
    this.title.classList.toggle('hidden', !on);
    if (on) this.$('bestLine').innerHTML = best ? `ベスト記録　<b>¥${best.toLocaleString('ja-JP')}</b>` : '';
  }

  openModal(el) {
    el.classList.remove('hidden');
    this.modalStack.push(el);
  }

  closeModal() {
    const el = this.modalStack.pop();
    if (el) el.classList.add('hidden');
  }

  anyModal() {
    return this.modalStack.length > 0;
  }

  showPause(on) {
    if (on) this.openModal(this.pause);
    else {
      for (const el of this.modalStack) el.classList.add('hidden');
      this.modalStack = [];
    }
  }

  showResult(data) {
    const r = RANKS.find((x) => data.money >= x.min);
    this.$('resRank').textContent = r.rank;
    this.$('resRank').className = 'rank-' + r.rank;
    this.$('resTitle').textContent = r.title;
    this.$('resDeliv').textContent = data.deliveries;
    this.$('resSpeedy').textContent = data.speedy;
    this.$('resTips').textContent = data.tips.toLocaleString('ja-JP');
    this.$('resCombo').textContent = data.combo;
    const km = (data.distance || 0) / 1000;
    this.$('resDist').textContent = km >= 1 ? `${km.toFixed(2)} km` : `${Math.round(data.distance || 0)} m`;
    this.$('resNew').classList.toggle('hidden', !data.newBest);
    this.openModal(this.result);
    // お金のカウントアップ
    const el = this.$('resMoney');
    const start = performance.now();
    const dur = 1200;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(data.money * e).toLocaleString('ja-JP');
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  hideResult() {
    this.result.classList.add('hidden');
    this.modalStack = this.modalStack.filter((e) => e !== this.result);
  }

  countdown(text, cls = '') {
    const el = this.countdownEl;
    el.textContent = text;
    el.className = 'countdown ' + cls;
    void el.offsetWidth;
    el.classList.add('pop');
    if (!text) el.classList.add('hidden');
  }

  fade(on) {
    this.fadeEl.classList.toggle('on', on);
  }
}
