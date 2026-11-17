import * as THREE from 'three';
import type { Placement } from '../data/schemas';
import { coralGeometry, fanAlphaTexture, NATURAL_HEIGHT, NATURAL_RADIUS, SWAYS, type CoralType } from './CoralGen';
import { patchMaterial } from './shaders';
import type { Terrain } from './Terrain';
import { Assets, bakeGeometry } from './Assets';

export const CORAL_TOP_MAX = -0.95;
const CHUNK = 10;
const VARIANTS = 3;

export interface Obstacle { x: number; y: number; z: number; r: number; id?: string; top: number }
interface ResolvedPlacement extends Placement { y: number; s: number; type: CoralType | 'model' }

interface Chunk {
  cx: number; cz: number;
  levels: THREE.Group[]; // lod0, lod1, lod2
}

/** The reef: placements from reef.json → instanced meshes, in 10 × 10 m chunks with 3 LOD levels. */
export class Reef {
  readonly group = new THREE.Group();
  readonly obstacles: Obstacle[] = [];
  readonly byId = new Map<string, Obstacle>();
  private chunks: Chunk[] = [];
  private grid = new Map<string, Obstacle[]>();
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private modelGeo = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material }[][]>();
  lodDistances: [number, number] = [8, 18];
  drawDistance = 46;
  castShadows = true;

  constructor(private terrain: Terrain, private assets: Assets) {
    this.group.name = 'reef';
  }

  private material(type: string) {
    let m = this.materials.get(type);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: type === 'rock' ? 0.95 : 0.85, metalness: 0 });
      if (type === 'fan') {
        m.alphaMap = fanAlphaTexture();
        m.alphaTest = 0.4;
        m.side = THREE.DoubleSide;
      }
      if (type === 'anemone') m.roughness = 0.6;
      patchMaterial(m, { caustics: true, wrap: type !== 'rock', sway: SWAYS[type as CoralType] ?? false });
      this.materials.set(type, m);
    }
    return m;
  }

  /** Preload GLB placements so build() can stay synchronous (the editor rebuilds often). */
  async preload(placements: Placement[]) {
    const paths = [...new Set(placements.filter((p) => !p.asset.startsWith('gen:')).map((p) => p.asset))];
    await Promise.all(paths.map(async (p) => {
      if (this.modelGeo.has(p)) return;
      const lods = await Promise.all([p, p.replace('.glb', '_lod1.glb'), p.replace('.glb', '_lod2.glb')].map(async (f) => {
        try { return bakeGeometry((await this.assets.load(`models/${f}`)).scene); } catch { return null; }
      }));
      for (const l of lods) l?.forEach((part) => patchMaterial(part.material, { caustics: true, wrap: true }));
      const base = lods[0]!;
      this.modelGeo.set(p, lods.map((l) => l ?? base));
    }));
  }

  build(placements: Placement[]) {
    this.clear();
    const resolved: ResolvedPlacement[] = placements.map((p) => {
      const type = p.asset.startsWith('gen:') ? (p.asset.slice(4) as CoralType) : 'model';
      const ground = this.terrain.heightAt(p.x, p.z) - 0.04;
      let natural = type === 'model' ? this.modelHeight(p.asset) : NATURAL_HEIGHT[type];
      let s = p.scale;
      if (ground + natural * s > CORAL_TOP_MAX) s = Math.max(0.2, (CORAL_TOP_MAX - ground) / natural);
      const radius = (type === 'model' ? 0.6 : NATURAL_RADIUS[type]) * s;
      const ob: Obstacle = { x: p.x, y: ground + natural * s * 0.45, z: p.z, r: Math.max(radius, natural * s * 0.5), id: p.id, top: ground + natural * s };
      this.obstacles.push(ob);
      if (p.id) this.byId.set(p.id, ob);
      const k = `${Math.floor(p.x / 4)},${Math.floor(p.z / 4)}`;
      (this.grid.get(k) ?? this.grid.set(k, []).get(k)!).push(ob);
      return { ...p, y: ground, s, type };
    });

    const byChunk = new Map<string, ResolvedPlacement[]>();
    for (const p of resolved) {
      const k = `${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
      (byChunk.get(k) ?? byChunk.set(k, []).get(k)!).push(p);
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3();
    const col = new THREE.Color();
    for (const [k, list] of byChunk) {
      const [cx, cz] = k.split(',').map(Number);
      const chunk: Chunk = { cx: (cx + 0.5) * CHUNK, cz: (cz + 0.5) * CHUNK, levels: [new THREE.Group(), new THREE.Group(), new THREE.Group()] };
      for (let lod = 0 as 0 | 1 | 2; lod < 3; lod = (lod + 1) as 0 | 1 | 2) {
        // group by type + variant (far LOD collapses variants)
        const groups = new Map<string, ResolvedPlacement[]>();
        for (const p of list) {
          const v = p.type === 'model' ? p.asset : `${p.type}:${lod === 2 ? 0 : p.seed % VARIANTS}`;
          (groups.get(v) ?? groups.set(v, []).get(v)!).push(p);
        }
        for (const [gk, items] of groups) {
          const parts: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = items[0].type === 'model'
            ? this.modelGeo.get(items[0].asset)?.[lod] ?? []
            : [{ geometry: coralGeometry(items[0].type as CoralType, Number(gk.split(':')[1]), lod), material: this.material(items[0].type) }];
          for (const part of parts) {
            const mesh = new THREE.InstancedMesh(part.geometry, part.material, items.length);
            items.forEach((p, i) => {
              q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotY);
              mesh.setMatrixAt(i, m4.compose(pos.set(p.x, p.y, p.z), q, sc.setScalar(p.s)));
              col.set(p.color ?? '#ffffff');
              const j = ((p.seed % 97) / 97 - 0.5) * 0.12;
              col.offsetHSL(j * 0.2, 0, j);
              mesh.setColorAt(i, col);
            });
            mesh.castShadow = lod < 2 && this.castShadows;
            mesh.receiveShadow = true;
            mesh.computeBoundingSphere();
            chunk.levels[lod].add(mesh);
          }
        }
        chunk.levels[lod].visible = false;
        this.group.add(chunk.levels[lod]);
      }
      this.chunks.push(chunk);
    }
  }

  private modelHeight(asset: string) {
    const parts = this.modelGeo.get(asset)?.[0];
    if (!parts) return 0.5;
    const box = new THREE.Box3();
    for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox!); }
    return Math.max(0.1, box.max.y);
  }

  clear() {
    for (const c of this.chunks) for (const l of c.levels) {
      for (const m of l.children) (m as THREE.InstancedMesh).dispose();
      this.group.remove(l);
    }
    this.chunks = [];
    this.obstacles.length = 0;
    this.byId.clear();
    this.grid.clear();
  }

  setShadows(on: boolean) {
    this.castShadows = on;
    for (const c of this.chunks) c.levels.forEach((l, i) => l.children.forEach((m) => (m.castShadow = on && i < 2)));
  }

  update(cam: THREE.Vector3) {
    const [d1, d2] = this.lodDistances;
    for (const c of this.chunks) {
      const d = Math.max(0, Math.hypot(c.cx - cam.x, c.cz - cam.z) - CHUNK * 0.7);
      const lod = d > this.drawDistance ? -1 : d < d1 ? 0 : d < d2 ? 1 : 2;
      c.levels.forEach((l, i) => (l.visible = i === lod));
    }
  }

  /** Obstacles near a point (4 m grid), for fish avoidance. */
  near(x: number, z: number): Obstacle[] {
    const gx = Math.floor(x / 4), gz = Math.floor(z / 4);
    const out: Obstacle[] = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const l = this.grid.get(`${gx + i},${gz + j}`);
      if (l) out.push(...l);
    }
    return out;
  }
}
