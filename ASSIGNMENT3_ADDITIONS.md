---
title: "CrowdLoop AI — Assignment 3 Additions"
author: "Gianluca Bavelloni"
date: "April 2026"
---

# CrowdLoop AI — Assignment 3 Additions

*Author: Gianluca Bavelloni · Prototyping II · April 2026 · Repo: `github.com/GianlucaBave/DJ_Assistant_streamlit`*

## 1. Summary

A3 is a structural rebuild along all three rubric axes (**appearance/UX, data-model pipeline, accuracy**) and hits three of the four explicit A3-brief examples simultaneously: *chatbot → RAG*, *external API → own API*, and a sharper move on *accuracy* by replacing `Math.random()`-driven telemetry with measurements from the actual audio buffer and a live camera feed. The Vibe Copilot stops being a chatbot that describes actions and becomes an **agent** that executes them through six tools, reasoning over a proper **retrieval-augmented** view of the library instead of stuffing the whole JSON into every prompt. The provider moved from Groq Llama-3.3-70B to Anthropic Claude Haiku 4.5 specifically to unlock native tool use and structured outputs. Every claim below is traceable to a specific file in the repository.

## 2. Delta vs Assignment 2

| Surface | Assignment 2 | Assignment 3 |
|---|---|---|
| LLM provider | Groq (Llama-3.3-70B-Versatile) via `groq-sdk` | Anthropic Claude Haiku 4.5 via `@anthropic-ai/sdk` |
| Copilot shape | Single-prompt streaming chatbot (describes moves) | Tool-calling agent with 6 tools that *executes* moves |
| Library retrieval | Entire playlist+track JSON stuffed into every system prompt | Dense-vector RAG: pre-computed 384-dim MiniLM embeddings + cosine similarity (`src/lib/rag.ts`) |
| Audio playback | None — spinning vinyl was cosmetic | Real MP3 playback with HTTP byte-range streaming (`/api/audio/[filename]`) + seek bar + auto-advance |
| Energy meter | `Math.random()` perturbations around track metadata | Live RMS from Web Audio `AnalyserNode` on the playing MP3 |
| Floor scan | Animated equalizer bars (decorative) | Simulated camera feed via a looping DJ-set video with a `Connect Camera` button |
| Stream protocol | Plain text deltas | Custom NDJSON event stream (`text` / `tool_use` / `action` / `done`) with a client dispatcher |
| Orchestration | None | Manual agentic loop on the server (max 6 turns, mixed server-side + client-side tools) |
| Song picker | Only via playlist sidebar | New searchable Browse Library panel with live filtering |
| Lines changed (commits on `main` since A2) | — | 5 commits, **+2 800 / −40** lines across the codebase |

## 3. Architectural Additions

### 3.1 Tool-calling agent loop (`src/app/api/chat/route.ts`)

A2's `/api/chat` produced a text stream and terminated. A3 replaces it with a manual agentic loop that alternates model turns with tool executions until Claude emits `stop_reason: "end_turn"` or hits the 6-turn cap. Six tools: `searchTracks`, `playTrack`, `pauseTrack`, `skipNext`, `skipPrevious`, `switchPlaylist`. `searchTracks` runs server-side (does RAG locally); the rest are *client-side* — the server fiats their success, returns a synthetic `tool_result` so Claude can continue reasoning, and emits a `{"type":"action","tool":...,"args":...}` event into the response stream. The browser parses NDJSON line-by-line and dispatches each action against the live `<audio>` element and React state. Effects are real (the deck actually plays/pauses/skips); the agent's "belief" is corrected on the next user turn because the updated `currentTrack` is part of the dynamic state block re-sent with every request.

**Why non-straightforward (A2 rubric):** combines *multi-call* iteration, *tool use*, *post-processing* (tool outputs drive UI state, not text), and a *custom NDJSON protocol* the client parses structurally. Required iterative prompt engineering — explicit rules gate the agent against calling `playTrack` on a result where `playable: false`.

### 3.2 RAG over the track library (`src/lib/rag.ts`, `scripts/embed-tracks.mjs`)

Retrieval is split into an offline and a runtime stage so the expensive step runs once on dev and the deployed app stays small.

*Offline.* `scripts/embed-tracks.mjs` loads `sentence-transformers/all-MiniLM-L6-v2` (384-dim) through `@xenova/transformers`, builds a description per track fusing *name, artist, genres, tempo-band, energy-band, danceability-band, popularity-band*, and the *playlists with their vibe*, and encodes each as a mean-pooled, L2-normalised vector. Output: `src/data/track_embeddings.json` (460 KB, checked in). Smoke tests confirm semantic signal: *"chill late-night deep house"* → *That's Right, The Weekend, and it felt like..* (all Deep House Midnight); *"tribal peak hour weapon"* → *Tondo, The Night Trip, Funk U Want* (all tribal/tech-house).

*Runtime.* The hard part on serverless: ONNX runtime native bindings are ~50 MB, exceeding Vercel's 50 MB Hobby limit. The module tries two strategies. First, a webpack-ignored dynamic import of `@xenova/transformers` loads the same model in the Node runtime — locally this works and yields true dense-vector retrieval (similarities 0.4–0.6 for good queries). On Vercel the package isn't in the bundle (`devDependency` only), the import throws, and we fall back to a lexical score computed against the *same rich descriptions* used offline — so lexical match still benefits from playlist tags, BPM bands, and energy bands, not just title tokens. The serverless function bundle is **32 KB** — a ~1 000× reduction versus shipping the model.

The `searchTracks` tool returns `{trackName, similarity, artist, bpm, key, energy, danceability, genres, playable}`, letting Claude trade semantic fit against BPM proximity, harmonic compatibility, and on-disk availability before calling `playTrack`.

### 3.3 Real audio playback (`/api/audio/[filename]`, `scripts/map-audio-files.mjs`)

A2's vinyl was decorative. A3 plays real MP3s.

*File matching.* `scripts/map-audio-files.mjs` fuzzy-matches 45 filenames in `/songs/` to 58 entries in `tracks.json`. Naïve token overlap collides — *"Gotta Let You Go"* stole *"Hold On, Let Go"* via two shared stop-word-adjacent tokens. Fix: a three-pass algorithm with manual overrides (`itfeltlike…` → `and it felt like..`), confidence-sorted greedy assignment (the track with the higher-scoring best candidate grabs the MP3 first), and gated acceptance (single-token titles need 100 % recall; multi-token titles need ≥2 hits or track+artist overlap). Result: **43/45 MP3s** mapped correctly; a `file` field is written back to `tracks.json`.

*Streaming.* `/api/audio/[filename]` serves MP3s with full HTTP byte-range support (`Accept-Ranges: bytes`, `206 Partial Content`) so `<audio>` seeking works without re-downloading. Path-traversal protection normalises the filename and pins the resolved path inside the serving directory. Route prefers `/songs/` (full-quality local) with fallback to `/public/demo-songs/` (eight 96 kbps demo tracks shipped so the Vercel deploy also plays audio). The set of actually-servable files is exposed via `/api/available-tracks`; the dashboard fetches it on mount to filter the Predictor and Browse Library to exactly what can play, and the agent reads the same listing so `searchTracks.playable` reflects the environment.

### 3.4 Live audio analysis — Web Audio RMS (`src/app/page.tsx`)

A2's energy reading was a simulation: `Math.random()` perturbations around `track.Energy` metadata. That was the weakest point on the accuracy axis. A3 wires a Web Audio `AnalyserNode` to the `<audio>` element; every 250 ms we compute RMS across 1 024-sample time-domain windows, map non-linearly onto 0–99 %, and drive both the Energy Level card and the Live Floor Scan intensity from that value while the track is playing. A "LIVE" badge signals the reading is measured, not simulated; the metadata fallback is preserved for paused / no-audio states.

### 3.5 Simulated camera feed + 3.6 Provider migration

The Live Floor Scan now defaults to a camera-off state with a `Connect Camera` CTA. Clicking it swaps in a 19 MB 720p H.264 CRF-28 loop of a real DJ set with a CRT-scanline overlay and vignette to read as "security cam". A `DISCONNECT` chip reverses it; the uncompressed 164 MB source is git-ignored. **Provider:** A2's Groq choice optimised chat latency; A3 required tool use and structured outputs, which Haiku 4.5 supports natively at the most aggressive cost in Anthropic's catalogue ($1/$5 per M tokens). End-to-end turn latency with 2–3 chained tool calls is 3–5 s, acceptable because the agent is *acting*, not chatting. System-prompt layout (stable playbook+catalogue first, dynamic state last) is cache-friendly for when the library grows past Haiku's 4 096-token cache-write minimum.

## 4. Rubric alignment

| Rubric axis / example (A2+A3) | Addressed by |
|---|---|
| "Simple chatbot → RAG" (A3 example) | §3.2 — dense-vector index + runtime cosine similarity + lexical fallback with the same rich descriptions |
| "External API → own API" (A3 example) | §3.1 — the manual agentic loop + NDJSON action stream is a custom orchestration layer built on top of the Messages API |
| "Accuracy" (A1/A2 axis) | §3.3 real MP3s; §3.4 live RMS from the audio buffer; §3.5 camera feed |
| "Data/model pipeline" (A1/A2 axis) | Offline embedding compute → `track_embeddings.json` → runtime dot-product; fuzzy MP3 matcher; `/api/available-tracks` gating |
| "Non-straightforward LLM" (A2 bar) | Multi-call tool loop; structured JSON output in `/api/analyze`; post-processing that drives UI state; iterative prompt engineering on the `playable` gating rule |
| "Appearance / UX" (A1/A2 axis) | Live camera overlay; live RMS bar; seek-bar; auto-scroll chat; bold markdown; Browse Library search |

## 5. Difficulties and how AI was leveraged

The fuzzy file matcher is representative of the feedback loop that drove most of A3. A naïve scorer matched one-token overlaps and wrong pairings went through. I described the symptom to Claude Code ("*24 (Turn It Up) (+6)* is stealing the Turn It Around MP3"), and it proposed the three-pass confidence-sorted assignment with stop-token filtering that finally converged on 43/45 correct. I never hand-edited the regex. Similar pattern on the stream-already-closed errors (race between client abort and `finally`-block `controller.close()`), on the NDJSON protocol design, and on the hybrid embedder/lexical fallback in `rag.ts`. The workflow was *I describe intent and constraints, Claude proposes, I read and accept or rewrite* — AI as pair programmer, not autopilot. Every architectural decision in this document was made by me; the implementation was co-written under review.

The hardest pure-engineering moment was the Vercel bundle-size failure: the naive approach of depending on `@xenova/transformers` at runtime pushed the serverless function past the 50 MB limit. The resolution was the two-stage RAG (dev-dep + dynamic import + lexical fallback) described in §3.2, which keeps the function at 32 KB without sacrificing the local-dev experience.

## 6. Limitations and reproducibility

Full-quality audio and the uncompressed 164 MB DJ-set video cannot be committed (GitHub's per-file limit is 100 MB, Vercel's static-file footprint is stricter still), so the deployed build ships eight 96 kbps demo tracks plus the 19 MB compressed video. All agent, RAG, playback, analysis, and camera-feed features work end-to-end on the hosted URL using this subset. The Predictor and Browse Library filter to the environment's actual on-disk set, so dead tracks never surface in the UI. On Vercel the RAG degrades to lexical scoring over rich descriptions; locally the full dense-vector retrieval is active. BPM remains metadata-derived; extending the `AnalyserNode` pipeline with autocorrelation-based live BPM detection is the natural next step and is flagged in README §10. A dedicated repository script (`scripts/embed-tracks.mjs`) regenerates the embedding index from scratch if the library changes, so the retrieval layer is reproducible end-to-end.
