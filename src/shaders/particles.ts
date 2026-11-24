/*
 * Shaders for the halo particle field and the line-segment trails.
 *
 * The halo is drawn as one instanced billboard quad per particle rather
 * than gl_Points. Rationale: point sprites are officially absent from
 * WebGPU, are capped by an implementation-defined ALIASED_POINT_SIZE_RANGE
 * in WebGL, and were observed to corrupt entire post-processing pipelines
 * on ANGLE/SwiftShader when sizes vary per vertex. Instanced quads have no
 * such limits, scale identically, and preserve the same single-draw-call
 * budget (24,000 instances max).
 */

export const HALO_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uSize;

attribute vec3 aPos;    // per-instance position (updated by the CPU sim)
attribute vec2 aCorner;  // quad corner in [-1, 1]
attribute float aSeed;
attribute float aScale;

varying float vFade;
varying float vSeed;
varying vec2 vCorner;

void main() {
  vec4 mv = modelViewMatrix * vec4(aPos, 1.0);

  // Perspective-attenuated billboard size — camera-facing by construction.
  float tw = 0.65 + 0.35 * sin(uTime * (0.6 + aSeed * 1.4) + aSeed * 40.0);
  float dist = max(0.6, -mv.z);
  float size = uSize * aScale * tw * (1.7 / dist) * 0.045;
  mv.xy += aCorner * size;

  vFade = tw;
  vSeed = aSeed;
  vCorner = aCorner;
  gl_Position = projectionMatrix * mv;
}
`;

export const HALO_FRAGMENT = /* glsl */ `
precision mediump float;

uniform vec3 uColorA;
uniform vec3 uColorB;

varying float vFade;
varying float vSeed;
varying vec2 vCorner;

void main() {
  float d = dot(vCorner, vCorner);
  if (d > 1.0) discard;
  float soft = pow(1.0 - d, 2.5);
  vec3 col = mix(uColorA, uColorB, vSeed);
  gl_FragColor = vec4(col * soft * vFade, soft * vFade);
}
`;

export const TRAIL_VERTEX = /* glsl */ `
attribute float aFade;   // 1.0 at particle head, low at tail vertex
varying float vFade;

void main() {
  vFade = aFade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const TRAIL_FRAGMENT = /* glsl */ `
precision mediump float;

uniform float uOpacity;
uniform vec3 uColor;

varying float vFade;

void main() {
  gl_FragColor = vec4(uColor, uOpacity * vFade);
}
`;
