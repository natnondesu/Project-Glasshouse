#!/bin/sh
# Rebuilds the map outlines Home's globe draws (apps/web/src/features/globe/data/).
#
# Sources (Natural Earth, public domain: https://www.naturalearthdata.com/about/terms-of-use/),
# pinned to one commit of https://github.com/nvkelso/natural-earth-vector (VERSION 5.2.0-pre):
#   ne_50m_admin_0_countries.geojson         countries, 1:50m
#   ne_10m_admin_1_states_provinces.geojson  first-level divisions, 1:10m; only Thailand's 77 provinces are kept
#   ne_10m_rivers_lake_centerlines, ne_10m_lakes, ne_10m_populated_places, ne_10m_airports
#                                            map detail for South-East Asia (the box below), 1:10m
#   ne_110m_rivers_lake_centerlines, ne_110m_lakes                 the same, coarse, for the rest of the world;
#                                            world places are capitals and scalerank <= 2 from the 1:10m set,
#                                            world airports scalerank <= 3
# Kept fields: countries n (English name), a2 (ISO 3166-1 alpha-2, for the browser's own localised name);
# provinces n (English name), t (Thai name), iso (ISO 3166-2). Natural Earth's name_local has wrong Thai names for
# some provinces (Bangkok reads เชียงใหม่), so t comes from thai-province-names.json: the official names, by ISO code.
# Detail fields: rivers and lakes n (name); places n, t (Thai), r (scalerank: lower is more important), c (1 for a
# national capital); airports n, t, iata, r. Every place and airport label has a Thai name: the checked tables first
# (thai-place-names.json by "ISO3:name", airport-names.json by IATA code), else Wikidata's Thai label by the feature's
# Wikidata id (wikidata-names-th.json, made by fetch-thai-names.mjs and committed; admin prefixes like อำเภอ stripped).
# A place with no Thai name anywhere is left out of the map in both languages, so Thai never falls back to Latin.
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
for f in ne_10m_rivers_lake_centerlines ne_10m_lakes ne_10m_populated_places ne_10m_airports ne_110m_rivers_lake_centerlines ne_110m_lakes; do
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
$MAPSHAPER -i "$SRC/ne_10m_populated_places.geojson" -filter "$IN_SEA" \
  -each 'n=NAME, r=SCALERANK, c=ADM0CAP == 1 ? 1 : 0, a3=ADM0_A3, wd=WIKIDATAID' -filter-fields n,r,c,a3,wd -o "$TMP/sea/places.json" format=geojson
$MAPSHAPER -i "$SRC/ne_10m_airports.geojson" -filter "$IN_SEA" \
  -each 'n=name, iata=iata_code, r=scalerank, wd=wikidataid' -filter-fields n,iata,r,wd -o "$TMP/sea/airports.json" format=geojson

$MAPSHAPER -i "$SRC/ne_110m_rivers_lake_centerlines.geojson" -erase bbox=$SEA -each 'n=name || ""' -filter-fields n \
  -o "$TMP/world/rivers.json" format=geojson
$MAPSHAPER -i "$SRC/ne_110m_lakes.geojson" -erase bbox=$SEA -each 'n=name || ""' -filter-fields n \
  -o "$TMP/world/lakes.json" format=geojson
$MAPSHAPER -i "$SRC/ne_10m_populated_places.geojson" -filter "!($IN_SEA) && (SCALERANK <= 2 || ADM0CAP == 1)" \
  -each 'n=NAME, r=SCALERANK, c=ADM0CAP == 1 ? 1 : 0, a3=ADM0_A3, wd=WIKIDATAID' -filter-fields n,r,c,a3,wd -o "$TMP/world/places.json" format=geojson
$MAPSHAPER -i "$SRC/ne_10m_airports.geojson" -filter "!($IN_SEA) && scalerank <= 3" \
  -each 'n=name, iata=iata_code, r=scalerank, wd=wikidataid' -filter-fields n,iata,r,wd -o "$TMP/world/airports.json" format=geojson

# Names: Thai from the checked tables, then Wikidata; a few corrections; short airport names.
node -e '
const fs = require("fs");
const [tmp, placeNamesFile, airportNamesFile, wikidataFile] = process.argv.slice(1);
const placeNames = JSON.parse(fs.readFileSync(placeNamesFile, "utf8"));
const airportNames = JSON.parse(fs.readFileSync(airportNamesFile, "utf8"));
const wikidata = JSON.parse(fs.readFileSync(wikidataFile, "utf8"));
// Natural Earth misspells this capital.
const fixes = { "Supham Buri": "Suphan Buri" };
const shortName = (n) => n.replace(/\s+(Int.l|International|Airport)\b.*$/, "").trim();
// Wikidata names some places by their administration (อำเภอ…, เทศบาลนคร…, ประเทศ…) and airports in full.
const thaiPlace = (t) => t.replace(/^(ประเทศ|อำเภอ|เทศบาล(นคร|เมือง|ตำบล)?|เมือง|นคร(?!รัฐ))(?=.{2})/, "").trim();
const thaiAirport = (t) => t.replace(/^(ท่าอากาศยาน|สนามบิน)(นานาชาติ)?\s*/, "").trim();
const latin = /[A-Za-z]/;
let dropped = 0;
for (const region of ["sea", "world"]) {
  const places = JSON.parse(fs.readFileSync(`${tmp}/${region}/places.json`, "utf8"));
  places.features = places.features.filter((f) => {
    const p = f.properties;
    const n = fixes[p.n] || p.n;
    const t = placeNames[`${p.a3}:${n}`] || (wikidata[p.wd] && thaiPlace(wikidata[p.wd]));
    if (p.a3 === "THA" && !placeNames[`THA:${n}`]) throw new Error("No checked Thai name for the Thai place " + n);
    if (!t || latin.test(t)) {
      dropped += 1;
      return false;
    }
    f.properties = { n, t, r: p.r, c: p.c };
    return true;
  });
  fs.writeFileSync(`${tmp}/${region}/places.json`, JSON.stringify(places));
  const airports = JSON.parse(fs.readFileSync(`${tmp}/${region}/airports.json`, "utf8"));
  for (const f of airports.features) {
    const p = f.properties;
    const named = airportNames[p.iata] || {};
    const t = named.t || (wikidata[p.wd] && thaiAirport(wikidata[p.wd]));
    if (!t || latin.test(t)) throw new Error("No Thai name for the airport " + p.iata + " " + p.n);
    f.properties = { n: named.n || shortName(p.n), t, iata: p.iata, r: p.r };
  }
  fs.writeFileSync(`${tmp}/${region}/airports.json`, JSON.stringify(airports));
}
console.log(`Left out ${dropped} places with no Thai name.`);
' "$TMP" "$(dirname "$0")/thai-place-names.json" "$(dirname "$0")/airport-names.json" "$(dirname "$0")/wikidata-names-th.json"

$MAPSHAPER -i combine-files "$TMP/sea/rivers.json" "$TMP/sea/lakes.json" "$TMP/sea/places.json" "$TMP/sea/airports.json" \
  -o "$OUT/sea-detail-10m.topo.json" format=topojson quantization=100000
$MAPSHAPER -i combine-files "$TMP/world/rivers.json" "$TMP/world/lakes.json" "$TMP/world/places.json" "$TMP/world/airports.json" \
  -o "$OUT/world-detail-110m.topo.json" format=topojson quantization=30000
