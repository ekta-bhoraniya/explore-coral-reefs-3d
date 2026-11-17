import * as THREE from 'three';
import type { Tuning } from '../data/schemas';
import { shared } from './shaders';

const snowVS = /* glsl */ `
uniform float uTime;
uniform vec3 uCenter;
uniform float uSize;
uniform float uDrift;
uniform float uPixelRatio;
attribute float aSeed;
varying float vAlpha;
void main() {
  vec3 p = position;
  p += vec3(sin(uTime * 0.13 + aSeed * 6.0), sin(uTime * 0.07 + aSeed * 3.0) * 0.4 - 0.2, cos(uTime * 0.11 + aSeed * 5.0)) * (uDrift * 6.0);
  p.x += uTime * uDrift; // slow current
  // wrap in a 20 m box around the player
  p = mod(p - uCenter + 10.0, 20.0) - 10.0 + uCenter;
  p.y = clamp(p.y, -6.0, -0.08);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  vAlpha = smoothstep(0.2, 1.0, d) * (1.0 - smoothstep(6.0, 10.0, d));
  gl_PointSize = clamp(uSize * (0.6 + aSeed) * uPixelRatio * (3.0 / max(d, 0.5)), 1.0 * uPixelRatio, 3.0 * uPixelRatio);
  gl_Position = projectionMatrix * mv;
}`;
const snowFS = /* glsl */ `
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.15, r) * vAlpha * 0.55;
  gl_FragColor = vec4(vec3(0.85, 0.95, 0.92) * a, a);
}`;

const bubbleVS = /* glsl */ `
attribute float aSize;
attribute float aLife;
uniform float uPixelRatio;
varying float vLife;
void main() {
  vLife = aLife;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio * 60.0 / max(-mv.z, 0.2);
  gl_Position = projectionMatrix * mv;
}`;
const bubbleFS = /* glsl */ `
varying float vLife;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  if (r > 0.5) discard;
  float rim = smoothstep(0.3, 0.48, r) * (1.0 - smoothstep(0.48, 0.5, r));
  float hi = smoothstep(0.16, 0.0, length(c - vec2(-0.15, -0.15)));
  float a = (rim * 0.8 + hi) * smoothstep(0.0, 0.15, vLife) * min(1.0, vLife * 4.0);
  gl_FragColor = vec4(vec3(0.9, 0.98, 1.0) * a, a);
}`;

const MAX_BUBBLES = 160;

export class Particles {
  private snow: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private bubbles: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private bPos = new Float32Array(MAX_BUBBLES * 3);
  private bVel = new Float32Array(MAX_BUBBLES * 3);
  private bLife = new Float32Array(MAX_BUBBLES);
  private bSize = new Float32Array(MAX_BUBBLES);
  private next = 0;
  private nextExhale = 4;
  private trailTimer = 0;
  onExhale: (() => void) | null = null;

  constructor(scene: THREE.Scene, private tuning: Tuning, pixelRatio: number) {
    const N = 2000;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos.set([(Math.random() - 0.5) * 20, -Math.random() * 6, (Math.random() - 0.5) * 20], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.snow = new THREE.Points(g, new THREE.ShaderMaterial({
      vertexShader: snowVS, fragmentShader: snowFS, transparent: true, depthWrite: false,
      uniforms: { uTime: shared.uTime, uCenter: { value: new THREE.Vector3() }, uSize: { value: tuning.particles.size }, uDrift: { value: tuning.particles.drift }, uPixelRatio: { value: pixelRatio } },
    }));
    this.snow.frustumCulled = false;

    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(this.bPos, 3).setUsage(THREE.DynamicDrawUsage));
    bg.setAttribute('aLife', new THREE.BufferAttribute(this.bLife, 1).setUsage(THREE.DynamicDrawUsage));
    bg.setAttribute('aSize', new THREE.BufferAttribute(this.bSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.bubbles = new THREE.Points(bg, new THREE.ShaderMaterial({
      vertexShader: bubbleVS, fragmentShader: bubbleFS, transparent: true, depthWrite: false,
      uniforms: { uPixelRatio: { value: pixelRatio } },
    }));
    this.bubbles.frustumCulled = false;
    scene.add(this.snow, this.bubbles);
  }

  setCount(n: number) {
    this.snow.geometry.setDrawRange(0, n);
  }
  setPixelRatio(pr: number) {
    this.snow.material.uniforms.uPixelRatio.value = pr;
    this.bubbles.material.uniforms.uPixelRatio.value = pr;
  }
  apply() {
    this.snow.material.uniforms.uSize.value = this.tuning.particles.size;
    this.snow.material.uniforms.uDrift.value = this.tuning.particles.drift;
  }

  burst(at: THREE.Vector3, count: number, spread = 0.15) {
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX_BUBBLES;
      this.bPos.set([at.x + (Math.random() - 0.5) * spread, at.y + (Math.random() - 0.5) * spread, at.z + (Math.random() - 0.5) * spread], i * 3);
      this.bVel.set([(Math.random() - 0.5) * 0.15, 0.35 + Math.random() * 0.45, (Math.random() - 0.5) * 0.15], i * 3);
      this.bLife[i] = 1;
      this.bSize[i] = 0.004 + Math.random() * 0.012;
    }
  }

  update(dt: number, camera: THREE.Camera, playerSpeed: number, kicking: boolean, underwater: boolean) {
    this.snow.material.uniforms.uCenter.value.copy(camera.position);
    this.snow.visible = underwater;
    // Bubble emitters: a trail when swimming fast, exhale bursts every 6–12 s.
    if (underwater) {
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const mouth = camera.position.clone().add(new THREE.Vector3(0, -0.25, 0)).addScaledVector(fwd, 0.25);
      this.trailTimer -= dt;
      if ((playerSpeed > 0.7 || kicking) && this.trailTimer <= 0) {
        this.burst(mouth.clone().addScaledVector(fwd, -0.4), 1, 0.4);
        this.trailTimer = 0.08;
      }
      this.nextExhale -= dt;
      if (this.nextExhale <= 0) {
        this.nextExhale = 6 + Math.random() * 6;
        this.burst(mouth, 10 + Math.floor(Math.random() * 20), 0.12);
        this.onExhale?.();
      }
    }
    for (let i = 0; i < MAX_BUBBLES; i++) {
      if (this.bLife[i] <= 0) continue;
      const o = i * 3;
      this.bVel[o + 1] = Math.min(this.bVel[o + 1] + dt * 0.4, 0.9);
      this.bPos[o] += (this.bVel[o] + Math.sin(this.bLife[i] * 20 + i) * 0.05) * dt;
      this.bPos[o + 1] += this.bVel[o + 1] * dt;
      this.bPos[o + 2] += this.bVel[o + 2] * dt;
      this.bLife[i] -= dt * 0.25;
      if (this.bPos[o + 1] > -0.02) this.bLife[i] = 0;
      if (this.bLife[i] <= 0) this.bSize[i] = 0;
    }
    const a = this.bubbles.geometry.attributes;
    a.position.needsUpdate = a.aLife.needsUpdate = a.aSize.needsUpdate = true;
  }
}
