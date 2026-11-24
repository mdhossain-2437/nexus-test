import * as THREE from 'three';
import { HALO_FRAGMENT, HALO_VERTEX, TRAIL_FRAGMENT, TRAIL_VERTEX } from '../shaders/particles';
import { mulberry32 } from './nexusObject';

/**
 * CPU particle simulation.
 *
 * Data layout (all preallocated once for the maximum capacity — the active
 * count is a prefix, so changing "particles" never reallocates):
 *
 *   home[]     fixed rest positions on a spherical shell
 *   pos[]      current positions      (drives halo points + trail heads)
 *   vel[]      velocities
 *   trail[]    line-strip pairs: [head, head - vel * k] per particle
 *
 * Forces per particle: spring to home, pointer attractor (projected onto the
 * interaction sphere), and a cheap divergence-free-ish swirl field built from
 * crossed trigonometric waves. Zero allocations happen inside step().
 */

export const MAX_PARTICLES = 24000;
const SHELL_RADIUS = 4.6;

export interface ParticleField {
  points: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  trails: THREE.LineSegments<THREE.BufferGeometry, THREE.ShaderMaterial>;
  activeCount: number;
  setActiveCount(n: number): void;
  setAttractor(point: THREE.Vector3 | null, mode: 'attract' | 'repel'): void;
  step(dt: number, params: { cohesion: number; attraction: number; turbulence: number }): void;
  dispose(): void;
}

export function createParticleField(): ParticleField {
  const rand = mulberry32(42);

  const home = new Float32Array(MAX_PARTICLES * 3);
  const pos = new Float32Array(MAX_PARTICLES * 3);
  const vel = new Float32Array(MAX_PARTICLES * 3);
  const seeds = new Float32Array(MAX_PARTICLES);
  const scales = new Float32Array(MAX_PARTICLES);

  for (let i = 0; i < MAX_PARTICLES; i++) {
    // Uniform-on-sphere home: perfect fit with the halo's angular coverage.
    const u = rand() * 2 - 1;
    const theta = rand() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    const radius = SHELL_RADIUS + (rand() - 0.5) * 2.2;
    const j = i * 3;
    home[j] = pos[j] = r * Math.cos(theta) * radius;
    home[j + 1] = pos[j + 1] = u * radius;
    home[j + 2] = pos[j + 2] = r * Math.sin(theta) * radius;
    seeds[i] = rand();
    scales[i] = 0.5 + rand();
  }

  // ---- halo instanced quads ----
  // One draw call, 4 vertices + 4 per-instance attributes per particle.
  const haloGeo = new THREE.InstancedBufferGeometry();
  const corners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  haloGeo.setAttribute(
    'aCorner',
    new THREE.BufferAttribute(corners, 2),
  );
  const posAttr = new THREE.InstancedBufferAttribute(pos, 3);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  haloGeo.setAttribute('aPos', posAttr);
  haloGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  haloGeo.setAttribute(
    'aScale',
    new THREE.InstancedBufferAttribute(scales, 1),
  );
  haloGeo.instanceCount = MAX_PARTICLES;

  const haloMat = new THREE.ShaderMaterial({
    vertexShader: HALO_VERTEX,
    fragmentShader: HALO_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uSize: { value: 3.1 },
      uColorA: { value: new THREE.Color('#8fd8c2') },
      uColorB: { value: new THREE.Color('#d8ff7a') },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Mesh(haloGeo, haloMat);
  points.frustumCulled = false;
  points.name = 'halo';

  // ---- trails ----
  const TRAIL_COUNT = 3000;
  const trailPos = new Float32Array(TRAIL_COUNT * 2 * 3);
  const trailFade = new Float32Array(TRAIL_COUNT * 2);
  for (let i = 0; i < TRAIL_COUNT; i++) {
    trailFade[i * 2] = 1.0;
    trailFade[i * 2 + 1] = 0.06;
  }
  const trailGeo = new THREE.BufferGeometry();
  const trailAttr = new THREE.BufferAttribute(trailPos, 3);
  trailAttr.setUsage(THREE.DynamicDrawUsage);
  trailGeo.setAttribute('position', trailAttr);
  trailGeo.setAttribute('aFade', new THREE.BufferAttribute(trailFade, 1));
  trailGeo.setDrawRange(0, TRAIL_COUNT * 2);

  const trailMat = new THREE.ShaderMaterial({
    vertexShader: TRAIL_VERTEX,
    fragmentShader: TRAIL_FRAGMENT,
    uniforms: {
      uOpacity: { value: 0.45 },
      uColor: { value: new THREE.Color('#a8ead2') },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const trails = new THREE.LineSegments(trailGeo, trailMat);
  trails.frustumCulled = false;

  let attractor: THREE.Vector3 | null = null;
  let attractorActive = false;
  let attractMode: 'attract' | 'repel' = 'attract';
  let activeCount = MAX_PARTICLES;

  function step(
    dt: number,
    params: { cohesion: number; attraction: number; turbulence: number },
  ) {
    const t = performance.now() * 0.0004;
    const cohesionK = params.cohesion * 2.2;
    const attractK = params.attraction * 5.5 * (attractMode === 'repel' ? -1 : 1);
    const turbK = params.turbulence * 0.9;
    const damping = 0.92;
    const packedDt = Math.min(dt, 1 / 45); // clamp to remain stable after stalls

    const attractX = attractor?.x ?? 0;
    const attractY = attractor?.y ?? 0;
    const attractZ = attractor?.z ?? 0;
    const hasAttractor = attractorActive && attractor !== null;

    const trailIdxStride = Math.max(1, Math.ceil(activeCount / TRAIL_COUNT));
    let trailCursor = 0;

    for (let i = 0; i < activeCount; i++) {
      const j = i * 3;
      let px = pos[j];
      let py = pos[j + 1];
      let pz = pos[j + 2];
      let vx = vel[j];
      let vy = vel[j + 1];
      let vz = vel[j + 2];

      // Spring toward home position.
      vx += (home[j] - px) * cohesionK * packedDt;
      vy += (home[j + 1] - py) * cohesionK * packedDt;
      vz += (home[j + 2] - pz) * cohesionK * packedDt;

      // Pointer attractor (inverse-square falloff, clamped near field).
      if (hasAttractor) {
        const dx = attractX - px;
        const dy = attractY - py;
        const dz = attractZ - pz;
        const d2 = dx * dx + dy * dy + dz * dz + 0.35;
        const w = attractK / d2;
        vx += dx * w * packedDt;
        vy += dy * w * packedDt;
        vz += dz * w * packedDt;
      }

      // Swirl field: non-conservative crossed waves, divergence-limited.
      if (turbK > 0) {
        const s1 = Math.sin(py * 0.6 + t * 2.0 + seeds[i] * 6.28);
        const s2 = Math.sin(pz * 0.55 - t * 1.6);
        const s3 = Math.sin(px * 0.5 + t * 1.2);
        vx += (s2 - s1 * 0.5) * turbK * packedDt;
        vy += (s3 - s2 * 0.5) * turbK * packedDt;
        vz += (s1 - s3 * 0.5) * turbK * packedDt;
      }

      // Integrate with exponential damping.
      const dampF = Math.pow(damping, packedDt * 60);
      vx *= dampF;
      vy *= dampF;
      vz *= dampF;
      px += vx * packedDt;
      py += vy * packedDt;
      pz += vz * packedDt;

      // Hard shell containment so bursts never escape composition.
      const r2 = px * px + py * py + pz * pz;
      const maxR = SHELL_RADIUS + 3.6;
      if (r2 > maxR * maxR) {
        const inv = maxR / Math.sqrt(r2);
        px *= inv; py *= inv; pz *= inv;
        vx *= -0.3; vy *= -0.3; vz *= -0.3;
      }

      pos[j] = px;
      pos[j + 1] = py;
      pos[j + 2] = pz;
      vel[j] = vx;
      vel[j + 1] = vy;
      vel[j + 2] = vz;

      // Write a velocity-stretched trail segment on a stride so that
      // trail count stays fixed regardless of particle count.
      if (i % trailIdxStride === 0 && trailCursor < TRAIL_COUNT) {
        const k = trailCursor * 6;
        trailPos[k] = px;
        trailPos[k + 1] = py;
        trailPos[k + 2] = pz;
        trailPos[k + 3] = px - vx * 0.16;
        trailPos[k + 4] = py - vy * 0.16;
        trailPos[k + 5] = pz - vz * 0.16;
        trailCursor++;
      }
    }

    // Fade unused trail slots out of draw range.
    trailGeo.setDrawRange(0, trailCursor * 2);
    (trailGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (haloGeo.getAttribute('aPos') as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  return {
    points,
    trails,
    get activeCount() {
      return activeCount;
    },
    setActiveCount(n: number) {
      activeCount = Math.max(64, Math.min(MAX_PARTICLES, Math.floor(n)));
      haloGeo.instanceCount = activeCount;
    },
    setAttractor(point, mode) {
      attractMode = mode;
      if (!point) {
        attractorActive = false;
        return;
      }
      if (!attractor) attractor = new THREE.Vector3();
      attractor.copy(point);
      attractorActive = true;
    },
    step,
    dispose() {
      haloGeo.dispose();
      haloMat.dispose();
      trailGeo.dispose();
      trailMat.dispose();
    },
  };
}
