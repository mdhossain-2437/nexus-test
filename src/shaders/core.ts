/*
 * GLSL sources for NEXUS.
 *
 * Shared chunks are exported separately and composed into the final
 * programs so the noise implementation exists exactly once.
 */

/** Ashima/Ian McEwan simplex noise (3D), public domain. Used by the core shader. */
export const SNOISE_3D = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
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
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

/** iq-style cosine palette. */
export const PALETTE = /* glsl */ `
vec3 palette(float t, float shift) {
  vec3 a = vec3(0.48, 0.42, 0.52);
  vec3 b = vec3(0.46, 0.38, 0.32);
  vec3 c = vec3(1.0, 0.95, 0.82);
  vec3 d = vec3(0.05, 0.16, 0.29);
  t += shift;
  return a + b * cos(6.28318 * (c * t + d));
}
`;

export interface CoreUniformsThree {
  uTime: { value: number };
  uDistortion: { value: number };
  uNoiseScale: { value: number };
  uFresnelPower: { value: number };
  uPaletteShift: { value: number };
  uMouse: { value: [number, number, number] };
  uMouseInfluence: { value: number };
  uHover: { value: number };
  uEnergy: { value: number };
}

export const CORE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uDistortion;
uniform float uNoiseScale;
uniform vec3 uMouse;        // pointer direction in object space
uniform float uMouseInfluence;
uniform float uHover;      // 0..1, eased on hover

varying vec3 vNormal;
varying vec3 vObjPos;
varying float vEnergy;

${SNOISE_3D}

void main() {
  vec3 n = normalize(position);
  float t = uTime * 0.45;

  // Primary breathing displacement: two octaves of simplex noise,
  // advected along the surface direction so crests travel over time.
  float n1 = snoise(n * (1.6 * uNoiseScale) + vec3(0.0, t, 0.0));
  float n2 = 0.5 * snoise(n * (3.4 * uNoiseScale) - vec3(t * 1.7, 0.0, t * 0.6));
  float disp = (n1 + n2) * uDistortion;

  // Pointer interaction: a bulge that follows the projected pointer
  // across the sphere, sharpened on hover.
  float proximity = max(dot(n, normalize(uMouse + vec3(1e-4))), 0.0);
  float bulge = pow(proximity, 12.0) * uMouseInfluence * (0.35 + uHover);
  disp += bulge;

  vec3 displaced = position + n * disp * 0.5;

  vEnergy = disp * 2.2 + bulge * 3.0;
  vObjPos = position;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(displaced, 1.0);
}
`;

export const CORE_FRAGMENT = /* glsl */ `
precision highp float;

uniform float uTime;
uniform float uPaletteShift;
uniform float uFresnelPower;
uniform float uEnergy;

varying vec3 vNormal;
varying vec3 vObjPos;
varying float vEnergy;

${SNOISE_3D}
${PALETTE}

float fbm(vec3 p) {
  float f = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    f += amp * snoise(p);
    p *= 2.03;
    amp *= 0.5;
  }
  return f;
}

void main() {
  vec3 viewDir = normalize(cameraPosition - vObjPos);
  float fresnel = pow(1.0 - abs(dot(viewDir, normalize(vNormal))), uFresnelPower);

  // Domain distortion: q warps the sampling domain of r before r
  // itself picks the final hue — a double-cosine warp. (IQ)
  float t = uTime * 0.12;
  vec3 p = vObjPos * 2.1 + vec3(0.0, t * 3.0, 0.0);
  vec3 q = vec3(fbm(p + vec3(0.0, 0.0, t)),
                fbm(p + vec3(3.2, 1.3, -t)),
                0.0);
  float r = fbm(p + 1.7 * q);

  vec3 base = palette(0.35 * r + length(q) * 0.35 + t * 0.3, uPaletteShift);
  vec3 rim = palette(r * 0.2 + 0.55, uPaletteShift + 0.08);

  vec3 col = base * 0.42 + fresnel * rim * (1.35 + uEnergy);
  col += pow(fresnel, 3.0) * 0.6;

  gl_FragColor = vec4(col, 1.0);
}
`;
