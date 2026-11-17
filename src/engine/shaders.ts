import * as THREE from 'three';

/**
 * Shared shader chunks, injected with onBeforeCompile so every reef, terrain and
 * fish material sits in the same water: caustics, sway, fish wiggle, hover glow.
 */
export const shared = {
  uTime: { value: 0 },
  uCausticStrength: { value: 0.35 },
  uCausticScale: { value: 1.6 },
  uCausticSpeed: { value: 0.25 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.86, 0.3).normalize() },
  uSwayStrength: { value: 0.08 },
  uSwaySpeed: { value: 0.9 },
  uMotion: { value: 1 }, // 0 under prefers-reduced-motion for sway
};

export const causticsGLSL = /* glsl */ `
uniform float uTime;
uniform float uCausticStrength;
uniform float uCausticScale;
uniform float uCausticSpeed;
varying vec3 vCWorldPos;
varying vec3 vCWorldNormal;

vec2 cHash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
// Animated Voronoi: distance to the nearest moving cell point, edges = bright lines
float cVoronoi(vec2 p, float t) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(float(x), float(y));
    vec2 o = cHash(i + g);
    o = 0.5 + 0.5 * sin(t + 6.2831 * o);
    float d = length(g + o - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return d2 - d1;
}
float caustics(vec3 wp) {
  float t = uTime * uCausticSpeed;
  vec2 p = wp.xz * uCausticScale;
  p += 0.35 * vec2(sin(p.y * 0.7 + t * 1.3), cos(p.x * 0.6 - t));
  float a = cVoronoi(p, t * 2.0);
  float b = cVoronoi(p * 1.37 + 3.1, -t * 1.6);
  float c = pow(1.0 - smoothstep(0.0, 0.16, a), 2.0) + pow(1.0 - smoothstep(0.0, 0.2, b), 2.0) * 0.7;
  return c;
}
`;

export interface PatchOptions {
  caustics?: boolean;
  sway?: boolean;
  /** fish swim wiggle; geometry must be normalised to x ∈ [-0.5, 0.5], head at +x */
  wiggle?: boolean;
  glow?: boolean;
  wrap?: boolean;
  /** per-instance wiggle phase from an `aPhase` instanced attribute (schools) */
  instPhase?: boolean;
}

export interface FishUniforms {
  uWigglePhase: { value: number };
  uWiggleAmp: { value: number };
  uWiggleFreq: { value: number };
  uGlow: { value: number };
  uSwell: { value: number };
}

export function makeFishUniforms(): FishUniforms {
  return {
    uWigglePhase: { value: Math.random() * 100 },
    uWiggleAmp: { value: 0.06 },
    uWiggleFreq: { value: 9 },
    uGlow: { value: 0 },
    uSwell: { value: 0 },
  };
}

/** Patch a built-in material in place. Programs are shared via customProgramCacheKey. */
export function patchMaterial(mat: THREE.Material, opts: PatchOptions, fishU?: FishUniforms) {
  const key = Object.entries(opts).filter(([, v]) => v).map(([k]) => k).join('-');
  mat.customProgramCacheKey = () => `reef-${key}`;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shared);
    if (fishU) Object.assign(shader.uniforms, fishU);
    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;

    vs = vs.replace('#include <common>', `#include <common>
      uniform float uTime; uniform float uSwayStrength; uniform float uSwaySpeed; uniform float uMotion;
      uniform float uWigglePhase; uniform float uWiggleAmp; uniform float uWiggleFreq; uniform float uSwell;
      varying vec3 vCWorldPos; varying vec3 vCWorldNormal;
      ${opts.instPhase ? 'attribute float aPhase;' : 'const float aPhase = 0.0;'}`);

    let begin = '#include <begin_vertex>';
    if (opts.sway) {
      begin += `
      {
        vec4 swOrigin = vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          swOrigin = instanceMatrix * swOrigin;
        #endif
        swOrigin = modelMatrix * swOrigin;
        float h = max(transformed.y, 0.0);
        float s = uSwayStrength * uMotion * h * h;
        transformed.x += s * sin(uTime * uSwaySpeed + swOrigin.x * 0.7 + swOrigin.z * 0.3);
        transformed.z += 0.6 * s * sin(uTime * uSwaySpeed * 0.8 + swOrigin.z * 0.7);
      }`;
    }
    if (opts.wiggle) {
      begin += `
      {
        float tailW = smoothstep(0.25, -0.5, transformed.x);
        transformed.z += uWiggleAmp * sin(uWiggleFreq * uTime + uWigglePhase + aPhase - transformed.x * 4.0) * tailW;
        transformed *= 1.0 + uSwell;
      }`;
    }
    vs = vs.replace('#include <begin_vertex>', begin);
    vs = vs.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      {
        vec4 cwp = vec4(transformed, 1.0);
        vec3 cn = objectNormal;
        #ifdef USE_INSTANCING
          cwp = instanceMatrix * cwp;
          cn = mat3(instanceMatrix) * cn;
        #endif
        vCWorldPos = (modelMatrix * cwp).xyz;
        vCWorldNormal = normalize(mat3(modelMatrix) * cn);
      }`);

    fs = fs.replace('#include <common>', `#include <common>
      ${causticsGLSL}
      uniform vec3 uSunDir;
      uniform float uGlow;`);
    let post = '';
    if (opts.caustics) {
      post += `
      {
        float up = clamp(dot(normalize(vCWorldNormal), uSunDir), 0.0, 1.0);
        float depthFade = exp(vCWorldPos.y * 0.18);
        outgoingLight += diffuseColor.rgb * caustics(vCWorldPos) * uCausticStrength * up * depthFade * 1.25;
      }`;
    }
    if (opts.wrap) {
      post += `
      {
        float edge = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0);
        outgoingLight += diffuseColor.rgb * edge * 0.18;
      }`;
    }
    if (opts.glow) {
      post += `
      {
        float fr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.2);
        outgoingLight += vec3(0.749, 0.965, 1.0) * fr * uGlow * 2.0 + vec3(0.749, 0.965, 1.0) * uGlow * 0.12;
      }`;
    }
    fs = fs.replace('#include <opaque_fragment>', post + '\n#include <opaque_fragment>');
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
  };
  mat.needsUpdate = true;
}
