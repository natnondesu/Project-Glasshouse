#!/bin/sh
# Rebuilds the map outlines Home's globe draws (apps/web/src/features/globe/data/).
#
# Sources (Natural Earth, public domain: https://www.naturalearthdata.com/about/terms-of-use/),
# pinned to one commit of https://github.com/nvkelso/natural-earth-vector (VERSION 5.2.0-pre):
#   ne_50m_admin_0_countries.geojson         countries, 1:50m
#   ne_10m_admin_1_states_provinces.geojson  first-level divisions, 1:10m; only Thailand's 77 provinces are kept
# Kept fields: countries n (English name), a2 (ISO 3166-1 alpha-2, for the browser's own localised name);
# provinces n (English name), t (Thai name from name_local, "จังหวัด" dropped), iso (ISO 3166-2).
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
  -each 'n=name=="Bangkok Metropolis" ? "Bangkok" : name, t=(name_local||"").replace(/^จังหวัด/,""), iso=iso_3166_2' \
  -filter-fields n,t,iso \
  -simplify 50% keep-shapes \
  -o "$OUT/thailand-provinces-10m.topo.json" format=topojson quantization=100000
