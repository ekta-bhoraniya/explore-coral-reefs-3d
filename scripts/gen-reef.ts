// Generates the first public/data/reef.json. After that, the reef editor (?editor=1) owns the file.
import { writeFileSync } from 'node:fs';
import { rng, channelDistance, baseHeight } from '../src/engine/terrainShape';

const r = rng(2026);
type P = { id?: string; asset: string; x: number; z: number; rotY: number; scale: number; seed: number; color?: string };
const out: P[] = [];
const round = (v: number) => Math.round(v * 100) / 100;
const pal: Record<string, string[]> = {
  branching: ['#e9dcc0', '#c9a27e', '#b9a1d6', '#d8c6a0', '#c48f6a'],
  table: ['#b89a6a', '#c9a64e', '#9fb38a', '#a88c5c'],
  brain: ['#8a8a3a', '#c9a23a', '#8a6a3a', '#9c8f4a'],
  soft: ['#e58aa6', '#f0965a', '#a66bc4', '#e8a0c0', '#f2b45a'],
  fan: ['#d9483a', '#e8743a', '#c43a52'],
  anemone: ['#efe2c8'],
  rock: ['#6b6a5e', '#7a7464', '#5f6660'],
};
const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
const add = (asset: string, x: number, z: number, scale: number, extra: Partial<P> = {}) => {
  const type = asset.replace('gen:', '');
  out.push({ asset, x: round(x), z: round(z), rotY: round(r() * Math.PI * 2), scale: round(scale), seed: Math.floor(r() * 1e6), ...(pal[type] ? { color: pick(pal[type]) } : {}), ...extra });
};

// Landmarks and homes first (ids are referenced by species.json).
add('gen:anemone', -0.9, 7.2, 1.25, { id: 'anemone-start' });
add('gen:brain', 2.6, 6.2, 1.1, { id: 'head-start' });
add('gen:table', -3.2, 5.0, 1.0, { id: 'table-start' });
add('gen:brain', -2.6, 1.4, 1.5, { id: 'coral-head-1' });
add('gen:table', -6.5, -9, 2.4, { id: 'big-table' });
for (let i = 0; i < 5; i++) add('gen:anemone', -9 + r() * 3, -1 + r() * 3, 0.8 + r() * 0.6, { id: `anemone-patch-${i + 1}` });
add('gen:rock', 6.0, -3.5, 1.6, { id: 'den-rock' });
// boulder pile landmark
for (let i = 0; i < 7; i++) add('gen:rock', -13 + r() * 3, -15 + r() * 3, 0.9 + r() * 1.2, i === 0 ? { id: 'boulder-pile' } : {});
add('gen:brain', 9, 8, 1.3, { id: 'coral-head-2' });

// Warm coral heads close in front of the start view.
const near: [string, number, number, number][] = [
  ['gen:soft', 1.2, 6.8, 1.0], ['gen:branching', -2.0, 6.3, 1.0], ['gen:soft', 3.4, 4.5, 0.9],
  ['gen:fan', -3.9, 3.2, 1.0], ['gen:branching', 4.2, 2.8, 1.1], ['gen:soft', -1.6, 4.6, 0.8],
  ['gen:brain', 3.6, 7.8, 0.8], ['gen:fan', 4.8, 5.5, 0.8],
  ['gen:soft', -0.4, 8.4, 1.3], ['gen:branching', 1.9, 8.6, 1.4], ['gen:soft', 0.6, 5.6, 1.4], ['gen:table', 1.0, 3.6, 1.6],
  ['gen:branching', -1.3, 5.4, 1.5], ['gen:soft', 2.3, 5.2, 1.2], ['gen:brain', -2.4, 8.3, 1.2], ['gen:fan', -4.6, 6.4, 1.2],
];
for (const [a, x, z, s] of near) add(a, x, z, s);

// Scatter, densest within 10 m of the start, thinning to the edges, keeping channels open.
const types: [string, number][] = [['gen:branching', 0.3], ['gen:brain', 0.18], ['gen:table', 0.1], ['gen:soft', 0.2], ['gen:fan', 0.07], ['gen:rock', 0.1], ['coral02.glb', 0.05]];
const pickType = () => { let t = r(); for (const [a, w] of types) { if ((t -= w) <= 0) return a; } return 'gen:branching'; };
let attempts = 0;
while (attempts++ < 20000 && out.length < 650) {
  const x = (r() * 2 - 1) * 30, z = (r() * 2 - 1) * 30;
  const d = Math.hypot(x, z - 4);
  if (d > 29) continue;
  const density = d < 10 ? 1 : Math.max(0.12, 1 - (d - 10) / 22);
  if (r() > density) continue;
  if (channelDistance(x, z) < 1.8) continue;
  if (Math.hypot(x, z - 10.5) < 1.6) continue; // keep the spot right below the start clear
  if (out.some((p) => Math.hypot(p.x - x, p.z - z) < (d < 10 ? 0.75 : 1.0))) continue;
  const a = pickType();
  const deep = baseHeight(x, z) < -3.5;
  add(a, x, z, (deep ? 1.4 : d < 10 ? 1.1 : 0.9) + r() * 0.9);
}

const reef = { version: 1, start: { x: 0, z: 10.5, yaw: 0, pitch: -0.62 }, bounds: { softRadius: 24, radius: 28 }, placements: out };
writeFileSync(new URL('../public/data/reef.json', import.meta.url), JSON.stringify(reef, null, 1) + '\n');
console.log(`${out.length} placements`);
