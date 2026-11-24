import * as THREE from "three";
import { CORE_FRAG, CORE_VERT, HALO_FRAG, HALO_VERT } from "./shaders/glsl";

export interface LayerDef {
  id: string;
  object: THREE.Object3D;
  explodeDir: THREE.Vector3;
  explodeDist: number;
  baseScale: number;
}

const ACCENT = new THREE.Color("#d7ff3f");

function fibonacciSphere(count: number, radius: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = phi * i;
    points.push(new THREE.Vector3(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius));
  }
  return points;
}

export class NexusObject {
  readonly group = new THREE.Group();
  private layers = new Map<string, LayerDef>();
  private coreMat: THREE.ShaderMaterial;
  private shellMat: THREE.MeshPhysicalMaterial;
  private metalMat: THREE.MeshPhysicalMaterial;
  private haloMat: THREE.ShaderMaterial;
  private latticeLineMat: THREE.LineBasicMaterial;
  private satellites: THREE.InstancedMesh;
  private satParams: { radius: number; speed: number; phase: number; incl: number }[] = [];
  private gyros: THREE.Group[] = [];
  private pulse = 0;
  private hoveredId: string | null = null;

  constructor() {
    this.group.name = "nexus";

    this.coreMat = new THREE.ShaderMaterial({
      vertexShader: CORE_VERT,
      fragmentShader: CORE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPulse: { value: 0 },
        uAccent: { value: ACCENT.clone() },
      },
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.92, 4), this.coreMat);
    core.name = "core";
    core.castShadow = true;
    this.addLayer("core", core, new THREE.Vector3(0, 0, 0), 0);

    this.shellMat = new THREE.MeshPhysicalMaterial({
      color: "#aebdd2",
      metalness: 0.0,
      roughness: 0.06,
      transmission: 0.92,
      thickness: 0.7,
      ior: 1.45,
      transparent: true,
      opacity: 0.35,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1.55, 96, 64), this.shellMat);
    shell.name = "shell";
    shell.castShadow = true;
    this.addLayer("shell", shell, new THREE.Vector3(0, 0, 0), 0);

    this.metalMat = new THREE.MeshPhysicalMaterial({
      color: "#c9d4e3",
      metalness: 0.9,
      roughness: 0.22,
      clearcoat: 0.6,
      clearcoatRoughness: 0.25,
      envMapIntensity: 1.2,
      emissive: "#d7ff3f",
      emissiveIntensity: 0.35,
    });
    const gyroGroup = new THREE.Group();
    const ringDefs = [
      { r: 1.95, tube: 0.028, tilt: new THREE.Euler(0.4, 0, 0.2) },
      { r: 2.2, tube: 0.02, tilt: new THREE.Euler(-0.5, 0.3, 0.9) },
      { r: 2.45, tube: 0.014, tilt: new THREE.Euler(0.9, -0.4, -0.3) },
    ];
    for (const def of ringDefs) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(def.r, def.tube, 24, 220), this.metalMat);
      ring.castShadow = true;
      const holder = new THREE.Group();
      holder.rotation.copy(def.tilt);
      holder.add(ring);
      gyroGroup.add(holder);
      this.gyros.push(holder);
    }
    this.addLayer("gyro", gyroGroup, new THREE.Vector3(0, 0, 1), 1.4);

    const latticePts = fibonacciSphere(900, 2.75);
    const posArr = new Float32Array(latticePts.length * 3);
    latticePts.forEach((p, i) => posArr.set([p.x, p.y, p.z], i * 3));
    const latticeGeo = new THREE.BufferGeometry();
    latticeGeo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    const latticePtsMat = new THREE.PointsMaterial({
      color: "#8fa3c0",
      size: 0.035,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const latticePoints = new THREE.Points(latticeGeo, latticePtsMat);
    const edges: number[] = [];
    const threshold = 0.62;
    for (let i = 0; i < latticePts.length; i++) {
      for (let j = i + 1; j < latticePts.length; j++) {
        if (latticePts[i].distanceTo(latticePts[j]) < threshold) {
          edges.push(i, j);
        }
      }
    }
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setIndex(edges);
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(posArr, 3));
    this.latticeLineMat = new THREE.LineBasicMaterial({
      color: "#4a5568",
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
    });
    const latticeLines = new THREE.LineSegments(edgeGeo, this.latticeLineMat);
    const lattice = new THREE.Group();
    lattice.add(latticePoints);
    lattice.add(latticeLines);
    this.addLayer("lattice", lattice, new THREE.Vector3(0, 1, 0), 2.2);

    const satCount = 42;
    this.satellites = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.045, 16, 12),
      this.metalMat,
      satCount
    );
    this.satellites.castShadow = true;
    const m = new THREE.Matrix4();
    for (let i = 0; i < satCount; i++) {
      const radius = 2.9 + (i % 7) * 0.22;
      this.satParams.push({
        radius,
        speed: (0.12 + ((i * 37) % 10) / 40) * (i % 2 === 0 ? 1 : -1),
        phase: (i / satCount) * Math.PI * 2,
        incl: (((i * 53) % 100) / 100 - 0.5) * 1.2,
      });
      m.makeTranslation(0, 0, radius);
      this.satellites.setMatrixAt(i, m);
    }
    this.satellites.instanceMatrix.needsUpdate = true;
    this.addLayer("satellites", this.satellites, new THREE.Vector3(1, 0, 0), 3.0);

    const haloCount = 1600;
    const haloGeo = new THREE.BufferGeometry();
    const seeds = new Float32Array(haloCount);
    const orbits = new Float32Array(haloCount);
    for (let i = 0; i < haloCount; i++) {
      seeds[i] = Math.random();
      orbits[i] = Math.random();
    }
    haloGeo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    haloGeo.setAttribute("aOrbit", new THREE.BufferAttribute(orbits, 1));
    haloGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(haloCount * 3), 3));
    this.haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VERT,
      fragmentShader: HALO_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uRadius: { value: 2.1 },
        uSize: { value: 0.055 },
        uPixelRatio: { value: 1 },
        uColor: { value: ACCENT.clone() },
        uOpacity: { value: 0.32 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Points(haloGeo, this.haloMat);
    this.addLayer("halo", halo, new THREE.Vector3(0, -0.5, 0), 1.0);
  }

  private addLayer(id: string, object: THREE.Object3D, dir: THREE.Vector3, dist: number) {
    object.userData.layerId = id;
    object.traverse((child) => {
      child.userData.layerId = id;
    });
    this.layers.set(id, {
      id,
      object,
      explodeDir: dir.clone().normalize(),
      explodeDist: dist,
      baseScale: 1,
    });
    this.group.add(object);
  }

  setLayerVisible(id: string, visible: boolean) {
    const layer = this.layers.get(id);
    if (layer) layer.object.visible = visible;
  }

  setPixelRatio(pr: number) {
    this.haloMat.uniforms.uPixelRatio.value = pr;
  }

  setHovered(id: string | null) {
    this.hoveredId = id;
  }

  setExplode(t: number) {
    const e = THREE.MathUtils.clamp(t, 0, 1);
    for (const layer of this.layers.values()) {
      layer.object.position.copy(layer.explodeDir).multiplyScalar(layer.explodeDist * e);
      const s = 1 + (layer.id === "core" ? 0 : e * 0.06);
      layer.object.scale.setScalar(s);
    }
  }

  applyMaterial(params: {
    color: string;
    metalness: number;
    roughness: number;
    transmission: number;
    opacity: number;
    emissive: string;
    emissiveIntensity: number;
  }) {
    this.metalMat.color.set(params.color);
    this.metalMat.metalness = params.metalness;
    this.metalMat.roughness = params.roughness;
    this.metalMat.emissive.set(params.emissive);
    this.metalMat.emissiveIntensity = params.emissiveIntensity;
    this.metalMat.needsUpdate = true;

    this.shellMat.transmission = params.transmission;
    this.shellMat.opacity = params.transmission > 0.01 ? 0.15 + params.opacity * 0.5 : params.opacity;
    this.shellMat.roughness = params.roughness * 0.5 + 0.04;
    this.shellMat.color.set(params.color).lerp(new THREE.Color("#ffffff"), 0.4);
    this.shellMat.needsUpdate = true;

    this.coreMat.uniforms.uAccent.value = new THREE.Color(params.emissive);
    this.haloMat.uniforms.uColor.value = new THREE.Color(params.emissive);
  }

  triggerPulse() {
    this.pulse = 1;
  }

  update(dt: number, time: number) {
    this.pulse = Math.max(0, this.pulse - dt * 2.2);
    this.coreMat.uniforms.uTime.value = time;
    this.coreMat.uniforms.uPulse.value = this.pulse;
    this.haloMat.uniforms.uTime.value = time;

    this.gyros[0].rotation.z += dt * 0.35;
    this.gyros[1].rotation.z -= dt * 0.27;
    this.gyros[2].rotation.z += dt * 0.19;
    for (const g of this.gyros) g.rotation.x += dt * 0.05;

    const layer = this.layers.get("lattice");
    if (layer && layer.object.visible) layer.object.rotation.y += dt * 0.08;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    for (let i = 0; i < this.satParams.length; i++) {
      const s = this.satParams[i];
      const a = s.phase + time * s.speed;
      p.set(Math.cos(a) * s.radius, Math.sin(s.incl) * s.radius * 0.6, Math.sin(a) * s.radius);
      q.setFromAxisAngle(up, s.incl);
      m.compose(p, q, new THREE.Vector3(1, 1, 1));
      this.satellites.setMatrixAt(i, m);
    }
    this.satellites.instanceMatrix.needsUpdate = true;

    if (this.hoveredId) {
      const layer = this.layers.get(this.hoveredId);
      if (layer) layer.object.scale.multiplyScalar(1); // scale handled by explode
    }
  }

  raycastTargets(): THREE.Object3D[] {
    const targets: THREE.Object3D[] = [];
    for (const layer of this.layers.values()) {
      if (!layer.object.visible) continue;
      layer.object.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Points) targets.push(child);
      });
    }
    return targets;
  }

  dispose() {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) mat.dispose();
      }
    });
    if (this.satellites.instanceMatrix) this.satellites.instanceMatrix.dispose?.();
  }
}
