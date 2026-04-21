// Quick sanity test for the RAG pipeline. Loads the pre-computed embeddings,
// embeds a couple of queries, prints the top matches.
// Usage: node scripts/test-rag.mjs

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "@xenova/transformers";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = JSON.parse(readFileSync(resolve(__dirname, "../src/data/track_embeddings.json"), "utf8"));

const QUERIES = [
  "chill late-night deep house that doesn't kill the dancefloor",
  "something to warm up the crowd, jazzy disco feel",
  "peak hour weapon, high energy, tribal drums",
  "a smooth harmonic bridge from 128 BPM house into afro house",
];

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

const embedder = await pipeline("feature-extraction", DATA.model);

for (const q of QUERIES) {
  const out = await embedder(q, { pooling: "mean", normalize: true });
  const hits = Object.entries(DATA.vectors)
    .map(([name, vec]) => ({ name, sim: dot(vec, out.data) }))
    .sort((a, b) => b.sim - a.sim)
    .slice(0, 5);
  console.log(`\nQ: ${q}`);
  for (const h of hits) console.log(`  ${h.sim.toFixed(3)}  ${h.name}`);
}
