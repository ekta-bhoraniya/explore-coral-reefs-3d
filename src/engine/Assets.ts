import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** GLB loading with meshopt decoding, caching and byte-level progress. */
export class Assets {
  private loader: GLTFLoader;
  private cache = new Map<string, Promise<GLTF>>();
  private progress = new Map<string, number>();
  onProgress: ((p: number) => void) | null = null;

  constructor() {
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
  }

  load(path: string): Promise<GLTF> {
    let p = this.cache.get(path);
    if (!p) {
      this.progress.set(path, 0);
      p = new Promise<GLTF>((resolve, reject) =>
        this.loader.load(
          `${import.meta.env.BASE_URL}${path}`,
          (g) => { this.progress.set(path, 1); this.emit(); resolve(g); },
          (e) => { if (e.total) { this.progress.set(path, e.loaded / e.total); this.emit(); } },
          reject,
        ),
      );
      this.cache.set(path, p);
    }
    return p;
  }

  private emit() {
    const v = [...this.progress.values()];
    this.onProgress?.(v.reduce((a, b) => a + b, 0) / Math.max(1, v.length));
  }
}

/** Collect every mesh's geometry into one, baked in the scene's local space. */
export function bakeGeometry(root: THREE.Object3D): { geometry: THREE.BufferGeometry; material: THREE.Material }[] {
  root.updateMatrixWorld(true);
  const out: { geometry: THREE.BufferGeometry; material: THREE.Material }[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !(m as unknown as THREE.SkinnedMesh).isSkinnedMesh) {
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      out.push({ geometry: g, material: Array.isArray(m.material) ? m.material[0] : m.material });
    }
  });
  return out;
}
