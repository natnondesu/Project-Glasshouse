#!/bin/sh
# Rebuilds the map outlines Home's globe draws (apps/web/src/features/globe/data/).
#
# Sources (Natural Earth, public domain: https://www.naturalearthdata.com/about/terms-of-use/),
# pinned to one commit of https://github.com/nvkelso/natural-earth-vector (VERSION 5.2.0-pre):
#   ne_50m_admin_0_countries.geojson         countries, 1:50m
#   ne_10m_admin_1_states_provinces.geojson  first-level divisions, 1:10m; only Thailand's 77 provinces are kept
#   ne_10m_rivers_lake_centerlines, ne_10m_lakes, ne_10m_populated_places_simple, ne_10m_airports
#                                            map detail for South-East Asia (the box below), 1:10m
#   ne_110m_rivers_lake_centerlines, ne_110m_lakes                 the same, coarse, for the rest of the world;
#                                            world places are capitals and scalerank <= 2 from the 1:10m set,
#                                            world airports scalerank <= 3
# Kept fields: countries n (English name), a2 (ISO 3166-1 alpha-2, for the browser's own localised name);
# provinces n (English name), t (Thai name), iso (ISO 3166-2). Natural Earth's name_local has wrong Thai names for
# some provinces (Bangkok reads เชียงใหม่), so t comes from thai-province-names.json: the official names, by ISO code.
# Detail fields: rivers and lakes n (name); places n, t (Thai, from thai-place-names.json by "ISO3:name"; every
# Thai place must have one), r (scalerank: lower is more important), c (1 for a national capital); airports n, t,
# iata, r, with short names (and Thai ones) from airport-names.json by IATA code.
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
for f in ne_10m_rivers_lake_centerlines ne_10m_lakes ne_10m_populated_places_simple ne_10m_airports ne_110m_rivers_lake_centerlines ne_110m_lakes; do
  curl -fsSLo "$SRC/$f.geojson" "$BASE/$f.geojson"
done

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

# ---- Map detail: rivers, lakes, places and airports ----
# South-East Asia in full detail; elsewhere coarse (the same box is left out there, so nothing is drawn twice).
SEA=90,-11,142,29
IN_SEA='this.x >= 90 && this.x <= 142 && this.y >= -11 && this.y <= 29'
TMP="$SRC/detail"
mkdir -p "$TMP/sea" "$TMP/world"

$MAPSHAPER -i "$SRC/ne_10m_rivers_lake_centerlines.geojson" -clip bbox=$SEA -each 'n=name_en || name || ""' -filter-fields n \
  -simplify 30% keep-shapes -o "$TMP/sea/rivers.json" format=geojson
$MAPSHAPER -i "$SRC/ne_10m_lakes.geojson" -clip bbox=$SEA -each 'n=name || ""' -filter-fields n \
  -simplify 30% keep-shapes -o "$TMP/sea/lakes.json" format=geojson
$MAPSHAPER -i "$SRC/ne_10m_populated_places_simple.geojson" -filter "$IN_SEA" \
  -each 'n=name, r=scalerank, c=adm0cap ? 1 : 0, a3=adm0_a3' -filter-fields n,r,c,a3 -o "$TMP/sea/places.json" format=geojson
$MAPSHAPER -i "$SRC/ne_10m_airports.geojson" -filter "$IN_SEA" \
  -each 'n=name, iata=iata_code, r=scalerank' -filter-fields n,iata,r -o "$TMP/sea/airports.json" format=geojson

$MAPSHAPER -i "$SRC/ne_110m_rivers_lake_centerlines.geojson" -erase bbox=$SEA -each 'n=name || ""' -filter-fields n \
  -o "$TMP/world/rivers.json" format=geojson
$MAPSHAPER -i "$SRC/ne_110m_lakes.geojson" -erase bbox=$SEA -each 'n=name || ""' -filter-fields n \
  -o "$TMP/world/lakes.json" format=geojson
$MAPSHAPER -i "$SRC/ne_10m_populated_places_simple.geojson" -filter "!($IN_SEA) && (scalerank <= 2 || adm0cap == 1)" \
  -each 'n=name, r=scalerank, c=adm0cap ? 1 : 0, a3=adm0_a3' -filter-fields n,r,c,a3 -o "$TMP/world/places.json" format=geojson
$MAPSHAPER -i "$SRC/ne_10m_airports.geojson" -filter "!($IN_SEA) && scalerank <= 3" \
  -each 'n=name, iata=iata_code, r=scalerank' -filter-fields n,iata,r -o "$TMP/world/airports.json" format=geojson

# Names: Thai from the checked tables, a few corrections, short airport names.
node -e '
const fs = require("fs");
const [tmp, placeNamesFile, airportNamesFile] = process.argv.slice(1);
const placeNames = JSON.parse(fs.readFileSync(placeNamesFile, "utf8"));
const airportNames = JSON.parse(fs.readFileSync(airportNamesFile, "utf8"));
// Natural Earth misspells this capital.
const fixes = { "Supham Buri": "Suphan Buri" };
const shortName = (n) => n.replace(/\s+(Int.l|International|Airport)\b.*$/, "").trim();
for (const region of ["sea", "world"]) {
  const places = JSON.parse(fs.readFileSync(`${tmp}/${region}/places.json`, "utf8"));
  for (const f of places.features) {
    const p = f.properties;
    const n = fixes[p.n] || p.n;
    const t = placeNames[`${p.a3}:${n}`];
    if (p.a3 === "THA" && !t) throw new Error("No Thai name for the Thai place " + n);
    f.properties = t ? { n, t, r: p.r, c: p.c } : { n, r: p.r, c: p.c };
  }
  fs.writeFileSync(`${tmp}/${region}/places.json`, JSON.stringify(places));
  const airports = JSON.parse(fs.readFileSync(`${tmp}/${region}/airports.json`, "utf8"));
  for (const f of airports.features) {
    const p = f.properties;
    const named = airportNames[p.iata] || {};
    f.properties = { n: named.n || shortName(p.n), ...(named.t ? { t: named.t } : {}), iata: p.iata, r: p.r };
  }
  fs.writeFileSync(`${tmp}/${region}/airports.json`, JSON.stringify(airports));
}
' "$TMP" "$(dirname "$0")/thai-place-names.json" "$(dirname "$0")/airport-names.json"

$MAPSHAPER -i combine-files "$TMP/sea/rivers.json" "$TMP/sea/lakes.json" "$TMP/sea/places.json" "$TMP/sea/airports.json" \
  -o "$OUT/sea-detail-10m.topo.json" format=topojson quantization=100000
$MAPSHAPER -i combine-files "$TMP/world/rivers.json" "$TMP/world/lakes.json" "$TMP/world/places.json" "$TMP/world/airports.json" \
  -o "$OUT/world-detail-110m.topo.json" format=topojson quantization=30000
