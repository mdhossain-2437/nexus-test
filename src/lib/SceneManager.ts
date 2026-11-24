import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { NexusObject } from "./NexusObject";
import { ParticleField } from "./Particles";
import { ShaderLab } from "./ShaderLab";
import { detectWebGL } from "./capabilities";
import { useNexus } from "../store";
import type { NexusState, Quality, View } from "../types";

interface ViewConfig {
  pos: [number, number, number];
  target: [number, number, number];
  autoRotate: boolean;
}

const VIEWS: Record<View, ViewConfig> = {
  universe: { pos: [0, 1.15, 7.4], target: [0, 0.15, 0], autoRotate: true },
  explorer: { pos: [3.4, 2.0, 4.8], target: [0, 0.1, 0], autoRotate: false },
  shaderlab: { pos: [0, 0, 3.7], target: [0, 0, 0], autoRotate: false },
  particlelab: { pos: [0, 0.6, 8.6], target: [0, 0, 0], autoRotate: false },
  material: { pos: [4.4, 1.8, 5.6], target: [0, 0.2, 0], autoRotate: true },
  monitor: { pos: [0, 1.15, 7.4], target: [0, 0.15, 0], autoRotate: true },
  settings: { pos: [0, 1.15, 7.4], target: [0, 0.15, 0], autoRotate: true },
};

const QUALITY_PRESETS: Record<Quality, { dprCap: number; shadowSize: number; bloomScale: number }> = {
  low: { dprCap: 1.0, shadowSize: 1024, bloomScale: 0.5 },
  medium: { dprCap: 1.5, shadowSize: 1024, bloomScale: 0.75 },
  high: { dprCap: 2.0, shadowSize: 2048, bloomScale: 1.0 },
  ultra: { dprCap: 2.5, shadowSize: 2048, bloomScale: 1.0 },
};

const STAR_COUNT = 2200;

export class SceneManager {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls!: OrbitControls;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private pmrem: THREE.PMREMGenerator | null = null;
  private nexus = new NexusObject();
  private particles: ParticleField | null = null;
  private lab = new ShaderLab();
  private keyLight!: THREE.DirectionalLight;
  private stars!: THREE.Points;
  private lastT = performance.now();
  private raf = 0;
  private animTime = 0;
  private labTime = 0;
  private disposed = false;
  private view: View = "universe";
  private camGoalPos = new THREE.Vector3(...VIEWS.universe.pos);
  private camGoalTarget = new THREE.Vector3(...VIEWS.universe.target);
  private raycaster = new THREE.Raycaster();
  private pointerNdc = new THREE.Vector2(0, 0);
  private mouseWorld = new THREE.Vector3(999, 999, 999);
  private lastInteract = -10;
  private dprScale = 1;
  private frames = 0;
  private perfWindowStart = performance.now();
  private avgFps = 60;
  private adaptCounter = 0;
  private ro: ResizeObserver;
  private glCaps = detectWebGL();
  private rebuildQueued = false;

  constructor(container: HTMLElement) {
    this.container = container;
    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-label", "NEXUS interactive 3D viewport");
    this.canvas.style.touchAction = "none";
    container.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    this.camera.position.set(...VIEWS.universe.pos);

    this.scene.background = new THREE.Color("#060607");
    this.scene.fog = new THREE.FogExp2("#060607", 0.022);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);

    this.buildRenderer();
    this.buildScene();
    this.bindStore();
    this.bindPointer();
    this.resize();
    this.loop();
  }

  // ---------------------------------------------------------------- setup

  private buildRenderer() {
    const state = useNexus.getState();
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: state.settings.antialias,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.info.autoReset = false;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.canvas.addEventListener("webglcontextlost", this.onContextLost);
    this.canvas.addEventListener("webglcontextrestored", this.onContextRestored);
  }

  private buildScene() {
    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;

    const hemi = new THREE.HemisphereLight(0x8fa0c0, 0x05060a, 0.55);
    this.scene.add(hemi);

    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
    this.keyLight.position.set(4.5, 6.5, 3.5);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = -6;
    this.keyLight.shadow.camera.right = 6;
    this.keyLight.shadow.camera.top = 6;
    this.keyLight.shadow.camera.bottom = -6;
    this.keyLight.shadow.camera.far = 20;
    this.keyLight.shadow.bias = -0.0004;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    const rim = new THREE.DirectionalLight(0x7d8cff, 1.1);
    rim.position.set(-5, -2.5, -4);
    this.scene.add(rim);

    const glow = new THREE.PointLight(0xd7ff3f, 3.5, 18, 2);
    glow.position.set(0, 2.6, 0);
    this.scene.add(glow);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(9, 72),
      new THREE.ShadowMaterial({ opacity: 0.42, color: 0x000000 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.9;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(STAR_COUNT * 3);
    for (let i = 0; i < STAR_COUNT; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(38 + Math.random() * 30);
      starPos.set([v.x, v.y, v.z], i * 3);
    }
    starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xaab4cc,
        size: 0.06,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      })
    );
    this.scene.add(this.stars);

    this.scene.add(this.nexus.group);
    this.particles = new ParticleField(this.renderer);
    this.scene.add(this.particles.group);
    this.scene.add(this.lab.mesh);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.target.set(...VIEWS.universe.target);
    this.controls.addEventListener("start", () => {
      this.lastInteract = this.animTime;
    });

    this.buildComposer();
    this.applyAll(useNexus.getState());
  }

  private buildComposer() {
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.65, 0.78);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  // ------------------------------------------------------------ lifecycle

  private onContextLost = (e: Event) => {
    e.preventDefault();
    useNexus.getState().setContextLost(true);
  };

  private onContextRestored = () => {
    this.rebuildGPUResources();
    useNexus.getState().setContextLost(false);
  };

  private rebuildGPUResources() {
    this.disposeComposer();
    if (this.particles) {
      this.scene.remove(this.particles.group);
      this.particles.dispose();
    }
    if (this.pmrem) {
      const envTex = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = envTex;
    }
    this.particles = new ParticleField(this.renderer);
    this.scene.add(this.particles.group);
    this.buildComposer();
    this.keyLight.shadow.map?.dispose();
    (this.keyLight.shadow.map as unknown) = null;
    this.applyAll(useNexus.getState());
    this.resize();
  }

  private rebuildRenderer() {
    this.rebuildQueued = false;
    this.disposeComposer();
    if (this.particles) {
      this.scene.remove(this.particles.group);
      this.particles.dispose();
      this.particles = null;
    }
    this.controls.dispose();
    this.renderer.dispose();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.canvas.remove();

    this.canvas = document.createElement("canvas");
    this.canvas.setAttribute("aria-label", "NEXUS interactive 3D viewport");
    this.canvas.style.touchAction = "none";
    this.container.appendChild(this.canvas);
    this.buildRenderer();

    this.pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.particles = new ParticleField(this.renderer);
    this.scene.add(this.particles.group);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 2.2;
    this.controls.maxDistance = 16;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.target.copy(this.camGoalTarget);
    this.controls.addEventListener("start", () => {
      this.lastInteract = this.animTime;
    });

    this.buildComposer();
    this.applyAll(useNexus.getState());
    this.resize();
  }

  private disposeComposer() {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
  }

  recenter() {
    const cfg = VIEWS[useNexus.getState().view];
    this.camGoalPos.set(...cfg.pos);
    this.camGoalTarget.set(...cfg.target);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls?.dispose();
    this.disposeComposer();
    this.particles?.dispose();
    this.nexus.dispose();
    this.lab.dispose();
    this.scene.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.LineSegments) {
        child.geometry.dispose();
      }
    });
    this.pmrem?.dispose();
    this.renderer.dispose();
    this.canvas.removeEventListener("webglcontextlost", this.onContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored);
    this.canvas.remove();
  }

  // ------------------------------------------------------------- pointer

  private bindPointer() {
    this.canvas.addEventListener("pointermove", (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointerNdc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -(((e.clientY - rect.top) / rect.height) * 2 - 1));
      this.lastInteract = this.animTime;

      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      const hits = this.raycaster.intersectObjects(this.nexus.raycastTargets(), false);
      const layerId = hits.length > 0 ? (hits[0].object.userData.layerId as string | undefined) ?? null : null;
      useNexus.getState().setHovered(layerId);
      this.canvas.style.cursor = layerId ? "pointer" : "grab";

      const plane = new THREE.Plane();
      plane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(0, 0, 0));
      const hit = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (hit) this.mouseWorld.copy(hit);
      else this.mouseWorld.set(999, 999, 999);
    });

    this.canvas.addEventListener("pointerdown", () => {
      this.lastInteract = this.animTime;
    });

    this.canvas.addEventListener("click", () => {
      this.raycaster.setFromCamera(this.pointerNdc, this.camera);
      const hits = this.raycaster.intersectObjects(this.nexus.raycastTargets(), false);
      if (hits.length > 0) {
        const layerId = hits[0].object.userData.layerId as string | undefined;
        if (layerId) {
          this.nexus.triggerPulse();
          useNexus.getState().selectLayer(layerId);
        }
      } else {
        useNexus.getState().selectLayer(null);
      }
    });
  }

  // -------------------------------------------------------------- store

  private bindStore() {
    useNexus.subscribe((s, prev) => {
      if (s.view !== prev.view) this.applyView(s);
      if (s.settings !== prev.settings) this.applySettings(s);
      if (s.material !== prev.material) this.nexus.applyMaterial(s.material);
      if (s.particles !== prev.particles) this.applyParticles(s);
      if (s.shader !== prev.shader) this.applyShader(s);
      if (s.explorer !== prev.explorer) this.applyExplorer(s);
      if (s.hovered !== prev.hovered) this.nexus.setHovered(s.hovered);
    });
  }

  private applyAll(s: NexusState) {
    this.applyView(s);
    this.applySettings(s);
    this.nexus.applyMaterial(s.material);
    this.applyParticles(s);
    this.applyShader(s);
    this.applyExplorer(s);
  }

  private applyView(s: NexusState) {
    this.view = s.view;
    const cfg = VIEWS[s.view];
    this.camGoalPos.set(...cfg.pos);
    this.camGoalTarget.set(...cfg.target);

    const showNexus = s.view !== "shaderlab";
    this.nexus.group.visible = showNexus;
    this.lab.mesh.visible = s.view === "shaderlab";
    if (this.particles) this.particles.group.visible = s.view !== "shaderlab";
  }

  private applySettings(s: NexusState) {
    const q = QUALITY_PRESETS[s.settings.quality];
    const perf = s.settings.performanceMode;

    if (s.settings.antialias !== this.renderer?.getContext().getContextAttributes()?.antialias) {
      if (!this.rebuildQueued) {
        this.rebuildQueued = true;
        queueMicrotask(() => this.rebuildRenderer());
      }
    }

    const baseDpr = Math.min(window.devicePixelRatio || 1, q.dprCap);
    this.dprScale = perf ? 0.6 : 1;
    this.renderer.setPixelRatio(baseDpr * this.dprScale);

    this.keyLight.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    if (this.keyLight.shadow.map) {
      this.keyLight.shadow.map.dispose();
      (this.keyLight.shadow.map as unknown) = null;
    }

    if (this.bloom) {
      this.bloom.strength = s.settings.postProcessing ? s.settings.bloomStrength * q.bloomScale : 0;
      this.bloom.threshold = 0.78;
    }
  }

  private applyParticles(s: NexusState) {
    if (!this.particles) return;
    const viewBoost = s.view === "particlelab" ? 1.6 : 1;
    this.particles.setCount(Math.floor(s.particles.count * viewBoost));
    this.particles.applyParams(s.particles, this.renderer.getPixelRatio());
  }

  private applyShader(s: NexusState) {
    const size = this.renderer.getSize(new THREE.Vector2());
    this.lab.applyParams(s.shader, size);
  }

  private applyExplorer(s: NexusState) {
    this.nexus.setExplode(s.explorer.explode);
    for (const layer of s.explorer.layers) {
      this.nexus.setLayerVisible(layer.id, layer.visible);
    }
  }

  // ---------------------------------------------------------------- loop

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    const size = this.renderer.getSize(new THREE.Vector2());
    this.lab.applyParams(useNexus.getState().shader, size);
    const pr = this.renderer.getPixelRatio();
    this.nexus.setPixelRatio(pr);
    this.applyParticles(useNexus.getState());
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const nowMs = performance.now();
    const rawDt = Math.min((nowMs - this.lastT) / 1000, 0.05);
    this.lastT = nowMs;
    this.renderer.info.reset();
    const s = useNexus.getState();
    const motionScale = s.settings.reducedMotion ? 0.25 : 1;
    const dt = s.settings.paused ? 0 : rawDt * motionScale;
    this.animTime += dt;
    const t = this.animTime;

    const k = 1 - Math.exp(-rawDt * 3.2);
    this.camera.position.lerp(this.camGoalPos, k);
    this.controls.target.lerp(this.camGoalTarget, k);

    const cfg = VIEWS[this.view];
    const idle = t - this.lastInteract > 4;
    this.controls.autoRotate = cfg.autoRotate && !s.settings.reducedMotion && idle;
    this.controls.autoRotateSpeed = 0.55;
    this.controls.update();

    if (this.nexus.group.visible) this.nexus.update(dt, t);
    if (this.particles && this.particles.group.visible) {
      this.particles.setMouseWorld(this.mouseWorld);
      this.particles.step(dt, t);
    }
    if (this.lab.mesh.visible) {
      this.labTime += dt * s.shader.speed;
      this.lab.setMouse(this.pointerNdc);
      this.lab.update(this.labTime);
    }
    this.stars.rotation.y += rawDt * 0.004;

    if (s.settings.postProcessing && this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    this.samplePerf();
  };

  private samplePerf() {
    this.frames++;
    const now = performance.now();
    const elapsed = now - this.perfWindowStart;
    if (elapsed >= 500) {
      const fps = (this.frames * 1000) / elapsed;
      this.avgFps = this.avgFps * 0.5 + fps * 0.5;
      this.frames = 0;
      this.perfWindowStart = now;

      const info = this.renderer.info;
      const s = useNexus.getState();
      s.setPerf({
        fps: Math.round(fps * 10) / 10,
        frameMs: Math.round((1000 / Math.max(1, fps)) * 100) / 100,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        points: info.render.points,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        particleCount: this.particles?.particleCount ?? 0,
        pixelRatio: Math.round(this.renderer.getPixelRatio() * 100) / 100,
        renderer: this.glCaps.renderer,
        glVersion: this.glCaps.webgl2 ? "WebGL2" : "WebGL1",
        measured: true,
      });

      this.adaptCounter++;
      if (this.adaptCounter >= 4 && !s.settings.performanceMode) {
        this.adaptCounter = 0;
        const q = QUALITY_PRESETS[s.settings.quality];
        if (this.avgFps < 47 && this.dprScale > 0.5) {
          this.dprScale = Math.max(0.5, this.dprScale - 0.25);
          this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dprCap) * this.dprScale);
          this.resize();
        } else if (this.avgFps > 57 && this.dprScale < 1) {
          this.dprScale = Math.min(1, this.dprScale + 0.25);
          this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dprCap) * this.dprScale);
          this.resize();
        }
      }
    }
  }
}
