import './style.css';
import { Game } from './game/Game.js';

const loading = document.getElementById('loading');
let game;
try {
  game = new Game(document.getElementById('app'), document.getElementById('ui'));
  // 最初の数フレームを描いてから読み込み画面を消す
  requestAnimationFrame(() => requestAnimationFrame(() => {
    loading.classList.add('done');
    setTimeout(() => loading.remove(), 700);
  }));
} catch (e) {
  loading.querySelector('.ld-text').textContent = '起動できませんでした（WebGL が使えるブラウザで開いてください）';
  throw e;
}

// 開発用：ブラウザのコンソールから触れるように（仮想時計で進めて撮影するのにも使う）
if (import.meta.env.DEV) {
  window.__game = game;
  window.__advance = (sec, dt = 1 / 60) => {
    const n = Math.round(sec / dt);
    for (let i = 0; i < n; i++) game.step(dt);
    game.stage.render();
    return n;
  };
  window.__hold = (keys, on = true) => {
    for (const k of keys) {
      if (on) game.input.keys.add(k);
      else game.input.keys.delete(k);
    }
  };
  window.__press = (key) => game.input.pressedKeys.add(key);
  window.__shot = async (name) => {
    game.stage.render();
    const url = game.stage.renderer.domElement.toDataURL('image/png');
    const r = await fetch('/__shot?name=' + encodeURIComponent(name), { method: 'POST', body: url });
    return r.ok;
  };
}
