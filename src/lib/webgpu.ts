import type { WebGPUStatus } from "../types";

// Spec flag values (lib.dom types these as plain number aliases).
const GPUBufferUsage = {
  MAP_READ: 0x0001,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  STORAGE: 0x0080,
} as const;
const GPUMapMode = { READ: 0x0001 } as const;

const WGSL = /* wgsl */ `
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= arrayLength(&input)) { return; }
  let x = input[i];
  output[i] = sin(x * 0.001) * cos(x * 0.0007) + sin(x * 0.0013 + 1.7);
}
`;

export async function runWebGPUExperiment(): Promise<Omit<WebGPUStatus, "checked">> {
  const workload = 1 << 22;
  if (typeof navigator === "undefined" || !("gpu" in navigator)) {
    return {
      available: false,
      detail: "navigator.gpu is not present — WebGPU unsupported in this browser. WebGL2 path active.",
      gpuComputeMs: null,
      cpuComputeMs: null,
      workload,
    };
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      return {
        available: false,
        detail: "WebGPU API present but no adapter (no compatible GPU). WebGL2 path active.",
        gpuComputeMs: null,
        cpuComputeMs: null,
        workload,
      };
    }
    const device = await adapter.requestDevice();
    const info = adapter.info;
    const detail = `WebGPU active — ${info.vendor ?? "unknown vendor"} ${info.architecture ?? ""}`.trim();

    const inputData = new Float32Array(workload);
    for (let i = 0; i < workload; i++) inputData[i] = i * 0.37;

    const inputBuf = device.createBuffer({ size: inputData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(inputBuf, 0, inputData);
    const outputBuf = device.createBuffer({ size: inputData.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    const readBuf = device.createBuffer({ size: inputData.byteLength, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });

    const module = device.createShaderModule({ code: WGSL });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module, entryPoint: "main" },
    });
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuf } },
        { binding: 1, resource: { buffer: outputBuf } },
      ],
    });

    const t0 = performance.now();
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(workload / 256));
    pass.end();
    encoder.copyBufferToBuffer(outputBuf, 0, readBuf, 0, inputData.byteLength);
    device.queue.submit([encoder.finish()]);
    await readBuf.mapAsync(GPUMapMode.READ);
    const gpuComputeMs = performance.now() - t0;
    const gpuView = new Float32Array(readBuf.getMappedRange().slice(0));
    readBuf.unmap();

    const t1 = performance.now();
    let cpuChecksum = 0;
    for (let i = 0; i < workload; i++) {
      const x = inputData[i];
      cpuChecksum += Math.sin(x * 0.001) * Math.cos(x * 0.0007) + Math.sin(x * 0.0013 + 1.7);
    }
    const cpuComputeMs = performance.now() - t1;

    let diff = 0;
    const samples = 4096;
    for (let k = 0; k < samples; k++) {
      const i = Math.floor((k / samples) * workload);
      const x = inputData[i];
      const ref = Math.sin(x * 0.001) * Math.cos(x * 0.0007) + Math.sin(x * 0.0013 + 1.7);
      diff += Math.abs(gpuView[i] - ref);
    }
    const avgDiff = diff / samples;

    inputBuf.destroy();
    outputBuf.destroy();
    readBuf.destroy();
    device.destroy();

    const agree = avgDiff < 2e-4;
    return {
      available: true,
      detail: `${detail}. Compute output ${agree ? "matches" : "MISMATCHES"} CPU reference (avg abs diff ${avgDiff.toExponential(1)} over ${samples} samples).`,
      gpuComputeMs: Math.round(gpuComputeMs * 100) / 100,
      cpuComputeMs: Math.round(cpuComputeMs * 100) / 100,
      workload,
    };
  } catch (err) {
    return {
      available: false,
      detail: `WebGPU initialization failed: ${err instanceof Error ? err.message : String(err)}. WebGL2 path active.`,
      gpuComputeMs: null,
      cpuComputeMs: null,
      workload,
    };
  }
}
