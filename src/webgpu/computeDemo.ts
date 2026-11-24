/*
 * WebGPU compute experiment — fully modular and optional.
 *
 * This module is independent of the WebGL scene. It runs a GPU-driven
 * particle simulation: 65,536 particles integrated entirely in a WGSL
 * compute pass, rendered as an instanced quad field on its own canvas.
 * The decisive difference vs. the WebGL path: zero per-particle CPU work —
 * the CPU only records the command buffers each frame.
 *
 * If WebGPU is unavailable the caller receives a graceful status and the
 * WebGL simulation remains the primary experience — nothing is faked.
 */

const PARTICLE_COUNT = 65_536; // 1024 dispatched workgroups of 64 threads.

const WGSL = /* wgsl */ `
struct Params {
  dt: f32,
  time: f32,
  attractX: f32,
  attractY: f32,
  attractZ: f32,
  mode: f32,       // 0 = attract, 1 = repel
  turbulence: f32,
  cohesion: f32,
  attraction: f32,
};

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> pos: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> vel: array<vec4<f32>>;

// Render pass reads the same position buffer through a read-only group.
@group(1) @binding(0) var<storage, read> posRead: array<vec4<f32>>;

@compute @workgroup_size(64)
fn simulate(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= arrayLength(&pos)) { return; }

  var p = pos[i];
  var v = vel[i];
  let dt = params.dt;
  let t = params.time;

  // Spring toward a home shell of radius 0.9.
  let home = normalize(p.xyz) * 0.9;
  v = v + (home - p.xyz) * (params.cohesion * 2.0) * dt;

  // Pointer attractor / repulsor with inverse-square falloff.
  let a = vec3<f32>(params.attractX, params.attractY, params.attractZ);
  let d = a - p.xyz;
  let d2 = dot(d, d) + 0.25;
  let sign = select(1.0, -1.0, params.mode > 0.5);
  v = v + d * (sign * params.attraction * 6.0 / d2) * dt;

  // Divergence-limited swirl — the same field family as the WebGL sim.
  let s1 = sin(p.y * 4.0 + t * 1.6 + f32(i) * 0.0001);
  let s2 = sin(p.z * 3.6 - t * 1.3);
  let s3 = sin(p.x * 3.2 + t * 1.1);
  v = v + vec3<f32>(s2 - s1 * 0.5, s3 - s2 * 0.5, s1 - s3 * 0.5) * (params.turbulence * dt);

  v = v * pow(0.94, dt * 60.0);
  p = vec4<f32>(p.xyz + v.xyz * dt, 0.0);

  // Containment shell.
  if (length(p.xyz) > 1.6) {
    p = vec4<f32>(normalize(p.xyz) * 1.6, 0.0);
    v = -v * 0.3;
  }

  pos[i] = p;
  vel[i] = v;
}

struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) center: f32,
};

@vertex
fn vsMain(
  @builtin(instance_index) ii: u32,
  @location(0) corner: vec2<f32>,
) -> VertexOut {
  let p = posRead[ii].xyz;
  // Isometric-style projection: rotate ~30 deg around Y, then tilt up.
  var q: vec3<f32>;
  q.x = p.x * 0.866 - p.z * 0.5;
  q.y = p.y;
  q.z = p.x * 0.5 + p.z * 0.866;
  let projected = vec2<f32>(q.x, q.y - q.z * 0.55);
  let size = 0.0032;
  var out: VertexOut;
  out.position = vec4<f32>(projected + corner * size, 0.0, 1.0);
  out.center = length(corner);
  return out;
}

@fragment
fn fsMain(in: VertexOut) -> @location(0) vec4<f32> {
  if (in.center > 1.0) { discard; }
  let alpha = (1.0 - in.center) * 0.45;
  let col = mix(vec3<f32>(0.55, 0.80, 0.66), vec3<f32>(0.85, 0.95, 0.55), in.center);
  return vec4<f32>(col * alpha, alpha);
}
`;

export type WebGpuStatus =
  | { kind: 'unsupported'; message: string }
  | { kind: 'error'; message: string }
  | { kind: 'running'; gpuBrand: string | null; computeCpuSubmitMs: number; fps: number };

interface DemoParams {
  turbulence: number;
  cohesion: number;
  attraction: number;
}

type StatusFn = (s: WebGpuStatus) => void;

export class WebGPUComputeDemo {
  /** Static capability probe — never throws. */
  static async probe(): Promise<{ supported: boolean; message: string }> {
    const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
    if (!gpu) {
      return {
        supported: false,
        message:
          'navigator.gpu is not present. WebGPU requires Chrome/Edge 113+ (or a recent Firefox build with the feature enabled) on a supported platform. The WebGL simulation carries the full experience.',
      };
    }
    try {
      const adapter = await gpu.requestAdapter();
      if (!adapter) {
        return {
          supported: false,
          message:
            'A WebGPU adapter could not be acquired (GPU blocklisted, driver issue, or power-saving mode). The WebGL simulation remains active.',
        };
      }
      return { supported: true, message: 'WebGPU adapter detected.' };
    } catch (err) {
      return {
        supported: false,
        message: `WebGPU probe failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private device: GPUDevice | null = null;
  private context: GPUCanvasContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private pipelineCompute: GPUComputePipeline | null = null;
  private pipelineRender: GPURenderPipeline | null = null;
  private bindCompute: GPUBindGroup | null = null;
  private bindRender: GPUBindGroup | null = null;
  private posBuffer: GPUBuffer | null = null;
  private velBuffer: GPUBuffer | null = null;
  private uniBuffer: GPUBuffer | null = null;
  private quadBuffer: GPUBuffer | null = null;
  private paramsData = new Float32Array(9 * 4); // padded to a 144B host slice
  private raf = 0;
  private running = false;
  private lastTime = 0;
  private emaSubmitMs = 0;
  private fpsFrames = 0;
  private fpsWindow = 0;
  private statusAccum = 0;
  private gpuBrand: string | null = null;
  private onStatus: StatusFn;
  private getParams: () => DemoParams;
  private pointer: { x: number; y: number } | null = null;
  private down = false;

  private constructor(onStatus: StatusFn, getParams: () => DemoParams) {
    this.onStatus = onStatus;
    this.getParams = getParams;
  }

  static async create(
    canvas: HTMLCanvasElement,
    getParams: () => DemoParams,
    onStatus: StatusFn,
  ): Promise<WebGPUComputeDemo> {
    const demo = new WebGPUComputeDemo(onStatus, getParams);
    try {
      await demo.init(canvas);
      return demo;
    } catch (err) {
      demo.dispose();
      onStatus({
        kind: 'error',
        message: `WebGPU initialization failed: ${err instanceof Error ? err.message : String(err)}. The WebGL simulation remains the active experience.`,
      });
      return demo;
    }
  }

  private async init(canvas: HTMLCanvasElement) {
    const gpu = (navigator as Navigator & { gpu: GPU }).gpu;
    const adapter = await gpu.requestAdapter();
    if (!adapter) throw new Error('No adapter');
    const info = adapter.info as GPUAdapterInfo | undefined;
    this.gpuBrand =
      info && (info.vendor || info.architecture)
        ? [info.vendor, info.architecture].filter(Boolean).join(' ')
        : null;

    this.device = await adapter.requestDevice();
    this.device.lost.then((lost) => {
      if (lost.reason !== 'destroyed') {
        this.stop();
        this.onStatus({
          kind: 'error',
          message: `GPU device lost (${lost.reason || 'unknown'}). The demo stopped; the WebGL simulation is unaffected.`,
        });
      }
    });

    this.canvas = canvas;
    const format = gpu.getPreferredCanvasFormat();
    this.context = this.resizeAndConfigure();

    // --- initial state: deterministic golden-angle shell fill ---
    const posInit = new Float32Array(PARTICLE_COUNT * 4);
    const velInit = new Float32Array(PARTICLE_COUNT * 4);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const y = 1 - (2 * (i + 0.5)) / PARTICLE_COUNT;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * i;
      posInit[i * 4] = Math.cos(theta) * r * 0.9;
      posInit[i * 4 + 1] = y * 0.9;
      posInit[i * 4 + 2] = Math.sin(theta) * r * 0.9;
    }
    const storageUsage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.posBuffer = this.device.createBuffer({ size: posInit.byteLength, usage: storageUsage });
    this.velBuffer = this.device.createBuffer({ size: velInit.byteLength, usage: storageUsage });
    this.uniBuffer = this.device.createBuffer({
      size: 144, // one full 144B uniform slot
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.quadBuffer = this.device.createBuffer({
      size: 32,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(this.posBuffer, 0, posInit);
    this.device.queue.writeBuffer(this.velBuffer, 0, velInit);
    this.device.queue.writeBuffer(
      this.quadBuffer,
      0,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    );

    const module = this.device.createShaderModule({ code: WGSL });
    const compileInfo = await module.getCompilationInfo();
    const errors = compileInfo.messages.filter((m) => m.type === 'error');
    if (errors.length > 0) throw new Error(`WGSL compile error: ${errors[0].message}`);

    const computeLayout = this.device.createBindGroupLayout({
      label: 'nexus-compute-layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      ],
    });
    const renderLayout = this.device.createBindGroupLayout({
      label: 'nexus-render-layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX,
          buffer: { type: 'read-only-storage' },
        },
      ],
    });

    this.pipelineCompute = this.device.createComputePipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [computeLayout] }),
      compute: { module, entryPoint: 'simulate' },
    });
    this.pipelineRender = this.device.createRenderPipeline({
      layout: this.device.createPipelineLayout({ bindGroupLayouts: [renderLayout] }),
      vertex: {
        module,
        entryPoint: 'vsMain',
        buffers: [
          {
            arrayStride: 8,
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
          },
        ],
      },
      fragment: { module, entryPoint: 'fsMain', targets: [{ format }] },
      primitive: { topology: 'triangle-strip' },
    });

    this.bindCompute = this.device.createBindGroup({
      layout: computeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniBuffer } },
        { binding: 1, resource: { buffer: this.posBuffer } },
        { binding: 2, resource: { buffer: this.velBuffer } },
      ],
    });
    this.bindRender = this.device.createBindGroup({
      layout: renderLayout,
      entries: [{ binding: 0, resource: { buffer: this.posBuffer } }],
    });
    void format;

    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);

    this.running = true;
    this.lastTime = performance.now();
    this.frame();
  }

  private resizeAndConfigure(): GPUCanvasContext {
    const canvas = this.canvas as HTMLCanvasElement;
    const ctx = (canvas.getContext('webgpu') as GPUCanvasContext | null) ?? null;
    if (!ctx) throw new Error('webgpu canvas context unavailable');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(2, Math.floor(canvas.clientWidth * dpr));
    canvas.height = Math.max(2, Math.floor(canvas.clientHeight * dpr));
    ctx.configure({
      device: this.device as GPUDevice,
      format: (navigator as Navigator & { gpu: GPU }).gpu.getPreferredCanvasFormat(),
      alphaMode: 'opaque',
    });
    return ctx;
  }

  private onPointerMove = (e: PointerEvent) => {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    this.pointer = {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((e.clientY - rect.top) / rect.height) * 2 - 1),
    };
    this.down = (e.buttons & 1) !== 0;
  };

  private onPointerLeave = () => {
    this.pointer = null;
    this.down = false;
  };

  get isRunning() {
    return this.running;
  }

  get particleCount() {
    return PARTICLE_COUNT;
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = () => {
    if (!this.running || !this.device || !this.context) return;
    this.raf = requestAnimationFrame(this.frame);

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    const p = this.getParams();
    const buf = this.paramsData;
    buf[0] = Math.max(dt, 0.0005);
    buf[1] = now * 0.0005;
    buf[2] = this.pointer?.x ?? -99;
    buf[3] = this.pointer?.y ?? -99;
    buf[4] = 0.5;
    buf[5] = this.down ? 1 : 0;
    buf[6] = p.turbulence;
    buf[7] = p.cohesion;
    buf[8] = p.attraction;
    this.device.queue.writeBuffer(this.uniBuffer as GPUBuffer, 0, buf);

    const encoder = this.device.createCommandEncoder();

    const t0 = performance.now();
    const compute = encoder.beginComputePass();
    compute.setPipeline(this.pipelineCompute as GPUComputePipeline);
    compute.setBindGroup(0, this.bindCompute as GPUBindGroup);
    compute.dispatchWorkgroups(PARTICLE_COUNT / 64);
    compute.end();
    // CPU-side submission cost only — true GPU timestamps would need the
    // 'timestamp-query' feature, which is reported honestly in the UI.
    const submitMs = performance.now() - t0;

    const render = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0.04, g: 0.045, b: 0.05, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    render.setPipeline(this.pipelineRender as GPURenderPipeline);
    render.setBindGroup(0, this.bindRender as GPUBindGroup);
    render.setVertexBuffer(0, this.quadBuffer as GPUBuffer);
    render.draw(4, PARTICLE_COUNT);
    render.end();
    this.device.queue.submit([encoder.finish()]);

    this.emaSubmitMs = this.emaSubmitMs * 0.9 + submitMs * 0.1;
    this.fpsFrames++;
    this.fpsWindow += dt;
    this.statusAccum++;
    if (this.statusAccum >= 15) {
      this.statusAccum = 0;
      this.onStatus({
        kind: 'running',
        gpuBrand: this.gpuBrand,
        computeCpuSubmitMs: this.emaSubmitMs,
        fps: this.fpsWindow > 0 ? this.fpsFrames / this.fpsWindow : 0,
      });
      this.fpsFrames = 0;
      this.fpsWindow = 0;
    }
  };

  dispose() {
    this.stop();
    this.canvas?.removeEventListener('pointermove', this.onPointerMove);
    this.canvas?.removeEventListener('pointerleave', this.onPointerLeave);
    try {
      this.context?.unconfigure();
    } catch {
      /* context may already be gone */
    }
    for (const b of [this.posBuffer, this.velBuffer, this.uniBuffer, this.quadBuffer]) {
      try {
        b?.destroy();
      } catch {
        /* already destroyed */
      }
    }
    this.posBuffer = this.velBuffer = this.uniBuffer = this.quadBuffer = null;
    try {
      this.device?.destroy();
    } catch {
      /* device may be lost already */
    }
    this.device = null;
  }
}
