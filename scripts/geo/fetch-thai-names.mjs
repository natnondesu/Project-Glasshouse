// Thai labels from Wikidata for every place and airport the map ships, by Wikidata id: run once when the data changes,
// and commit wikidata-names-th.json (the build reads only the committed file; nothing is fetched at build time).
// Checked names in thai-place-names.json and airport-names.json win over these.
//
// Usage: node scripts/geo/fetch-thai-names.mjs <dir with the Natural Earth geojson build-geo.sh downloaded>
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const src = process.argv[2];
if (!src) throw new Error('Pass the directory build-geo.sh downloaded the sources into.');
const read = (name) => JSON.parse(readFileSync(join(src, name), 'utf8'));
// The same boxes and filters as build-geo.sh.
const inSea = ([x, y]) => x >= 90 && x <= 142 && y >= -11 && y <= 29;
const places = read('ne_10m_populated_places.geojson').features.filter((f) => inSea(f.geometry.coordinates) || f.properties.SCALERANK <= 2 || f.properties.ADM0CAP === 1);
const airports = read('ne_10m_airports.geojson').features.filter((f) => inSea(f.geometry.coordinates) || f.properties.scalerank <= 3);
const ids = [...new Set([...places.map((f) => f.properties.WIKIDATAID), ...airports.map((f) => f.properties.wikidataid)].filter(Boolean))].sort();

const labels = {};
for (let i = 0; i < ids.length; i += 200) {
  const values = ids.slice(i, i + 200).map((id) => `wd:${id}`).join(' ');
  const query = `SELECT ?item ?label WHERE { VALUES ?item { ${values} } ?item rdfs:label ?label FILTER(LANG(?label) = "th") }`;
  const res = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`, {
    headers: { accept: 'application/sparql-results+json', 'user-agent': 'glasshouse-geo-build/1.0 (Thai map names)' },
  });
  if (!res.ok) throw new Error(`Wikidata answered ${res.status}`);
  for (const b of (await res.json()).results.bindings) labels[b.item.value.split('/').pop()] = b.label.value;
}
const sorted = Object.fromEntries(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'wikidata-names-th.json'), `${JSON.stringify(sorted, null, 1)}\n`);
console.log(`${Object.keys(sorted).length} of ${ids.length} ids have a Thai label`);
