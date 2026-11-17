import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Species } from '../data/schemas';
import { makeFishUniforms, patchMaterial, type FishUniforms } from './shaders';
import { bakeGeometry } from './Assets';
import { procFishGeometry } from './ProcFish';
import type { Terrain } from './Terrain';
import type { Reef, Obstacle } from './Reef';

const UP = new THREE.Vector3(0, 1, 0);
const SURFACE_LIMIT = -0.15;

/** A species' model, normalised once: 1 unit long, head +X, centred. Cloned per fish. */
export class FishModel {
  parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  skinned: { scene: THREE.Object3D; clip: THREE.AnimationClip | null; offset: THREE.Vector3; scale: number } | null = null;
  box = new THREE.Box3(new THREE.Vector3(-0.5, -0.15, -0.1), new THREE.Vector3(0.5, 0.15, 0.1));

  constructor(readonly species: Species, gltf: GLTF | null) {
    const m = species.model;
    const rot = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(m.rotationX, m.rotationY, m.rotationZ, 'YXZ'));
    if (!gltf) {
      const colors = (m.procColors ?? ['#4fa3e0', '#1b1f2a', '#f2d23a']) as [string, string, string];
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide });
      this.parts = [{ geometry: procFishGeometry(colors, 'tang'), material: mat }];
      this.box.setFromBufferAttribute(this.parts[0].geometry.attributes.position as THREE.BufferAttribute);
      return;
    }
    if (m.animated) {
      const scene = gltf.scene;
      scene.applyMatrix4(rot);
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene, true);
      const size = box.getSize(new THREE.Vector3());
      const scale = 1 / Math.max(size.x, 1e-6);
      const offset = box.getCenter(new THREE.Vector3()).multiplyScalar(-1);
      this.skinned = { scene, clip: gltf.animations[0] ?? null, offset, scale };
      this.box.set(box.min.clone().add(offset).multiplyScalar(scale), box.max.clone().add(offset).multiplyScalar(scale));
      return;
    }
    this.parts = bakeGeometry(gltf.scene);
    const box = new THREE.Box3();
    for (const p of this.parts) {
      p.geometry.applyMatrix4(rot);
      p.geometry.computeBoundingBox();
      box.union(p.geometry.boundingBox!);
    }
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 1 / Math.max(size.x, 1e-6);
    for (const p of this.parts) {
      p.geometry.translate(-center.x, -center.y, -center.z);
      p.geometry.scale(s, s, s);
      p.geometry.computeBoundingSphere();
    }
    this.box.set(box.min.clone().sub(center).multiplyScalar(s), box.max.clone().sub(center).multiplyScalar(s));
    if (m.tint) {
      const tint = new THREE.Color(m.tint);
      for (const p of this.parts) {
        const mm = p.material as THREE.MeshStandardMaterial;
        if (mm.color) mm.color.lerp(tint, m.tintStrength);
      }
    }
  }
}

export interface FishContext {
  dt: number;
  time: number;
  terrain: Terrain;
  reef: Reef;
  player: THREE.Vector3;
  groups: Map<string, GroupState>;
}

export interface GroupState { target: THREE.Vector3; timer: number; grazing: boolean; anchor: THREE.Vector3 }

/** What a behaviour wants this frame. */
export interface Intent {
  target: THREE.Vector3;
  speed: number;
  /** stop and hover (velocity eases to 0) */
  hold?: boolean;
  /** behaviour already reacted to the player (e.g. clownfish hide) */
  handlesShy?: boolean;
  /** extra nose-down pitch (radians), e.g. forage */
  pitch?: number;
  roll?: number;
  /** minimum clearance above the sand (default 0.3 m) */
  minClear?: number;
  /** obstacle this fish may enter (its anemone / den) */
  ignore?: Obstacle | null;
  wiggle?: number;
  swell?: number;
}

let counter = 0;

export class Fish {
  readonly id: string;
  readonly root = new THREE.Group();
  readonly visual = new THREE.Group();
  readonly hitbox: THREE.Mesh;
  readonly uniforms: FishUniforms;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  private mixer: THREE.AnimationMixer | null = null;
  private action: THREE.AnimationAction | null = null;
  state: Record<string, unknown> = {};
  shyTimer = 0;
  private shyCooldown = 0;
  private fleeDir = new THREE.Vector3();
  selected = false;
  hovered = false;
  private glow = 0;
  private yawRate = 0;
  private lastYaw = 0;
  private bank = 0;
  readonly length: number;
  wiggleScale = 1;
  index: number;

  constructor(readonly model: FishModel, readonly species: Species, index: number, private reduced: boolean) {
    this.index = index;
    this.id = `${species.id}-${index}-${counter++}`;
    this.length = species.sceneLength;
    this.uniforms = makeFishUniforms();
    const isOctopus = species.behaviour.type === 'den';
    this.uniforms.uWiggleAmp.value = isOctopus ? 0.035 : 0.06;
    this.uniforms.uWiggleFreq.value = isOctopus ? 1.4 : 9;

    if (model.skinned) {
      const clone = SkeletonUtils.clone(model.skinned.scene);
      clone.position.copy(model.skinned.offset);
      const holder = new THREE.Group();
      holder.add(clone);
      holder.scale.setScalar(model.skinned.scale);
      clone.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.material = (m.material as THREE.Material).clone();
          patchMaterial(m.material as THREE.Material, { caustics: true, glow: true }, this.uniforms);
          m.castShadow = true;
          m.frustumCulled = false;
        }
      });
      this.visual.add(holder);
      if (model.skinned.clip) {
        this.mixer = new THREE.AnimationMixer(clone);
        this.action = this.mixer.clipAction(model.skinned.clip);
        this.action.play();
        this.action.time = Math.random() * model.skinned.clip.duration;
      }
    } else {
      for (const p of model.parts) {
        const mat = p.material.clone();
        patchMaterial(mat, { caustics: true, glow: true, wiggle: true }, this.uniforms);
        const mesh = new THREE.Mesh(p.geometry, mat);
        mesh.castShadow = true;
        this.visual.add(mesh);
      }
    }
    this.visual.scale.setScalar(this.length);
    this.root.add(this.visual);

    // Invisible, slightly enlarged (1.3×) box for picking; a minimum size keeps small fish easy to click.
    const size = model.box.getSize(new THREE.Vector3()).multiplyScalar(1.3 * this.length);
    size.max(new THREE.Vector3(0.22, 0.16, 0.16));
    this.hitbox = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshBasicMaterial({ visible: false }));
    this.hitbox.position.copy(model.box.getCenter(new THREE.Vector3()).multiplyScalar(this.length));
    this.hitbox.userData.fish = this;
    this.root.add(this.hitbox);
  }

  get radius() {
    return this.length * 0.5;
  }

  place(p: THREE.Vector3) {
    this.pos.copy(p);
    this.root.position.copy(p);
  }

  update(ctx: FishContext, intent: Intent, maxSpeed: number, shyDistance: number) {
    const { dt } = ctx;
    const b = this.species.behaviour;

    // Player awareness: turn away and speed up for 1–2 s, then calm down.
    const toPlayer = this.pos.clone().sub(ctx.player);
    const dPlayer = toPlayer.length();
    this.shyCooldown -= dt;
    if (!intent.handlesShy && !this.selected && dPlayer < shyDistance && this.shyTimer <= 0 && this.shyCooldown <= 0) {
      this.shyTimer = 1 + Math.random();
      this.shyCooldown = this.shyTimer + 1.5;
      this.fleeDir.copy(toPlayer).setY(toPlayer.y * 0.3).normalize();
    }
    let target = intent.target;
    let speed = intent.speed;
    let hold = intent.hold ?? false;
    if (this.shyTimer > 0 && !this.selected) {
      this.shyTimer -= dt;
      target = this.pos.clone().addScaledVector(this.fleeDir, 3);
      speed = maxSpeed;
      hold = false;
    }

    // Steering: seek / arrive → clamp → integrate.
    const desired = new THREE.Vector3();
    if (this.selected || hold) {
      desired.set(0, 0, 0);
    } else {
      desired.copy(target).sub(this.pos);
      const d = desired.length();
      const arrive = Math.min(1, d / 0.6);
      desired.multiplyScalar(d > 1e-4 ? (speed * arrive) / d : 0);
    }
    const steer = desired.sub(this.vel);
    const maxForce = this.selected ? 3 : 1.2 + maxSpeed;
    if (steer.length() > maxForce) steer.setLength(maxForce);
    this.vel.addScaledVector(steer, dt * (this.selected ? 4 : 2));

    // Terrain and coral avoidance.
    const minClear = intent.minClear ?? 0.3;
    const ground = ctx.terrain.heightAt(this.pos.x, this.pos.z);
    const floor = ground + minClear;
    if (this.pos.y < floor + 0.25) this.vel.y += (floor + 0.25 - this.pos.y) * 3 * dt;
    for (const ob of ctx.reef.near(this.pos.x, this.pos.z)) {
      if (ob === intent.ignore) continue;
      const dx = this.pos.x - ob.x, dy = this.pos.y - ob.y, dz = this.pos.z - ob.z;
      const d = Math.hypot(dx, dy, dz);
      const min = ob.r + 0.2 + this.radius * 0.5;
      if (d < min + 0.4 && d > 1e-4) {
        const push = (min + 0.4 - d) * 4;
        this.vel.x += (dx / d) * push * dt;
        this.vel.y += (dy / d) * push * dt * 0.6 + push * 0.4 * dt;
        this.vel.z += (dz / d) * push * dt;
      }
    }
    const spd = this.vel.length();
    if (spd > maxSpeed) this.vel.multiplyScalar(maxSpeed / spd);
    if (this.selected) this.vel.multiplyScalar(Math.pow(0.88, dt * 60)); // eases to 0 over ~400 ms

    this.pos.addScaledVector(this.vel, dt);
    // Hard constraints: never through sand, coral or the surface.
    for (const ob of ctx.reef.near(this.pos.x, this.pos.z)) {
      if (ob === intent.ignore) continue;
      const v = this.pos.clone().sub(new THREE.Vector3(ob.x, ob.y, ob.z));
      const min = ob.r + 0.2;
      const d = v.length();
      if (d < min) this.pos.addScaledVector(d > 1e-4 ? v.normalize() : UP, min - d);
    }
    const g2 = ctx.terrain.heightAt(this.pos.x, this.pos.z) + minClear;
    if (this.pos.y < g2) { this.pos.y = g2; this.vel.y = Math.max(0, this.vel.y); }
    if (this.pos.y > SURFACE_LIMIT) { this.pos.y = SURFACE_LIMIT; this.vel.y = Math.min(0, this.vel.y); }
    this.root.position.copy(this.pos);

    // Orientation: face the velocity (smoothed), bank in turns, pitch towards the target.
    const v = this.vel;
    const hs = Math.hypot(v.x, v.z);
    const q = new THREE.Quaternion();
    if (this.selected) {
      const toCam = ctx.player.clone().sub(this.pos);
      const yaw = Math.atan2(toCam.x, toCam.z); // +X perpendicular to the view: side-on
      q.setFromEuler(new THREE.Euler(0, yaw, 0, 'YZX'));
    } else if (hs > 0.02 || Math.abs(v.y) > 0.02) {
      const yaw = Math.atan2(-v.z, v.x);
      this.yawRate = THREE.MathUtils.lerp(this.yawRate, wrap(yaw - this.lastYaw) / Math.max(dt, 1e-3), 0.1);
      this.lastYaw = yaw;
      const pitch = Math.atan2(v.y, Math.max(hs, 1e-3)) * 0.7 + (intent.pitch ?? 0);
      this.bank = THREE.MathUtils.clamp(-this.yawRate * 0.25, -0.26, 0.26);
      q.setFromEuler(new THREE.Euler(this.bank + (intent.roll ?? 0), yaw, THREE.MathUtils.clamp(pitch, -0.6, 0.6), 'YZX'));
    } else {
      const e = new THREE.Euler().setFromQuaternion(this.root.quaternion, 'YZX');
      q.setFromEuler(new THREE.Euler(intent.roll ?? 0, e.y, intent.pitch ?? 0, 'YZX'));
    }
    this.root.quaternion.slerp(q, 1 - Math.pow(0.9, dt * 60));

    // Swim motion: wiggle frequency follows speed; 30% while held on the card.
    const rel = Math.min(1, spd / Math.max(b.speed, 0.05));
    const baseFreq = b.type === 'den' ? 1.4 : b.type === 'glide' ? 1.2 : 9 / Math.max(0.6, Math.sqrt(this.length * 4));
    this.uniforms.uWiggleFreq.value = baseFreq * (0.55 + 0.6 * rel);
    const amp = b.type === 'den' ? 0.035 : b.type === 'glide' ? 0.015 : 0.06;
    this.uniforms.uWiggleAmp.value = amp * (intent.wiggle ?? 1) * (this.selected ? 0.3 : 1) * this.wiggleScale * (this.reduced ? 0.6 : 1);
    this.uniforms.uSwell.value = THREE.MathUtils.lerp(this.uniforms.uSwell.value, intent.swell ?? 0, 0.05);
    if (this.mixer && this.action) {
      this.action.timeScale = this.selected ? 0.3 : 0.5 + rel;
      this.mixer.update(dt);
    }
    // Hover glow eases in and out.
    this.glow = THREE.MathUtils.lerp(this.glow, this.hovered || this.selected ? 0.35 : 0, 1 - Math.pow(0.85, dt * 60));
    this.uniforms.uGlow.value = this.glow;
  }
}

export function wrap(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
