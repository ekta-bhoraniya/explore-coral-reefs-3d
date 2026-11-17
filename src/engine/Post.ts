import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Tuning } from '../data/schemas';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uNear: { value: 0.05 },
    uFar: { value: 120 },
    uRedDist: { value: 12 },
    uGreenDist: { value: 25 },
    uLoss: { value: 0.85 },
    uUnderwater: { value: 1 },
    uSaturation: { value: 1.1 },
    uContrast: { value: 1.04 },
    uTint: { value: new THREE.Color('#bfe8ff') },
    uTintStrength: { value: 0.08 },
    uWarmth: { value: 0.06 },
    uVignette: { value: 0.35 },
    uMask: { value: 0.6 },
    uMaskOn: { value: 1 },
    uFlash: { value: 0 },
    uWaterColor: { value: new THREE.Color('#1d6a86') },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform float uNear, uFar, uRedDist, uGreenDist, uLoss, uUnderwater;
    uniform float uSaturation, uContrast, uTintStrength, uWarmth, uVignette, uMask, uMaskOn, uFlash, uAspect;
    uniform vec3 uTint, uWaterColor;
    varying vec2 vUv;
    float viewDist(float d) {
      float z = d * 2.0 - 1.0;
      return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
    }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float d = texture2D(tDepth, vUv).x;
      float dist = d >= 1.0 ? 60.0 : viewDist(d);
      // Depth colour loss: red goes first, then green, so the distance turns blue-green.
      vec3 keep = vec3(exp(-dist / uRedDist * 2.3), exp(-dist / uGreenDist * 1.2), 1.0);
      // the absorbed energy re-appears as water colour, so haze keeps its brightness
      float absorbed = dot(c * (1.0 - keep), vec3(0.4));
      vec3 lost = c * keep + uWaterColor / max(dot(uWaterColor, vec3(0.333)), 0.05) * absorbed * 0.55;
      c = mix(c, lost, uLoss * uUnderwater * (d >= 1.0 ? 0.0 : 1.0));
      // Grade: warm close-ups, cool tint, saturation, contrast
      c *= mix(vec3(1.0), vec3(1.0 + uWarmth, 1.0, 1.0 - uWarmth), uUnderwater * (1.0 - smoothstep(1.0, 6.0, dist)));
      c = mix(c, c * uTint * 1.25, uTintStrength * uUnderwater);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSaturation);
      c = (c - 0.18) * uContrast + 0.18;
      // Vignette + soft snorkel-mask edge
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
      c *= 1.0 - uVignette * smoothstep(0.35, 1.0, length(p) * 1.25);
      vec2 q = abs(vUv - 0.5) * 2.0;
      float lens = pow(pow(q.x, 4.0) + pow(q.y * 1.08, 4.0), 0.25);
      float mask = smoothstep(0.86, 1.06, lens) * uMask * uMaskOn * uUnderwater;
      c = mix(c, vec3(0.01, 0.03, 0.04), mask);
      c = mix(c, vec3(1.0), uFlash);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

/** render (MSAA + depth texture) → bloom → combined grade pass → output (tone map + sRGB) */
export class Post {
  readonly target: THREE.WebGLRenderTarget;
  private composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly grade: ShaderPass;
  private texPass: TexturePass;

  constructor(private renderer: THREE.WebGLRenderer, private tuning: Tuning) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: 4,
      depthTexture: new THREE.DepthTexture(size.x, size.y),
    });
    this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType }));
    this.texPass = new TexturePass(this.target.texture);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), tuning.bloom.strength, tuning.bloom.radius, tuning.bloom.threshold);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.texPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.grade.uniforms.tDepth.value = this.target.depthTexture;
    this.apply();
  }

  apply() {
    const t = this.tuning, u = this.grade.uniforms;
    this.bloom.strength = t.bloom.strength;
    this.bloom.threshold = t.bloom.threshold;
    this.bloom.radius = t.bloom.radius;
    u.uRedDist.value = t.depthLoss.redDistance;
    u.uGreenDist.value = t.depthLoss.greenDistance;
    u.uLoss.value = t.depthLoss.strength;
    u.uSaturation.value = t.grade.saturation;
    u.uContrast.value = t.grade.contrast;
    u.uTint.value.set(t.grade.tint);
    u.uTintStrength.value = t.grade.tintStrength;
    u.uWarmth.value = t.grade.warmth;
    u.uVignette.value = t.grade.vignette;
    u.uMask.value = t.grade.mask;
    u.uWaterColor.value.set(t.fog.color);
  }

  setSize(w: number, h: number, pr: number) {
    const W = Math.floor(w * pr), H = Math.floor(h * pr);
    this.target.setSize(W, H);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.grade.uniforms.uAspect.value = w / h;
  }

  setBloom(on: boolean) {
    this.bloom.enabled = on;
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.grade.uniforms.uNear.value = camera.near;
    this.grade.uniforms.uFar.value = camera.far;
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.composer.render();
  }
}
