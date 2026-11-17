import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { baseHeight, rng, TERRAIN_SIZE } from './terrainShape';
import { patchMaterial } from './shaders';

const RES = 512;

/** Sea floor: an 80 × 80 m plane displaced by a 512² heightmap between y = −5 and −1.5. */
export class Terrain {
  readonly mesh: THREE.Mesh;
  private heights = new Float32Array(RES * RES);

  constructor() {
    for (let j = 0; j < RES; j++)
      for (let i = 0; i < RES; i++) {
        const x = (i / (RES - 1) - 0.5) * TERRAIN_SIZE;
        const z = (j / (RES - 1) - 0.5) * TERRAIN_SIZE;
        this.heights[j * RES + i] = baseHeight(x, z);
      }

    const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 256, 256);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const n2 = createNoise2D(rng(99));
    const sand = new THREE.Color('#d9c9a3');
    const dark = new THREE.Color('#9d8f6e');
    const c = new THREE.Color();
    for (let k = 0; k < pos.count; k++) {
      const x = pos.getX(k), z = pos.getZ(k);
      pos.setY(k, this.heightAt(x, z));
      // A second, larger noise layer breaks up the texture tiling.
      const t = 0.5 + 0.5 * n2(x * 0.05, z * 0.05);
      c.copy(sand).lerp(dark, t * 0.55 + 0.1 * n2(x * 0.3, z * 0.3));
      colors.set([c.r, c.g, c.b], k * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const { map, normalMap } = makeSandTextures();
    const mat = new THREE.MeshStandardMaterial({
      map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9), vertexColors: true, roughness: 0.95, metalness: 0,
    });
    patchMaterial(mat, { caustics: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
  }

  /** Bilinear CPU lookup used by fish, the player and the editor. */
  heightAt(x: number, z: number): number {
    const fx = (x / TERRAIN_SIZE + 0.5) * (RES - 1);
    const fz = (z / TERRAIN_SIZE + 0.5) * (RES - 1);
    const i = Math.max(0, Math.min(RES - 2, Math.floor(fx)));
    const j = Math.max(0, Math.min(RES - 2, Math.floor(fz)));
    const u = Math.min(1, Math.max(0, fx - i)), v = Math.min(1, Math.max(0, fz - j));
    const h = this.heights;
    const a = h[j * RES + i], b = h[j * RES + i + 1], c = h[(j + 1) * RES + i], d = h[(j + 1) * RES + i + 1];
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  }
}

/** Generated sand colour + ripple-mark normal map (tiled 20×). */
function makeSandTextures() {
  const S = 256;
  const n = createNoise2D(rng(7));
  const col = document.createElement('canvas');
  col.width = col.height = S;
  const cctx = col.getContext('2d')!;
  const cimg = cctx.createImageData(S, S);
  const hgt = new Float32Array(S * S);
  const TAU = Math.PI * 2;
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      // tileable noise via torus mapping
      const nx = Math.cos(u * TAU), ny = Math.sin(u * TAU), nz = Math.cos(v * TAU), nw = Math.sin(v * TAU);
      const g = n(nx * 1.5 + nz * 0.7, ny * 1.5 + nw * 0.7);
      const grain = n(nx * 9 + nz * 9, ny * 9 + nw * 9);
      const ripple = Math.sin((v + 0.04 * g) * TAU * 6 + u * TAU);
      hgt[y * S + x] = ripple * 0.6 + grain * 0.25;
      const l = 0.82 + 0.08 * g + 0.06 * grain;
      const i = (y * S + x) * 4;
      cimg.data[i] = 255 * l; cimg.data[i + 1] = 245 * l; cimg.data[i + 2] = 220 * l; cimg.data[i + 3] = 255;
    }
  cctx.putImageData(cimg, 0, 0);
  const nrm = document.createElement('canvas');
  nrm.width = nrm.height = S;
  const nctx = nrm.getContext('2d')!;
  const nimg = nctx.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const hx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)];
      const hy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
      const v = new THREE.Vector3(-hx, -hy, 1.2).normalize();
      const i = (y * S + x) * 4;
      nimg.data[i] = (v.x * 0.5 + 0.5) * 255; nimg.data[i + 1] = (v.y * 0.5 + 0.5) * 255; nimg.data[i + 2] = (v.z * 0.5 + 0.5) * 255; nimg.data[i + 3] = 255;
    }
  nctx.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(col);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(nrm);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(20, 20);
    t.anisotropy = 4;
  }
  return { map, normalMap };
}
