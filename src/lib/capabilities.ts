export interface GLCapabilities {
  webgl2: boolean;
  renderer: string;
  vendor: string;
  version: string;
  maxTextureSize: number;
  maxFloatPrecision: "high" | "medium" | "low";
}

export function detectWebGL(): GLCapabilities {
  const fallback: GLCapabilities = {
    webgl2: false,
    renderer: "unavailable",
    vendor: "unavailable",
    version: "unavailable",
    maxTextureSize: 0,
    maxFloatPrecision: "low",
  };
  try {
    const canvas = document.createElement("canvas");
    const gl2 = canvas.getContext("webgl2");
    if (!gl2) {
      const gl1 = canvas.getContext("webgl");
      if (!gl1) return fallback;
      const dbg = gl1.getExtension("WEBGL_debug_renderer_info");
      return {
        webgl2: false,
        renderer: dbg ? String(gl1.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "webgl1",
        vendor: dbg ? String(gl1.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : "unknown",
        version: String(gl1.getParameter(gl1.VERSION)),
        maxTextureSize: gl1.getParameter(gl1.MAX_TEXTURE_SIZE) as number,
        maxFloatPrecision: "low",
      };
    }
    const dbg = gl2.getExtension("WEBGL_debug_renderer_info");
    const renderer = dbg ? String(gl2.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl2.getParameter(gl2.RENDERER));
    const vendor = dbg ? String(gl2.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl2.getParameter(gl2.VENDOR));
    const frag = gl2.getShaderPrecisionFormat(gl2.FRAGMENT_SHADER, gl2.HIGH_FLOAT);
    return {
      webgl2: true,
      renderer,
      vendor,
      version: String(gl2.getParameter(gl2.VERSION)),
      maxTextureSize: gl2.getParameter(gl2.MAX_TEXTURE_SIZE) as number,
      maxFloatPrecision: frag && frag.precision > 0 ? "high" : "low",
    };
  } catch {
    return fallback;
  }
}

export function supportsFloatRenderTarget(gl: WebGL2RenderingContext): boolean {
  const ext = gl.getExtension("EXT_color_buffer_float");
  return ext !== null;
}

export function webgpuSupported(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}
