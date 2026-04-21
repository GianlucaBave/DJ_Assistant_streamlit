---
title: "CrowdLoop AI — Assignment 3 Additions"
author: "Gianluca Bavelloni"
date: "April 2026"
---

# CrowdLoop AI — Assignment 3 Additions

*Gianluca Bavelloni · Prototyping II · April 2026 · Repo: `github.com/GianlucaBave/DJ_Assistant_streamlit`*

## 1. Summary

A3 is a structural rebuild along the three rubric axes (**appearance/UX, data-model pipeline, accuracy**) that hits three of the four "substantial refinement" examples from the brief simultaneously: *chatbot → RAG*, *external API → own API*, and *accuracy* via replacing `Math.random()`-driven telemetry with measurements from the actual audio buffer and a live camera feed. The Vibe Copilot stops being a chatbot that describes actions and becomes an **agent** executing them through six tools, reasoning over a proper retrieval-augmented view of the library. Provider moved from Groq Llama-3.3-70B to Anthropic Claude Haiku 4.5 to unlock native tool use and structured outputs. Every claim below traces to a file in the repo.

## 2. Delta vs Assignment 2

| Area | A2 | A3 |
|---|---|---|
| LLM provider | Groq Llama-3.3-70B | Anthropic Claude Haiku 4.5 |
| Copilot shape | Single-prompt streaming chatbot | Tool-calling agent (6 tools, multi-turn loop) |
| Library retrieval | Whole JSON stuffed in system prompt | Dense-vector RAG (384-dim MiniLM + cosine) |
| Audio playback | None (vinyl decorative) | Real MP3 byte-range streaming + seek |
| Energy meter | `Math.random()` around metadata | Live RMS from Web Audio `AnalyserNode` |
| Floor scan | Animated equalizer | Simulated camera feed (looping DJ-set video) |
| Stream protocol | Plain text deltas | Custom NDJSON (`text`/`tool_use`/`action`/`done`) |
| Orchestration | None | Manual agentic loop with mixed server/client tools |
| Song picker | Playlist sidebar only | Searchable Browse Library panel |

## 3. Architectural Additions

**3.1 Tool-calling agent (`src/app/api/chat/route.ts`).** Manual agentic loop alternating model turns with tool executions until Claude emits `stop_reason:"end_turn"` or hits the 6-turn cap. Six tools: `searchTracks` (server-side RAG), `playTrack`, `pauseTrack`, `skipNext`, `skipPrevious`, `switchPlaylist`. Client-side tools are "fiated" on the server — the agent gets a synthetic success `tool_result` so its loop stays coherent, and a `{"type":"action",...}` event goes into the stream; the browser parses NDJSON line-by-line and dispatches against the live `<audio>` element and React state. The belief is corrected on the next user turn because the fresh `currentTrack` ships in the dynamic state block. **Non-straightforward (A2 rubric):** multi-call iteration + tool use + post-processing of tool outputs into UI state + custom wire protocol + iterative prompt engineering (explicit `PLAYABILITY RULE` prevents calling `playTrack` on `playable:false` results).

**3.2 RAG (`src/lib/rag.ts`, `scripts/embed-tracks.mjs`).** Offline: `scripts/embed-tracks.mjs` runs `Xenova/all-MiniLM-L6-v2` over 58 tracks, builds rich per-track descriptions (name + artist + genres + tempo/energy/danceability/popularity bands + playlist tags), and writes 384-dim L2-normalized vectors to `src/data/track_embeddings.json` (460 KB, committed). Runtime: a webpack-ignored dynamic import of `@xenova/transformers` loads the same model inside Node. Locally this yields true dense-vector retrieval (similarities 0.4–0.6 for meaningful queries — e.g. *"tribal peak hour"* → Tondo @ 0.59). On Vercel the package isn't in the function bundle (it's a `devDependency`), the import throws, and we fall back to a lexical score computed against the *same rich descriptions* — so lexical match still benefits from playlist tags and BPM/energy bands, not just title tokens. Result: serverless function stays at **32 KB**, a ~1 000× reduction vs shipping the embedding model. `searchTracks` returns `{trackName, similarity, artist, bpm, key, energy, danceability, genres, playable}`, so Claude can trade semantic fit against BPM proximity, harmonic compatibility, and on-disk availability before calling `playTrack`.

**3.3 Real audio playback (`/api/audio/[filename]`, `scripts/map-audio-files.mjs`).** *File matching*: fuzzy match between 45 MP3s in `/songs/` and 58 `tracks.json` entries. Naïve token overlap collides — *"Gotta Let You Go"* stole *"Hold On, Let Go"* via shared `{let, go}` tokens. Fix is a three-pass algorithm: manual overrides for quirky cases, confidence-sorted greedy assignment (tracks with higher-scoring best candidates grab their MP3 first), and gated acceptance (single-token titles need 100% recall; multi-token need ≥2 hits or track+artist overlap). **43/45** MP3s mapped correctly; a `file` field is written back. *Streaming*: `/api/audio/[filename]` serves MP3s with full HTTP byte-range support (`Accept-Ranges: bytes`, `206 Partial Content`) so `<audio>` seeking works without re-downloading. Path-traversal protection pins the resolved path inside the serving directory. Route prefers `/songs/` (local full-quality) with fallback to `/public/demo-songs/` (8 × 96 kbps demo tracks shipped to Vercel). `/api/available-tracks` exposes the set of on-disk files; the dashboard fetches it on mount to filter the Predictor + Browse Library, and the agent reads the same listing so `searchTracks.playable` reflects the environment.

**3.4 Live audio analysis — Web Audio RMS.** A2's energy reading was `Math.random()` perturbations around `track.Energy` — the weakest spot on "accuracy". A3 wires a Web Audio `AnalyserNode` to the `<audio>` element; every 250 ms RMS is computed over 1 024-sample time-domain windows, mapped non-linearly onto 0–99 %, and drives the Energy Level card and Live Floor Scan intensity while audio plays. A `LIVE` badge signals the reading is measured. Metadata fallback preserved for paused/no-audio states.

**3.5 Simulated camera feed + provider migration.** Live Floor Scan defaults to a camera-off state with a `Connect Camera` CTA. Clicking swaps in a 19 MB, 720p H.264 CRF-28 loop with CRT-scanline overlay + vignette for a "security cam" read. Uncompressed 164 MB source git-ignored. **Provider:** A2's Groq choice optimized chat latency; A3 needed native tool use + structured outputs, which Haiku 4.5 supports at the most aggressive cost in Anthropic's catalogue ($1/$5 per MTok). End-to-end turn latency with 2–3 chained tool calls sits at 3–5 s — acceptable because the agent is now *acting*, not chatting.

## 4. Rubric alignment

| Rubric axis / example | Addressed by |
|---|---|
| "Simple chatbot → RAG" (A3 example) | §3.2 — dense-vector index + runtime cosine + lexical fallback over same rich descriptions |
| "External API → own API" (A3 example) | §3.1 — manual agentic loop + NDJSON action stream is a custom orchestration layer on the Messages API |
| Accuracy (A1/A2 axis) | §3.3 real MP3s; §3.4 live RMS from audio buffer; §3.5 camera feed |
| Data/model pipeline (A1/A2 axis) | Offline embedding → `track_embeddings.json` → runtime dot-product; fuzzy matcher; env-aware file listing |
| Non-straightforward LLM (A2 bar) | Multi-call tool loop; structured JSON in `/api/analyze`; post-processing drives UI state; iterative prompt engineering on playability gating |
| Appearance / UX (A1/A2 axis) | Camera feed; live RMS bar + LIVE badge; seek-bar; auto-scroll chat; `**bold**` markdown rendering; Browse Library search |

## 5. Difficulties and AI leverage

The fuzzy-matcher bug is representative. Naïve scorer accepted single-token overlaps, so *"24 (Turn It Up) (+6)"* stole the *"Turn It Around"* MP3 via `{turn, it}` overlap. I described the symptom to Claude Code ("second 24 track steals an unrelated MP3") and it proposed the three-pass confidence-sorted assignment with stop-token filtering that converged on 43/45 correct — I never hand-edited the regex. Same pattern on the double-close `ReadableStream` race (client abort + `finally` both calling `controller.close()`), on the NDJSON protocol, on the hybrid embedder + lexical fallback in `rag.ts`. Hardest pure-engineering moment was Vercel's 50 MB function limit: naive `@xenova/transformers` import pushed past. Resolution (§3.2) drops to 32 KB without sacrificing local dev.

## 6. Limitations

Full-quality audio (309 MB) and the uncompressed 164 MB video cannot be committed (GitHub 100 MB per-file limit, Vercel stricter still). Deployed build ships 8 × 96 kbps demo tracks + 19 MB compressed video — all agent/RAG/playback/analysis/camera-feed features work end-to-end on Vercel with this subset. Predictor + Browse Library filter to each environment's actual on-disk set, so dead tracks never surface. On Vercel RAG degrades to lexical scoring over rich descriptions; locally the full dense-vector retrieval is active. BPM remains metadata-derived; extending the `AnalyserNode` pipeline with autocorrelation-based live BPM detection is the natural next step (README §16). `scripts/embed-tracks.mjs` regenerates the embedding index from scratch, so the retrieval layer is reproducible end-to-end.
