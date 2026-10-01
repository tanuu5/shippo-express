import * as THREE from 'three';

// 街のマテリアル（MeshStandardMaterial に手続き的な模様を差し込む）

const NOISE = /* glsl */ `
float h21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = h21(i);
  float b = h21(i + vec2(1.0, 0.0));
  float c = h21(i + vec2(0.0, 1.0));
  float d = h21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p *= 2.03;
    a *= 0.5;
  }
  return s;
}
`;

// 建物：uv = 壁面上の位置 (m)、aWin = (階高, 窓の間隔, 様式, 乱数種)
export function makeBuildingMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0.0, envMapIntensity: 0.6 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 aWin;
varying vec2 vFacade;
varying vec4 vWin;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
vFacade = uv;
vWin = aWin;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vFacade;
varying vec4 vWin;
float gWin = 0.0;
${NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec2 f = vFacade;
  float style = vWin.z;
  vec3 col = diffuseColor.rgb;
  if (style > 0.5) {
    float fh = max(vWin.x, 0.5);
    float sp = max(vWin.y, 0.5);
    float seed = vWin.w;
    float fl = floor(f.y / fh);
    float ly = fract(f.y / fh);
    float cx = floor(f.x / sp);
    float lx = fract(f.x / sp);
    float h = h21(vec2(cx + seed * 17.0, fl + seed * 3.0));
    vec2 wmin = vec2(0.3, 0.32);
    vec2 wmax = vec2(0.7, 0.8);
    float allow = 1.0;
    float framed = 1.0;
    if (style < 1.5) {
      if (fl < 0.5 && h < 0.18) allow = 0.0;
    } else if (style < 2.5) {
      if (fl < 0.5) { wmin = vec2(0.06, 0.06); wmax = vec2(0.94, 0.7); }
      else { wmin = vec2(0.25, 0.3); wmax = vec2(0.75, 0.82); }
    } else if (style < 3.5) {
      wmin = vec2(0.04, 0.3); wmax = vec2(0.96, 0.86); framed = 0.0;
    } else if (style < 4.5) {
      wmin = vec2(0.035, 0.06); wmax = vec2(0.965, 0.95); framed = 0.0;
    } else if (style < 5.5) {
      wmin = vec2(0.2, 0.26); wmax = vec2(0.8, 0.86);
    } else {
      wmin = vec2(0.18, 0.66); wmax = vec2(0.82, 0.88); framed = 0.0;
      if (fl > 0.5) allow = 0.0;
    }
    float aa = 0.012;
    float inX = smoothstep(wmin.x - aa, wmin.x + aa, lx) * (1.0 - smoothstep(wmax.x - aa, wmax.x + aa, lx));
    float inY = smoothstep(wmin.y - aa, wmin.y + aa, ly) * (1.0 - smoothstep(wmax.y - aa, wmax.y + aa, ly));
    float win = inX * inY * allow;
    float fx = step(wmin.x - 0.045, lx) * step(lx, wmax.x + 0.045);
    float fy = step(wmin.y - 0.05, ly) * step(ly, wmax.y + 0.07);
    float frame = fx * fy * (1.0 - win) * allow * framed;
    vec3 glass = mix(vec3(0.26, 0.33, 0.42), vec3(0.6, 0.71, 0.8), smoothstep(wmin.y, wmax.y, ly));
    if (style < 2.5 || (style > 4.5 && style < 5.5)) glass = mix(glass, vec3(0.94, 0.86, 0.74), step(0.7, h) * 0.6);
    if (style > 3.5 && style < 4.5) glass = mix(vec3(0.32, 0.44, 0.56), vec3(0.64, 0.76, 0.86), ly) * (0.88 + 0.22 * h);
    col = mix(col, vec3(0.97, 0.96, 0.93), frame);
    col = mix(col, glass, win);
    // 階ごとの目地
    col *= 1.0 - 0.07 * (1.0 - smoothstep(0.0, 0.035, ly)) * step(1.5, style);
    // 壁の下の方をうっすら暗く（接地感）
    col *= mix(0.74, 1.0, smoothstep(0.0, 1.4, f.y));
    gWin = win;
  } else if (style < -0.5) {
    // 屋根・屋上：うっすらムラ
    col *= 0.93 + 0.1 * fbm(f * 0.6);
  }
  diffuseColor.rgb = col;
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.16, gWin);`,
      );
  };
  m.customProgramCacheKey = () => 'building-v1';
  return m;
}

// 地面：uv = 地面上の位置 (m)、aKind = (種類, 補助値)
export const GK = {
  ROAD: 0,
  CROSS: 1,
  JUNCTION: 2,
  WALK: 3,
  CURB: 4,
  GRASS: 5,
  TILES: 6,
  PLAZA_ROUND: 7,
  DIRT: 8,
  CONCRETE: 9,
  WOOD: 10,
  STONE: 11,
  FOREST: 12,
  GARDEN: 13,
  FIELD: 14,
  RAIL: 15,
};

export function makeGroundMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.4 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 aKind;
varying vec2 vG;
varying vec2 vKind;
varying vec3 vWP;`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
vG = uv;
vKind = aKind;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec2 vG;
varying vec2 vKind;
varying vec3 vWP;
float gRough = 0.92;
${NOISE}
vec3 asphalt(vec2 p) {
  float n = fbm(p * 1.3) * 0.5 + h21(floor(p * 18.0)) * 0.25;
  vec3 c = mix(vec3(0.36, 0.38, 0.42), vec3(0.44, 0.46, 0.5), n);
  c *= 0.93 + 0.1 * fbm(p * 0.08);
  return c;
}
vec3 grassCol(vec2 p, vec3 a, vec3 b) {
  float n = fbm(p * 0.35);
  vec3 c = mix(a, b, n);
  c *= 0.9 + 0.2 * h21(floor(p * 9.0));
  float fl = step(0.985, h21(floor(p * 3.0)));
  c = mix(c, mix(vec3(1.0, 0.97, 0.9), vec3(1.0, 0.86, 0.4), h21(floor(p * 3.0) + 7.0)), fl * 0.8);
  return c;
}
`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float k = floor(vKind.x + 0.5);
  vec2 p = vG;
  vec3 c = vec3(0.5);
  if (k == 0.0) {
    // 車道：p.x=中心からの横位置, p.y=進行方向の距離
    c = asphalt(vWP.xz);
    float ax = abs(p.x);
    float edge = smoothstep(3.5, 3.55, ax) * (1.0 - smoothstep(3.68, 3.73, ax));
    float center = (1.0 - smoothstep(0.07, 0.11, ax)) * step(0.45, fract(p.y / 6.0));
    c = mix(c, vec3(0.93, 0.92, 0.88), max(edge, center) * 0.92);
    // 路面の補修跡
    c *= 0.94 + 0.06 * step(0.5, vnoise(vWP.xz * 0.15));
  } else if (k == 1.0) {
    c = asphalt(vWP.xz);
    float s = step(0.5, fract(p.x / 0.9));
    float inside = step(0.45, abs(p.x)) * step(abs(p.x), 3.4);
    c = mix(c, vec3(0.93, 0.93, 0.9), s * inside * 0.9);
  } else if (k == 2.0) {
    c = asphalt(vWP.xz) * 0.97;
    // マンホール
    float d = length(fract(p / 22.0 + 0.37) * 22.0 - 11.0);
    c = mix(c, vec3(0.32, 0.33, 0.35), (1.0 - smoothstep(0.34, 0.37, d)) * 0.9);
  } else if (k == 3.0) {
    // 歩道：レンガ敷き（半目地ずらし）
    vec2 q = vWP.xz * vec2(2.5, 5.0);
    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
    vec2 cell = floor(q);
    vec2 fq = fract(q);
    float jn = step(0.06, fq.x) * step(0.1, fq.y);
    float hh = h21(cell);
    vec3 brick = mix(vec3(0.84, 0.76, 0.66), vec3(0.78, 0.62, 0.52), step(0.8, hh));
    brick *= 0.92 + 0.12 * hh;
    c = mix(vec3(0.62, 0.58, 0.54), brick, jn);
  } else if (k == 4.0) {
    c = vec3(0.8, 0.79, 0.76) * (0.94 + 0.08 * vnoise(vWP.xz * 3.0));
  } else if (k == 5.0) {
    c = grassCol(vWP.xz, vec3(0.42, 0.62, 0.3), vec3(0.56, 0.72, 0.36));
  } else if (k == 6.0) {
    vec2 q = vWP.xz / 0.8;
    vec2 cell = floor(q);
    vec2 fq = fract(q);
    float jn = step(0.04, fq.x) * step(0.04, fq.y);
    float ch = mod(cell.x + cell.y, 2.0);
    vec3 t = mix(vec3(0.86, 0.83, 0.78), vec3(0.79, 0.75, 0.7), ch);
    t *= 0.95 + 0.07 * h21(cell);
    c = mix(vec3(0.6, 0.57, 0.53), t, jn);
  } else if (k == 7.0) {
    // 広場：同心円の石畳
    float r = length(p);
    float a = r > 1e-4 ? atan(p.y, p.x) : 0.0;
    float ring = floor(r / 1.2);
    float seg = floor(a * (6.0 + ring * 2.0) / 6.2831);
    vec2 fq = vec2(fract(r / 1.2), fract(a * (6.0 + ring * 2.0) / 6.2831));
    float jn = step(0.06, fq.x) * step(0.04, fq.y);
    vec3 t = mix(vec3(0.88, 0.84, 0.77), vec3(0.8, 0.72, 0.64), step(0.5, fract(ring * 0.5)));
    t = mix(t, vec3(0.72, 0.62, 0.55), step(0.86, h21(vec2(ring, seg))) * 0.6);
    c = mix(vec3(0.62, 0.58, 0.54), t, jn);
  } else if (k == 8.0) {
    c = mix(vec3(0.74, 0.64, 0.5), vec3(0.8, 0.71, 0.56), fbm(vWP.xz * 0.5));
    c *= 0.94 + 0.08 * h21(floor(vWP.xz * 7.0));
  } else if (k == 9.0) {
    vec2 q = vWP.xz / 4.0;
    vec2 fq = fract(q);
    float jn = step(0.012, fq.x) * step(0.012, fq.y);
    c = mix(vec3(0.62, 0.62, 0.6), vec3(0.72, 0.71, 0.68), fbm(vWP.xz * 0.3) * 0.8 + 0.1 * h21(floor(q)));
    c *= mix(0.8, 1.0, jn);
  } else if (k == 10.0) {
    // 桟橋の板
    float q = vWP.x / 0.32;
    float fq = fract(q);
    float jn = step(0.08, fq);
    float hh = h21(vec2(floor(q), floor(vWP.z / 3.1 + h21(vec2(floor(q), 1.0)))));
    vec3 w = mix(vec3(0.55, 0.4, 0.28), vec3(0.66, 0.5, 0.36), hh);
    c = mix(vec3(0.25, 0.2, 0.16), w, jn);
  } else if (k == 11.0) {
    vec2 q = vWP.xz / 0.9;
    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
    vec2 cell = floor(q);
    vec2 fq = fract(q);
    float jn = step(0.07, fq.x) * step(0.07, fq.y);
    c = mix(vec3(0.5, 0.5, 0.48), vec3(0.7, 0.69, 0.66) * (0.88 + 0.16 * h21(cell)), jn);
  } else if (k == 12.0) {
    c = grassCol(vWP.xz, vec3(0.3, 0.46, 0.24), vec3(0.42, 0.52, 0.3));
    c = mix(c, vec3(0.55, 0.42, 0.3), step(0.8, vnoise(vWP.xz * 1.7)) * 0.5);
  } else if (k == 13.0) {
    c = grassCol(vWP.xz, vec3(0.48, 0.66, 0.34), vec3(0.6, 0.76, 0.42));
  } else if (k == 14.0) {
    c = mix(vec3(0.8, 0.66, 0.5), vec3(0.84, 0.72, 0.56), fbm(vWP.xz * 0.4));
    // 白線
    float lines = (1.0 - smoothstep(0.06, 0.1, abs(fract(p.x / 12.0 + 0.5) - 0.5) * 12.0)) * step(abs(p.y), 18.0);
    c = mix(c, vec3(0.97), lines * 0.8);
  } else if (k == 15.0) {
    // 線路：バラスト＋枕木＋レール
    c = mix(vec3(0.5, 0.48, 0.45), vec3(0.62, 0.6, 0.56), h21(floor(vWP.xz * 6.0)));
    float sl = step(0.62, fract(vWP.x / 0.6)) * step(abs(p.y), 1.3);
    c = mix(c, vec3(0.38, 0.3, 0.24), sl);
    float rail = (1.0 - smoothstep(0.03, 0.06, abs(abs(p.y) - 0.75)));
    c = mix(c, vec3(0.72, 0.72, 0.74), rail);
  }
  gRough = (k == 0.0 || k == 2.0) ? 0.82 : 0.93;
  diffuseColor.rgb = c;
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = gRough;`,
      );
  };
  m.customProgramCacheKey = () => 'ground-v1';
  return m;
}

// 海・池：波で法線を揺らす
export function makeWaterMaterial(opts = {}) {
  const uniforms = { uTime: { value: 0 } };
  const m = new THREE.MeshStandardMaterial({
    color: opts.color || 0x3f9bb0,
    roughness: 0.12,
    metalness: 0.0,
    envMapIntensity: 1.0,
    transparent: !!opts.transparent,
    opacity: opts.opacity || 1,
  });
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPw;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvWPw = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uTime;
varying vec3 vWPw;
${NOISE}`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float n = fbm(vWPw.xz * 0.08 + vec2(uTime * 0.02, uTime * 0.013));
  diffuseColor.rgb *= 0.85 + 0.3 * n;
  // 岸寄りの明るい帯
  float sparkle = step(0.93, vnoise(vWPw.xz * 1.6 + vec2(uTime * 0.6, -uTime * 0.4)));
  diffuseColor.rgb += sparkle * 0.18;
}`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
{
  vec2 q = vWPw.xz;
  float t = uTime;
  float dx = cos(q.x * 0.35 + t * 1.1) * 0.08 + cos(q.x * 0.9 + q.y * 0.5 + t * 1.7) * 0.05 + (vnoise(q * 0.8 + t * 0.3) - 0.5) * 0.12;
  float dz = cos(q.y * 0.3 + t * 0.9) * 0.08 + cos(q.y * 1.1 - q.x * 0.4 + t * 1.3) * 0.05 + (vnoise(q * 0.8 - t * 0.25 + 3.1) - 0.5) * 0.12;
  vec3 nW = normalize(vec3(-dx, 1.0, -dz));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
}`,
      );
  };
  m.customProgramCacheKey = () => 'water-v1';
  return m;
}

// カメラのすぐ手前に来た面を点描で透かす（木の葉・街灯などにカメラがめり込んだとき画面を覆わないように）
export function addNearFade(m, near = 0.9, far = 2.4) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    // 4x4 のベイヤー配列で規則的に抜く（乱数の点描よりノイズっぽくならない）
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
float nfBayer(vec2 p) {
  ivec2 i = ivec2(mod(p, 4.0));
  const float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[i.x + i.y * 4] + 0.5) / 16.0;
}`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
{
  float camD = length(vViewPosition);
  if (camD < ${far.toFixed(2)}) {
    float keep = clamp((camD - ${near.toFixed(2)}) / ${(far - near).toFixed(2)}, 0.0, 1.0);
    if (nfBayer(gl_FragCoord.xy) > keep) discard;
  }
}`,
      );
  };
  const key = m.customProgramCacheKey ? m.customProgramCacheKey() : '';
  m.customProgramCacheKey = () => key + '|nearfade';
  return m;
}

export function vcolMat(opts = {}) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.5, ...opts });
  return addNearFade(m);
}
