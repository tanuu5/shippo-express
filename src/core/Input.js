// 入力：キーボード・マウス・ゲームパッド・タッチ（仮想スティック）をまとめて「操作」に変換する
export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.pressedKeys = new Set();
    this.move = { x: 0, y: 0 };
    this.camDX = 0;
    this.camDY = 0;
    this.jumpDown = false;
    this.jumpPressed = false;
    this.dashDown = false;
    this.slidePressed = false;
    this.pausePressed = false;
    this.confirmPressed = false;
    this.lastCamInput = -10;
    this.time = 0;
    this.touch = { active: false, stickId: null, sx: 0, sy: 0, x: 0, y: 0, camId: null, cx: 0, cy: 0, jump: false, dash: false, jumpEdge: false, slideEdge: false };
    this.usingTouch = false;
    this._drag = null;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k)) e.preventDefault();
      this.keys.add(k);
      this.pressedKeys.add(k);
      this.usingTouch = false;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    // アプリ切り替えなどで keyup / touchend が届かないと押しっぱなしになるので、離れたら全部戻す
    const release = () => this.releaseAll();
    window.addEventListener('blur', release);
    window.addEventListener('pagehide', release);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) release();
    });

    dom.addEventListener('mousedown', (e) => {
      if (e.button === 0 || e.button === 2) this._drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === dom) {
        this.camDX += e.movementX * 0.0032;
        this.camDY += e.movementY * 0.0026;
        this.lastCamInput = this.time;
      } else if (this._drag) {
        this.camDX += (e.clientX - this._drag.x) * 0.006;
        this.camDY += (e.clientY - this._drag.y) * 0.004;
        this._drag.x = e.clientX;
        this._drag.y = e.clientY;
        this.lastCamInput = this.time;
      }
    });
    window.addEventListener('mouseup', () => (this._drag = null));
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  releaseAll() {
    this.keys.clear();
    this._drag = null;
    this.touch.x = 0;
    this.touch.y = 0;
    this.touch.jump = false;
    this.touch.dash = false;
    this.touch.jumpEdge = false;
    this.touch.slideEdge = false;
    if (this.onRelease) this.onRelease();
  }

  // タッチ UI（ui/TouchControls.js）から呼ばれる
  setTouchStick(x, y) {
    this.touch.x = x;
    this.touch.y = y;
    this.usingTouch = true;
  }
  setTouchButton(name, down) {
    if (name === 'jump') {
      if (down && !this.touch.jump) this.touch.jumpEdge = true;
      this.touch.jump = down;
    } else if (name === 'dash') {
      this.touch.dash = down;
    } else if (name === 'slide' && down) {
      this.touch.slideEdge = true;
    }
    this.usingTouch = true;
  }
  addTouchCamera(dx, dy) {
    this.camDX += dx * 0.008;
    this.camDY += dy * 0.005;
    this.lastCamInput = this.time;
  }

  update(dt) {
    this.time += dt;
    const k = this.keys;
    const p = this.pressedKeys;
    let x = 0;
    let y = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    let jumpDown = k.has('Space') || k.has('KeyJ');
    let jumpPressed = p.has('Space') || p.has('KeyJ');
    let dashDown = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyK');
    let slidePressed = p.has('KeyC') || p.has('KeyL');
    this.pausePressed = p.has('Escape') || p.has('KeyP');
    this.confirmPressed = p.has('Enter') || p.has('Space');
    // Q で左、E で右を向く（camDX が正だと視点は左へ回る。マウスドラッグは「画面をつかんで回す」向き）
    if (k.has('KeyQ')) {
      this.camDX += 2.2 * dt;
      this.lastCamInput = this.time;
    }
    if (k.has('KeyE')) {
      this.camDX -= 2.2 * dt;
      this.lastCamInput = this.time;
    }

    // ゲームパッド
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      const ax = dz(gp.axes[0] || 0);
      const ay = dz(gp.axes[1] || 0);
      if (Math.abs(ax) + Math.abs(ay) > 0) {
        x = ax;
        y = -ay;
      }
      const rx = dz(gp.axes[2] || 0);
      const ry = dz(gp.axes[3] || 0);
      if (rx || ry) {
        // 右スティックを右に倒すと右を向く
        this.camDX -= rx * 2.6 * dt;
        this.camDY += ry * 1.6 * dt;
        this.lastCamInput = this.time;
      }
      const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      if (!this._padPrev) this._padPrev = {};
      const edge = (i) => b(i) && !this._padPrev[i];
      if (b(0)) jumpDown = true;
      if (edge(0)) jumpPressed = true;
      if (b(7) || b(5) || b(2)) dashDown = true;
      if (edge(1) || edge(6)) slidePressed = true;
      if (edge(9)) this.pausePressed = true;
      if (edge(0) || edge(9)) this.confirmPressed = true;
      for (let i = 0; i < gp.buttons.length; i++) this._padPrev[i] = b(i);
      break;
    }

    // タッチ
    if (this.usingTouch) {
      if (Math.abs(this.touch.x) + Math.abs(this.touch.y) > 0.05) {
        x = this.touch.x;
        y = this.touch.y;
      }
      if (this.touch.jump) jumpDown = true;
      if (this.touch.jumpEdge) jumpPressed = true;
      if (this.touch.dash) dashDown = true;
      if (this.touch.slideEdge) slidePressed = true;
      this.touch.jumpEdge = false;
      this.touch.slideEdge = false;
    }

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = x;
    this.move.y = y;
    this.jumpDown = this.enabled && jumpDown;
    this.jumpPressed = this.enabled && jumpPressed;
    this.dashDown = this.enabled && dashDown;
    this.slidePressed = this.enabled && slidePressed;
    if (!this.enabled) {
      this.move.x = 0;
      this.move.y = 0;
    }
  }

  // フレームの最後に呼ぶ
  endFrame() {
    this.pressedKeys.clear();
    this.camDX = 0;
    this.camDY = 0;
  }

  camIdleTime() {
    return this.time - this.lastCamInput;
  }
}
