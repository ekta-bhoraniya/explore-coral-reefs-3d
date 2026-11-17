import * as THREE from 'three';
import type { Species } from '../data/schemas';
import type { Assets } from './Assets';
import { Fish, FishModel, type FishContext, type GroupState } from './Fish';
import { behaviours } from './Behaviours';
import type { Terrain } from './Terrain';
import type { Reef } from './Reef';

export class FishManager {
  readonly group = new THREE.Group();
  readonly fish: Fish[] = [];
  private groups = new Map<string, GroupState>();
  private time = 0;
  countScale = 1;

  constructor(private assets: Assets, private terrain: Terrain, private reef: Reef, private reduced: boolean) {
    this.group.name = 'fish';
  }

  async addSpecies(sp: Species) {
    let gltf = null;
    if (!sp.model.src.startsWith('proc:')) {
      try { gltf = await this.assets.load(sp.model.src); } catch (e) { console.warn(`Model for ${sp.id} failed, using stand-in`, e); }
    }
    const model = new FishModel(sp, gltf);
    const n = sp.behaviour.count;
    for (let i = 0; i < n; i++) {
      const f = new Fish(model, sp, i, this.reduced);
      f.place(this.spawnFor(sp, i));
      this.fish.push(f);
      this.group.add(f.root);
    }
  }

  private spawnFor(sp: Species, i: number) {
    const b = sp.behaviour;
    const h = b.home ? this.reef.byId.get(b.home) : undefined;
    const base = h ? new THREE.Vector3(h.x, h.top + 0.15, h.z) : new THREE.Vector3(b.spawn?.x ?? 0, 0, b.spawn?.z ?? 0);
    const p = base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6 + i * 0.1, 0, (Math.random() - 0.5) * 0.6));
    if (!h) p.y = Math.min(-0.8, this.terrain.heightAt(p.x, p.z) + 0.9);
    if (b.type === 'rest') p.y = this.terrain.heightAt(p.x, p.z) + 0.14;
    if (b.type === 'circleCoral' && h) p.x += (b.radius ?? 1.2) + h.r;
    return p;
  }

  update(dt: number, player: THREE.Vector3) {
    this.time += dt;
    const ctx: FishContext = { dt, time: this.time, terrain: this.terrain, reef: this.reef, player, groups: this.groups };
    for (const f of this.fish) {
      const b = f.species.behaviour;
      const intent = behaviours[b.type](f, ctx);
      f.update(ctx, intent, b.maxSpeed, b.shyDistance);
    }
  }

  byId(id: string) {
    return this.fish.find((f) => f.id === id);
  }
}
