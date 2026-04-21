# CrowdLoop AI — Agentic DJ Copilot with RAG, Real Audio, and Live Floor Scan

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://dj-assistant-streamlit.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Anthropic](https://img.shields.io/badge/Anthropic-Claude_Haiku_4.5-D97757)](https://www.anthropic.com/)
[![RAG](https://img.shields.io/badge/RAG-MiniLM_L6_v2-5B21B6)](https://huggingface.co/Xenova/all-MiniLM-L6-v2)
[![Audio](https://img.shields.io/badge/Audio-Web_Audio_API-FF6F00)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

> **Assignment 3 (current submission).** The chatbot is now an **agent** that actually controls the deck via native tool use (play, pause, skip, switch playlist, semantic search). The track library is **RAG-indexed** with pre-computed 384-dim embeddings. The dashboard plays **real MP3s** with seekable byte-range streaming, the energy meter reads a **live RMS signal** from the Web Audio API, and the Live Floor Scan card is now a **camera feed** driven by a looping DJ-set video. See §12 for the full A3 delta vs. A2, and the 2-pager at [`ASSIGNMENT3_ADDITIONS.md`](./ASSIGNMENT3_ADDITIONS.md) for the submission deliverable.

---

## Table of Contents

1. [Why CrowdLoop AI](#1-why-crowdloop-ai)
2. [What A3 Does (End-User Perspective)](#2-what-a3-does-end-user-perspective)
3. [Evolution: A1 → A2 → A3](#3-evolution-a1--a2--a3)
4. [Technical Architecture](#4-technical-architecture)
5. [Technology Stack](#5-technology-stack)
6. [Repository Structure](#6-repository-structure)
7. [The Six Agent Tools](#7-the-six-agent-tools)
8. [LLM Integration (Non-Trivial Usage)](#8-llm-integration-non-trivial-usage)
9. [Data Pipeline](#9-data-pipeline)
10. [Accuracy Engineering: Killing `Math.random()`](#10-accuracy-engineering-killing-mathrandom)
11. [Setup & Local Development](#11-setup--local-development)
12. [Assignment 3 Additions (Delta vs A2)](#12-assignment-3-additions-delta-vs-a2)
13. [Rubric Alignment](#13-rubric-alignment)
14. [Deployment to Vercel](#14-deployment-to-vercel)
15. [Engineering Journey & Difficulties](#15-engineering-journey--difficulties)
16. [Known Limitations & Future Work](#16-known-limitations--future-work)
17. [Credits](#17-credits)

---

## 1. Why CrowdLoop AI

For DJs — especially those still building their reputation or performing in high-pressure rooms — "reading the floor" is a skill that takes years to develop, and a single bad transition can empty a dancefloor. Most tools that *claim* to help (BPM meters, key-analysis software, Spotify's "DJ mode") stop at metadata. None of them **act on the deck** when the vibe starts to slip. None of them **see** the floor. None of them **listen** to what's actually coming out of the speakers.

**CrowdLoop AI** is a real-time command center that does all three: it *listens* (live RMS from the audio buffer drives the energy meter), it *sees* (a camera feed — simulated by a DJ-set video in this prototype — replaces the equalizer animation), and most importantly it *acts* (a tool-calling LLM agent searches the library, queues transitions, switches vibe modes, and controls playback on natural-language command). The result is a prototype where the AI is not a sidebar; it's the second pair of hands behind the decks.

---

## 2. What A3 Does (End-User Perspective)

A typical live session looks like this:

1. **DJ opens the dashboard.** The left sidebar shows four curated playlists (Deep House Midnight, Warm-Up Groovy, Peak Hour Bangers, Afro & Festival). The center shows the vinyl player. The header has three cards — Energy Level, Live Floor Scan, People Detected.
2. **DJ clicks a playlist.** The first playable track auto-loads and starts playing. The vinyl animates, the seek bar advances, the Energy Level card flips to `LIVE` mode and shows real-time RMS from the audio buffer.
3. **DJ clicks 📹 Connect Camera.** The center card swaps from a disconnected state to a looping DJ-set video with a CRT-scanline overlay — the "floor scan" is now visible.
4. **DJ types to the Vibe Copilot:** *"find me something uplifting around 128 BPM and play it."* The agent:
   - Emits `Hunting for uplifting energy…` (streamed text)
   - Calls `searchTracks` (server-side RAG → top-5 results with similarity scores)
   - Picks the best match that is *playable* (has a mapped MP3 on disk)
   - Calls `playTrack` (which emits an `action` event on the stream that the browser dispatches against the audio element)
   - Streams a 1-sentence follow-up: *"Locked in at 128 BPM, key 7B — crowd will feel it."*
5. **DJ says *"peak hour now"*.** Agent calls `switchPlaylist("peak-hour-bangers")` — playlist changes, first playable track auto-loads.
6. **DJ uses Browse Library.** A searchable dropdown of all playable tracks (filter by title, artist, genre, BPM, key). Click → plays.
7. **After a few transitions, DJ clicks VIEW AI REPORT.** Claude receives the full session telemetry (energy history, crowd history, feedback log, current track) and returns a schema-bound JSON report: overall_score, energy_trend, crowd_retention, peak_moment, strengths, weaknesses, summary_paragraph, next_recommendation. The report is rendered both in-UI and as a downloadable PDF.

All of this runs with `ANTHROPIC_API_KEY` as the only required secret.

---

## 3. Evolution: A1 → A2 → A3

| Stage | Framework | Data | AI | Notable Limitations |
|---|---|---|---|---|
| **A1** (Streamlit prototype) | Python + Streamlit | Static CSV | Heuristic BPM/Key matching, no LLM | Rerun-on-every-click model broke real-time animations. No CSS-level control. |
| **A2** (Next.js + Groq) | Next.js 15 + TypeScript | Static JSON | Groq Llama-3.3-70B streaming chatbot + structured-JSON set analysis | Chatbot *described* moves, didn't *act*. Library stuffed into every system prompt. Energy was `Math.random()`. |
| **A3** (Agent + RAG + Real Audio) | Next.js 16 + TypeScript + Web Audio API | Static JSON + pre-computed 384-dim embeddings + real MP3s | **Anthropic Claude Haiku 4.5** with native tool use + **RAG** + structured-JSON analysis | Agent loop runs 6 tool calls max per turn; RAG index capped at 58 tracks; BPM still metadata-derived (roadmap). |

The A1 → A2 step was about **surface fidelity** (real UI, real state machine). The A2 → A3 step is about **agentic behaviour + accuracy** — the AI stops narrating and starts acting, and the telemetry stops being fake and starts being measured.

---

## 4. Technical Architecture

### 4.1 System overview

```
                         ┌──────────────────────────────────────┐
                         │         BROWSER (Client)             │
                         │                                      │
     User types in chat  │   Dashboard (page.tsx)               │
     ───────────────────▶│   ┌─────────────────────────────┐    │
                         │   │  Chat consumer              │    │
                         │   │  - parses NDJSON stream     │    │
                         │   │  - dispatches 'action' evts │    │
                         │   │    → playTrack / pause /    │    │
                         │   │      skip / switchPlaylist  │    │
                         │   │      on <audio> + state     │    │
                         │   └─────────────────────────────┘    │
                         │   ┌─────────────────────────────┐    │
                         │   │  <audio src=/api/audio/...> │    │
                         │   │  + Web Audio AnalyserNode   │───┐│
                         │   │  → live RMS → Energy card   │   ││
                         │   └─────────────────────────────┘   ││
                         └──────────────────────────────────────┘
                                  ▲                              │
                                  │ NDJSON events                │ MP3 byte-range
                                  │                              │ requests
                                  │                              ▼
                         ┌──────────────────────────────────────┐
                         │         NEXT.JS SERVER               │
                         │                                      │
                         │   /api/chat  ──▶ agentic loop        │
                         │     │                                │
                         │     ▼                                │
                         │  Anthropic Messages API              │
                         │  (Claude Haiku 4.5, 6 tools)         │
                         │                                      │
                         │   /api/audio/[filename]  ───▶ MP3    │
                         │      stream with Range support       │
                         │                                      │
                         │   /api/available-tracks  ──▶ file    │
                         │      listing (env-aware)             │
                         │                                      │
                         │   /api/analyze  ──▶ structured JSON  │
                         │      set report                      │
                         └──────────────────────────────────────┘
                                  ▲
                                  │ imports
                                  │
                         ┌──────────────────────────────────────┐
                         │  src/lib/rag.ts                      │
                         │   ├─ try dynamic import              │
                         │   │   @xenova/transformers (dev)     │
                         │   │   → dense-vector cosine sim      │
                         │   └─ fallback: lexical over enriched │
                         │      track descriptions              │
                         └──────────────────────────────────────┘
```

### 4.2 Agent loop (`/api/chat`)

```
┌─────────────────────────────────────────────────────────────┐
│ for turn in 0..5:                                           │
│   stream = client.messages.stream(...)                      │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ for event in stream:                                │   │
│   │   if text_delta: write({type:"text", ...})         │   │
│   └─────────────────────────────────────────────────────┘   │
│   final = await stream.finalMessage()                       │
│   convo.push({role:'assistant', content: final.content})    │
│                                                             │
│   if final.stop_reason === 'end_turn':  BREAK               │
│                                                             │
│   for block in tool_use blocks:                             │
│     write({type:"tool_use", tool, args})                    │
│     if tool is server-side (searchTracks):                  │
│        result = executeServerTool(...)                      │
│        write({type:"tool_result", ...})                     │
│     else (client-side: play/pause/skip/switch):             │
│        write({type:"action", tool, args})                   │
│        result = fiat success                                │
│     convo.push({role:'user', content: tool_results})        │
│                                                             │
│ write({type:"done"}) ; close stream                         │
└─────────────────────────────────────────────────────────────┘
```

Key design decisions:

- **NDJSON not SSE.** SSE is overkill for this — we just need framed events over HTTP. NDJSON (`Content-Type: application/x-ndjson`) is one JSON object per `\n`, which maps cleanly to a `for (const line of lines)` client parser.
- **Server-side vs client-side tools.** `searchTracks` needs the embedding index and tracks.json, so it runs on the server and returns a `tool_result` directly. The deck-control tools (`playTrack`, etc.) only make sense in the browser — the server fiats their success to keep Claude's loop coherent, and the `action` event tells the client to *actually* do the thing. The agent's belief that `playTrack` "succeeded" is corrected on the next user turn because the fresh `currentTrack` is part of the re-sent state block.
- **Paragraph breaks between segments.** When Claude alternates text → tool → text, the two text segments would concatenate in a single bubble. The server inserts a synthetic `{type:"text", text:"\n\n"}` at the boundary so the client's chat bubble shows discrete thoughts.
- **6-turn cap.** Prevents runaway loops if the model gets confused. In practice end_turn fires after 2–3 turns.

### 4.3 RAG pipeline (`src/lib/rag.ts`, `scripts/embed-tracks.mjs`)

```
OFFLINE  (developer machine, runs once)
────────
tracks.json (58 entries)
  +
playlists.json (4 vibes)
  │
  ▼
scripts/embed-tracks.mjs
  │
  │  For each track, build a rich description:
  │    "Track Name by Artist. Genres: ... .
  │     Tempo: X BPM (band). Key: Y.
  │     Energy: band. Danceability: band.
  │     Popularity: band.
  │     Appears in playlists: 'Name (vibe)'"
  │
  ▼
Xenova/all-MiniLM-L6-v2
(mean-pooled, L2-normalised)
  │
  ▼
src/data/track_embeddings.json
(384-dim × 58, ≈460 KB)

RUNTIME
────────
query string
  │
  ▼
src/lib/rag.ts
  │
  ├─ 1. try dynamic import of @xenova/transformers
  │     (webpackIgnore → NOT bundled into serverless function)
  │     ↓ if installed (dev): embed query, dot-product vs all 58 vectors → top-K
  │     ↓ if missing (Vercel): throw, fall through
  │
  └─ 2. lexical fallback:
        tokenise query, score each pre-computed description
        by token-overlap / |query_tokens|, sort desc
```

### 4.4 Audio pipeline (`/api/audio/[filename]`)

```
Browser <audio src=/api/audio/Never%20Walk%20Alone...mp3>
  │
  │  (first request: GET, no Range header)
  ▼
/api/audio/[filename]/route.ts
  │
  │ basename(normalize(decoded))  ←  path-traversal guard
  │
  ▼
resolveAudioPath(safeName):
  1. try /songs/<name>.mp3          (full-quality local library)
  2. try /public/demo-songs/<name>.mp3  (compressed fallback, shipped)
  ↓
Node createReadStream → Response(body, {
  status: req.headers['Range'] ? 206 : 200,
  headers: {
    'Content-Type': 'audio/mpeg',
    'Accept-Ranges': 'bytes',
    'Content-Range': req.headers['Range'] ? `bytes S-E/TOT` : undefined,
    'Content-Length': ...,
    'Cache-Control': 'public, max-age=3600'
  }
})
```

Browser subsequent requests carry `Range: bytes=START-END` (for seeking). Route responds with `206 Partial Content`, browser re-uses the existing HTMLMediaElement without re-fetching the whole file.

---

## 5. Technology Stack

| Layer | Technology | Rationale / Purpose |
|---|---|---|
| **Framework** | Next.js 16 (App Router) | Secure server-side API routes (`/api/chat`, `/api/analyze`, `/api/audio/[filename]`, `/api/available-tracks`), React Server Components, built-in streaming support. |
| **Language** | TypeScript 5 | Static typing for the intertwined state (track history, energy logs, conversation, tool call/result pairs) prevents silent schema drift. |
| **UI Framework** | React 19 | Concurrent features for streaming chat updates without layout jank. |
| **Styling** | Tailwind CSS 4 | Rapid iteration on the dark-mode "mission control" aesthetic. No runtime CSS-in-JS. |
| **AI Engine** | Anthropic Claude Haiku 4.5 | Native tool use, structured outputs, cheapest model in Anthropic's current catalogue ($1 / $5 per MTok). |
| **Anthropic SDK** | `@anthropic-ai/sdk` ^0.90 | Official TypeScript client. Manual agentic loop using `client.messages.stream()` + `stream.finalMessage()`. |
| **RAG — offline** | `@xenova/transformers` + `Xenova/all-MiniLM-L6-v2` | 384-dim sentence embeddings computed in Node (ONNX runtime). Dev-only dependency to keep the serverless bundle small. |
| **RAG — runtime** | Pure-TS cosine similarity + lexical fallback | Dynamic import loads MiniLM locally; serverless falls back to enriched lexical scoring. |
| **Audio playback** | HTML5 `<audio>` + `/api/audio/[filename]` with byte-range support | Native seeking, caching, and progressive streaming. |
| **Audio analysis** | Web Audio API `AnalyserNode` | Live RMS amplitude extraction at ~4 Hz, drives the Energy Level card. |
| **Video** | HTML5 `<video>` (autoplay, muted, loop) | Simulated camera feed for the Live Floor Scan card. |
| **Charts** | Recharts | Real-time energy curve area chart (last 30 intervals). |
| **PDF** | jsPDF + html-to-image | Renders the AI set analysis as a downloadable professional report. |
| **Data** | Static JSON (`tracks.json`, `playlists.json`, `track_embeddings.json`) | Typed library + vector index — no database required for the prototype. |
| **Deployment** | Vercel (Hobby tier) | Auto-deploys on push. `ANTHROPIC_API_KEY` in Environment Variables. |

---

## 6. Repository Structure

```text
/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # Dashboard: audio + video + chat + agent action dispatch
│   │   ├── report/page.tsx            # Full-screen AI set-analysis report view
│   │   ├── globals.css
│   │   └── api/
│   │       ├── chat/route.ts          # Tool-calling agent loop (NDJSON stream, 6 tools)
│   │       ├── analyze/route.ts       # Structured-JSON set analysis via Claude
│   │       ├── audio/[filename]/route.ts   # MP3 streaming with byte-range + dual-path lookup
│   │       └── available-tracks/route.ts   # On-disk file listing for env-aware UI filtering
│   ├── components/
│   │   └── PdfReportTemplate.tsx      # Professional PDF layout for the set analysis
│   ├── data/
│   │   ├── tracks.json                # 58 tracks (BPM, Camelot Key, Energy, Danceability, Genres, file)
│   │   ├── playlists.json             # 4 curated playlists (id, name, emoji, vibe, tracks[])
│   │   └── track_embeddings.json      # Pre-computed 384-dim MiniLM embeddings (~460 KB)
│   └── lib/
│       ├── rag.ts                     # Dynamic import + lexical fallback semantic search
│       ├── audioFiles.ts              # Env-aware on-disk listing of servable MP3s (10s cache)
│       ├── recommender.ts             # Heuristic BPM/Key scoring (AI Track Predictor)
│       ├── pdfGenerator.ts            # Session → fetch /api/analyze → structured JSON
│       └── types.ts                   # Track, Playlist, SessionState interfaces
├── scripts/
│   ├── map-audio-files.mjs            # Fuzzy-match /songs/*.mp3 → tracks.json `file` field
│   ├── embed-tracks.mjs               # Offline: compute 384-dim embeddings → track_embeddings.json
│   └── test-rag.mjs                   # Sanity-check the retrieval pipeline
├── songs/                             # Local full-quality MP3 library (gitignored — user-local)
├── public/
│   ├── videos/
│   │   ├── dj-set-demo.mp4            # 19 MB compressed DJ-set loop (shipped)
│   │   └── .gitkeep
│   ├── demo-songs/                    # 8 × 96 kbps compressed MP3s (shipped to Vercel)
│   └── images/                        # UI assets (high/mid/low-energy illustrations)
├── ASSIGNMENT3_ADDITIONS.md           # 2-pager submission deliverable (A3)
├── repository.txt                     # Submission: GitHub URL
├── deployment.txt                     # Submission: video/demo URL
├── PROJECT_OVERVIEW.txt               # Compact product overview
├── .env.local.example                 # ANTHROPIC_API_KEY template
├── .gitignore                         # Ignores /songs/, /public/videos/*.mp4 (except demo), .env*
├── package.json                       # `@anthropic-ai/sdk` (prod) + `@xenova/transformers` (dev)
├── next.config.ts
├── tsconfig.json
└── README.md                          # This document
```

---

## 7. The Six Agent Tools

The Vibe Copilot is defined with six tools declared in `src/app/api/chat/route.ts`. Three categories.

### Server-side tools (resolve on the server, return a `tool_result` directly)

**`searchTracks`**

Semantic search over the track library. The only server-side tool.

```json
{
  "name": "searchTracks",
  "description": "Semantic search over the DJ's track library. Use this whenever the DJ describes a vibe, mood, or transition idea in natural language. Returns ranked tracks with BPM, Key, Energy, and Danceability.",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": {"type": "string"},
      "topK":  {"type": "integer", "default": 5}
    },
    "required": ["query"]
  }
}
```

Return shape (after enrichment with tracks.json metadata + on-disk availability check):

```json
[
  {
    "trackName": "Tondo",
    "similarity": 0.591,
    "artist": "Disclosure;Eko Roosevelt",
    "bpm": 132, "key": "5A",
    "energy": 0.92, "danceability": 0.675,
    "genres": "musica house",
    "playable": true
  },
  ...
]
```

### Client-side tools (server fiats success, browser executes the action)

**`playTrack(trackName)`** — starts playing an exact track name.
**`pauseTrack()`** — pauses the current track.
**`skipNext()`** — next track in the active playlist (skipping over tracks without MP3).
**`skipPrevious()`** — previous track in the active playlist.
**`switchPlaylist(playlistId)`** — swaps the active playlist. Enum-constrained to `deep-house-midnight | warm-up-groovy | peak-hour-bangers | afro-festival`.

### System prompt playbook

The system prompt tells the agent *when* to reach for each tool:

```
TOOL PLAYBOOK:
- "find me something" / vibe request: ALWAYS call searchTracks first, then
  decide whether to playTrack the top hit.
- "play <name>" commands: use playTrack immediately.
- "next" / "skip" / "pause" / "back": use the corresponding control tool.
- "switch to <mood>" / "peak hour now": use switchPlaylist.
- Announce briefly (1 sentence, DJ-punchy) BEFORE the tool call.
- After tool results, give a tight follow-up (1-2 sentences max).

PLAYABILITY RULE:
- searchTracks results include a `playable` flag. ONLY playTrack where
  playable:true — playable:false means no MP3 file is available here.
- If the top hit is not playable, prefer the next playable result and
  mention the substitution briefly.
```

---

## 8. LLM Integration (Non-Trivial Usage)

The A2 rubric asked for a **non-straightforward LLM implementation**. CrowdLoop hits this through three distinct patterns, each with a different architectural shape.

### Pattern 1 — Tool-Calling Agent (the A3 headline)

Located in `src/app/api/chat/route.ts`. The copilot is declared with the six tools listed in §7. The agentic loop (§4.2) iterates until the model emits `stop_reason: "end_turn"` or hits the 6-turn cap. Each iteration:

1. Calls `client.messages.stream(...)` with the full conversation + tools list.
2. Streams `text_delta` events straight to the client as NDJSON `{type:"text"}` events.
3. Awaits `stream.finalMessage()` to get the complete `Message` object.
4. Appends the assistant message to the conversation transcript.
5. If the message contains `tool_use` blocks:
   - For **server-side tools** (`searchTracks`): executes locally, pushes a `tool_result` to the transcript.
   - For **client-side tools** (deck control): emits an `action` NDJSON event so the browser executes the effect, and pushes a *synthetic* success `tool_result` to the transcript so Claude can continue reasoning.

This is non-straightforward for four reasons:

- **Multi-call iteration**: the single user message often triggers 2–3 model round-trips.
- **Tool use**: the model emits structured JSON tool invocations, not free text.
- **Mixed server/client tool execution**: requires a custom protocol (`action` events) to bridge the two halves of the stack.
- **Post-processing**: the tool outputs drive UI state (audio element, playlist state, feedback log), not just text in a bubble.

Prompt engineering was iterative. The initial version let the agent call `playTrack` on results with `playable:false`, which silently failed. Adding the explicit `PLAYABILITY RULE` to the system prompt and having `searchTracks` return the flag fixed it.

### Pattern 2 — Retrieval-Augmented Generation (RAG)

Covered in detail in §9. In short: `searchTracks` doesn't just keyword-match; it computes cosine similarity between the query vector and the pre-computed vectors of enriched track descriptions. The agent uses those ranked results as grounding for `playTrack` decisions, preventing hallucination (it cannot suggest tracks that don't exist in the library).

### Pattern 3 — Structured-JSON Set Analysis

Located in `src/app/api/analyze/route.ts`. Treats the LLM as a **computational analyst**.

- The client serialises the full session telemetry (energy timeline, crowd-size timeline, last 10 feedback events, current track) into a condensed JSON block.
- The prompt includes an explicit schema with 9 fields: `overall_score` (int 0-100), `energy_trend` (enum: ascending/descending/volatile/stable), `crowd_retention` (int), `peak_moment` (int), `critical_failure` (int or null), `strengths` (str array), `weaknesses` (str array), `summary_paragraph` (str), `next_recommendation` (str).
- The response is parsed with `JSON.parse()` (stripping markdown code fences if Haiku wraps them).
- The parsed object feeds *both* the in-app "Report Card" UI (score bars, peak moment list, etc.) *and* the `pdfGenerator.ts` module that maps the structured fields onto a fixed-coordinate PDF layout.

The "non-trivial" element here is end-to-end: JSON schema design → reliable generation → parsing → dual rendering (web + PDF).

---

## 9. Data Pipeline

Three offline processing scripts feed the runtime.

### 9.1 `scripts/map-audio-files.mjs` — MP3 ↔ track mapping

Walks `/songs/*.mp3` and `tracks.json`, produces a best-effort filename → track name mapping via token-overlap scoring. Key algorithmic details:

- **Tokenisation**: lowercase, strip noise patterns (`(Extended Mix)`, `(Radio Edit)`, `[No Art]`, etc.), strip punctuation, filter by length ≥ 3 and STOP_TOKENS set.
- **Scoring**: for each (track, filename) pair, compute `trackHits / trackTokens.size + (artistHits / artistTokens.size) × 0.4`.
- **Confidence-sorted greedy assignment**: sort candidate tracks by their best score descending, then assign in order. Prevents false-positive collisions (e.g. *"Gotta Let You Go"* vs *"Hold On, Let Go"* both tokenising to `{let, go}`).
- **Gated acceptance**:
  - Single-token titles allowed only with 100 % recall (e.g. `"Glow"` → `"Glow.mp3"`).
  - Multi-token titles require ≥2 hits OR (≥1 track hit AND ≥1 artist hit).
- **Manual overrides** for known-quirky filenames (e.g. `itfeltlike…` ↔ `and it felt like..`).

Result on this repo: **43/45 MP3s** matched to the 58 tracks in `tracks.json` (the remaining 14 tracks legitimately have no MP3 file; the 2 remaining MP3s have no matching track).

### 9.2 `scripts/embed-tracks.mjs` — dense-vector index

Loads `Xenova/all-MiniLM-L6-v2` via `@xenova/transformers`, iterates all 58 tracks, builds a rich description per track (name, artist, genres, tempo-band, energy-band, danceability-band, popularity-band, playlist tags), encodes each as a **mean-pooled, L2-normalised 384-dim vector**, and writes `src/data/track_embeddings.json`. File size ~460 KB, runtime ~90 seconds on the first run (model download) and ~20 seconds thereafter (cached).

### 9.3 `src/lib/audioFiles.ts` — env-aware file listing

Exports `listAvailableAudio()` which reads both `/songs/` and `/public/demo-songs/`, de-duplicates, and returns a `Set<string>`. 10-second in-memory cache. Consumed by `/api/available-tracks` (client filter) and by `executeServerTool` in the agent loop (so `searchTracks.playable` reflects the actual environment).

---

## 10. Accuracy Engineering: Killing `Math.random()`

A2's rubric-weakest area was accuracy. Three fields on the dashboard were driven by `Math.random()`:

- **Energy Level** — perturbed around `track.Energy` metadata.
- **Live Floor Scan** — entirely animated, no real signal.
- **People Detected** — random walk.

A3 replaces two of the three with measurement:

### 10.1 Energy Level → live RMS

`src/app/page.tsx` wires a Web Audio `AnalyserNode` to the `<audio>` element on first user interaction (required by browser autoplay policy). Every ~250 ms:

```ts
analyser.getByteTimeDomainData(buf);
let sum = 0;
for (let i = 0; i < buf.length; i++) {
  const v = (buf[i] - 128) / 128;  // signed normalised amplitude
  sum += v * v;
}
const rms = Math.sqrt(sum / buf.length);  // [0, 1]
const pct = Math.max(0, Math.min(99, Math.round(rms * 330)));
setLiveAudioEnergy(pct);
```

The non-linear mapping (`× 330`) is because RMS on loud club music sits around 0.1–0.3; we expand that to the visible 0–99 % range. A **`LIVE` badge** appears on the Energy Level card while measurement is active; when the track is paused, we fall back to the metadata-driven simulated value so the card is never empty.

### 10.2 Live Floor Scan → camera feed

The equalizer-bars animation is replaced with a simulated camera feed. When disconnected, the card shows a minimal camera-off state with a `Connect Camera` CTA. When connected, a 19 MB 720p H.264 CRF-28 loop of a real DJ set plays in `object-cover` mode with:

- A dark vignette gradient (`bg-gradient-to-t from-black/70`).
- A repeating-linear-gradient scanline overlay at ~15 % opacity (mix-blend-overlay) for a "security cam" look.
- A red `CAM LIVE` pill in the top-left header.
- A `✕ DISCONNECT` chip in the top-right.

The compressed video ships in `/public/videos/dj-set-demo.mp4` (committed to the repo). The uncompressed 164 MB source is gitignored.

### 10.3 People Detected — still simulated

Transparent limitation: a real people-counter would require either computer-vision on the camera feed (TF.js) or an external sensor. Out of scope for A3; documented in §16.

---

## 11. Setup & Local Development

### Prerequisites

- **Node.js 18.x or higher**
- An **Anthropic API key** — grab one at [console.anthropic.com](https://console.anthropic.com/)
- (Optional) **ffmpeg** if you want to re-compress your own video / MP3 library

### Installation

1. **Clone the repository**
    ```bash
    git clone https://github.com/GianlucaBave/DJ_Assistant_streamlit.git
    cd DJ_Assistant_streamlit
    ```
2. **Install dependencies**
    ```bash
    npm install
    ```
3. **Configure environment**
    ```bash
    cp .env.local.example .env.local
    # Edit .env.local — add ANTHROPIC_API_KEY=sk-ant-...
    ```
4. **(Optional) Add your own MP3 library**
    Drop MP3 files into `/songs/`, then:
    ```bash
    node scripts/map-audio-files.mjs    # fuzzy-match MP3s → tracks.json
    node scripts/embed-tracks.mjs       # regenerate embeddings (~90s first run)
    ```
    Without this step the app still runs using the 8 shipped demo tracks in `/public/demo-songs/`.
5. **Run**
    ```bash
    npm run dev
    # http://localhost:3000
    ```

### Verifying the RAG path

```bash
node scripts/test-rag.mjs
```

Expected output: for query *"tribal peak hour weapon"* the top result should be `Tondo` (similarity ~0.59). If you see `similarity: 0` across the board, the dynamic import of `@xenova/transformers` failed and you're on the lexical fallback — check that it's installed (`npm ls @xenova/transformers`).

---

## 12. Assignment 3 Additions (Delta vs A2)

| Area | Assignment 2 | Assignment 3 |
|---|---|---|
| **LLM provider** | Groq Llama-3.3-70B (`groq-sdk`) | Anthropic Claude Haiku 4.5 (`@anthropic-ai/sdk`) |
| **Copilot shape** | Single-prompt streaming chatbot | Tool-calling agent with 6 tools, multi-turn loop |
| **Library retrieval** | Whole library JSON stuffed into every system prompt | Dense-vector RAG with pre-computed 384-dim embeddings |
| **Retrieval at runtime** | N/A | Dynamic import of MiniLM (dev) + lexical fallback (Vercel) |
| **Serverless bundle size** | N/A | 32 KB (~1 000× smaller than shipping ONNX runtime) |
| **Stream protocol** | Plain text deltas | NDJSON (`text` / `tool_use` / `tool_result` / `action` / `done`) |
| **Audio playback** | None (vinyl was cosmetic) | Real MP3 streaming with HTTP byte-range (`/api/audio/[filename]`) |
| **Seek / skip / auto-advance** | N/A | Seek bar, `onEnded → next`, playable-only skip |
| **Energy meter** | `Math.random()` around metadata | Live RMS from Web Audio `AnalyserNode` |
| **Live Floor Scan** | Equalizer-bars animation | Simulated camera feed (looping DJ-set video + CRT overlay) |
| **Song picker** | Playlist sidebar only | Playlist sidebar + searchable Browse Library panel |
| **Environment-aware UI** | N/A | `/api/available-tracks` endpoint filters Predictor + Browse to on-disk files |
| **Chat rendering** | Plain text | `**bold**` markdown + paragraph breaks between tool segments + auto-scroll |
| **MP3 ↔ track mapping** | N/A | Confidence-sorted greedy matcher, 43/45 MP3s matched |
| **Vercel compatibility** | No audio/video on Vercel | Ships 8 × 96 kbps compressed demo tracks + 19 MB compressed video |

---

## 13. Rubric Alignment

The A3 rubric inherits from A2. A3 adds the "substantial refinement" axis with explicit examples. Mapping:

| Rubric criterion | Example from the brief | How CrowdLoop A3 addresses it |
|---|---|---|
| Non-straightforward LLM use | "Multi-call use cases (chatbot, tools, RAG)" | §8 Pattern 1 (agent loop) + Pattern 2 (RAG) + Pattern 3 (structured JSON) |
| Non-straightforward LLM use | "Complex post-processing" | `action` events drive real UI state; structured JSON drives PDF layout |
| Non-straightforward LLM use | "Iterative prompt refinement" | Playability gating rule added after testing showed `playTrack` calls on unplayable tracks |
| A3 substantial refinement | "Chatbot → RAG" | §9 RAG pipeline with pre-computed embeddings |
| A3 substantial refinement | "External API → own API" | §4.2 agentic-loop orchestration + NDJSON action protocol is a custom layer on top of the Messages API |
| A1/A2 axis — accuracy | — | §10 live RMS + camera feed replace `Math.random()` |
| A1/A2 axis — data/model pipeline | — | §9 offline embedding + fuzzy matcher + env-aware file listing |
| A1/A2 axis — appearance/UX | — | Live badge; Connect Camera; Browse Library; markdown chat; seek bar; auto-scroll; playable-only filters |

---

## 14. Deployment to Vercel

Auto-deploys on every push to `main`. Requirements for the deploy to work fully:

1. **`ANTHROPIC_API_KEY`** must be set in Vercel → Project → Settings → Environment Variables (Production, Preview, Development).
2. After adding the key, **redeploy without the build cache** (three-dots menu → Redeploy → uncheck "Use existing Build Cache") so the new env is picked up.

### What works on Vercel

- All dashboard UI
- Tool-calling agent (Anthropic API is server-side)
- RAG with **lexical fallback** (dense-vector requires `@xenova/transformers` which is a `devDependency` and intentionally not shipped — see §4.3)
- Real MP3 playback for the **8 shipped demo tracks** (one per playlist + iconic picks, 96 kbps, 39 MB total)
- Compressed DJ-set video for Connect Camera (19 MB)
- AI Set Analysis + PDF export

### What doesn't work on Vercel

- The other 36 mapped tracks show up only in the local env (the UI correctly filters them out via `/api/available-tracks` — they don't appear in the Predictor or Browse Library on Vercel).

**Live URL**: [https://dj-assistant-streamlit.vercel.app/](https://dj-assistant-streamlit.vercel.app/)

---

## 15. Engineering Journey & Difficulties

A few representative moments:

### The fuzzy matcher bug

My first matcher accepted single-token overlaps. *"24 (Turn It Up) (+6)"* (tokens: `{24, turn, it, up}`) stole the *"Turn It Around (Tom Novy Deep House Remix)"* MP3 (tokens: `{turn, it, around, tom, novy, deep, house}`) because `{turn, it}` intersect at 2 tokens and the score was above threshold. The fix had three parts: add `it` / `up` to STOP_TOKENS, require `≥2 track hits` for multi-token titles, and *sort candidates by their best score before greedy assignment* so tracks with higher-quality matches grab their MP3 first. Final accuracy: 43/45 correct.

### `ReadableStream is already closed` on client abort

The first agent loop called `controller.close()` in a `finally` block. When the browser aborted the fetch mid-stream (e.g. user refreshed the page), the `for await` exit path would trigger a second close attempt and Node threw. Fix: a `closed` flag plus `try/catch` around `controller.close()` and around every `controller.enqueue()` call.

### Vercel's 50 MB serverless function limit

The naive "import `@xenova/transformers` at runtime" approach pushed the `/api/chat` function past 50 MB because ONNX runtime native bindings are ~50 MB on their own. Fix described in §4.3: move to `devDependencies`, use `await import(/* webpackIgnore: true */ "@xenova/transformers")` so Turbopack doesn't try to bundle it, and build a lexical fallback over the same rich descriptions used offline. Result: 32 KB serverless function, RAG still works in dev, lexical fallback on Vercel is still content-aware (uses genre/BPM/playlist tags, not just title tokens).

### Paragraph breaks in the chat bubble

Claude's response when alternating text → tool → text produced two text-delta segments that the client concatenated: *"right now.Dropping..."* had no visual break between "now" and "Dropping". Fix server-side: track a `globalHasWrittenText` flag across turns, emit a synthetic `\n\n` text delta before the first text-delta of each post-first turn. Client renders with `whitespace-pre-wrap` and a small regex-based `**bold**` → `<strong>` so the output reads as discrete thoughts.

### How AI was leveraged

Claude Code acted as a pair programmer throughout. The fuzzy-matcher fix, the NDJSON protocol design, the dynamic-import pattern for the RAG fallback, the Web Audio RMS mapping — all started as symptom descriptions ("the second 24 track is stealing an unrelated MP3") and were iterated in conversation until the implementation landed. Design decisions and scope were always mine; implementation was co-written and reviewed.

---

## 16. Known Limitations & Future Work

- **BPM is still metadata-derived.** A natural next step is autocorrelation-based BPM detection on the same time-domain buffer already feeding RMS. Would complete the "accuracy" axis.
- **People Detected is still a random walk.** A vision layer — webcam input + `TensorFlow.js` + a pre-trained person detection model — would turn this into a real measurement.
- **Dense-vector RAG is unavailable on Vercel.** The function bundle constraint forces the lexical fallback. Options to restore dense retrieval in prod: (a) move to a Pro tier with a higher limit, (b) use a hosted embedding API (Cohere / Voyage — the latter is Anthropic-recommended), (c) serve embeddings via a dedicated VPS/Render service.
- **Session persistence.** Sessions, feedback logs, and AI reports are ephemeral (lost on refresh). A SQLite + Prisma layer would enable cross-session analytics ("your average peak-hour energy last Friday was 91 %, tonight is 82 %").
- **Agent memory / learning.** The copilot doesn't yet learn which transitions worked — every session starts fresh. Embedding past sessions and adding them to the RAG index would close the loop suggested by the "Learning Loop" UI.
- **Full library on Vercel.** Currently only 8 of 44 playable tracks ship to production (compressed MP3s). Hosting audio on Vercel Blob or Cloudflare R2 would unlock the full catalogue without bloating the git repo.
- **WebSocket transport.** Current chat is NDJSON over HTTP streaming. For large multi-user sessions or sub-second action dispatch a WebSocket layer would reduce per-turn overhead.
- **Harmonic-mixing enforcement in the agent.** The UI has a Harmonic toggle; the agent respects BPM/key heuristically via the system prompt but doesn't yet *force* harmonic-compatible picks. A `harmonicOnly: boolean` tool parameter would fix this.

---

## 17. Credits

*Project developed for Prototyping II — Assignment 3 (optional final submission).*

**Author**: Gianluca Bavelloni
**LLM provider**: Anthropic — Claude Haiku 4.5 + pair-programming with Claude Code
**Retrieval model**: `sentence-transformers/all-MiniLM-L6-v2` (via Xenova's ONNX port)
**DJ-set video source**: used locally for prototyping, compressed for shareability

Submission deliverables live in the repo root: [`repository.txt`](./repository.txt), [`deployment.txt`](./deployment.txt), [`ASSIGNMENT3_ADDITIONS.md`](./ASSIGNMENT3_ADDITIONS.md) (also provided as PDF).
