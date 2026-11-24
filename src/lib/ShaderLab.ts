import * as THREE from "three";
import { LAB_FRAG, LAB_VERT } from "./shaders/glsl";
import type { ShaderParams } from "../types";

const PATTERN_INDEX: Record<ShaderParams["pattern"], number> = {
  aurora: 0,
  voronoi: 1,
  ripple: 2,
  plasma: 3,
};

export class ShaderLab {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: LAB_VERT,
      fragmentShader: LAB_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: new THREE.Vector2(0.5, 0.5) },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uFrequency: { value: 3.2 },
        uDistortion: { value: 0.65 },
        uHue: { value: 0.32 },
        uIntensity: { value: 1.0 },
        uPattern: { value: 0 },
      },
    });
    const geo = new THREE.SphereGeometry(1.7, 128, 96);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = "shader-lab";
    this.mesh.visible = false;
  }

  applyParams(p: ShaderParams, resolution: THREE.Vector2) {
    const u = this.mat.uniforms;
    u.uFrequency.value = p.frequency;
    u.uDistortion.value = p.distortion;
    u.uHue.value = p.hue;
    u.uIntensity.value = p.intensity;
    u.uPattern.value = PATTERN_INDEX[p.pattern];
    u.uResolution.value = resolution;
  }

  setMouse(ndc: THREE.Vector2) {
    this.mat.uniforms.uMouse.value.set(ndc.x * 0.5 + 0.5, 1 - (ndc.y * 0.5 + 0.5));
  }

  update(time: number) {
    this.mat.uniforms.uTime.value = time;
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
