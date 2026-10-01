import { WORLD, QUAY_Z, RH, N, line, LIGHTHOUSE } from '../world/cityPlan.js';

// ミニマップ：街を一度だけ描いておき、毎フレーム「カメラの向きが上」になるよう回して表示
const LOT_COLORS = { R: '#efe4d2', C: '#f2dcc9', D: '#dfe3ea', P: '#bfe3a6', S: '#e8e0d0', Z: '#f6e6c4', F: '#a8d496', M: '#ece3d2', L: '#e2ecd8', H: '#e8f1ea', K: '#eee6c6', A: '#dcd9d3' };

export class Minimap {
  constructor(canvas, city) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.city = city;
    this.scale = 1.05; // CSS px / m
    this.base = this.renderBase();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.size = 0;
    this.t = 0;
  }

  renderBase() {
    const plan = this.city.plan;
    const w = Math.ceil(WORLD.maxX - WORLD.minX);
    const h = Math.ceil(WORLD.maxZ - WORLD.minZ);
    const c = document.createElement('canvas');
    const S = 2; // 1m = 2px
    c.width = w * S;
    c.height = h * S;
    const g = c.getContext('2d');
    g.scale(S, S);
    g.translate(-WORLD.minX, -WORLD.minZ);
    g.fillStyle = '#cfe6c2';
    g.fillRect(WORLD.minX, WORLD.minZ, w, h);
    g.fillStyle = '#8fcbe0';
    g.fillRect(WORLD.minX, QUAY_Z, w, WORLD.maxZ - QUAY_Z);
    // 道路
    g.fillStyle = '#ffffff';
    for (const s of plan.segments) {
      if (s.axis === 'z') g.fillRect(s.x0 - RH, s.z0 - RH, RH * 2, s.z1 - s.z0 + RH * 2);
      else g.fillRect(s.x0 - RH, s.z0 - RH, s.x1 - s.x0 + RH * 2, RH * 2);
    }
    g.fillRect(line(0) - RH - 2.5, line(N) + RH, line(N) - line(0) + 2 * RH + 5, QUAY_Z - line(N) - RH);
    // 敷地
    for (const l of plan.grounds) {
      g.fillStyle = LOT_COLORS[l.type] || '#e8e0d4';
      g.fillRect(l.x0, l.z0, l.x1 - l.x0, l.z1 - l.z0);
    }
    // 建物
    for (const b of plan.buildings) {
      g.fillStyle = b.style === 'house' ? '#c9a58f' : b.style === 'shop' ? '#d2b39c' : b.style === 'glass' || b.style === 'office' ? '#aeb9c6' : '#bfb2a2';
      g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
    }
    // 池・噴水
    g.fillStyle = '#8fcbe0';
    for (const p of this.city.pools) {
      g.beginPath();
      g.ellipse(p.x, p.z, p.r * (p.sx || 1), p.r, 0, 0, Math.PI * 2);
      g.fill();
    }
    // 桟橋・防波堤
    g.fillStyle = '#d6c1a2';
    for (const c2 of this.city.col.list) {
      if (c2.tag === 'pier') g.fillRect(c2.minX, c2.minZ, c2.maxX - c2.minX, c2.maxZ - c2.minZ);
    }
    g.fillStyle = '#e05a4e';
    g.beginPath();
    g.arc(LIGHTHOUSE.x, LIGHTHOUSE.z, 2.5, 0, Math.PI * 2);
    g.fill();
    this.baseScale = S;
    return c;
  }

  // info: { px, pz, yaw(カメラ), heading(プレイヤー), customers:[{x,z,color}], dest:{x,z}|null, route:[{x,z}] }
  draw(info, dt) {
    this.t += dt;
    const cv = this.canvas;
    const css = cv.clientWidth || 170;
    const px2 = Math.round(css * this.dpr);
    if (cv.width !== px2) {
      cv.width = px2;
      cv.height = px2;
    }
    const g = this.ctx;
    const W = cv.width;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    g.clip();
    const s = this.scale * this.dpr;
    const th = info.yaw;
    const a = -Math.cos(th) * s;
    const b = -Math.sin(th) * s;
    const c = Math.sin(th) * s;
    const d = -Math.cos(th) * s;
    g.setTransform(a, b, c, d, W / 2, W / 2);
    g.translate(-info.px, -info.pz);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.base, WORLD.minX, WORLD.minZ, this.base.width / this.baseScale, this.base.height / this.baseScale);
    // 経路
    if (info.route && info.route.length) {
      g.strokeStyle = '#ff8a3d';
      g.lineWidth = 3.2 / this.scale;
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.setLineDash([6 / this.scale, 4 / this.scale]);
      g.lineDashOffset = -this.t * 18;
      g.beginPath();
      g.moveTo(info.px, info.pz);
      for (const p of info.route) g.lineTo(p.x, p.z);
      g.stroke();
      g.setLineDash([]);
    }
    const toCanvas = (x, z) => {
      const dx = x - info.px;
      const dz = z - info.pz;
      return [W / 2 + a * dx + c * dz, W / 2 + b * dx + d * dz];
    };
    g.setTransform(1, 0, 0, 1, 0, 0);
    // お客さん
    for (const cu of info.customers || []) {
      let [x, y] = toCanvas(cu.x, cu.z);
      const r = W / 2 - 7 * this.dpr;
      const dx = x - W / 2;
      const dy = y - W / 2;
      const l = Math.hypot(dx, dy);
      const edge = l > r;
      if (edge) {
        x = W / 2 + (dx / l) * r;
        y = W / 2 + (dy / l) * r;
      }
      g.fillStyle = cu.color;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2 * this.dpr;
      g.beginPath();
      g.arc(x, y, (edge ? 4 : 5.5) * this.dpr, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // 目的地
    if (info.dest) {
      let [x, y] = toCanvas(info.dest.x, info.dest.z);
      const r = W / 2 - 9 * this.dpr;
      const dx = x - W / 2;
      const dy = y - W / 2;
      const l = Math.hypot(dx, dy);
      if (l > r) {
        x = W / 2 + (dx / l) * r;
        y = W / 2 + (dy / l) * r;
      }
      const pulse = 1 + Math.sin(this.t * 8) * 0.15;
      star(g, x, y, 9 * this.dpr * pulse, '#ff5d8f');
    }
    // プレイヤー（向き）
    const rel = info.heading - th;
    g.save();
    g.translate(W / 2, W / 2);
    g.rotate(-rel);
    g.fillStyle = '#7f4f45';
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2 * this.dpr;
    g.beginPath();
    const k = this.dpr;
    g.moveTo(0, -9 * k);
    g.lineTo(6.5 * k, 7 * k);
    g.lineTo(0, 3.5 * k);
    g.lineTo(-6.5 * k, 7 * k);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    g.restore();
    // 外枠
    g.strokeStyle = 'rgba(127,104,102,0.9)';
    g.lineWidth = 4 * this.dpr;
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2 - 2 * this.dpr, 0, Math.PI * 2);
    g.stroke();
  }
}

function star(g, x, y, r, color) {
  g.fillStyle = color;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 2.2;
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.stroke();
}
