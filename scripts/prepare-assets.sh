#!/usr/bin/env bash
# Step 1: download the Remix 3D ocean models (Ethereal/IR Engine open asset kit),
# convert the legacy spec-gloss materials to metal-rough, compress with meshopt
# and build two LOD levels. Re-runnable; skips files that already exist.
set -euo pipefail
BASE=https://media.githubusercontent.com/media/ir-engine/ir-engine-assets-basic/HEAD/assets
RAW=.asset-cache; OUT=public/models
mkdir -p "$RAW" "$OUT"
GT="npx --no-install gltf-transform"
FILES=(
  "ocean/ClownFish.glb:clownfish"
  "ocean/AngelFish3.glb:emperor-angelfish"
  "low_poly/SeaTurtle.glb:sea-turtle"
  "ocean/NapoleonWrassefish.glb:napoleon-wrasse"
  "ocean/Orangedottedtuskfish.glb:tuskfish"
  "ocean/Octopus.glb:octopus"
  "ocean/white-tip-shark.glb:whitetip-shark"
  "ocean/Coral02.glb:coral02"
)
for entry in "${FILES[@]}"; do
  src="${entry%%:*}"; id="${entry##*:}"
  raw="$RAW/$id.glb"; out="$OUT/$id.glb"
  [ -s "$raw" ] || curl -fsSL "$BASE/$src" -o "$raw"
  if [ ! -s "$out" ]; then
    $GT metalrough "$raw" "$RAW/$id.mr.glb"
    $GT resize "$RAW/$id.mr.glb" "$RAW/$id.rs.glb" --width 1024 --height 1024
    $GT webp "$RAW/$id.rs.glb" "$RAW/$id.wp0.glb"
    $GT weld "$RAW/$id.wp0.glb" "$RAW/$id.wp.glb"
    $GT simplify "$RAW/$id.wp.glb" "$RAW/$id.s.glb" --ratio 0.55 --error 0.01
    $GT meshopt "$RAW/$id.s.glb" "$out"
    $GT simplify "$RAW/$id.wp.glb" "$RAW/$id.l1.glb" --ratio 0.35 --error 0.02 && $GT meshopt "$RAW/$id.l1.glb" "$OUT/${id}_lod1.glb"
    $GT simplify "$RAW/$id.wp.glb" "$RAW/$id.l2.glb" --ratio 0.1 --error 0.05 && $GT meshopt "$RAW/$id.l2.glb" "$OUT/${id}_lod2.glb"
  fi
  ls -la "$out"
done
