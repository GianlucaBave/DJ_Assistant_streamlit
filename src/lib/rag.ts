// RAG over the track library.
//
// Embeddings are pre-computed offline (scripts/embed-tracks.mjs) and shipped
// as src/data/track_embeddings.json (MiniLM-L6-v2, 384-dim, L2-normalized).
//
// Runtime strategy — tries, in order:
//   1. Local transformer model via @xenova/transformers (dynamic import so it
//      only loads if the package is installed — it's a devDependency). In
//      development this gives true dense-vector retrieval matching the
//      offline embeddings. On Vercel serverless, the package is excluded
//      from the function bundle (dev-only + webpackIgnore), the import
//      throws, and we fall back silently.
//   2. Enhanced lexical score against a rich description per track (name +
//      artist + genres + BPM/key/energy/playlist tags). Still ranks by real
//      content signals, not just literal title match.
//
// Since stored vectors are already normalized, cosine similarity reduces to
// a dot product on the embedding path.

import embeddingsData from "@/data/track_embeddings.json";
import tracksData from "@/data/tracks.json";
import playlistsData from "@/data/playlists.json";
import type { Track, Playlist } from "@/lib/types";

type EmbeddingsFile = {
  model: string;
  dim: number;
  vectors: Record<string, number[]>;
};

type SearchHit = {
  trackName: string;
  similarity: number;
};

const DATA = embeddingsData as EmbeddingsFile;
const TRACKS = tracksData as Track[];
const PLAYLISTS = playlistsData as Playlist[];

// --- shared math ----------------------------------------------------------

function dot(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

// --- path 1: local embedding (dev env) ------------------------------------

type EmbedOutput = { data: Float32Array | number[] };
type Embedder = (
  text: string,
  opts: { pooling: "mean"; normalize: boolean },
) => Promise<EmbedOutput>;

let embedderPromise: Promise<Embedder | null> | null = null;

async function getLocalEmbedder(): Promise<Embedder | null> {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      try {
        // webpackIgnore keeps the heavy ONNX runtime out of the serverless
        // bundle; the import only resolves if the package is installed.
        const mod = await import(
          /* webpackIgnore: true */ "@xenova/transformers"
        );
        const embedder = await mod.pipeline("feature-extraction", DATA.model);
        return embedder as unknown as Embedder;
      } catch {
        return null;
      }
    })();
  }
  return embedderPromise;
}

// --- path 2: lexical fallback with rich track descriptions ----------------

const STOP = new Set([
  "the", "a", "an", "and", "of", "to", "in", "on", "with", "for", "by",
  "me", "my", "you", "is", "at", "as", "it", "this", "that",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

function tempoBand(bpm: number): string {
  if (bpm < 115) return "slow downtempo chill";
  if (bpm < 122) return "mid-tempo groove warmup";
  if (bpm < 127) return "classic house tempo";
  if (bpm < 131) return "driving peak house";
  return "high-energy peak-time";
}

function energyBand(e: number): string {
  if (e < 0.4) return "low intimate calm";
  if (e < 0.6) return "medium groove building";
  if (e < 0.8) return "high energetic floor-filling uplifting";
  return "peak euphoric banger anthem";
}

// Playlist tags give the lexical search useful semantic signal like
// "peak hour", "warm-up", "afro", "festival", "deep", "midnight".
const trackPlaylists = new Map<string, string[]>();
for (const pl of PLAYLISTS) {
  for (const name of pl.tracks) {
    const arr = trackPlaylists.get(name) ?? [];
    arr.push(pl.name, pl.vibe);
    trackPlaylists.set(name, arr);
  }
}

function describeTrack(t: Track): string {
  const plTags = trackPlaylists.get(t["Track Name"]) ?? [];
  return [
    t["Track Name"],
    t["Artist Name(s)"],
    t.Genres ?? "house",
    tempoBand(t.Tempo),
    `${t.Tempo} bpm`,
    `key ${t.Key}`,
    energyBand(t.Energy),
    t.Popularity >= 65 ? "popular hit" : t.Popularity >= 35 ? "solid" : "underground",
    ...plTags,
  ]
    .join(" ")
    .toLowerCase();
}

// Pre-tokenize all track descriptions once
const trackTokens: Map<string, Set<string>> = new Map();
for (const t of TRACKS) {
  trackTokens.set(t["Track Name"], new Set(tokens(describeTrack(t))));
}

function lexicalFallback(query: string, topK: number): SearchHit[] {
  const qt = tokens(query);
  if (qt.length === 0) return [];
  const qSet = new Set(qt);

  const hits: SearchHit[] = [];
  for (const [name, tt] of trackTokens.entries()) {
    let hits_count = 0;
    for (const q of qSet) if (tt.has(q)) hits_count++;
    // Normalized jaccard-ish: recall over query tokens
    const score = hits_count / qSet.size;
    hits.push({ trackName: name, similarity: score });
  }
  return hits.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
}

// --- main entry -----------------------------------------------------------

export async function semanticSearch(
  query: string,
  topK: number = 5,
): Promise<SearchHit[]> {
  if (!query || !query.trim()) return [];

  const embedder = await getLocalEmbedder();
  if (embedder) {
    try {
      const out = await embedder(query, { pooling: "mean", normalize: true });
      const q = Array.from(out.data);
      const hits: SearchHit[] = [];
      for (const [trackName, vec] of Object.entries(DATA.vectors)) {
        hits.push({ trackName, similarity: dot(vec, q) });
      }
      hits.sort((a, b) => b.similarity - a.similarity);
      return hits.slice(0, topK);
    } catch (err) {
      console.warn("[rag] local embedding failed, falling back:", err);
    }
  }

  return lexicalFallback(query, topK);
}
