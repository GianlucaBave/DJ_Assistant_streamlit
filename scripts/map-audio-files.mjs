// Fuzzy-match MP3 filenames in /songs/ to tracks.json entries.
// Writes a `file` field (filename only — not a path) onto each track.
// Run: node scripts/map-audio-files.mjs

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SONGS_DIR = resolve(ROOT, "songs");
const TRACKS_FILE = resolve(ROOT, "src/data/tracks.json");

const NOISE_PATTERNS = [
  /\(extended\s*mix\)/gi,
  /\(radio\s*edit\)/gi,
  /\(edit\)/gi,
  /\(original[^)]*\)/gi,
  /\(ft[^)]*\)/gi,
  /\(feat[^)]*\)/gi,
  /\(with[^)]*\)/gi,
  /\[[^\]]*\]/g,
  /\bextended\b/gi,
  /\bvisualizer\b/gi,
  /\bvisualiser\b/gi,
  /\bofficial\b/gi,
  /\bremaster(ed)?\b/gi,
  /\baudio\b/gi,
  /\bvideo\s*edit\b/gi,
  /\bremix\s*edit\b/gi,
  /\(video\)/gi,
];

const STOP_TOKENS = new Set([
  "the", "a", "an", "and", "of", "to", "in", "on", "with", "ft", "feat",
  "featuring", "mix", "extended", "radio", "edit", "remix", "original",
  "version", "remaster", "remastered", "official", "audio", "video",
  "visualizer", "visualiser", "mashup", "it", "is", "my", "me", "you",
  "up", "dj",
]);

// Manual overrides for tracks where the fuzzy matcher gets confused
// (e.g. odd filename concatenation like "itfeltlike" vs "and it felt like")
const MANUAL_OVERRIDES = {
  "and it felt like..": "Mr Belt & Wezol, Millean  & Alex Hosking - and itfeltlike... (Extended Mix).mp3",
};

function tokenize(s) {
  let normalized = s.toLowerCase();
  for (const p of NOISE_PATTERNS) normalized = normalized.replace(p, " ");
  normalized = normalized
    .replace(/\.mp3$/i, "")
    .replace(/[_\-,;:()\[\]"'`’"“”.&+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized
    .split(" ")
    .filter((t) => t.length > 1 && !STOP_TOKENS.has(t));
}

function scoreDetailed(trackName, artistName, fileBase) {
  const trackTokens = new Set(tokenize(trackName));
  const artistTokens = new Set(tokenize(artistName || ""));
  const fileTokens = new Set(tokenize(fileBase));

  if (trackTokens.size === 0 || fileTokens.size === 0) {
    return { total: 0, trackHits: 0, trackSize: trackTokens.size, artistHits: 0 };
  }

  let trackHits = 0;
  for (const t of trackTokens) if (fileTokens.has(t)) trackHits++;
  let artistHits = 0;
  for (const t of artistTokens) if (fileTokens.has(t)) artistHits++;

  const trackRecall = trackHits / trackTokens.size;
  const artistBonus = artistTokens.size > 0
    ? (artistHits / artistTokens.size) * 0.4
    : 0;

  return {
    total: trackRecall + artistBonus,
    trackHits,
    trackSize: trackTokens.size,
    artistHits,
  };
}

function main() {
  const tracks = JSON.parse(readFileSync(TRACKS_FILE, "utf8"));
  const mp3s = readdirSync(SONGS_DIR).filter((f) => f.toLowerCase().endsWith(".mp3"));

  const used = new Set();
  let matched = 0;
  const unmatched = [];

  // Reset existing file assignments so we re-match from scratch
  for (const track of tracks) track.file = null;

  // Pass 1: manual overrides
  for (const track of tracks) {
    const override = MANUAL_OVERRIDES[track["Track Name"]];
    if (override && mp3s.includes(override)) {
      track.file = override;
      used.add(override);
      matched++;
    }
  }

  // Passes 2 & 3: score each track against every MP3, sort track assignments by
  // confidence (highest score first), greedy assign. Prevents e.g. "Gotta Let
  // You Go" (0.5) from stealing "Hold On, Let Go" MP3 from "Hold On, Let Go" (1.4).
  const candidates = tracks
    .filter((t) => !t.file)
    .map((track) => {
      let best = { total: 0, trackHits: 0, trackSize: 0, artistHits: 0, file: null };
      for (const mp3 of mp3s) {
        if (used.has(mp3)) continue;
        const s = scoreDetailed(track["Track Name"], track["Artist Name(s)"], mp3);
        if (s.total > best.total) best = { ...s, file: mp3 };
      }
      return { track, best };
    })
    .sort((a, b) => b.best.total - a.best.total);

  for (const { track, best } of candidates) {
    // Re-score if the best file is now used (taken by an earlier-sorted candidate)
    let final = best;
    if (final.file && used.has(final.file)) {
      let refreshed = { total: 0, trackHits: 0, trackSize: 0, artistHits: 0, file: null };
      for (const mp3 of mp3s) {
        if (used.has(mp3)) continue;
        const s = scoreDetailed(track["Track Name"], track["Artist Name(s)"], mp3);
        if (s.total > refreshed.total) refreshed = { ...s, file: mp3 };
      }
      final = refreshed;
    }

    const oneTokenExact = final.trackSize === 1 && final.trackHits === 1;
    const multiTokenMatch = final.trackHits >= 2;
    const trackPlusArtist = final.trackHits >= 1 && final.artistHits >= 1;
    const gated = oneTokenExact || multiTokenMatch || trackPlusArtist;

    if (final.file && final.total >= 0.5 && gated) {
      track.file = final.file;
      used.add(final.file);
      matched++;
    } else {
      track.file = null;
      unmatched.push({
        name: track["Track Name"],
        score: final.total.toFixed(2),
        hits: `${final.trackHits}/${final.trackSize}`,
        artistHits: final.artistHits,
        best: final.file,
      });
    }
  }

  writeFileSync(TRACKS_FILE, JSON.stringify(tracks, null, 2) + "\n");

  console.log(`Matched ${matched}/${tracks.length} tracks.`);
  console.log(`MP3s used: ${used.size}/${mp3s.length}`);
  if (unmatched.length > 0) {
    console.log("\nUnmatched tracks:");
    for (const u of unmatched) {
      console.log(`  "${u.name}"  (best guess @${u.score}: ${u.best ?? "none"})`);
    }
  }
  const unusedMp3s = mp3s.filter((m) => !used.has(m));
  if (unusedMp3s.length > 0) {
    console.log("\nUnused MP3 files:");
    for (const m of unusedMp3s) console.log(`  ${m}`);
  }
}

main();
