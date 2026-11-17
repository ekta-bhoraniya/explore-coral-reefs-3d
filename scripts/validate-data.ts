// Step 2: every data file is validated at build time; a bad file fails the build.
import { readFileSync, existsSync } from 'node:fs';
import { creditsFileSchema, reefSchema, speciesFileSchema, tuningSchema } from '../src/data/schemas';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../public/data/${p}`, import.meta.url), 'utf8'));
let failed = false;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log(`✓ ${name}`); } catch (e) { failed = true; console.error(`✗ ${name}\n${e instanceof Error ? e.message : e}`); }
};

let reefIds = new Set<string>();
let files = new Set<string>();
check('reef.json', () => {
  const reef = reefSchema.parse(read('reef.json'));
  reefIds = new Set(reef.placements.flatMap((p) => (p.id ? [p.id] : [])));
  for (const p of reef.placements) {
    if (!p.asset.startsWith('gen:') && !existsSync(new URL(`../public/models/${p.asset}`, import.meta.url))) throw new Error(`Missing model ${p.asset}`);
    if (!p.asset.startsWith('gen:')) files.add(`models/${p.asset}`);
  }
});
check('species.json', () => {
  const { species } = speciesFileSchema.parse(read('species.json'));
  for (const s of species) {
    if (s.behaviour.home && !reefIds.has(s.behaviour.home)) throw new Error(`${s.id}: home "${s.behaviour.home}" is not a placement id in reef.json`);
    if (['anemone', 'circleCoral', 'den'].includes(s.behaviour.type) && !s.behaviour.home) throw new Error(`${s.id}: behaviour ${s.behaviour.type} needs a home`);
    if (!s.model.src.startsWith('proc:')) {
      if (!existsSync(new URL(`../public/${s.model.src}`, import.meta.url))) throw new Error(`${s.id}: missing model ${s.model.src}`);
      files.add(s.model.src);
    }
    for (const ph of s.photos) files.add(ph.src);
  }
});
check('credits.json', () => {
  const { credits } = creditsFileSchema.parse(read('credits.json'));
  const credited = new Set(credits.flatMap((c) => c.files));
  // "No credit entry, no asset."
  const missing = [...files].filter((f) => !credited.has(f));
  if (missing.length) throw new Error(`Assets without a credits.json entry: ${missing.join(', ')}`);
});
check('tuning.json', () => { tuningSchema.parse(read('tuning.json')); });
if (failed) process.exit(1);
