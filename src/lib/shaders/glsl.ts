// ---------------------------------------------------------------------------
// NEXUS GLSL library. All shaders are written in GLSL1 style; three.js
// transpiles them to GLSL ES 3.00 when running on a WebGL2 context.
// ---------------------------------------------------------------------------

export const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

float fbm(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * snoise(p);
    p = p * 2.03 + vec3(11.3, 7.1, 5.9);
    a *= 0.5;
  }
  return v;
}

vec3 hueShift(vec3 color, float h) {
  const vec3 k = vec3(0.57735);
  float c = cos(h * 6.28318530718);
  return color * c + cross(k, color) * sin(h * 6.28318530718) * (1.0 - c) + k * dot(k, color) * (1.0 - c);
}
`;

// --- Plasma core: vertex displacement + fresnel rim -----------------------

export const CORE_VERT = /* glsl */ `
uniform float uTime;
uniform float uPulse;
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying float vDisplace;

${NOISE_GLSL}

void main() {
  float n = snoise(normalize(position) * 2.4 + vec3(0.0, uTime * 0.22, uTime * 0.13));
  float n2 = fbm(normalize(position) * 3.1 - vec3(uTime * 0.1));
  float d = n * 0.10 + n2 * 0.05 + uPulse * 0.03;
  vDisplace = d;
  vec3 displaced = position + normal * d;
  vec4 wp = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

export const CORE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uAccent;
varying vec3 vNormalW;
varying vec3 vWorldPos;
varying float vDisplace;

${NOISE_GLSL}

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  float bands = fbm(normalize(vWorldPos) * 4.0 + vec3(0.0, uTime * 0.35, -uTime * 0.2));
  float hot = smoothstep(0.1, 0.9, bands + vDisplace * 2.0);
  vec3 deep = vec3(0.012, 0.014, 0.02);
  vec3 mid = mix(vec3(0.10, 0.12, 0.16), uAccent * 0.35, hot);
  vec3 col = mix(deep, mid, clamp(hot * 1.4, 0.0, 1.0));
  col += uAccent * fres * 1.15;
  col += uAccent * hot * 0.22;
  gl_FragColor = vec4(col, 1.0);
}
`;

// --- Halo points: orbital motion in the vertex shader ----------------------

export const HALO_VERT = /* glsl */ `
uniform float uTime;
uniform float uRadius;
uniform float uSize;
uniform float uPixelRatio;
attribute float aSeed;
attribute float aOrbit;
varying float vTwinkle;

void main() {
  float ang = aSeed * 6.28318530718 + uTime * (0.05 + aOrbit * 0.12) * (aOrbit > 0.5 ? 1.0 : -1.0);
  float r = uRadius * (0.85 + 0.3 * fract(aSeed * 7.31));
  float incl = (fract(aSeed * 3.77) - 0.5) * 1.9;
  vec3 p = vec3(cos(ang) * r, sin(incl) * r * 0.55, sin(ang) * r);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vTwinkle = 0.5 + 0.5 * sin(uTime * (1.0 + fract(aSeed * 5.13) * 3.0) + aSeed * 40.0);
  gl_PointSize = uSize * uPixelRatio * (300.0 / -mv.z) * (0.6 + vTwinkle * 0.8);
  gl_Position = projectionMatrix * mv;
}
`;

export const HALO_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vTwinkle;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float alpha = smoothstep(0.5, 0.05, d) * vTwinkle * uOpacity;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

// --- GPGPU particle simulation (fragment shader on a float target) --------

export const SIM_FRAG = /* glsl */ `
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uDelta;
uniform float uTime;
uniform float uSpeed;
uniform float uSpread;
uniform float uMouseForce;
uniform vec3 uMouse;
uniform float uBound;
varying vec2 vUv;

${NOISE_GLSL}

float hash(float n) { return fract(sin(n) * 43758.5453123); }

void main() {
  vec4 prev = texture2D(uPrev, vUv);
  vec3 pos = prev.xyz;
  float seed = prev.w;

  vec3 flow = vec3(
    fbm(pos * 0.55 + vec3(0.0, uTime * 0.11, seed * 17.0)),
    fbm(pos * 0.55 + vec3(31.4, uTime * 0.09, seed * 29.0)),
    fbm(pos * 0.55 + vec3(57.1, 19.7, uTime * 0.13 + seed * 41.0))
  ) - 0.5;

  vec3 toMouse = pos - uMouse;
  float md = length(toMouse);
  vec3 repulse = (md > 0.0001 ? toMouse / md : vec3(0.0)) * uMouseForce * exp(-md * 1.4) * 2.2;

  vec3 vel = flow * uSpeed * 2.4 + repulse;
  pos += vel * uDelta * 3.0;

  float r = length(pos);
  if (r > uBound || r < 0.001) {
    float a = hash(seed + uTime) * 6.28318530718;
    float b = hash(seed * 1.7 + uTime * 0.7) * 6.28318530718;
    float rr = 0.4 + hash(seed * 3.1 + uTime * 1.3) * uBound * 0.9 * uSpread;
    pos = vec3(cos(a) * cos(b), sin(b), sin(a) * cos(b)) * rr;
  }

  gl_FragColor = vec4(pos, seed);
}
`;

export const SIM_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

// --- Particle render: reads a position texture ----------------------------

export const PARTICLE_VERT = /* glsl */ `
uniform sampler2D uPosTex;
uniform float uSize;
uniform float uPixelRatio;
attribute vec2 aUv;
attribute float aSeed;
varying float vSeed;
varying float vFade;

void main() {
  vec4 p = texture2D(uPosTex, aUv);
  vSeed = aSeed;
  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  float speedFade = clamp(length(p.xyz) * 0.25, 0.35, 1.0);
  vFade = speedFade;
  gl_PointSize = uSize * uPixelRatio * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

export const PARTICLE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vSeed;
varying float vFade;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float alpha = smoothstep(0.5, 0.08, d);
  alpha *= uOpacity * vFade * (0.55 + 0.45 * fract(vSeed * 7.7));
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

// --- Shader Lab surface ----------------------------------------------------

export const LAB_VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vPos;
void main() {
  vUv = uv;
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const LAB_FRAG = /* glsl */ `
uniform float uTime;
uniform vec2 uMouse;
uniform vec2 uResolution;
uniform float uFrequency;
uniform float uDistortion;
uniform float uHue;
uniform float uIntensity;
uniform int uPattern;
varying vec2 vUv;
varying vec3 vPos;

${NOISE_GLSL}

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float hash(float n) { return fract(sin(n) * 43758.5453123); }

vec2 warp(vec2 p, float t) {
  vec2 q;
  q.x = fbm(vec3(p * uFrequency, t));
  q.y = fbm(vec3(p * uFrequency + 5.2, t + 1.3));
  vec2 r;
  r.x = fbm(vec3(p * uFrequency + q * uDistortion * 2.0 + vec2(1.7, 9.2), t + 2.1));
  r.y = fbm(vec3(p * uFrequency + q * uDistortion * 2.0 + vec2(8.3, 2.8), t + 3.7));
  return p * uFrequency + (q + r) * uDistortion;
}

float voronoi(vec2 p, float t) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = vec2(hash(dot(ip + g, vec2(12.9898, 78.233)) + t * 0.13),
                    hash(dot(ip + g, vec2(39.346, 11.135)) + t * 0.17));
      o = 0.5 + 0.5 * sin(t * 0.8 + 6.2831 * o);
      float d = length(g + o - fp);
      if (d < f1) { f2 = f1; f1 = d; }
      else if (d < f2) { f2 = d; }
    }
  }
  return f2 - f1;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);
  float t = uTime * 0.35;
  vec2 m = (uMouse - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

  vec2 p = warp(uv, t);
  float v = 0.0;
  vec3 col = vec3(0.0);

  if (uPattern == 0) {
    // aurora: warped fbm bands
    v = fbm(vec3(p * 1.6, t * 0.6));
    float band = sin((uv.y + v * 2.2) * 6.0 + t * 1.4) * 0.5 + 0.5;
    col = mix(vec3(0.008, 0.01, 0.016), vec3(0.05, 0.35, 0.22), clamp(v * 1.5, 0.0, 1.0));
    col += vec3(0.1, 0.5, 0.45) * band * 0.35;
  } else if (uPattern == 1) {
    // voronoi cells
    v = fbm(vec3(uv * 2.0, t));
    float d = voronoi(uv * 4.0 + v * 1.5, t);
    float edge = smoothstep(0.0, 0.08, d);
    col = mix(vec3(0.02, 0.03, 0.05), vec3(0.55, 0.75, 0.7), edge);
    col *= 0.4 + 0.6 * hash(floor(uv * 4.0 + v * 1.5));
  } else if (uPattern == 2) {
    // ripple: mouse-centered interference
    float d = length(uv - m * 0.6);
    v = sin(d * 22.0 - t * 4.0 + fbm(vec3(uv * 3.0, t)) * 6.0 * uDistortion) * 0.5 + 0.5;
    col = mix(vec3(0.01, 0.012, 0.02), vec3(0.2, 0.45, 0.55), v);
    col += vec3(0.9, 0.95, 1.0) * pow(1.0 - smoothstep(0.0, 0.35, d), 3.0) * 0.6;
  } else {
    // plasma: classic sin interference
    v = sin(p.x * 3.0 + t) + sin(p.y * 3.0 - t * 1.3) + sin((p.x + p.y) * 2.0 + t * 0.7) + sin(length(p) * 4.0 - t * 2.0);
    v = v * 0.25 * 0.5 + 0.5;
    col = vec3(v, sin(v * 6.2831 + uHue * 6.2831) * 0.5 + 0.5, cos(v * 6.2831 + uHue * 6.2831) * 0.5 + 0.5) * 0.35;
  }

  col = hueShift(col, uHue);
  col *= uIntensity;
  float vig = smoothstep(1.4, 0.25, length(uv));
  col *= mix(0.55, 1.0, vig);
  gl_FragColor = vec4(col, 1.0);
}
`;
