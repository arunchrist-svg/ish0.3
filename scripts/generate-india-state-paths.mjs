/**
 * Builds projected SVG paths from udit-001/india-maps-data (states object).
 * Source: https://github.com/udit-001/india-maps-data
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";

const TOPO_URL =
  "https://cdn.jsdelivr.net/gh/udit-001/india-maps-data@2884453/topojson/india.json";
const WIDTH = 520;
const HEIGHT = 620;
const PAD = 8;

const NAME_TO_ID = {
  "Andaman and Nicobar Islands": "AN",
  "Andhra Pradesh": "AP",
  "Arunachal Pradesh": "AR",
  Assam: "AS",
  Bihar: "BR",
  Chandigarh: "CH",
  Chhattisgarh: "CG",
  Delhi: "DL",
  "Dadra and Nagar Haveli and Daman and Diu": "DD",
  Goa: "GA",
  Gujarat: "GJ",
  Haryana: "HR",
  "Himachal Pradesh": "HP",
  "Jammu and Kashmir": "JK",
  Jharkhand: "JH",
  Karnataka: "KA",
  Kerala: "KL",
  Ladakh: "LA",
  Lakshadweep: "LD",
  "Madhya Pradesh": "MP",
  Maharashtra: "MH",
  Manipur: "MN",
  Meghalaya: "ML",
  Mizoram: "MZ",
  Nagaland: "NL",
  Odisha: "OD",
  Puducherry: "PY",
  Punjab: "PB",
  Rajasthan: "RJ",
  Sikkim: "SK",
  "Tamil Nadu": "TN",
  Telangana: "TS",
  Tripura: "TR",
  "Uttar Pradesh": "UP",
  Uttarakhand: "UK",
  "West Bengal": "WB",
};

const res = await fetch(TOPO_URL);
if (!res.ok) throw new Error(`Failed to download India topojson: ${res.status}`);
const topo = await res.json();
const collection = feature(topo, topo.objects.states);
const projection = geoMercator().fitExtent(
  [
    [PAD, PAD],
    [WIDTH - PAD, HEIGHT - PAD],
  ],
  collection,
);
const path = geoPath(projection).digits(1);

const states = [];
for (const feat of collection.features) {
  const name = feat.properties?.st_nm;
  const id = NAME_TO_ID[name];
  if (!id) throw new Error(`Unmapped map state: ${name}`);
  const d = path(feat);
  if (!d) throw new Error(`Empty path for ${name}`);
  states.push({ id, name, d });
}

states.sort((a, b) => a.name.localeCompare(b.name));

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../src/lib/geo");
const header = `/* Generated from udit-001/india-maps-data@2884453 states layer. Do not edit by hand. */
/* https://github.com/udit-001/india-maps-data */

export const INDIA_MAP_VIEWBOX = "0 0 ${WIDTH} ${HEIGHT}";

export type IndiaStatePath = {
  id: string;
  name: string;
  d: string;
};

export const INDIA_STATE_PATHS: IndiaStatePath[] = `;

writeFileSync(join(outDir, "india-state-paths.ts"), `${header}${JSON.stringify(states, null, 2)};\n`);
console.log(`Wrote ${states.length} state paths`);
