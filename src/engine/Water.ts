import * as THREE from 'three';
import type { Tuning } from '../data/schemas';
import { shared } from './shaders';

export class Lighting {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private offset = new THREE.Vector3();

  constructor(scene: THREE.Scene, private tuning: Tuning) {
    this.sun = new THREE.DirectionalLight(tuning.sun.color, tuning.sun.intensity);
    this.hemi = new THREE.HemisphereLight(tuning.hemi.sky, tuning.hemi.ground, tuning.hemi.intensity);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -15;
    cam.right = cam.top = 15;
    cam.near = 1;
    cam.far = 40;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 4;
    scene.add(this.sun, this.sun.target, this.hemi);
    this.apply();
  }

  apply() {
    const t = this.tuning;
    const el = THREE.MathUtils.degToRad(t.sun.elevationDeg), az = THREE.MathUtils.degToRad(t.sun.azimuthDeg);
    this.offset.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(20);
    shared.uSunDir.value.copy(this.offset).normalize();
    this.sun.color.set(t.sun.color);
    this.sun.intensity = t.sun.intensity;
    this.hemi.intensity = t.hemi.intensity;
    this.hemi.color.set(t.hemi.sky);
    this.hemi.groundColor.set(t.hemi.ground);
  }

  setShadows(size: number) {
    this.sun.castShadow = size > 0;
    if (size > 0 && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }

  /** The shadow map follows the player, snapped to texels to avoid shimmering. */
  follow(p: THREE.Vector3) {
    const snap = 30 / Math.max(512, this.sun.shadow.mapSize.x);
    const x = Math.round(p.x / snap) * snap, z = Math.round(p.z / snap) * snap;
    this.sun.target.position.set(x, -3, z);
    this.sun.position.set(x, -3, z).add(this.offset);
  }
}

const surfaceVS = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const surfaceFS = /* glsl */ `
uniform float uTime;
uniform float uRippleSpeed;
uniform float uNormalStrength;
uniform float uWindowCos;
uniform vec3 uSky;
uniform vec3 uDeep;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform vec3 uSunDir;
varying vec3 vWorld;

vec2 grad(vec2 p, float t) {
  // two scrolling ripple layers (analytic derivatives of sums of sines)
  vec2 g = vec2(0.0);
  g += vec2(cos(p.x * 1.7 + t * 1.1), 0.0) * 0.5;
  g += vec2(0.0, cos(p.y * 2.3 - t * 0.9)) * 0.45;
  g += vec2(cos(dot(p, vec2(2.9, 1.3)) + t * 1.7)) * vec2(2.9, 1.3) * 0.12;
  g += vec2(cos(dot(p, vec2(-1.9, 3.7)) - t * 1.3)) * vec2(-1.9, 3.7) * 0.1;
  g += vec2(cos(dot(p, vec2(6.1, -4.3)) + t * 2.9)) * vec2(6.1, -4.3) * 0.03;
  return g;
}

void main() {
  float t = uTime * uRippleSpeed * 25.0;
  vec2 g = grad(vWorld.xz * 0.9, t) + grad(vWorld.xz * 2.1 + 7.0, t * 1.3) * 0.5;
  vec3 n = normalize(vec3(-g.x * uNormalStrength * 0.25, 1.0, -g.y * uNormalStrength * 0.25));
  vec3 V = normalize(vWorld - cameraPosition);
  float dist = length(vWorld - cameraPosition);
  vec3 col;
  float alpha = 1.0;
  if (cameraPosition.y < 0.0) {
    // Seen from below: Snell's window of sky, total internal reflection beyond it.
    float c = dot(V, n);
    float win = smoothstep(uWindowCos - 0.06, uWindowCos + 0.04, c);
    float sun = pow(max(dot(refract(V, -n, 1.33), uSunDir), 0.0), 60.0);
    vec3 sky = uSky * (1.0 + 0.4 * sin(g.x * 3.0)) + vec3(1.0, 0.95, 0.85) * sun * 3.0;
    vec3 tir = mix(uDeep, uFogColor, 0.35) * (0.8 + 0.3 * (g.x + g.y));
    col = mix(tir, sky, win);
    // edge of the window shimmers brightest
    col += uSky * 0.35 * (1.0 - abs(win * 2.0 - 1.0)) * win;
    float f = 1.0 - exp(-pow(uFogDensity * dist * 0.8, 2.0));
    col = mix(col, uFogColor, f * (1.0 - win * 0.6));
  } else {
    // From above (intro): sky reflection over see-through water.
    float fres = pow(1.0 - max(dot(-V, n), 0.0), 3.0);
    vec3 sky = mix(vec3(0.62, 0.84, 0.95), vec3(0.95, 0.98, 1.0), fres);
    col = mix(vec3(0.12, 0.55, 0.62), sky, 0.25 + 0.7 * fres);
    col += pow(max(dot(reflect(V, n), uSunDir), 0.0), 200.0) * 2.0;
    alpha = 0.32 + 0.6 * fres;
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const shaftVS = /* glsl */ `
varying vec2 vUv;
varying float vDist;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vDist = length(w.xyz - cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const shaftFS = /* glsl */ `
uniform float uOpacity;
uniform float uTime;
uniform float uPhase;
varying vec2 vUv;
varying float vDist;
void main() {
  float across = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
  across = pow(across, 1.6);
  float along = smoothstep(0.0, 0.08, vUv.y) * pow(vUv.y, 0.7); // uv.y = 1 at surface
  float pulse = 0.65 + 0.35 * sin(uTime * 0.45 + uPhase) * sin(uTime * 0.27 + uPhase * 1.7);
  float near = smoothstep(0.6, 3.0, vDist);
  float a = across * along * pulse * uOpacity * near;
  gl_FragColor = vec4(vec3(0.82, 0.95, 1.0) * a, 1.0);
}`;

export class Water {
  readonly fog: THREE.FogExp2;
  readonly surface: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private shafts: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  private shaftGroup = new THREE.Group();
  private shaftDir = new THREE.Vector3();
  private rand = Math.random;

  constructor(private scene: THREE.Scene, private tuning: Tuning) {
    this.fog = new THREE.FogExp2(tuning.fog.color, tuning.fog.density);
    scene.fog = this.fog;
    scene.background = new THREE.Color(tuning.fog.color);

    const s = tuning.surface;
    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(240, 240, 1, 1).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        vertexShader: surfaceVS,
        fragmentShader: surfaceFS,
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: shared.uTime,
          uSunDir: shared.uSunDir,
          uRippleSpeed: { value: s.rippleSpeed },
          uNormalStrength: { value: s.normalStrength },
          uWindowCos: { value: Math.cos(THREE.MathUtils.degToRad(s.windowDeg)) },
          uSky: { value: new THREE.Color(s.skyColor) },
          uDeep: { value: new THREE.Color(s.deepColor) },
          uFogColor: { value: new THREE.Color(tuning.fog.color) },
          uFogDensity: { value: tuning.fog.density },
        },
      }),
    );
    this.surface.renderOrder = 10;
    this.surface.name = 'surface';
    scene.add(this.surface, this.shaftGroup);
  }

  setShaftCount(n: number) {
    while (this.shafts.length > n) {
      const m = this.shafts.pop()!;
      this.shaftGroup.remove(m);
      m.material.dispose();
    }
    const geo = makeShaftGeometry();
    while (this.shafts.length < n) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: shaftVS,
        fragmentShader: shaftFS,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        uniforms: { uOpacity: { value: 0.1 }, uTime: shared.uTime, uPhase: { value: this.rand() * 10 } },
      });
      const m = new THREE.Mesh(geo, mat);
      m.userData.dead = true;
      m.frustumCulled = false;
      this.shafts.push(m);
      this.shaftGroup.add(m);
    }
  }

  apply() {
    const t = this.tuning;
    this.fog.color.set(t.fog.color);
    (this.scene.background as THREE.Color).set(t.fog.color);
    const u = this.surface.material.uniforms;
    u.uRippleSpeed.value = t.surface.rippleSpeed;
    u.uNormalStrength.value = t.surface.normalStrength;
    u.uWindowCos.value = Math.cos(THREE.MathUtils.degToRad(t.surface.windowDeg));
    u.uSky.value.set(t.surface.skyColor);
    u.uDeep.value.set(t.surface.deepColor);
    u.uFogColor.value.set(t.fog.color);
  }

  /** edge: 0..1.5 murk factor from the player's distance to the boundary; above: camera above water */
  update(camPos: THREE.Vector3, viewDir: THREE.Vector3, edge: number, above: number) {
    const t = this.tuning;
    const density = THREE.MathUtils.lerp(t.fog.density, t.fog.edgeDensity, Math.min(1, edge)) * (1 - above * 0.75);
    this.fog.density = density;
    this.surface.material.uniforms.uFogDensity.value = density;
    this.surface.position.set(camPos.x, 0, camPos.z);

    // Light shafts: refracted sun direction, recycled around the player so some are always in view.
    this.shaftDir.copy(shared.uSunDir.value).multiplyScalar(-1);
    this.shaftDir.y *= 1.6;
    this.shaftDir.normalize();
    const ahead = new THREE.Vector3(viewDir.x, 0, viewDir.z).normalize();
    for (const m of this.shafts) {
      const dx = m.position.x - camPos.x, dz = m.position.z - camPos.z;
      if (m.userData.dead || dx * dx + dz * dz > 15 * 15) {
        const a = (this.rand() - 0.5) * Math.PI * 1.4;
        const r = 2 + this.rand() * 11;
        const dir = ahead.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        m.position.set(camPos.x + dir.x * r, 0, camPos.z + dir.z * r);
        const width = 0.6 + this.rand() * 1.8;
        m.scale.set(width, 9 + this.rand() * 6, width);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), this.shaftDir);
        m.material.uniforms.uOpacity.value = THREE.MathUtils.lerp(t.shafts.opacityMin, t.shafts.opacityMax, this.rand());
        m.userData.dead = false;
      }
    }
    this.shaftGroup.visible = above < 0.5;
  }
}

/** Two crossed quads, hanging down from y = 0 to y = −1, uv.y = 1 at the top. */
function makeShaftGeometry() {
  const a = new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0);
  const b = a.clone().rotateY(Math.PI / 2);
  const pos = new Float32Array([...a.attributes.position.array, ...b.attributes.position.array]);
  const uv = new Float32Array([...a.attributes.uv.array, ...b.attributes.uv.array]);
  const idxA = Array.from(a.index!.array);
  const idx = [...idxA, ...idxA.map((i) => i + 4)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
