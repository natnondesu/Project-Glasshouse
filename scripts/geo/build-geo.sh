#!/bin/sh
# Rebuilds the map outlines Home's globe draws (apps/web/src/features/globe/data/).
#
# Sources (Natural Earth, public domain: https://www.naturalearthdata.com/about/terms-of-use/),
# pinned to one commit of https://github.com/nvkelso/natural-earth-vector (VERSION 5.2.0-pre):
#   ne_50m_admin_0_countries.geojson         countries, 1:50m
#   ne_10m_admin_1_states_provinces.geojson  first-level divisions, 1:10m; only Thailand's 77 provinces are kept
# Kept fields: countries n (English name), a2 (ISO 3166-1 alpha-2, for the browser's own localised name);
# provinces n (English name), t (Thai name), iso (ISO 3166-2). Natural Earth's name_local has wrong Thai names for
# some provinces (Bangkok reads เชียงใหม่), so t comes from thai-province-names.json: the official names, by ISO code.
# Tool: mapshaper 0.7.89 (MPL-2.0), run once here; nothing of it ships.
#
# Usage: scripts/geo/build-geo.sh <empty download dir>
set -eu
SRC=${1:?"pass an empty directory to download the sources into"}
OUT="$(cd "$(dirname "$0")/../.." && pwd)/apps/web/src/features/globe/data"
BASE=https://raw.githubusercontent.com/nvkelso/natural-earth-vector/ca96624a56bd078437bca8184e78163e5039ad19/geojson
MAPSHAPER="pnpm dlx mapshaper@0.7.89"

curl -fsSLo "$SRC/countries.geojson" "$BASE/ne_50m_admin_0_countries.geojson"
curl -fsSLo "$SRC/admin1.geojson" "$BASE/ne_10m_admin_1_states_provinces.geojson"

$MAPSHAPER -i "$SRC/countries.geojson" name=countries \
  -each 'n=NAME, a2=(ISO_A2 && ISO_A2 != "-99") ? ISO_A2 : ISO_A2_EH' \
  -filter-fields n,a2 \
  -simplify 20% keep-shapes \
  -o "$OUT/countries-50m.topo.json" format=topojson quantization=30000

$MAPSHAPER -i "$SRC/admin1.geojson" name=provinces \
  -filter 'adm0_a3=="THA"' \
  -each 'n=name=="Bangkok Metropolis" ? "Bangkok" : name, iso=iso_3166_2' \
  -filter-fields n,iso \
  -simplify 50% keep-shapes \
  -o "$OUT/thailand-provinces-10m.topo.json" format=topojson quantization=100000

# Thai names by ISO code; every province must have one.
node -e '
const fs = require("fs");
const [file, namesFile] = process.argv.slice(1);
const topo = JSON.parse(fs.readFileSync(file, "utf8"));
const names = JSON.parse(fs.readFileSync(namesFile, "utf8"));
for (const g of topo.objects.provinces.geometries) {
  const t = names[g.properties.iso];
  if (!t) throw new Error("No Thai name for " + g.properties.iso + " " + g.properties.n);
  g.properties = { n: g.properties.n, t, iso: g.properties.iso };
}
fs.writeFileSync(file, JSON.stringify(topo));
' "$OUT/thailand-provinces-10m.topo.json" "$(dirname "$0")/thai-province-names.json"
