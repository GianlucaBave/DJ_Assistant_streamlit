// Compute sentence embeddings for every track in tracks.json and save them to
// src/data/track_embeddings.json. Uses Xenova/all-MiniLM-L6-v2 (384-dim).
// Run once offline; the RAG API reads these at runtime.
// Usage: node scripts/embed-tracks.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline, env } from "@xenova/transformers";

// Allow the first run to download the model; cache it locally
env.allowLocalModels = true;

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const TRACKS_FILE = resolve(ROOT, "src/data/tracks.json");
const EMBEDDINGS_FILE = resolve(ROOT, "src/data/track_embeddings.json");
const PLAYLISTS_FILE = resolve(ROOT, "src/data/playlists.json");

const MODEL_ID = "Xenova/all-MiniLM-L6-v2";

function tempoBand(bpm) {
  if (bpm < 115) return "slow downtempo";
  if (bpm < 122) return "mid-tempo groove";
  if (bpm < 127) return "classic house tempo";
  if (bpm < 131) return "driving house tempo";
  return "high-energy peak-time tempo";
}

function energyBand(e) {
  if (e < 0.4) return "low-energy, intimate";
  if (e < 0.6) return "medium-energy, groove-building";
  if (e < 0.8) return "high-energy, floor-filling";
  return "peak-energy, euphoric";
}

function danceBand(d) {
  if (d == null) return "danceable";
  if (d < 0.6) return "listener-oriented";
  if (d < 0.75) return "danceable";
  if (d < 0.85) return "highly danceable";
  return "hyper-danceable";
}

function popBand(p) {
  if (p == null) return "underground";
  if (p < 20) return "underground";
  if (p < 50) return "mid-tier";
  if (p < 70) return "popular";
  return "mainstream hit";
}

function describeTrack(t, playlistTags) {
  const genres = t.Genres ? t.Genres.split(",").map((g) => g.trim()).filter(Boolean).join(", ") : "house";
  const lines = [
    `Track: ${t["Track Name"]} by ${t["Artist Name(s)"]}`,
    `Genres: ${genres}`,
    `Tempo: ${t.Tempo} BPM (${tempoBand(t.Tempo)}), Key: ${t.Key}`,
    `Energy: ${energyBand(t.Energy)}`,
    `Danceability: ${danceBand(t.Danceability)}`,
    `Popularity: ${popBand(t.Popularity)}`,
  ];
  if (playlistTags.length > 0) {
    lines.push(`Appears in playlists: ${playlistTags.join("; ")}`);
  }
  return lines.join(". ");
}

async function main() {
  const tracks = JSON.parse(readFileSync(TRACKS_FILE, "utf8"));
  const playlists = JSON.parse(readFileSync(PLAYLISTS_FILE, "utf8"));

  // Precompute per-track playlist tags (name + vibe) for richer embedding context
  const trackToPlaylists = new Map();
  for (const pl of playlists) {
    for (const name of pl.tracks) {
      if (!trackToPlaylists.has(name)) trackToPlaylists.set(name, []);
      trackToPlaylists.get(name).push(`${pl.name} (${pl.vibe})`);
    }
  }

  console.log(`Loading model ${MODEL_ID}... (first run downloads ~90MB)`);
  const embedder = await pipeline("feature-extraction", MODEL_ID);
  console.log("Model loaded. Embedding tracks…");

  const embeddings = {};
  let i = 0;
  for (const t of tracks) {
    const name = t["Track Name"];
    const tags = trackToPlaylists.get(name) || [];
    const text = describeTrack(t, tags);
    const output = await embedder(text, { pooling: "mean", normalize: true });
    // output.data is a Float32Array of length 384
    embeddings[name] = Array.from(output.data);
    i++;
    if (i % 10 === 0 || i === tracks.length) {
      console.log(`  ${i}/${tracks.length}`);
    }
  }

  writeFileSync(EMBEDDINGS_FILE, JSON.stringify({ model: MODEL_ID, dim: 384, vectors: embeddings }));
  console.log(`Wrote ${tracks.length} embeddings to ${EMBEDDINGS_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
