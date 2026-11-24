import * as THREE from "three";
import { PARTICLE_FRAG, PARTICLE_VERT, SIM_FRAG, SIM_VERT } from "./shaders/glsl";
import { supportsFloatRenderTarget } from "./capabilities";

const TEX_SIZE = 256;
const MAX_PARTICLES = TEX_SIZE * TEX_SIZE;
const HISTORY = 3;
const TRAIL_WEIGHTS = [1.0, 0.38, 0.16];

export interface ParticleUniforms {
  speed: number;
  spread: number;
  mouseForce: number;
  size: number;
  color: string;
}

export class ParticleField {
  readonly group = new THREE.Group();
  private renderer: THREE.WebGLRenderer;
  private gl: WebGL2RenderingContext;
  private simScene = new THREE.Scene();
  private simCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private simMat: THREE.ShaderMaterial;
  private history: THREE.WebGLRenderTarget[] = [];
  private clouds: THREE.Points[] = [];
  private cloudMats: THREE.ShaderMaterial[] = [];
  private geo: THREE.BufferGeometry;
  private count = 24000;
  private mouse = new THREE.Vector3(999, 999, 999);
  private texel = 1 / TEX_SIZE;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.gl = renderer.getContext() as WebGL2RenderingContext;
    this.group.name = "particle-field";

    const type = supportsFloatRenderTarget(this.gl) ? THREE.FloatType : THREE.HalfFloatType;
    const opts: THREE.RenderTargetOptions = {
      type,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    };

    const initial = new Float32Array(MAX_PARTICLES * 4);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const r = 0.5 + Math.random() * 5.5;
      initial[i * 4 + 0] = Math.cos(a) * Math.sin(b) * r;
      initial[i * 4 + 1] = Math.cos(b) * r;
      initial[i * 4 + 2] = Math.sin(a) * Math.sin(b) * r;
      initial[i * 4 + 3] = Math.random();
    }
    const seedTex = new THREE.DataTexture(initial, TEX_SIZE, TEX_SIZE, THREE.RGBAFormat, type);
    seedTex.needsUpdate = true;

    for (let i = 0; i < HISTORY; i++) {
      const rt = new THREE.WebGLRenderTarget(TEX_SIZE, TEX_SIZE, opts);
      this.renderer.setRenderTarget(rt);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.clear();
      const seedMat = new THREE.ShaderMaterial({
        vertexShader: SIM_VERT,
        fragmentShader: SIM_FRAG,
        uniforms: {
          uPrev: { value: seedTex },
          uTexel: { value: new THREE.Vector2(this.texel, this.texel) },
          uDelta: { value: 0 },
          uTime: { value: Math.random() * 100 },
          uSpeed: { value: 0 },
          uSpread: { value: 1 },
          uMouseForce: { value: 0 },
          uMouse: { value: this.mouse },
          uBound: { value: 6 },
        },
        depthTest: false,
        depthWrite: false,
      });
      const seedMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), seedMat);
      const scene = new THREE.Scene();
      scene.add(seedMesh);
      this.renderer.render(scene, this.simCam);
      seedMat.dispose();
      seedMesh.geometry.dispose();
      this.history.push(rt);
    }
    this.renderer.setRenderTarget(null);

    this.simMat = new THREE.ShaderMaterial({
      vertexShader: SIM_VERT,
      fragmentShader: SIM_FRAG,
      uniforms: {
        uPrev: { value: this.history[0].texture },
        uTexel: { value: new THREE.Vector2(this.texel, this.texel) },
        uDelta: { value: 0.016 },
        uTime: { value: 0 },
        uSpeed: { value: 0.6 },
        uSpread: { value: 1 },
        uMouseForce: { value: 1 },
        uMouse: { value: this.mouse },
        uBound: { value: 6 },
      },
      depthTest: false,
      depthWrite: false,
    });
    this.simScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.simMat));

    this.geo = new THREE.BufferGeometry();
    const uv = new Float32Array(MAX_PARTICLES * 2);
    const seed = new Float32Array(MAX_PARTICLES);
    const pos = new Float32Array(MAX_PARTICLES * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      uv[i * 2 + 0] = ((i % TEX_SIZE) + 0.5) * this.texel;
      uv[i * 2 + 1] = (Math.floor(i / TEX_SIZE) + 0.5) * this.texel;
      seed[i] = Math.random();
    }
    this.geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute("aUv", new THREE.BufferAttribute(uv, 2));
    this.geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));

    for (let i = 0; i < HISTORY; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: PARTICLE_VERT,
        fragmentShader: PARTICLE_FRAG,
        uniforms: {
          uPosTex: { value: this.history[i].texture },
          uSize: { value: 1.6 },
          uPixelRatio: { value: 1 },
          uColor: { value: new THREE.Color("#d7ff3f") },
          uOpacity: { value: 0.3 * TRAIL_WEIGHTS[i] },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const points = new THREE.Points(this.geo, mat);
      points.frustumCulled = false;
      points.name = `particle-cloud-${i}`;
      this.cloudMats.push(mat);
      this.clouds.push(points);
      this.group.add(points);
    }
    this.setCount(this.count);
  }

  setCount(count: number) {
    this.count = Math.min(count, MAX_PARTICLES);
    this.geo.setDrawRange(0, this.count);
  }

  get particleCount() {
    return this.count;
  }

  setMouseWorld(v: THREE.Vector3) {
    this.mouse.copy(v);
  }

  applyParams(p: ParticleUniforms, pixelRatio: number) {
    this.simMat.uniforms.uSpeed.value = p.speed;
    this.simMat.uniforms.uSpread.value = p.spread;
    this.simMat.uniforms.uMouseForce.value = p.mouseForce;
    this.simMat.uniforms.uBound.value = 2.0 + p.spread * 4.5;
    for (let i = 0; i < HISTORY; i++) {
      this.cloudMats[i].uniforms.uSize.value = p.size;
      this.cloudMats[i].uniforms.uPixelRatio.value = pixelRatio;
      this.cloudMats[i].uniforms.uColor.value = new THREE.Color(p.color);
      this.cloudMats[i].uniforms.uOpacity.value = 0.3 * TRAIL_WEIGHTS[i];
    }
  }

  step(dt: number, time: number) {
    const u = this.simMat.uniforms;
    u.uDelta.value = Math.min(dt, 0.05);
    u.uTime.value = time;
    u.uMouse.value = this.mouse;
    u.uPrev.value = this.history[0].texture;

    const write = this.history[HISTORY - 1];
    this.renderer.setRenderTarget(write);
    this.renderer.render(this.simScene, this.simCam);
    this.renderer.setRenderTarget(null);

    this.history.pop();
    this.history.unshift(write);
    for (let i = 0; i < HISTORY; i++) {
      this.cloudMats[i].uniforms.uPosTex.value = this.history[i].texture;
    }
  }

  dispose() {
    this.simMat.dispose();
    (this.simScene.children[0] as THREE.Mesh).geometry.dispose();
    for (const rt of this.history) rt.dispose();
    for (const mat of this.cloudMats) mat.dispose();
    this.geo.dispose();
  }
}

export const MAX_PARTICLES_SUPPORTED = MAX_PARTICLES;
