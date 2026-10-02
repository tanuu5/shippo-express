// 効果音と BGM を Web Audio でその場で合成する（音声ファイルは使わない）
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicVol = 0.5;
    this.sfxVol = 0.8;
    this.music = null;
    this.lastPlay = {};
  }

  // ユーザー操作のあとで呼ぶ
  init() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.master);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicVol;
    this.musicGain.connect(this.master);
    // ノイズ
    const len = ctx.sampleRate;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.music = new Music(this);
  }

  setVolumes(music, sfx) {
    this.musicVol = music;
    this.sfxVol = sfx;
    if (this.ctx) {
      this.musicGain.gain.setTargetAtTime(music, this.ctx.currentTime, 0.05);
      this.sfxGain.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    }
  }

  // --- 部品
  tone(type, f0, f1, dur, vol, t0 = 0, opts = {}) {
    const ctx = this.ctx;
    const t = ctx.currentTime + t0;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur * (opts.slide || 1));
    if (opts.vib) {
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = opts.vib;
      lg.gain.value = opts.vibAmt || 12;
      l.connect(lg);
      lg.connect(o.frequency);
      l.start(t);
      l.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opts.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.lp;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(opts.out || this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseHit(dur, vol, type = 'bandpass', freq = 1500, q = 1, t0 = 0, out) {
    const ctx = this.ctx;
    const t = ctx.currentTime + t0;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(out || this.sfxGain);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  // --- 効果音
  play(name, opts = {}) {
    if (!this.ctx || !this.enabled) return;
    const now = this.ctx.currentTime;
    const minGap = { step: 0.06, honk: 0.3, tick: 0.2, splash: 0.1 }[name] || 0.02;
    if (this.lastPlay[name] && now - this.lastPlay[name] < minGap) return;
    this.lastPlay[name] = now;
    const v = opts.vol ?? 1;
    switch (name) {
      case 'jump':
        this.tone('triangle', 330, 720, 0.14, 0.22 * v);
        this.tone('sine', 660, 1200, 0.1, 0.08 * v);
        break;
      case 'doublejump':
        this.tone('triangle', 620, 1250, 0.16, 0.2 * v);
        this.tone('sine', 1560, 2090, 0.25, 0.1 * v, 0.05);
        this.tone('sine', 2350, 2350, 0.2, 0.05 * v, 0.1);
        break;
      case 'land':
        this.tone('sine', 150, 55, 0.12, 0.35 * v * (opts.power || 1));
        this.noiseHit(0.08, 0.12 * v * (opts.power || 1), 'lowpass', 900);
        break;
      case 'step':
        this.noiseHit(0.035, 0.06 * v, 'bandpass', opts.water ? 900 : 2200 + Math.random() * 600, 2);
        if (opts.water) this.tone('sine', 500 + Math.random() * 400, 900, 0.06, 0.04);
        break;
      case 'bounce':
        this.tone('sine', 180, 520, 0.32, 0.3 * v, 0, { vib: 22, vibAmt: 40 });
        this.tone('triangle', 360, 900, 0.2, 0.08 * v, 0.02);
        break;
      case 'pickup': {
        const notes = [72, 76, 79, 84];
        notes.forEach((n, i) => this.tone('square', mtof(n), mtof(n), 0.14, 0.09, i * 0.06, { lp: 3500 }));
        this.tone('sine', mtof(96), mtof(96), 0.3, 0.06, 0.24);
        break;
      }
      case 'deliver': {
        const seq = [
          [72, 0],
          [76, 0.08],
          [79, 0.16],
          [84, 0.26],
          [83, 0.42],
          [84, 0.5],
        ];
        for (const [n, t] of seq) {
          this.tone('square', mtof(n), mtof(n), 0.2, 0.09, t, { lp: 4000 });
          this.tone('triangle', mtof(n - 12), mtof(n - 12), 0.22, 0.1, t);
        }
        this.tone('sine', mtof(96), mtof(96), 0.5, 0.07, 0.5);
        this.play('coin', { delay: 0.7 });
        break;
      }
      case 'coin':
        this.tone('square', mtof(83), mtof(83), 0.07, 0.08, opts.delay || 0, { lp: 5000 });
        this.tone('square', mtof(88), mtof(88), 0.28, 0.08, (opts.delay || 0) + 0.07, { lp: 5000 });
        break;
      case 'combo': {
        const n = 72 + Math.min(12, (opts.n || 1) * 2);
        this.tone('triangle', mtof(n), mtof(n + 12), 0.1, 0.12);
        this.tone('sine', mtof(n + 12), mtof(n + 12), 0.15, 0.06, 0.05);
        break;
      }
      case 'fail':
        this.tone('triangle', 440, 330, 0.3, 0.2, 0, { vib: 6, vibAmt: 15 });
        this.tone('triangle', 330, 196, 0.5, 0.2, 0.3, { vib: 6, vibAmt: 15 });
        break;
      case 'hit':
        this.noiseHit(0.25, 0.35, 'lowpass', 1200);
        this.tone('sine', 120, 50, 0.2, 0.4);
        this.tone('triangle', 900, 180, 0.4, 0.12, 0.05, { vib: 18, vibAmt: 60 });
        break;
      case 'bonk':
        this.tone('sine', 220, 90, 0.12, 0.25);
        this.noiseHit(0.05, 0.1, 'bandpass', 800, 3);
        break;
      case 'honk': {
        const vol = 0.14 * v;
        this.tone('square', 392, 392, 0.3, vol, 0, { lp: 1400 });
        this.tone('square', 494, 494, 0.3, vol * 0.8, 0, { lp: 1400 });
        break;
      }
      case 'glide':
        this.noiseHit(0.6, 0.08, 'bandpass', 700, 0.7);
        this.tone('sine', 500, 900, 0.3, 0.06);
        break;
      case 'dash':
        this.noiseHit(0.3, 0.1, 'highpass', 2500, 0.5);
        break;
      case 'wallkick':
        this.noiseHit(0.05, 0.2, 'bandpass', 1800, 2);
        this.tone('square', 400, 900, 0.12, 0.08, 0.02, { lp: 3000 });
        break;
      case 'slide':
        this.noiseHit(0.45, 0.1, 'bandpass', 1300, 0.8);
        break;
      case 'splash':
        this.noiseHit(opts.big ? 0.7 : 0.3, opts.big ? 0.35 : 0.15, 'bandpass', 1200, 0.6);
        for (let i = 0; i < (opts.big ? 6 : 3); i++) this.tone('sine', 400 + Math.random() * 600, 1200 + Math.random() * 600, 0.07, 0.05, 0.05 + i * 0.05);
        break;
      case 'tick':
        this.tone('square', 1760, 1760, 0.03, 0.05, 0, { lp: 5000 });
        break;
      case 'timeup':
        this.tone('square', 880, 880, 0.2, 0.12, 0, { lp: 3000 });
        this.tone('square', 880, 880, 0.2, 0.12, 0.25, { lp: 3000 });
        this.tone('square', 660, 660, 0.7, 0.14, 0.5, { lp: 3000 });
        break;
      case 'count':
        this.tone('square', 660, 660, 0.12, 0.1, 0, { lp: 3000 });
        break;
      case 'go':
        this.tone('square', 1320, 1320, 0.35, 0.12, 0, { lp: 4000 });
        this.tone('triangle', 660, 660, 0.35, 0.1);
        break;
      case 'ui':
        this.tone('triangle', 880, 1320, 0.07, 0.1);
        break;
      case 'move':
        // メニューで項目を移したとき
        this.tone('triangle', 700, 780, 0.035, 0.06);
        break;
      case 'bump':
        this.tone('triangle', 520, 300, 0.12, 0.12);
        break;
      case 'nearmiss':
        this.noiseHit(0.35, 0.14, 'bandpass', 2400, 1.5);
        this.tone('triangle', 800, 1600, 0.15, 0.08);
        break;
      default:
        break;
    }
  }

  startMusic(level = 1) {
    if (!this.ctx) return;
    this.music.start(level);
  }
  setMusicLevel(level) {
    if (this.music) this.music.level = level;
  }
  stopMusic() {
    if (this.music) this.music.stop();
  }
  jingle(kind) {
    if (!this.ctx) return;
    if (kind === 'result') {
      const seq = [
        [67, 0, 0.15],
        [72, 0.15, 0.15],
        [76, 0.3, 0.15],
        [79, 0.45, 0.3],
        [76, 0.8, 0.12],
        [79, 0.92, 0.6],
      ];
      for (const [n, t, d] of seq) {
        this.tone('square', mtof(n), mtof(n), d + 0.1, 0.09, t, { lp: 3500, out: this.musicGain });
        this.tone('triangle', mtof(n - 12), mtof(n - 12), d + 0.1, 0.1, t, { out: this.musicGain });
      }
    }
  }
}

// --- BGM：ヘ長調の明るいシティポップ風ループ（IV-V-iii-vi の「王道進行」）
const CHORDS = [
  // [ベースのルート, 和音(MIDI)]
  [46, [58, 62, 65, 69]], // B♭maj7
  [48, [58, 60, 64, 67]], // C7
  [45, [55, 60, 64, 67]], // Am7
  [50, [57, 60, 62, 65]], // Dm7
  [43, [55, 58, 62, 65]], // Gm7
  [48, [58, 60, 64, 67]], // C7
  [41, [57, 60, 64, 65]], // Fmaj7
  [41, [57, 60, 63, 65]], // F7
  [46, [58, 62, 65, 69]], // B♭maj7
  [46, [60, 64, 67, 70]], // C/B♭
  [45, [55, 60, 64, 67]], // Am7
  [50, [57, 60, 62, 66]], // D7
  [43, [55, 58, 62, 65]], // Gm7
  [48, [55, 58, 62, 65]], // Gm7/C
  [41, [57, 60, 65, 69]], // F
  [48, [58, 60, 64, 67]], // C7
];
// メロディ：[MIDI, 8分音符の長さ]（0 = 休符）
const MEL = [
  [[69, 1], [70, 1], [72, 2], [74, 1], [72, 1], [70, 2]],
  [[72, 1], [74, 1], [76, 2], [79, 1], [76, 1], [72, 2]],
  [[72, 3], [69, 1], [72, 1], [76, 1], [81, 2]],
  [[79, 1], [77, 1], [76, 1], [74, 1], [77, 4]],
  [[74, 1], [76, 1], [77, 2], [79, 1], [77, 1], [74, 2]],
  [[76, 1], [77, 1], [79, 2], [82, 1], [81, 1], [79, 2]],
  [[81, 3], [77, 1], [72, 2], [69, 2]],
  [[70, 1], [72, 1], [74, 1], [75, 1], [77, 4]],
  [[77, 2], [74, 1], [77, 1], [82, 2], [81, 1], [79, 1]],
  [[79, 2], [76, 1], [79, 1], [84, 2], [82, 1], [81, 1]],
  [[81, 3], [79, 1], [76, 2], [72, 2]],
  [[78, 1], [79, 1], [81, 1], [84, 1], [86, 4]],
  [[86, 2], [84, 1], [82, 1], [81, 2], [79, 2]],
  [[82, 1], [81, 1], [79, 1], [77, 1], [76, 2], [72, 2]],
  [[77, 2], [81, 2], [79, 1], [77, 1], [76, 1], [77, 1]],
  [[79, 4], [0, 2], [72, 1], [76, 1]],
];

class Music {
  constructor(sound) {
    this.s = sound;
    this.ctx = sound.ctx;
    this.out = sound.ctx.createGain();
    this.out.gain.value = 0.55;
    this.out.connect(sound.musicGain);
    this.level = 1;
    this.timer = null;
    this.step = 0;
    this.bpm = 132;
    // メロディのイベント表（16 分単位）
    this.melody = [];
    let pos = 0;
    for (const bar of MEL) {
      for (const [n, len] of bar) {
        if (n) this.melody.push({ at: pos, n, len: len * 2 });
        pos += len * 2;
      }
    }
    this.total = 16 * 16;
  }

  start(level) {
    this.level = level;
    if (this.timer) return;
    this.step = 0;
    this.next = this.ctx.currentTime + 0.08;
    this.out.gain.cancelScheduledValues(this.ctx.currentTime);
    this.out.gain.setValueAtTime(0.55, this.ctx.currentTime);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  schedule() {
    const ctx = this.ctx;
    const bpm = this.level >= 2 ? 150 : this.bpm;
    const spb = 60 / bpm / 4;
    // タブが裏にあってタイマーが間引かれたあとは、遅れた音をまとめて鳴らさずに今へ飛ぶ
    if (this.next < ctx.currentTime - 0.05) this.next = ctx.currentTime + 0.02;
    while (this.next < ctx.currentTime + 0.14) {
      this.playStep(this.step, this.next, spb);
      this.next += spb;
      this.step = (this.step + 1) % this.total;
    }
  }

  note(type, m, t, dur, vol, opts = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(mtof(m), t);
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack || 0.006));
    if (opts.sustain) {
      g.gain.setTargetAtTime(vol * opts.sustain, t + 0.03, 0.08);
      g.gain.setTargetAtTime(0.0001, t + dur, 0.05);
    } else g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opts.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(opts.lp, t);
      if (opts.lpEnd) f.frequency.exponentialRampToValueAtTime(opts.lpEnd, t + dur);
      f.Q.value = opts.q || 0.7;
      o.connect(f);
      node = f;
    }
    if (opts.vib) {
      const l = ctx.createOscillator();
      const lg = ctx.createGain();
      l.frequency.value = 5.5;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(opts.vib, t + Math.min(0.25, dur));
      l.connect(lg);
      lg.connect(o.detune);
      l.start(t);
      l.stop(t + dur + 0.2);
    }
    node.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.25);
  }

  drum(kind, t, vol) {
    const ctx = this.ctx;
    const s = this.s;
    if (kind === 'kick') {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g);
      g.connect(this.out);
      o.start(t);
      o.stop(t + 0.25);
    } else if (kind === 'snare') {
      const src = ctx.createBufferSource();
      src.buffer = s.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1900;
      f.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      src.connect(f);
      f.connect(g);
      g.connect(this.out);
      src.start(t, Math.random() * 0.4);
      src.stop(t + 0.2);
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(vol * 0.5, t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g2);
      g2.connect(this.out);
      o.start(t);
      o.stop(t + 0.12);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = s.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7500;
      const g = ctx.createGain();
      const len = kind === 'open' ? 0.16 : 0.04;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(f);
      f.connect(g);
      g.connect(this.out);
      src.start(t, Math.random() * 0.4);
      src.stop(t + len + 0.02);
    }
  }

  playStep(step, t, spb) {
    const lv = this.level;
    const bar = Math.floor(step / 16);
    const i = step % 16;
    const [root, chord] = CHORDS[bar];
    // ドラム
    if (lv >= 1) {
      if (i === 0 || i === 8 || (i === 10 && bar % 2 === 1)) this.drum('kick', t, 0.5);
      if (i === 4 || i === 12) this.drum('snare', t, 0.22);
      if (i % 2 === 0) this.drum('hat', t, i % 4 === 2 ? 0.06 : 0.035);
      if (lv >= 2 && i % 2 === 1) this.drum('hat', t, 0.03);
      if (i === 14 && bar % 4 === 3) this.drum('open', t, 0.05);
    } else if (i === 0 || i === 8) this.drum('kick', t, 0.2);
    // ベース（はずむ 8 分）
    const bpat = [0, null, 12, null, 0, null, 7, null, 0, null, 12, null, 7, null, 10, null];
    const bn = bpat[i];
    if (bn !== null) this.note('sawtooth', root + bn, t, spb * 1.6, lv >= 1 ? 0.13 : 0.09, { lp: 900, lpEnd: 300, q: 2 });
    // コード（裏拍のカッティング）
    const stab = [2, 6, 10, 14].includes(i) || (i === 0 && bar % 2 === 0);
    if (stab) {
      for (const n of chord) {
        this.note('triangle', n, t, spb * 1.2, 0.035, { detune: -6 });
        this.note('sine', n + 12, t, spb * 0.9, 0.012);
      }
    }
    // キラキラのアルペジオ（後半）
    if (lv >= 1 && bar >= 8 && i % 2 === 0) {
      const n = chord[(i / 2) % chord.length] + 12;
      this.note('sine', n, t, spb * 1.4, 0.022);
    }
    // メロディ
    const pos = step;
    for (const ev of this.melody) {
      if (ev.at === pos) {
        const dur = ev.len * spb * 0.92;
        const v = lv >= 1 ? 0.07 : 0.045;
        this.note('square', ev.n, t, dur, v, { lp: 2600, sustain: 0.55, vib: 14 });
        this.note('triangle', ev.n - 12, t, dur, v * 0.6, { sustain: 0.5 });
      }
    }
  }
}
