import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural stand-in fish body (powder blue tang placeholder, background fusiliers).
 * Normalised: length 1 along x ∈ [-0.5, 0.5], head at +x. Vertex colours carry the pattern.
 */
export function procFishGeometry(colors: [string, string, string], pattern: 'tang' | 'fusilier', detail = 1): THREE.BufferGeometry {
  const [body, accent, tail] = colors.map((c) => new THREE.Color(c));
  const seg = detail > 0 ? 18 : 8;
  const ring = detail > 0 ? 14 : 6;
  const deep = pattern === 'tang' ? 0.27 : 0.17; // body depth / length
  // Body: a lathe around x, flattened sideways.
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg; // 0 = tail end, 1 = snout
    const x = -0.32 + t * 0.8;
    const r = Math.sin(Math.pow(t, 0.75) * Math.PI) * deep * (t < 0.15 ? 0.55 + t * 3 : 1);
    pts.push(new THREE.Vector2(Math.max(r, 0.004), x));
  }
  const lathe = new THREE.LatheGeometry(pts, ring);
  lathe.rotateZ(-Math.PI / 2); // lathe axis y → x
  lathe.scale(1, 1, 0.36);
  lathe.deleteAttribute('uv');

  // Tail fin (forked) and dorsal/anal fins as thin triangles.
  const fin = (verts: number[]) => {
    const g = new THREE.BufferGeometry();
    const v = new Float32Array(verts);
    g.setAttribute('position', new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  };
  const tailFin = fin([
    -0.3, 0, 0.004, -0.5, 0.16, 0, -0.42, 0, 0,
    -0.3, 0, 0.004, -0.42, 0, 0, -0.5, -0.16, 0,
    -0.3, 0, -0.004, -0.42, 0, 0, -0.5, 0.16, 0,
    -0.3, 0, -0.004, -0.5, -0.16, 0, -0.42, 0, 0,
  ]);
  const top = deep * 0.92;
  const dorsal = fin([
    0.2, top, 0, -0.28, top * 0.35, 0, -0.05, top + 0.06, 0,
    0.2, top, 0, -0.05, top + 0.06, 0, -0.28, top * 0.35, 0,
    0.05, -top, 0, -0.04, -top - 0.05, 0, -0.27, -top * 0.35, 0,
    0.05, -top, 0, -0.27, -top * 0.35, 0, -0.04, -top - 0.05, 0,
  ]);
  const lathed = lathe.toNonIndexed();
  const g = mergeGeometries([lathed, tailFin, dorsal])!;
  g.computeVertexNormals();

  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    if (x < -0.31) c.copy(tail);
    else if (pattern === 'tang') {
      if (x > 0.3) c.copy(accent); // black face
      else if (Math.abs(y) > deep * 0.9) c.copy(tail); // yellow dorsal fin
      else c.copy(body).multiplyScalar(0.9 + 0.2 * (y / deep));
      if (y < -deep * 0.55 && x > 0.05 && x < 0.3) c.lerp(new THREE.Color('#f4f4f0'), 0.6); // white throat
    } else {
      // fusilier: blue back, pale belly, yellow tail
      c.copy(y > 0.02 ? body : accent);
      if (y > 0.02) c.multiplyScalar(0.85 + y * 1.5);
    }
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
