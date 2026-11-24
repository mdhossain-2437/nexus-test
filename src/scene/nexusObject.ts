import * as THREE from 'three';
import { CORE_FRAGMENT, CORE_VERTEX } from '../shaders/core';

/**
 * Builds the NEXUS centrepiece entirely procedurally:
 *
 *  - CORE   icosahedron displaced by a custom GLSL vertex/fragment shader
 *  - RINGS  three physically-based toroidal orbits at mutual angles
 *  - LATTICE ~1.1k instanced rods on a Fibonacci sphere shell
 *  - SHADOW a ShadowMaterial catcher plane grounding the composition
 *
 * No external model assets are used; every vertex is generated from
 * mathematics at runtime.
 */

export interface NexusObject {
  group: THREE.Group;
  coreMesh: THREE.Mesh<THREE.IcosahedronGeometry, THREE.ShaderMaterial>;
  ringMeshes: THREE.Mesh<THREE.TorusGeometry, THREE.MeshPhysicalMaterial>[];
  lattice: THREE.InstancedMesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;
  shadowPlane: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>;
  ringMaterial: THREE.MeshPhysicalMaterial;
  dispose(): void;
}

// Fibonacci sphere distribution — even angular coverage without poles clumping.
function fibonacciDirection(i: number, total: number, jitter: (n: number) => number): THREE.Vector3 {
  const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle
  const y = 1 - (2 * (i + 0.5) / total);
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = phi * i + jitter(0.35);
  return new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius).normalize();
}

export function createNexusObject(): NexusObject {
  const group = new THREE.Group();

  // ---------- CORE ----------
  const coreGeometry = new THREE.IcosahedronGeometry(1.35, 64);
  const coreMaterial = new THREE.ShaderMaterial({
    vertexShader: CORE_VERTEX,
    fragmentShader: CORE_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uDistortion: { value: 0.32 },
      uNoiseScale: { value: 1.4 },
      uFresnelPower: { value: 2.6 },
      uPaletteShift: { value: 0.12 },
      uMouse: { value: new THREE.Vector3(0, 0, 1) },
      uMouseInfluence: { value: 0.65 },
      uHover: { value: 0 },
      uEnergy: { value: 0 },
    },
  });
  const coreMesh = new THREE.Mesh(coreGeometry, coreMaterial);
  coreMesh.name = 'core';

  // ---------- RINGS ----------
  // A single shared physical material drives Material Studio controls.
  const ringMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xc8cfd6,
    metalness: 0.95,
    roughness: 0.28,
    transparent: true,
    opacity: 1,
    emissive: 0x22303a,
    emissiveIntensity: 0.35,
  });
  const ringMeshes: NexusObject['ringMeshes'] = [];
  const ringSpecs: Array<{ radius: number; tube: number; tilt: Array<number>; roll: number }> = [
    { radius: 2.35, tube: 0.045, tilt: [Math.PI / 2, 0, 0], roll: 0 },
    { radius: 2.85, tube: 0.03, tilt: [Math.PI / 2 - 0.5, 0.35, 0.18], roll: 0 },
    { radius: 3.35, tube: 0.028, tilt: [Math.PI / 2 + 0.22, -0.28, -0.1], roll: 0 },
  ];
  for (const spec of ringSpecs) {
    const geo = new THREE.TorusGeometry(spec.radius, spec.tube, 24, 220);
    const mesh = new THREE.Mesh(geo, ringMaterial);
    mesh.rotation.set(spec.tilt[0], 0, 0);
    mesh.rotation.y = spec.tilt[1];
    mesh.rotation.x += spec.tilt[2];
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.userData.layer = 'rings';
    ringMeshes.push(mesh);
    group.add(mesh);
  }

  // ---------- LATTICE ----------
  const LATTICE_COUNT = 1152;
  const rod = new THREE.BoxGeometry(0.012, 0.012, 0.34);
  const latticeMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa4ae,
    metalness: 0.9,
    roughness: 0.32,
  });
  const lattice = new THREE.InstancedMesh(rod, latticeMaterial, LATTICE_COUNT);
  lattice.userData.layer = 'lattice';
  lattice.castShadow = true;
  const dummy = new THREE.Object3D();
  const seeded = mulberry32(1080);
  for (let i = 0; i < LATTICE_COUNT; i++) {
    const dir = fibonacciDirection(i, LATTICE_COUNT, (amp) => (seeded() - 0.5) * amp);
    // Two shells: a dense inner shell and a sparser outer corona.
    const shell = i % 3 === 0 ? 3.75 : 3.05;
    const pos = dir.clone().multiplyScalar(shell + (seeded() - 0.5) * 0.18);
    dummy.position.copy(pos);
    // Orient the rod radially so the shell reads as a crystalline cage.
    dummy.lookAt(pos.clone().multiplyScalar(2));
    dummy.rotateX(Math.PI / 2);
    dummy.updateMatrix();
    lattice.setMatrixAt(i, dummy.matrix);
  }
  lattice.instanceMatrix.needsUpdate = true;

  group.add(coreMesh);
  group.add(lattice);

  // ---------- SHADOW CATCHER ----------
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.ShadowMaterial({ opacity: 0.32 }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = -4.4;
  shadowPlane.receiveShadow = true;
  group.add(shadowPlane);

  return {
    group,
    coreMesh,
    ringMeshes,
    lattice,
    shadowPlane,
    ringMaterial,
    dispose() {
      coreGeometry.dispose();
      coreMaterial.dispose();
      for (const m of ringMeshes) m.geometry.dispose();
      rod.dispose();
      latticeMaterial.dispose();
      ringMaterial.dispose();
      shadowPlane.geometry.dispose();
      (shadowPlane.material as THREE.Material).dispose();
    },
  };
}

/** Deterministic PRNG so the lattice layout is identical on every load. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
