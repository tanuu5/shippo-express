// ゲームパッドとキーボードでメニューを操作する。
// 十字キー・左スティック・矢印キーで選び、A / Enter / Space で決定（ボタンをクリックしたのと同じ）。
// 設定の音量つまみと画質は左右で変える。あそびかたは上下でスクロール。
// 選んでいる項目には枠（.gp-focus）を付ける。マウスやタッチで操作したら枠は消す。
export class MenuNav {
  constructor(screens, onMove) {
    this.screens = screens;
    this.onMove = onMove || (() => {});
    this.index = new WeakMap(); // 画面ごとに、選んでいた項目の番号を覚えておく
    this.el = null;
    this.shown = false;
    this.depth = 0; // 前のフレームで開いていた画面の数
    const hide = () => this.show(false);
    window.addEventListener('pointerdown', hide);
    window.addEventListener('mousemove', (e) => {
      if (e.movementX || e.movementY) hide();
    });
  }

  // いま操作できるメニュー：いちばん上に開いている画面、なければタイトルのメニュー
  container(state) {
    const s = this.screens;
    const top = s.modalStack[s.modalStack.length - 1];
    if (top) return top;
    if (state === 'title' && !s.title.classList.contains('hidden')) return s.title.querySelector('.menu');
    return null;
  }

  items(c) {
    return [...c.querySelectorAll('button[data-act], input[type="range"], select')].filter((e) => e.offsetParent !== null);
  }

  show(on) {
    this.shown = on;
    if (this.el) this.el.classList.toggle('gp-focus', on);
  }

  setFocus(el) {
    if (this.el && this.el !== el) this.el.classList.remove('gp-focus');
    this.el = el;
    if (el) el.classList.toggle('gp-focus', this.shown);
  }

  // m: Input.menu（null ならメニューの外）。okAllowed が false のあいだは決定を受け付けない
  update(m, state, okAllowed = true) {
    // 新しく開いた画面は先頭の項目から（閉じて戻った画面は、前に選んでいた項目のまま）
    const depth = this.screens.modalStack.length;
    if (depth > this.depth) this.index.delete(this.screens.modalStack[depth - 1]);
    this.depth = depth;
    const c = m ? this.container(state) : null;
    const items = c ? this.items(c) : [];
    if (!items.length) {
      this.setFocus(null);
      return;
    }
    let i = this.index.get(c) ?? 0;
    if (i >= items.length) i = 0;
    const cur = items[i];
    const dir = m.up || m.down || m.left || m.right;
    // 枠が出ていないときの最初の方向入力は、いま選ばれている項目を見せるだけ
    if (dir && !this.shown) {
      this.show(true);
      this.setFocus(cur);
      this.onMove();
      return;
    }
    if (m.up || m.down) {
      const card = c.querySelector('.card');
      if (items.length === 1 && card && card.scrollHeight > card.clientHeight + 4) {
        // あそびかたなど、ボタンが 1 つだけの長い画面はスクロール
        card.scrollBy(0, m.down ? 90 : -90);
      } else {
        i = (i + (m.down ? 1 : -1) + items.length) % items.length;
        this.onMove();
      }
    }
    if (m.left || m.right) {
      const d = m.right ? 1 : -1;
      if (cur.type === 'range') {
        const v = Math.max(+cur.min || 0, Math.min(+cur.max || 100, +cur.value + d * 5));
        if (v !== +cur.value) {
          cur.value = String(v);
          cur.dispatchEvent(new Event('input', { bubbles: true }));
          this.onMove();
        }
      } else if (cur.tagName === 'SELECT') {
        this.cycle(cur, d);
      } else {
        i = (i + d + items.length) % items.length;
        this.onMove();
      }
    }
    if (dir) this.show(true);
    this.index.set(c, i);
    this.setFocus(items[i]);
    if (m.ok && okAllowed) {
      const el = items[i];
      if (el.tagName === 'SELECT') this.cycle(el, 1);
      else if (el.tagName === 'BUTTON') el.click();
    }
  }

  cycle(sel, d) {
    const n = sel.options.length;
    sel.selectedIndex = (sel.selectedIndex + d + n) % n;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    this.onMove();
  }
}
