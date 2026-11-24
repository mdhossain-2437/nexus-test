import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { createNexusObject, type NexusObject } from '../scene/nexusObject';
import { createParticleField, type ParticleField } from '../scene/particleField';
import { useNexus, type Quality, type ViewPreset } from '../state/store';
import { usePerf } from '../state/perf';

const QUALITY_DPR_CAP: Record<Quality, number> = { low: 1, medium: 1.5, high: 2 };
const BLOOM_BY_QUALITY: Record<Quality, { strength: number; radius: number; threshold: number }> = {
  low: { strength: 0.35, radius: 0.5, threshold: 0.85 },
  medium: { strength: 0.5, radius: 0.6, threshold: 0.75 },
  high: { strength: 0.65, radius: 0.7, threshold: 0.7 },
};

const VIEW_PRESETS: Record<ViewPreset, { position: THREE.Vector3; target: THREE.Vector3 }> = {
  overview: { position: new THREE.Vector3(3.4, 2.2, 6.8), target: new THREE.Vector3(0, 0, 0) },
  core: { position: new THREE.Vector3(0, 0.4, 3.1), target: new THREE.Vector3(0, 0, 0) },
  rings: { position: new THREE.Vector3(0, 3.6, 4.6), target: new THREE.Vector3(0, 0, 0.3) },
  horizon: { position: new THREE.Vector3(0.4, -2.4, 7.2), target: new THREE.Vector3(0, 0.5, 0) },
};

const INTERACTION_SPHERE = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4.4);

export class NexusEngine {
  private canvas: HTMLCanvasElement;
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloomPass: UnrealBloomPass;
  private outputPass: OutputPass;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget;

  private nexus: NexusObject;
  private particles: ParticleField;

  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.PointLight;
  private rimLight: THREE.PointLight;
  private ambient: THREE.AmbientLight;

  private raycaster = new THREE.Raycaster();
  private pointerNDC = new THREE.Vector2(10, 10);
  private pointerActive = false;
  private pointerDown = false;
  private hoveredLayer: string | null = null;
  private hoverEase = 0;
  private attractorPoint: THREE.Vector3 | null = null;

  private raf = 0;
  private lastFrameTime = 0;
  private simTime = 0;
  private frameEMA = 16;
  private adaptiveScale = 1;
  private adaptiveCooldown = 0;
  private statsAccumulator = 0;
  private fpsFrames = 0;
  private fpsWindow = 0;

  private presetAnim: {
    fromPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    to: ViewPreset;
    t: number;
  } | null = null;

  private unsubscribeStore: () => void;
  private resizeObserver: ResizeObserver;
  private disposed = false;
  private contextLost = false;

  private tmpVec = new THREE.Vector3();
  private tmpRay = new THREE.Ray();
  private originVec = new THREE.Vector3();
  private tmpMatrix = new THREE.Matrix4();

  private constructor(
    canvas: HTMLCanvasElement,
    container: HTMLElement,
    renderer: THREE.WebGLRenderer,
  ) {
    this.canvas = canvas;
    this.container = container;

    // ---------- renderer ----------
    const state = useNexus.getState();
    this.renderer = renderer;
    this.renderer.setClearColor(0x08090a, 1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = state.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // ---------- camera & controls ----------
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.camera.position.copy(VIEW_PRESETS.overview.position);

    this.controls = new OrbitControls(this.camera, container);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 1.9;
    this.controls.maxDistance = 16;
    this.controls.autoRotate = !state.reducedMotion;
    this.controls.autoRotateSpeed = 0.5;
    this.controls.enablePan = false;

    // ---------- scene ----------
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x08090a, 0.032);

    this.nexus = createNexusObject();
    const cu = this.nexus.coreMesh.material.uniforms;
    cu.uDistortion.value = state.shader.distortion;
    cu.uFresnelPower.value = state.shader.fresnelPower;
    cu.uPaletteShift.value = state.shader.paletteShift;
    cu.uMouseInfluence.value = state.shader.mouseInfluence;
    cu.uNoiseScale.value = state.shader.noiseScale;
    this.nexus.lattice.frustumCulled = false;
    this.scene.add(this.nexus.group);

    // ---------- particles ----------
    this.particles = createParticleField();
    this.particles.setActiveCount(state.particles.count);
    this.scene.add(this.particles.points);
    this.scene.add(this.particles.trails);

    // ---------- lighting ----------
    this.keyLight = new THREE.DirectionalLight(0xfff2e0, 2.6);
    this.keyLight.position.set(5, 7, 4);
    this.keyLight.castShadow = state.shadows;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 24;
    this.keyLight.shadow.camera.left = -8;
    this.keyLight.shadow.camera.right = 8;
    this.keyLight.shadow.camera.top = 8;
    this.keyLight.shadow.camera.bottom = -8;
    this.keyLight.shadow.bias = -0.0006;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.PointLight(0x79e0c0, 14, 22, 2);
    this.fillLight.position.set(-5, -2, 3);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.PointLight(0xd8ff7a, 10, 26, 2);
    this.rimLight.position.set(-3, 4, -6);
    this.scene.add(this.rimLight);

    this.ambient = new THREE.AmbientLight(0x39424d, 0.55);
    this.scene.add(this.ambient);

    this.setLightIntensity(state.material.lightIntensity);

    // ---------- environment (procedural, no assets) ----------
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = this.pmrem.fromScene(new RoomEnvironment(), 0.045);
    this.scene.environment = this.envRT.texture;

    // ---------- post-processing ----------
    // Default EffectComposer (half-float targets) gives the highest-quality
    // bloom chain; MSAA is applied by setting .samples on its render targets
    // (see onStoreChange), which works on both ping-pong buffers.
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      BLOOM_BY_QUALITY[state.quality].strength,
      BLOOM_BY_QUALITY[state.quality].radius,
      BLOOM_BY_QUALITY[state.quality].threshold,
    );
    this.outputPass = new OutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(this.outputPass);
    // MSAA applies from the first frame (uniform) — not only after a toggle.
    const initialSamples = state.antialias ? 4 : 0;
    this.composer.renderTarget1.samples = initialSamples;
    this.composer.renderTarget2.samples = initialSamples;

    // ---------- sizing ----------
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();

    // ---------- events ----------
    container.addEventListener('pointermove', this.onPointerMove);
    container.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    container.addEventListener('pointerleave', this.onPointerLeave);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);

    this.unsubscribeStore = useNexus.subscribe(this.onStoreChange);
    this.applyMaterialParams();
    this.applyLayerVisibility();
  }

  static create(canvas: HTMLCanvasElement, container: HTMLElement): NexusEngine | null {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) {
      useNexus.getState().setUnsupportedReason(
        'WebGL 2 is unavailable in this browser. NEXUS requires a WebGL 2 context — try a recent Chrome, Edge or Firefox with hardware acceleration enabled.',
      );
      return null;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: useNexus.getState().antialias,
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch (err) {
      useNexus.getState().setUnsupportedReason(
        `The WebGL context could not be created: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
    return new NexusEngine(canvas, container, renderer);
  }

  // ==========================================================================
  // public API
  // ==========================================================================

  start() {
    this.lastFrameTime = performance.now();
    this.renderer.info.autoReset = false;
    this.loop();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unsubscribeStore();
    this.resizeObserver.disconnect();
    this.container.removeEventListener('pointermove', this.onPointerMove);
    this.container.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.container.removeEventListener('pointerleave', this.onPointerLeave);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.controls.dispose();
    this.particles.dispose();
    this.nexus.dispose();
    this.scene.clear();
    this.envRT.dispose();
    this.pmrem.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }

  // ==========================================================================
  // event wiring
  // ==========================================================================

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.container.getBoundingClientRect();
    this.pointerNDC.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.pointerActive = true;
  };

  private onPointerDown = () => {
    this.pointerDown = true;
    this.trySelectAtPointer();
  };

  private onPointerUp = () => {
    this.pointerDown = false;
  };

  private onPointerLeave = () => {
    this.pointerActive = false;
    this.particles.setAttractor(null, 'attract');
    this.hoveredLayer = null;
    this.container.style.cursor = '';
  };

  private onVisibility = () => {
    // Pause the render loop entirely when the tab is hidden — no idle GPU work.
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else if (this.raf === 0 && !this.disposed && !this.contextLost) {
      this.lastFrameTime = performance.now();
      this.loop();
    }
  };

  private onContextLost = (e: Event) => {
    e.preventDefault();
    this.contextLost = true;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    useNexus.getState().setContextLost(true);
  };

  private onContextRestored = () => {
    this.contextLost = false;
    useNexus.getState().setContextLost(false);
    if (!this.disposed) {
      this.lastFrameTime = performance.now();
      this.loop();
    }
  };

  // ==========================================================================
  // store sync — the engine reads state imperatively from Zustand
  // ==========================================================================

  private onStoreChange = () => {
    const s = useNexus.getState();
    const cu = this.nexus.coreMesh.material.uniforms;
    cu.uDistortion.value = s.shader.distortion;
    cu.uFresnelPower.value = s.shader.fresnelPower;
    cu.uPaletteShift.value = s.shader.paletteShift;
    cu.uMouseInfluence.value = s.shader.mouseInfluence;
    cu.uNoiseScale.value = s.shader.noiseScale;

    this.particles.setActiveCount(s.particles.count);
    this.particles.points.material.uniforms.uSize.value = s.particles.size;
    this.particles.trails.material.uniforms.uOpacity.value = s.particles.trailOpacity;

    this.applyMaterialParams();
    this.applyLayerVisibility();

    this.renderer.shadowMap.enabled = s.shadows;
    this.keyLight.castShadow = s.shadows;
    this.nexus.lattice.castShadow = s.shadows;
    for (const ring of this.nexus.ringMeshes) ring.castShadow = s.shadows;

    // Antialias toggle: MSAA lives on the composer's render targets when
    // post-processing is on (the immutable context flag covers the direct path).
    const msaa = s.antialias ? 4 : 0;
    this.composer.renderTarget1.samples = msaa;
    this.composer.renderTarget2.samples = msaa;
    this.resize();

    const bloom = BLOOM_BY_QUALITY[s.quality];
    this.bloomPass.strength = s.postFX ? bloom.strength : 0;
    this.bloomPass.radius = bloom.radius;
    this.bloomPass.threshold = bloom.threshold;
    this.bloomPass.enabled = s.postFX;

    this.controls.autoRotate = s.animating && !s.reducedMotion;

    if (s.viewPreset !== (this.presetAnim?.to ?? this.currentPreset)) {
      this.beginPreset(s.viewPreset);
    }
  };

  private currentPreset: ViewPreset = 'overview';

  private beginPreset(preset: ViewPreset) {
    this.currentPreset = preset;
    this.presetAnim = {
      fromPos: this.camera.position.clone(),
      fromTarget: this.controls.target.clone(),
      to: preset,
      t: 0,
    };
    this.controls.enabled = false;
  }

  private applyMaterialParams() {
    const m = useNexus.getState().material;
    const mat = this.nexus.ringMaterial;
    mat.color.set(m.color);
    mat.metalness = m.metalness;
    mat.roughness = m.roughness;
    mat.opacity = m.opacity;
    mat.transparent = m.opacity < 1 || m.transmission > 0;
    mat.transmission = m.transmission;
    mat.emissiveIntensity = m.emissiveIntensity;
    mat.needsUpdate = mat.transparent !== mat.userData.wasTransparent;
    mat.userData.wasTransparent = mat.transparent;
    this.setLightIntensity(m.lightIntensity);
  }

  private setLightIntensity(factor: number) {
    this.keyLight.intensity = 2.6 * factor;
    this.fillLight.intensity = 14 * factor;
    this.rimLight.intensity = 10 * factor;
    this.ambient.intensity = 0.55 * factor;
  }

  private applyLayerVisibility() {
    const { layers } = useNexus.getState();
    this.nexus.coreMesh.visible = layers.core;
    for (const ring of this.nexus.ringMeshes) ring.visible = layers.rings;
    this.nexus.lattice.visible = layers.lattice;
    this.particles.points.visible = layers.halo;
    this.particles.trails.visible = layers.halo;
  }

  // ==========================================================================
  // interaction
  // ==========================================================================

  private updatePointerWorld() {
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const ray = this.raycaster.ray;
    // Attractor: intersect the interaction sphere; fall back to closest point.
    const hit = ray.intersectSphere(INTERACTION_SPHERE, this.tmpVec);
    if (hit) {
      this.attractorPoint = this.tmpVec;
    } else {
      ray.closestPointToPoint(this.originVec, this.tmpVec);
      this.attractorPoint = this.tmpVec;
    }
    this.particles.setAttractor(this.attractorPoint, this.pointerDown ? 'repel' : 'attract');
  }

  private updateHover() {
    if (!this.pointerActive) return;
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const s = useNexus.getState();
    const targets: THREE.Object3D[] = [];
    if (s.layers.core) targets.push(this.nexus.coreMesh);
    if (s.layers.rings) targets.push(...this.nexus.ringMeshes);
    if (s.layers.lattice) targets.push(this.nexus.lattice);
    const hits = this.raycaster.intersectObjects(targets, false);
    const layer = hits.length > 0 ? ((hits[0].object.userData.layer as string) ?? 'core') : null;
    this.hoveredLayer = layer;
    this.container.style.cursor = layer ? 'grab' : '';
  }

  private trySelectAtPointer() {
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);
    const s = useNexus.getState();
    const targets: THREE.Object3D[] = [];
    if (s.layers.core) targets.push(this.nexus.coreMesh);
    if (s.layers.rings) targets.push(...this.nexus.ringMeshes);
    if (s.layers.lattice) targets.push(this.nexus.lattice);
    const hits = this.raycaster.intersectObjects(targets, false);
    if (hits.length === 0) return;
    const layer = (hits[0].object.userData.layer as keyof typeof s.layers) ?? 'core';
    s.selectLayer(layer);
    s.setActiveSection('explorer');
  }

  // ==========================================================================
  // sizing & adaptive resolution
  // ==========================================================================

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const s = useNexus.getState();
    const dprCap = Math.min(
      QUALITY_DPR_CAP[s.quality],
      s.performanceMode ? 1 : window.devicePixelRatio,
    );
    this.renderer.setPixelRatio(dprCap * this.adaptiveScale);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(dprCap * this.adaptiveScale);
    this.composer.setSize(w, h);
   
  }

  private adaptResolution(frameMs: number) {
    const s = useNexus.getState();
    if (s.performanceMode) return; // fixed ratio in performance mode
    this.frameEMA = this.frameEMA * 0.9 + frameMs * 0.1;
    this.adaptiveCooldown -= 1;
    if (this.adaptiveCooldown > 0) return;
    if (this.frameEMA > 22 && this.adaptiveScale > 0.6) {
      this.adaptiveScale = Math.max(0.6, this.adaptiveScale - 0.1);
      this.adaptiveCooldown = 120; // ~2 s of frames between steps
      this.resize();
    } else if (this.frameEMA < 14 && this.adaptiveScale < 1) {
      this.adaptiveScale = Math.min(1, this.adaptiveScale + 0.05);
      this.adaptiveCooldown = 240;
      this.resize();
    }
  }

  // ==========================================================================
  // main loop
  // ==========================================================================

  private loop = () => {
    if (this.disposed || this.contextLost) return;
    this.raf = requestAnimationFrame(this.loop);

    // Instrumentation counts the whole frame (shadow + scene + post passes),
    // so the monitor reports true frame totals rather than the last pass.
    this.renderer.info.reset();

    const t0 = performance.now();
    const dt = Math.min((t0 - this.lastFrameTime) / 1000, 0.1);
    this.lastFrameTime = t0;
    const s = useNexus.getState();

    const motionFactor = s.animating && !s.reducedMotion ? 1 : 0;
    this.simTime += dt * s.shader.timeScale * motionFactor * 0.85;

    // uniform updates
    const cu = this.nexus.coreMesh.material.uniforms;
    cu.uTime.value = this.simTime;
    this.particles.points.material.uniforms.uTime.value = this.simTime;

    // pointer-driven core response: hover ease + directional bulge
    const hoverTarget = this.hoveredLayer === 'core' ? 1 : 0;
    this.hoverEase += (hoverTarget - this.hoverEase) * Math.min(1, dt * 8);
    cu.uHover.value = this.hoverEase;
    if (this.pointerActive) {
      // direction from camera through the pointer, expressed in object space
      this.raycaster.setFromCamera(this.pointerNDC, this.camera);
      this.raycaster.ray.at(this.camera.position.length() * 0.5, this.tmpVec);
      this.tmpMatrix.copy(this.nexus.coreMesh.matrixWorld).invert();
      this.tmpRay.copy(this.raycaster.ray).applyMatrix4(this.tmpMatrix);
      cu.uMouse.value.copy(this.tmpRay.direction).normalize();
    }
    cu.uEnergy.value = s.material.emissiveIntensity * 0.5;

    // orbital choreography of the ring assembly
    if (motionFactor && s.layers.rings) {
      this.nexus.group.rotation.y += dt * 0.08;
      this.nexus.ringMeshes[1].rotation.z += dt * 0.1;
      this.nexus.ringMeshes[2].rotation.y -= dt * 0.07;
    }

    // camera preset animation
    if (this.presetAnim) {
      const anim = this.presetAnim;
      anim.t = Math.min(1, anim.t + dt / 1.4);
      const e = 1 - Math.pow(1 - anim.t, 3); // cubic ease-out
      const dest = VIEW_PRESETS[anim.to];
      this.camera.position.lerpVectors(anim.fromPos, dest.position, e);
      this.controls.target.lerpVectors(anim.fromTarget, dest.target, e);
      if (anim.t >= 1) {
        this.presetAnim = null;
        this.controls.enabled = true;
      }
    }

    // interaction + simulation
    if (this.pointerActive && s.layers.halo) this.updatePointerWorld();
    if (s.animating && !s.reducedMotion) {
      this.particles.step(dt, {
        cohesion: s.particles.cohesion,
        attraction: s.particles.attraction,
        turbulence: s.particles.turbulence,
      });
    }
    this.updateHover();

    this.controls.update();

    // render
    if (s.postFX) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // instrumentation
    const frameMs = performance.now() - t0;
    this.adaptResolution(frameMs);
    this.fpsFrames++;
    this.fpsWindow += dt;
    this.statsAccumulator += dt;
    if (this.statsAccumulator >= 0.25) {
      const info = this.renderer.info;
      const heap = (performance as PerfMemoryHost).memory;
      usePerf.getState().setStats({
        fps: this.fpsWindow > 0 ? this.fpsFrames / this.fpsWindow : 0,
        frameTimeMs: this.frameEMA,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        points: info.render.points,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        programs: info.programs?.length ?? 0,
        webglVersion: 'WebGL 2.0',
        maxTextureSize: this.renderer.capabilities.maxTextureSize,
        maxVertexAttribs: null,
        jsHeapMB: heap ? heap.usedJSHeapSize / 1048576 : null,
        pixelRatio: this.renderer.getPixelRatio(),
        gpuRendererSource: 1,
        gpuRenderer: queryGpuRenderer(this.renderer) ?? 'unavailable',
        particleCount: this.particles.activeCount,
        adaptiveScale: this.adaptiveScale,
      });
      this.fpsFrames = 0;
      this.fpsWindow = 0;
      this.statsAccumulator = 0;
    }
  };
}

interface PerfMemoryHost {
  memory?: { usedJSHeapSize: number };
}

let cachedGpuRenderer: string | null = null;
function queryGpuRenderer(renderer: THREE.WebGLRenderer): string | null {
  if (cachedGpuRenderer !== null) return cachedGpuRenderer;
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    cachedGpuRenderer = ext
      ? (gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) ?? 'unavailable'
      : 'unavailable (WEBGL_debug_renderer_info not exposed)';
  } catch {
    cachedGpuRenderer = 'unavailable';
  }
  return cachedGpuRenderer;
}
