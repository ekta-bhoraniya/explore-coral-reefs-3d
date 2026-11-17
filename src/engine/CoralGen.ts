import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createNoise3D } from 'simplex-noise';
import { rng } from './terrainShape';

export type CoralType = 'branching' | 'brain' | 'table' | 'soft' | 'anemone' | 'fan' | 'rock';

/** Natural height (m) at scale 1, used to keep coral tops below y = −0.9. */
export const NATURAL_HEIGHT: Record<CoralType, number> = {
  branching: 0.6, brain: 0.32, table: 0.4, soft: 0.38, anemone: 0.22, fan: 0.85, rock: 0.42,
};
/** Footprint radius (m) at scale 1, for fish avoidance. */
export const NATURAL_RADIUS: Record<CoralType, number> = {
  branching: 0.4, brain: 0.42, table: 0.62, soft: 0.3, anemone: 0.25, fan: 0.42, rock: 0.55,
};
export const SWAYS: Record<CoralType, boolean> = {
  branching: false, brain: false, table: false, soft: true, anemone: true, fan: true, rock: false,
};

const cache = new Map<string, THREE.BufferGeometry>();

/** Geometry for (type, variant, lod). Base sits at y = 0. Vertex colours carry fake AO and tip tints. */
export function coralGeometry(type: CoralType, variant: number, lod: 0 | 1 | 2): THREE.BufferGeometry {
  const key = `${type}:${variant}:${lod}`;
  let g = cache.get(key);
  if (!g) {
    const seed = 1000 + variant * 7919 + type.length * 31;
    g = BUILDERS[type](rng(seed), lod);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    cache.set(key, g);
  }
  return g;
}

function finish(g: THREE.BufferGeometry, keepUv = false) {
  if (!keepUv) g.deleteAttribute('uv');
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

function colorize(g: THREE.BufferGeometry, fn: (p: THREE.Vector3) => [number, number, number]) {
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    col.set(fn(p), i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const ao = (y: number, h: number) => 0.45 + 0.55 * Math.min(1, Math.max(0, y / h) * 1.6);

const BUILDERS: Record<CoralType, (r: () => number, lod: 0 | 1 | 2) => THREE.BufferGeometry> = {
  branching(r, lod) {
    const levels = [5, 4, 3][lod];
    const segs = [6, 4, 3][lod];
    const parts: THREE.BufferGeometry[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const grow = (base: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, level: number) => {
      const end = base.clone().addScaledVector(dir, len);
      const cyl = new THREE.CylinderGeometry(rad * 0.72, rad, len, segs, 1, level === 0);
      cyl.translate(0, len / 2, 0);
      cyl.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
      cyl.translate(base.x, base.y, base.z);
      parts.push(finish(cyl));
      if (level === 0) {
        const tip = new THREE.SphereGeometry(rad * 0.75, segs, 3);
        tip.translate(end.x, end.y, end.z);
        parts.push(finish(tip));
        return;
      }
      const n = r() < 0.3 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const ang = THREE.MathUtils.degToRad(20 + r() * 25);
        const axis = new THREE.Vector3(r() - 0.5, 0, r() - 0.5).normalize();
        const d = dir.clone().applyAxisAngle(axis, ang * (i === 0 && n === 2 ? -1 : 1));
        d.y = Math.max(d.y, 0.25);
        grow(end, d.normalize(), len * (0.72 + r() * 0.15), rad * 0.72, level - 1);
      }
    };
    const trunks = 3 + Math.floor(r() * 3);
    for (let t = 0; t < trunks; t++) {
      const a = (t / trunks) * Math.PI * 2 + r();
      const d = new THREE.Vector3(Math.cos(a) * 0.45, 1, Math.sin(a) * 0.45).normalize();
      grow(new THREE.Vector3(Math.cos(a) * 0.05, -0.02, Math.sin(a) * 0.05), d, 0.16, 0.035, levels - 1);
    }
    const g = mergeGeometries(parts)!;
    return colorize(g, (p) => {
      const tip = Math.min(1, Math.max(0, (p.y - 0.35) / 0.25));
      const s = ao(p.y, 0.55);
      return [s * (1 - 0.15 * tip), s * (1 - 0.25 * tip), s * (1 + 0.1 * tip)];
    });
  },

  table(r, lod) {
    const radial = [36, 18, 10][lod];
    const n = createNoise3D(r);
    const top = new THREE.CylinderGeometry(0.62, 0.5, 0.07, radial, [3, 2, 1][lod]);
    const pos = top.attributes.position;
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const rr = Math.hypot(p.x, p.z);
      const a = Math.atan2(p.z, p.x);
      const k = 1 + 0.12 * n(Math.cos(a) * 2, Math.sin(a) * 2, 0) * (rr / 0.6);
      p.x *= k;
      p.z *= k;
      p.y += 0.02 * n(p.x * 9, p.z * 9, 1) + rr * rr * 0.08;
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    top.rotateX((r() - 0.5) * 0.2);
    top.translate(0, 0.34, 0);
    const stem = new THREE.CylinderGeometry(0.06, 0.12, 0.34, [10, 6, 4][lod]);
    stem.translate(0, 0.17, 0);
    const g = mergeGeometries([finish(top.toNonIndexed()), finish(stem.toNonIndexed())])!;
    g.computeVertexNormals();
    return colorize(g, (q) => {
      const s = q.y > 0.3 ? 0.75 + 0.25 * Math.min(1, (q.y - 0.3) / 0.06) : ao(q.y, 0.35) * 0.7;
      return [s, s, s];
    });
  },

  brain(r, lod) {
    const n = createNoise3D(r);
    let g: THREE.BufferGeometry = new THREE.SphereGeometry(0.4, [40, 20, 10][lod], [28, 14, 8][lod]);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = mergeVertices(g);
    const pos = g.attributes.position;
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const dir = p.clone().normalize();
      const ridge = 1 - Math.abs(n(dir.x * 5, dir.y * 5, dir.z * 5));
      const d = 1 + (lod === 2 ? 0 : 0.06 * ridge * ridge) + 0.08 * n(dir.x * 1.2, dir.y * 1.2, dir.z * 1.2);
      p.multiplyScalar(d);
      p.y = p.y * 0.62;
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    g.translate(0, 0.1, 0);
    g.computeVertexNormals();
    return colorize(g, (q) => {
      const s = ao(q.y + 0.05, 0.4);
      return [s, s, s];
    });
  },

  soft(r, lod) {
    const parts: THREE.BufferGeometry[] = [];
    const stalks = [10, 7, 4][lod] + Math.floor(r() * 3);
    for (let i = 0; i < stalks; i++) {
      const len = 0.16 + r() * 0.18;
      const rad = 0.035 + r() * 0.03;
      const c = new THREE.CapsuleGeometry(rad, len, [3, 2, 1][lod], [8, 6, 4][lod]);
      c.translate(0, len / 2 + rad * 0.5, 0);
      c.rotateZ((r() - 0.5) * 0.9);
      c.rotateX((r() - 0.5) * 0.9);
      const a = r() * Math.PI * 2, d = r() * 0.16;
      c.translate(Math.cos(a) * d, 0, Math.sin(a) * d);
      parts.push(finish(c));
    }
    const g = mergeGeometries(parts)!;
    return colorize(g, (p) => {
      const s = ao(p.y, 0.3);
      const t = Math.min(1, p.y / 0.35);
      return [s * (0.9 + 0.2 * t), s * (0.85 + 0.15 * t), s * (0.9 + 0.2 * t)];
    });
  },

  fan(r, lod) {
    const g = new THREE.PlaneGeometry(0.95, 0.85, [8, 4, 2][lod], [8, 4, 2][lod]);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      pos.setZ(i, 0.06 * Math.sin(x * 4 + r()) + 0.04 * y * y);
    }
    g.translate(0, 0.425, 0);
    g.computeVertexNormals();
    finish(g, true);
    return colorize(g, (p) => {
      const s = ao(p.y, 0.4);
      return [s, s, s];
    });
  },

  anemone(r, lod) {
    const parts: THREE.BufferGeometry[] = [];
    const n = [240, 110, 45][lod];
    const up = new THREE.Vector3(0, 1, 0);
    const disc = new THREE.CylinderGeometry(0.2, 0.24, 0.06, 16);
    disc.translate(0, 0.03, 0);
    parts.push(finish(disc));
    for (let i = 0; i < n; i++) {
      // golden-angle distribution over a dome
      const t = (i + 0.5) / n;
      const phi = Math.acos(1 - t * 0.95);
      const th = i * 2.39996;
      const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi) + 0.25, Math.sin(phi) * Math.sin(th)).normalize();
      const len = 0.1 + r() * 0.06;
      const cone = new THREE.ConeGeometry(lod === 2 ? 0.02 : 0.012, len, lod === 2 ? 3 : 4, 1);
      cone.translate(0, len / 2, 0);
      cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
      const base = dir.clone().multiplyScalar(0.12);
      cone.translate(base.x, base.y * 0.5 + 0.05, base.z);
      parts.push(finish(cone));
    }
    const g = mergeGeometries(parts)!;
    return colorize(g, (p) => {
      const d = p.length();
      const tip = Math.min(1, Math.max(0, (d - 0.17) / 0.1));
      return [1 - 0.35 * tip, 1 - 0.6 * tip, 1 - 0.1 * tip];
    });
  },

  rock(r, lod) {
    const n = createNoise3D(r);
    let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(0.5, [4, 2, 1][lod]);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    const pos = g.attributes.position;
    const p = new THREE.Vector3();
    const sx = 0.8 + r() * 0.5, sz = 0.8 + r() * 0.5;
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i);
      const k = 1 + 0.25 * n(p.x * 1.6, p.y * 1.6, p.z * 1.6) + 0.08 * n(p.x * 5, p.y * 5, p.z * 5);
      p.multiplyScalar(k);
      pos.setXYZ(i, p.x * sx, p.y * 0.62, p.z * sz);
    }
    g.translate(0, 0.12, 0);
    g.computeVertexNormals();
    return colorize(g, (q) => {
      const s = ao(q.y + 0.1, 0.5);
      const moss = Math.max(0, q.y - 0.1) * 0.6;
      return [s * (1 - moss * 0.3), s * (1 + moss * 0.2), s * (1 - moss * 0.2)];
    });
  },
};

/** Net-like alpha texture for sea fans. */
export function fanAlphaTexture(): THREE.Texture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  const r = rng(42);
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    if (depth > 0) {
      branch(x2, y2, a - 0.35 - r() * 0.2, len * 0.8, w * 0.75, depth - 1);
      branch(x2, y2, a + 0.35 + r() * 0.2, len * 0.8, w * 0.75, depth - 1);
    }
  };
  branch(S / 2, S, -Math.PI / 2, S * 0.2, 7, 7);
  // fine mesh between branches
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1;
  for (let i = 0; i < 70; i++) {
    const y = S * (0.1 + r() * 0.85);
    const half = (S - y) * 0.55 + 20;
    ctx.beginPath();
    ctx.moveTo(S / 2 - half * r(), y);
    ctx.lineTo(S / 2 + half * r(), y + (r() - 0.5) * 20);
    ctx.stroke();
  }
  // round the silhouette
  ctx.globalCompositeOperation = 'destination-in';
  ctx.globalAlpha = 1;
  const grd = ctx.createRadialGradient(S / 2, S, S * 0.2, S / 2, S, S);
  grd.addColorStop(0.75, '#fff');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  return t;
}
