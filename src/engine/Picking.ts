import * as THREE from 'three';
import type { Fish } from './Fish';

const MAX_DIST = 12;

/** Hover and click on hero fish via raycasting against enlarged invisible boxes. */
export class Picking {
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private hasPointer = false;

  constructor(el: HTMLElement, private camera: THREE.PerspectiveCamera) {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.hasPointer = true;
    });
    el.addEventListener('pointerleave', () => (this.hasPointer = false));
    this.ray.far = MAX_DIST;
  }

  pick(fish: Fish[]): Fish | null {
    if (!this.hasPointer) return null;
    this.ray.setFromCamera(this.ndc, this.camera);
    const boxes = fish.filter((f) => f.root.visible && f.pos.distanceTo(this.camera.position) < MAX_DIST).map((f) => f.hitbox);
    const hit = this.ray.intersectObjects(boxes, false)[0];
    return hit ? (hit.object.userData.fish as Fish) : null;
  }

  /** Fish currently in view and close enough to click, nearest first (keyboard Tab order). */
  inView(fish: Fish[]): Fish[] {
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse),
    );
    return fish
      .filter((f) => f.pos.distanceTo(this.camera.position) < MAX_DIST && frustum.containsPoint(f.pos))
      .sort((a, b) => a.pos.distanceTo(this.camera.position) - b.pos.distanceTo(this.camera.position));
  }
}
