import * as THREE from 'three';
import { procFishGeometry } from './ProcFish';
import { makeFishUniforms, patchMaterial } from './shaders';
import type { Terrain } from './Terrain';

/** Background schools: boids, one InstancedMesh (one draw call) per school. Not clickable. */
class School {
  readonly mesh: THREE.InstancedMesh;
  private pos: THREE.Vector3[] = [];
  private vel: THREE.Vector3[] = [];
  private center = new THREE.Vector3();
  private angle = Math.random() * 6.28;
  private count: number;

  constructor(private terrain: Terrain, count: number, private route: { x: number; z: number; r: number; y: number }) {
    this.count = count;
    const geo = procFishGeometry(['#3a78c8', '#dfe8ee', '#f2d23a'], 'fusilier', 0);
    const phases = new Float32Array(count);
    for (let i = 0; i < count; i++) phases[i] = Math.random() * 20;
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, side: THREE.DoubleSide });
    const u = makeFishUniforms();
    u.uWiggleAmp.value = 0.07;
    u.uWiggleFreq.value = 14;
    patchMaterial(mat, { caustics: true, wiggle: true, instPhase: true }, u);
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.updateCenter(0);
    for (let i = 0; i < count; i++) {
      this.pos.push(this.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 3)));
      this.vel.push(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(0.4));
    }
  }

  private updateCenter(dt: number) {
    this.angle += dt * 0.035;
    const { x, z, r, y } = this.route;
    this.center.set(x + Math.cos(this.angle) * r, y, z + Math.sin(this.angle * 1.3) * r * 0.7);
    const g = this.terrain.heightAt(this.center.x, this.center.z);
    this.center.y = THREE.MathUtils.clamp(Math.max(y, g + 1.0), -4, -0.9);
  }

  setVisibleCount(n: number) {
    this.mesh.count = Math.min(n, this.count);
  }

  update(dt: number, player: THREE.Vector3) {
    this.updateCenter(dt);
    const n = this.mesh.count;
    const sep = new THREE.Vector3(), ali = new THREE.Vector3(), coh = new THREE.Vector3(), tmp = new THREE.Vector3();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(0.16, 0.16, 0.16);
    const fwd = new THREE.Vector3(1, 0, 0);
    for (let i = 0; i < n; i++) {
      const p = this.pos[i], v = this.vel[i];
      sep.set(0, 0, 0); ali.set(0, 0, 0); coh.set(0, 0, 0);
      let cnt = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        tmp.subVectors(p, this.pos[j]);
        const d2 = tmp.lengthSq();
        if (d2 < 1.2) {
          cnt++;
          ali.add(this.vel[j]);
          coh.add(this.pos[j]);
          if (d2 < 0.09) sep.addScaledVector(tmp, 1 / Math.max(d2, 0.01));
        }
      }
      const acc = new THREE.Vector3();
      if (cnt) {
        acc.addScaledVector(sep, 0.05);
        acc.addScaledVector(ali.divideScalar(cnt).sub(v), 0.8);
        acc.addScaledVector(coh.divideScalar(cnt).sub(p), 0.5);
      }
      acc.addScaledVector(tmp.subVectors(this.center, p), 0.25); // pull to the school centre
      // The school parts smoothly around the player.
      tmp.subVectors(p, player);
      const dp = tmp.length();
      if (dp < 2.5) acc.addScaledVector(tmp.normalize(), (2.5 - dp) * 3);
      const g = this.terrain.heightAt(p.x, p.z);
      if (p.y < g + 0.6) acc.y += (g + 0.6 - p.y) * 4;
      if (p.y > -0.4) acc.y -= (p.y + 0.4) * 4;
      v.addScaledVector(acc, dt);
      const sp = v.length();
      if (sp > 1.1) v.multiplyScalar(1.1 / sp);
      if (sp < 0.25) v.multiplyScalar(0.25 / Math.max(sp, 1e-3));
      p.addScaledVector(v, dt);
      p.y = Math.min(p.y, -0.2);
      q.setFromUnitVectors(fwd, tmp.copy(v).normalize());
      this.mesh.setMatrixAt(i, m.compose(p, q, s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Schools {
  readonly group = new THREE.Group();
  private schools: School[] = [];

  constructor(terrain: Terrain) {
    this.schools = [
      new School(terrain, 70, { x: -4, z: -6, r: 9, y: -1.4 }),
      new School(terrain, 50, { x: 10, z: 2, r: 7, y: -1.8 }),
    ];
    for (const s of this.schools) this.group.add(s.mesh);
  }

  setTier(tier: 'high' | 'medium' | 'low') {
    const scale = tier === 'high' ? 1 : tier === 'medium' ? 0.7 : 0.45;
    this.schools.forEach((s, i) => {
      s.mesh.visible = !(tier === 'low' && i > 0);
      s.setVisibleCount(Math.round(80 * scale));
    });
  }

  update(dt: number, player: THREE.Vector3) {
    for (const s of this.schools) if (s.mesh.visible) s.update(dt, player);
  }
}
