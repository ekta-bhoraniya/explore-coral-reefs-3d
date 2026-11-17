# Reef Snorkel: real-time 3D MVP (PRD B)

A desktop web page where you scroll to dive off a rocky ledge, drop through the water surface and swim freely over a shallow Andaman Sea coral reef. Click a fish to learn about it.

Built with Vite, TypeScript, three.js (plain classes, no React Three Fiber), React 19 for the HTML overlay only, GSAP ScrollTrigger, Framer Motion, Tailwind 4, Howler, simplex-noise and zod.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # validates data, type-checks, outputs static dist/
```

| URL flag | What it does |
| --- | --- |
| `?debug=1` | lil-gui with every value from `tuning.json`, FPS / draw-call / triangle counter, and "Save" (writes `public/data/tuning.json` in dev) |
| `?editor=1` | Reef editor: fly camera (WASD, Q/E, Shift), palette, click terrain to place, Select mode + TransformControls (G move, R rotate, Y scale), Scatter brush, Export `reef.json` |
| `?quality=high\|medium\|low` | Force a quality tier (otherwise auto-detected over the first 3 s) |
| `#credits` | Credits page generated from `credits.json` |

## Controls

W A S D or the arrow keys to swim · Shift for a strong kick · drag to look · wheel to zoom · click a fish (or Tab to cycle through the fish in view, Enter to open its card) · Esc or click the scene to close the card.

## Content is data

Everything you might want to change lives in `public/data/` and is validated with zod at build time (`npm run validate`). A bad file fails the build.

- `reef.json`: start pose, soft boundary, and every coral / rock placement. `asset` is `gen:<branching|brain|table|soft|fan|anemone|rock>` (generated in `CoralGen.ts`) or a GLB under `public/models`. Placements snap to the terrain, and their scale is clamped so tops stay below y = −0.95. `id` lets species refer to a home (clownfish → `anemone-start`, angelfish → `coral-head-1`, octopus → `den-rock`). The first layout came from `scripts/gen-reef.ts`; the editor owns it after that.
- `species.json`: the 8 species, with model orientation/size, card facts, photos and `behaviour` (`anemone`, `circleCoral`, `glide`, `patrol`, `forage`, `den`, `rest`, `graze`). Adding a species needs no code change.
- `credits.json`: one entry per asset. The build fails if a model or photo referenced by `reef.json` or `species.json` has no credit entry ("no credit entry, no asset").
- `tuning.json`: every visual constant (fog, light, caustics, depth colour loss, surface, shafts, bloom, grade, swim physics, sway).

## Assets

`npm run assets` (`scripts/prepare-assets.sh`) downloads the Microsoft Remix 3D ocean models from the IR/Ethereal Engine open asset kit, converts the legacy spec-gloss materials to metal-rough (that's why they rendered white), resizes textures to 1K WebP, compresses with meshopt, and writes `_lod1` / `_lod2` versions. Every fish ends up between 140 and 700 KB.

## Status and open items

Built: Steps 0 to 10 of the build spec, with all 8 species and both background schools.

Still to do before a public launch:

- **Fish photos:** none yet. The build workspace can't reach Wikimedia Commons or iNaturalist, so the card shows three labelled placeholders. Add 3 CC0 / CC BY photos per species to `public/photos/<id>-1.webp` etc., list them in `species.json → photos`, and add each one to `credits.json`.
- **Facts are `draft`:** they come from FishBase / SeaLifeBase summaries, but a second person has to check each one before `factStatus` can be set to `verified`. Dev builds show a "Draft facts" tag on each card.
- **Sound:** the files in `public/audio` are placeholders I synthesized with ffmpeg (filtered noise, normalised to about −18 / −20 LUFS). Swap in Freesound CC0 picks and credit them.
- **Model licences:** the Remix 3D kit is CC0 according to its curator. Confirm this before launch.
- **Powder blue tang:** uses a procedural stand-in body until a realistic model is found or bought. The fusilier schools use the same generator.
- **Terrain:** the heightmap is generated analytically (`terrainShape.ts`: raised reef zone, two winding sand channels, an eastern drop-off) rather than loaded from a hand-painted `terrain.png`.
- **Tuning and checks:** tune against the reference panorama with `?debug=1`, then run the Step 11 acceptance checklist on the reference laptop in Chrome and Safari.

## Deploy

The output is a static `dist/`. `netlify.toml` and `vercel.json` set long-cache headers for `/models`, `/textures`, `/photos` and `/audio`.
