import * as THREE from 'three';
import type { Tuning } from '../data/schemas';

export const SWIM_HEIGHT = -0.35;
const PITCH_MIN = THREE.MathUtils.degToRad(-80);
const PITCH_MAX = THREE.MathUtils.degToRad(20);

export class Input {
  keys = new Set<string>();
  dragging = false;
  dragDX = 0;
  dragDY = 0;
  wheel = 0;
  movedPointer = 0;
  enabled = true;
  private downX = 0;
  private downY = 0;
  /** true if the last pointerup ended a drag rather than a click */
  wasDrag = false;

  constructor(private el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (isTyping(e)) return;
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.wasDrag = false;
      this.downX = e.clientX;
      this.downY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      this.movedPointer = performance.now();
      if (!this.dragging) return;
      this.dragDX += e.movementX;
      this.dragDY += e.movementY;
      if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 5) this.wasDrag = true;
    });
    const up = (e: PointerEvent) => {
      this.dragging = false;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', (e) => { this.wheel += e.deltaY; }, { passive: true });
  }

  axis() {
    if (!this.enabled) return { f: 0, s: 0, kick: false };
    const k = this.keys;
    const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    return { f, s, kick: k.has('ShiftLeft') || k.has('ShiftRight') };
  }
  consumeDrag() {
    const d = { x: this.dragDX, y: this.dragDY };
    this.dragDX = this.dragDY = 0;
    return d;
  }
  consumeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }
  get el_() { return this.el; }
}

export const isTyping = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
};

/** The snorkeller: camera at the surface, horizontal swimming with momentum, drag to look. */
export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  yaw = 0;
  pitch = -0.6;
  targetYaw = 0;
  targetPitch = -0.6;
  fov = 72;
  targetFov = 72;
  frozen = false;
  /** while set, the camera rotates to look at this point (card open) */
  lookTarget: THREE.Vector3 | null = null;
  private time = 0;
  reducedMotion = false;
  lastKick = 0;
  onKick: (() => void) | null = null;
  private wasMoving = false;
  boundary = { softRadius: 24, radius: 28, center: new THREE.Vector2(0, 0) };
  /** 0..1, how far into the murky edge the player is */
  edge = 0;
  moved = false;
  looked = false;

  constructor(private camera: THREE.PerspectiveCamera, private tuning: Tuning) {}

  setPose(x: number, z: number, yaw: number, pitch: number) {
    this.position.set(x, SWIM_HEIGHT, z);
    this.velocity.set(0, 0, 0);
    this.yaw = this.targetYaw = yaw;
    this.pitch = this.targetPitch = pitch;
  }

  update(dt: number, input: Input) {
    this.time += dt;
    const sw = this.tuning.swim;
    const drag = input.consumeDrag();
    if (drag.x || drag.y) {
      this.targetYaw -= drag.x * sw.lookSensitivity;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch - drag.y * sw.lookSensitivity, PITCH_MIN, PITCH_MAX);
      if (!this.lookTarget) this.looked = true;
    }
    const wheel = input.consumeWheel();
    if (wheel && !this.lookTarget) this.targetFov = THREE.MathUtils.clamp(this.targetFov + wheel * 0.02, 55, 85);

    if (this.lookTarget) {
      const d = this.lookTarget.clone().sub(this.position);
      this.targetYaw = this.yaw + wrapAngle(Math.atan2(-d.x, -d.z) - this.yaw);
      this.targetPitch = THREE.MathUtils.clamp(Math.atan2(d.y, Math.hypot(d.x, d.z)), PITCH_MIN, PITCH_MAX);
    }
    // Look inertia: ease towards the target (faster, fixed ~600 ms when centring on a fish).
    const k = this.lookTarget ? 1 - Math.pow(0.9, dt * 60) : 1 - Math.pow(sw.lookInertia, dt * 60);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
    this.fov += (this.targetFov - this.fov) * (1 - Math.pow(0.9, dt * 60));

    // Movement on the horizontal plane only.
    const { f, s, kick } = this.frozen ? { f: 0, s: 0, kick: false } : input.axis();
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const wish = new THREE.Vector3()
      .addScaledVector(fwd, f > 0 ? f : f * 0.5)
      .addScaledVector(right, s * 0.7);
    const moving = wish.lengthSq() > 0;
    if (moving) this.moved = true;
    if (moving && (!this.wasMoving || (kick && this.time - this.lastKick > 0.8))) {
      this.lastKick = this.time;
      this.onKick?.();
    }
    this.wasMoving = moving;
    const max = sw.maxSpeed * (kick ? sw.kick : 1);
    this.velocity.addScaledVector(wish, sw.accel * (kick ? 1.6 : 1) * dt);

    // Soft boundary: beyond the radius a gentle force steers back to the centre. No walls.
    const toC = new THREE.Vector3(this.boundary.center.x - this.position.x, 0, this.boundary.center.y - this.position.z);
    const r = toC.length();
    this.edge = THREE.MathUtils.clamp((r - this.boundary.softRadius) / (this.boundary.radius - this.boundary.softRadius), 0, 1.5);
    if (r > this.boundary.radius) {
      const push = (r - this.boundary.radius) * 1.6 + 0.4;
      this.velocity.addScaledVector(toC.normalize(), push * dt);
      // gently turn the head back too
      const back = Math.atan2(-toC.x, -toC.z);
      this.targetYaw += wrapAngle(back - this.targetYaw) * 0.6 * dt;
    }
    const speed = this.velocity.length();
    if (speed > max * (r > this.boundary.radius ? 1.6 : 1)) this.velocity.multiplyScalar(Math.max(max, speed * 0.96) / speed);
    // Water drag: glide to a stop. Stronger while frozen so it eases to 0 in ~400 ms.
    this.velocity.multiplyScalar(Math.pow(this.frozen ? 0.88 : sw.drag, dt * 60));
    this.position.addScaledVector(this.velocity, dt);
    this.position.y = SWIM_HEIGHT;
  }

  get speed() {
    return this.velocity.length();
  }

  /** Apply the pose to the camera, with bob and roll unless reduced motion. */
  apply(camera = this.camera) {
    const bob = this.reducedMotion ? 0 : 0.03 * Math.sin((this.time * Math.PI * 2) / 4);
    const roll = this.reducedMotion ? 0 : THREE.MathUtils.degToRad(0.5) * Math.sin((this.time * Math.PI * 2) / 5.3);
    camera.position.set(this.position.x, this.position.y + bob, this.position.z);
    camera.rotation.set(this.pitch, this.yaw, roll, 'YXZ');
    if (Math.abs(camera.fov - this.fov) > 0.01) {
      camera.fov = this.fov;
      camera.updateProjectionMatrix();
    }
  }
}

export function wrapAngle(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
