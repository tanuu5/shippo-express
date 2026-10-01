// スマホ用：左半分で仮想スティック、右下にボタン、右半分のドラッグで視点
export class TouchControls {
  constructor(root, input) {
    this.input = input;
    root.insertAdjacentHTML(
      'beforeend',
      `<div id="touch" class="hidden">
  <div class="stick" id="stick"><div class="knob" id="knob"></div></div>
  <button class="tbtn jump" id="tJump">ジャンプ</button>
  <button class="tbtn dash" id="tDash">ダッシュ</button>
  <button class="tbtn slide" id="tSlide">すべる</button>
  <button class="tbtn pause" id="tPause">Ⅱ</button>
</div>`,
    );
    this.el = document.getElementById('touch');
    this.stick = document.getElementById('stick');
    this.knob = document.getElementById('knob');
    this.stickTouch = null;
    this.camTouch = null;
    this.onPause = null;
    const btn = (id, name) => {
      const b = document.getElementById(id);
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        input.setTouchButton(name, true);
        b.classList.add('on');
      }, { passive: false });
      const up = (e) => {
        e.preventDefault();
        input.setTouchButton(name, false);
        b.classList.remove('on');
      };
      b.addEventListener('touchend', up, { passive: false });
      b.addEventListener('touchcancel', up, { passive: false });
    };
    btn('tJump', 'jump');
    btn('tDash', 'dash');
    btn('tSlide', 'slide');
    document.getElementById('tPause').addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.onPause) this.onPause();
    }, { passive: false });

    const surface = document.getElementById('app');
    surface.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < window.innerWidth * 0.45 && this.stickTouch === null) {
          this.stickTouch = t.identifier;
          this.sx = t.clientX;
          this.sy = t.clientY;
          this.stick.style.left = `${t.clientX - 60}px`;
          this.stick.style.top = `${t.clientY - 60}px`;
          this.stick.classList.add('on');
        } else if (this.camTouch === null) {
          this.camTouch = t.identifier;
          this.cx = t.clientX;
          this.cy = t.clientY;
        }
      }
    }, { passive: true });
    surface.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stickTouch) {
          let dx = t.clientX - this.sx;
          let dy = t.clientY - this.sy;
          const l = Math.hypot(dx, dy);
          const R = 55;
          if (l > R) {
            dx *= R / l;
            dy *= R / l;
          }
          this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
          input.setTouchStick(dx / R, -dy / R);
        } else if (t.identifier === this.camTouch) {
          input.addTouchCamera(t.clientX - this.cx, t.clientY - this.cy);
          this.cx = t.clientX;
          this.cy = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.stickTouch) {
          this.stickTouch = null;
          this.knob.style.transform = '';
          this.stick.classList.remove('on');
          input.setTouchStick(0, 0);
        } else if (t.identifier === this.camTouch) this.camTouch = null;
      }
    };
    surface.addEventListener('touchend', end, { passive: true });
    surface.addEventListener('touchcancel', end, { passive: true });
    window.addEventListener('touchstart', () => this.show(true), { once: true, passive: true });
    // 画面を離れたときはスティックとボタンを戻す
    input.onRelease = () => {
      this.stickTouch = null;
      this.camTouch = null;
      this.knob.style.transform = '';
      this.stick.classList.remove('on');
      for (const b of this.el.querySelectorAll('.tbtn.on')) b.classList.remove('on');
    };
  }

  show(on) {
    this.enabled = on;
    this.el.classList.toggle('hidden', !on || !this.visible);
  }

  setVisible(v) {
    this.visible = v;
    this.el.classList.toggle('hidden', !v || !this.enabled);
  }
}
