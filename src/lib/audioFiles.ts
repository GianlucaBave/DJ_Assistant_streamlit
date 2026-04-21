// Shared helper: lists the set of MP3 filenames that are actually servable
// on disk (full-quality /songs/ dir + shipped /public/demo-songs/ fallback).
// Both the audio route and the agent's searchTracks tool consult this so the
// UI and the agent agree on what counts as "playable".

import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const SONGS_DIR = resolve(process.cwd(), "songs");
const DEMO_DIR = resolve(process.cwd(), "public", "demo-songs");

let cached: Set<string> | null = null;
let cachedAt = 0;
const TTL_MS = 10_000;

export function listAvailableAudio(): Set<string> {
  const now = Date.now();
  if (cached && now - cachedAt < TTL_MS) return cached;

  const set = new Set<string>();
  for (const dir of [SONGS_DIR, DEMO_DIR]) {
    try {
      for (const f of readdirSync(dir)) {
        if (f.toLowerCase().endsWith(".mp3")) set.add(f);
      }
    } catch {
      // dir may not exist (e.g. /songs/ on Vercel) — ignore
    }
  }
  cached = set;
  cachedAt = now;
  return set;
}
