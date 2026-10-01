import * as THREE from 'three';

// 顔のデカール用テクスチャ（表情ごとに1枚）。
// キャンバス 512px が頭部ローカル座標の x∈[-0.11, 0.11]m / y∈[C.y+0.09, C.y-0.13]m に対応する（正面からの平行投影）。
export const FACE_UV = { halfWidth: 0.11, top: 0.09, bottom: -0.13 };
const SIZE = 512;
const K = SIZE / (FACE_UV.halfWidth * 2); // px / m

const px = (x) => SIZE / 2 + x * K;
const py = (yRel) => (FACE_UV.top - yRel) * K;

// 参照画像から測った顔の目印（頭の中心からの相対位置, m）
const EYE_X = 0.0425;
const EYE_Y = -0.046;
const MOUTH_Y = -0.089;

const LASH = '#3a2527';
const LASH_SOFT = '#6e4b4a';
const BROW = '#a8847e';
const MOUTH = '#8a5250';

function eyeOpening(ctx, W, H, lid) {
  // 目の開口部（外側の目尻が +x）。lid: 0=全開, 1=半目（ドヤ顔）
  const topY = -H * (0.98 - 0.42 * lid);
  ctx.beginPath();
  ctx.moveTo(-W * 0.96, H * 0.12);
  ctx.bezierCurveTo(-W * 0.8, topY * 0.95, W * 0.35, topY * 1.08, W * 1.0, -H * 0.2 - lid * H * 0.05);
  ctx.bezierCurveTo(W * 0.98, H * 0.3, W * 0.62, H * 0.72, 0, H * 0.74);
  ctx.bezierCurveTo(-W * 0.55, H * 0.74, -W * 0.9, H * 0.45, -W * 0.96, H * 0.12);
  ctx.closePath();
  return topY;
}

function drawOpenEye(ctx, cx, cy, side, o) {
  const W = 66 * (o.eyeScale || 1);
  const H = 56 * (o.eyeScale || 1);
  const lid = o.lid || 0;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(side, 1);

  // 白目
  const topY = eyeOpening(ctx, W, H, lid);
  ctx.fillStyle = '#fffaf8';
  ctx.fill();
  ctx.save();
  ctx.clip();

  // 虹彩：上が濃く、下に向かって明るいローズブラウン
  const irisR = W * 0.64 * (o.irisScale || 1);
  const irisRy = H * 0.96 * (o.irisScale || 1);
  const icx = -W * 0.04 + (o.lookX || 0) * W * 0.25;
  const icy = H * 0.1;
  let g = ctx.createLinearGradient(0, icy - irisRy, 0, icy + irisRy);
  g.addColorStop(0.0, '#3e2426');
  g.addColorStop(0.35, '#6f403f');
  g.addColorStop(0.7, '#b0706a');
  g.addColorStop(1.0, '#e2a597');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(icx, icy, irisR, irisRy, 0, 0, Math.PI * 2);
  ctx.fill();
  // 虹彩のふち
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(52,28,30,0.85)';
  ctx.stroke();
  // 瞳孔
  ctx.fillStyle = 'rgba(40,20,22,0.9)';
  ctx.beginPath();
  ctx.ellipse(icx, icy - irisRy * 0.08, irisR * 0.42, irisRy * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  // 下側の明るい反射（三日月）
  g = ctx.createRadialGradient(icx, icy + irisRy * 0.55, 2, icx, icy + irisRy * 0.55, irisR * 0.9);
  g.addColorStop(0, 'rgba(255,196,180,0.75)');
  g.addColorStop(1, 'rgba(255,196,180,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(icx, icy + irisRy * 0.5, irisR * 0.8, irisRy * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  // 上まぶたの落ち影
  g = ctx.createLinearGradient(0, topY, 0, topY + H * 0.55);
  g.addColorStop(0, 'rgba(120,70,70,0.55)');
  g.addColorStop(1, 'rgba(120,70,70,0)');
  ctx.fillStyle = g;
  ctx.fillRect(-W * 1.2, topY - 4, W * 2.4, H * 0.6);
  // ハイライト（大・小）
  if (!o.noShine) {
    ctx.fillStyle = 'rgba(255,255,255,0.96)';
    ctx.beginPath();
    ctx.ellipse(icx - irisR * 0.38, icy - irisRy * 0.28, irisR * 0.3, irisRy * 0.22, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(icx + irisR * 0.42, icy + irisRy * 0.42, irisR * 0.13, irisRy * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    if (o.sparkle) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      star(ctx, icx + irisR * 0.2, icy - irisRy * 0.05, irisR * 0.28);
    }
  }
  ctx.restore(); // clip

  // 上まつげ：太いライン＋目尻のはね
  eyeOpening(ctx, W, H, lid);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(-W * 0.96, H * 0.12);
  ctx.bezierCurveTo(-W * 0.8, topY * 0.95, W * 0.35, topY * 1.08, W * 1.0, -H * 0.2 - lid * H * 0.05);
  ctx.strokeStyle = LASH;
  ctx.lineWidth = 10;
  ctx.stroke();
  // 目尻側を厚く
  ctx.beginPath();
  ctx.moveTo(W * 0.25, topY * 1.02);
  ctx.bezierCurveTo(W * 0.6, topY * 0.98, W * 0.9, topY * 0.7, W * 1.12, -H * 0.12 - lid * H * 0.05);
  ctx.lineWidth = 15;
  ctx.stroke();
  // はね
  ctx.beginPath();
  ctx.moveTo(W * 0.95, -H * 0.3 - lid * H * 0.05);
  ctx.lineTo(W * 1.25, -H * 0.42 - lid * H * 0.08);
  ctx.lineWidth = 6;
  ctx.stroke();
  // 二重まぶたの線
  ctx.beginPath();
  ctx.moveTo(-W * 0.55, topY - H * 0.28);
  ctx.quadraticCurveTo(W * 0.2, topY - H * 0.42, W * 0.85, topY * 0.55 - H * 0.35);
  ctx.strokeStyle = 'rgba(160,110,105,0.6)';
  ctx.lineWidth = 3;
  ctx.stroke();
  // 下まつげ（目尻側だけ）
  ctx.beginPath();
  ctx.moveTo(W * 0.92, H * 0.18);
  ctx.bezierCurveTo(W * 0.8, H * 0.6, W * 0.35, H * 0.76, -W * 0.05, H * 0.76);
  ctx.strokeStyle = LASH_SOFT;
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.restore();
  ctx.restore();
}

function star(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.35;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function drawClosedEye(ctx, cx, cy, side, kind) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(side, 1);
  ctx.lineCap = 'round';
  ctx.strokeStyle = LASH;
  ctx.lineWidth = 10;
  ctx.beginPath();
  if (kind === 'happy') {
    // ^ ^ 形
    ctx.moveTo(-54, 14);
    ctx.quadraticCurveTo(0, -46, 56, 8);
  } else {
    // まばたき：下に弧
    ctx.moveTo(-58, 2);
    ctx.quadraticCurveTo(0, 36, 62, -6);
    ctx.lineWidth = 9;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(52, -2);
    ctx.lineTo(74, -14);
    ctx.lineWidth = 6;
  }
  ctx.stroke();
  ctx.restore();
}

function drawDizzyEye(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = LASH;
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 60; i++) {
    const a = i * 0.36;
    const r = 3 + i * 0.75;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.9);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBrows(ctx, o) {
  const tilt = o.browTilt === undefined ? 1 : o.browTilt; // 1=内側が下がる（ドヤ・きりっ）, -1=困り眉
  const lift = o.browLift || 0;
  for (const side of [-1, 1]) {
    const cx = px(side * EYE_X);
    const cy = py(EYE_Y) - 92 - lift;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(-48, 8 * tilt);
    ctx.quadraticCurveTo(0, -6 - 4 * tilt, 50, -6 * tilt);
    ctx.strokeStyle = BROW;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }
}

function drawMouth(ctx, kind) {
  const cx = px(0);
  const cy = py(MOUTH_Y);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = MOUTH;
  ctx.lineWidth = 5;
  if (kind === 'smile') {
    // 口角をすこし上げた、にんまり顔
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy - 4);
    ctx.bezierCurveTo(cx - 12, cy + 10, cx + 12, cy + 10, cx + 26, cy - 6);
    ctx.stroke();
  } else if (kind === 'open') {
    // 浅めの開いた口。あご先の丸みにかからないよう、下へ深くしすぎない
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(cx - 23, cy - 5);
      ctx.bezierCurveTo(cx - 13, cy + 20, cx + 13, cy + 20, cx + 23, cy - 5);
      ctx.closePath();
    };
    outline();
    ctx.fillStyle = '#9a4f52';
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#e88a8c';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 14, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 舌を描いたあとは今のパスが舌の楕円なので、口の輪郭を引き直してから線を描く
    // （そのまま stroke すると、口の下に舌の輪が線でぶら下がって見える）
    outline();
    ctx.stroke();
    // 小さな八重歯
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(cx + 8, cy - 2);
    ctx.lineTo(cx + 16, cy - 3);
    ctx.lineTo(cx + 12, cy + 5);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'o') {
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4, 12, 15, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#9a4f52';
    ctx.fill();
    ctx.stroke();
  } else if (kind === 'wavy') {
    ctx.beginPath();
    ctx.moveTo(cx - 30, cy + 2);
    for (let i = 0; i <= 12; i++) {
      const x = cx - 30 + i * 5;
      ctx.lineTo(x, cy + 2 + (i % 2 ? -6 : 4));
    }
    ctx.stroke();
  } else if (kind === 'cat') {
    // ω口
    ctx.beginPath();
    ctx.moveTo(cx - 26, cy - 2);
    ctx.quadraticCurveTo(cx - 13, cy + 16, cx, cy);
    ctx.quadraticCurveTo(cx + 13, cy + 16, cx + 26, cy - 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBlush(ctx, strength) {
  for (const side of [-1, 1]) {
    const cx = px(side * 0.052);
    const cy = py(-0.07);
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 58);
    g.addColorStop(0, `rgba(240,150,150,${0.5 * strength})`);
    g.addColorStop(1, 'rgba(240,150,150,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, 0.62);
    ctx.translate(-cx, -cy);
    ctx.beginPath();
    ctx.arc(cx, cy, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export const EXPRESSIONS = {
  smug: { eyes: 'open', lid: 0.42, mouth: 'smile', browTilt: 1, blush: 1 },
  blink: { eyes: 'blink', mouth: 'smile', browTilt: 1, blush: 1 },
  happy: { eyes: 'happy', mouth: 'open', browTilt: -0.3, browLift: 6, blush: 1.2 },
  surprised: { eyes: 'open', lid: -0.15, irisScale: 0.82, mouth: 'o', browTilt: -0.6, browLift: 14, blush: 0.7 },
  determined: { eyes: 'open', lid: 0.25, mouth: 'cat', browTilt: 1.6, blush: 0.9, sparkle: true },
  dizzy: { eyes: 'dizzy', mouth: 'wavy', browTilt: -1, blush: 0.8 },
  open: { eyes: 'open', lid: 0.0, mouth: 'open', browTilt: 0.4, blush: 1, sparkle: true },
};

export function drawFace(canvas, exprName) {
  const o = EXPRESSIONS[exprName] || EXPRESSIONS.smug;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, SIZE, SIZE);
  drawBlush(ctx, o.blush || 1);
  // 小さな鼻の影
  ctx.strokeStyle = 'rgba(214,150,140,0.55)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(px(0.002), py(-0.071));
  ctx.lineTo(px(-0.002), py(-0.075));
  ctx.stroke();
  drawBrows(ctx, o);
  for (const side of [-1, 1]) {
    const cx = px(side * EYE_X);
    const cy = py(EYE_Y);
    if (o.eyes === 'open') drawOpenEye(ctx, cx, cy, side, o);
    else if (o.eyes === 'dizzy') drawDizzyEye(ctx, cx, cy);
    else drawClosedEye(ctx, cx, cy, side, o.eyes);
  }
  drawMouth(ctx, o.mouth);
}

export function createFaceTextures() {
  const out = {};
  for (const name of Object.keys(EXPRESSIONS)) {
    const c = document.createElement('canvas');
    c.width = SIZE;
    c.height = SIZE;
    drawFace(c, name);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    out[name] = t;
  }
  return out;
}
