# CrowdLoop AI — Assignment 3 Additions

*Author: Gianluca Bavelloni · April 2026*

## Summary

Assignment 3 turns CrowdLoop from a **chatbot** that talks about tracks into an **agent** that actually drives the deck. The single biggest shift is architectural: the Vibe Copilot is now a tool-calling agent built on Anthropic Claude Haiku 4.5, with a proper Retrieval-Augmented Generation (RAG) layer over the track library and direct control over a real audio engine. Three of the rubric's example directions for "substantial refinement" are addressed simultaneously — *chatbot → RAG*, *external API → own API*, and a sharper move on the rubric's third axis, *accuracy*, by replacing `Math.random()`-driven telemetry with measurements from the actual audio signal.

---

## The five substantial additions

### 1. Tool-calling agent replaces the chatbot (`/api/chat`)

In A2, the copilot was a single-turn streaming chatbot: the full track library was pasted into the system prompt, Claude wrote text, and the UI rendered that text. If the user said *"play Glow"*, the copilot would *describe* playing Glow — nothing actually happened on the deck.

A3's `/api/chat` runs a **manual agentic loop** on the server. Six tools are exposed: `searchTracks` (server-side RAG), `playTrack`, `pauseTrack`, `skipNext`, `skipPrevious`, `switchPlaylist`. Server-side tools execute locally; client-side tools emit a special `action` event into the response stream and the browser dispatches them on the live audio element. The loop runs until Claude emits `end_turn` (max 6 turns), which allows chained reasoning like *"search for uplifting 128 BPM → pick the best match → play it → explain the BPM/key fit"* in a single request.

The stream protocol is **NDJSON**: `{type: "text" | "tool_use" | "action" | "done"}`, one event per line. The client parses line-by-line, rendering text deltas into the chat window, executing actions on the audio element, and surfacing tool use (e.g. "🔍 searching…") in the feedback log.

### 2. RAG over the track library (`src/lib/rag.ts`)

A2 stuffed the entire library into every system prompt. Fine at 58 tracks, broken at 500+.

A3 ships a proper retrieval pipeline:
- **Offline**: `scripts/embed-tracks.mjs` runs the `Xenova/all-MiniLM-L6-v2` model in Node (via `@xenova/transformers`) to compute a 384-dim normalized embedding for each track. The input string fuses name, artist, genres, BPM band, energy band, danceability, popularity, and the playlists the track belongs to, yielding a rich semantic signal. Output lives in `src/data/track_embeddings.json` (~460 KB).
- **Online**: the same model embeds the user query inside `semanticSearch()`. Because vectors are L2-normalized, cosine similarity collapses to a dot product. Top-K hits are enriched with live BPM/Key/Energy metadata and returned to the agent as a `searchTracks` tool result.

Smoke-testing showed the retrieval is genuinely semantic: *"peak hour, tribal drums"* returns Tondo / The Night Trip / Funk U Want; *"chill late-night deep house"* returns That's Right / The Weekend / and it felt like.. — none of which lexically overlap the query.

### 3. Real audio playback (`/api/audio/[filename]`)

A2's vinyl was cosmetic. A3 plays **real MP3s** from a local `/songs/` folder (gitignored — user-local). A Node route handler (`src/app/api/audio/[filename]/route.ts`) serves the files with full **HTTP byte-range support** so seeking works. A mapping script (`scripts/map-audio-files.mjs`) fuzzy-matches 45 MP3 filenames to the 58 tracks in the library using token-overlap scoring with a three-pass strategy: (a) manual overrides for edge cases like `itfeltlike` → `"and it felt like.."`, (b) candidate scoring, (c) confidence-sorted greedy assignment to prevent *"Gotta Let You Go"* (weak match, score 0.5) from stealing the *"Hold On, Let Go"* MP3 from the true owner (score 1.4). Forty-three of forty-five MP3s map correctly; the remaining tracks show *"Preview unavailable"* and fall back to the simulated energy curve.

### 4. Live audio analysis (`AnalyserNode`)

The A2 rubric's third axis — *accuracy* — was the weakest part of A2: energy, floor scan, people count were all driven by `Math.random()`. A3 wires a Web Audio `AnalyserNode` to the `<audio>` element. Every ~250 ms we compute root-mean-square amplitude across 1024-sample windows, map it non-linearly onto 0–99%, and drive the energy meter and the waveform animation from that value while the track is actually playing. When paused, the display reverts to the metadata-driven estimate. A small "LIVE" badge signals which mode is active.

### 5. Anthropic Claude Haiku 4.5 replaces Groq Llama-3.3

A2 picked Groq for raw latency. A3's requirement shifted from *chat speed* to *agent capability*: native tool use, structured outputs, and prompt-caching primitives. Claude Haiku 4.5 is Anthropic's cheapest current model ($1/$5 per MTok) and handles the 2–3-turn tool loop in ~3–5 s end-to-end. Tool definitions are declared as JSON-schema objects; the SDK's `messages.stream()` helper drives the streaming response with proper cleanup on client abort.

---

## How the A3 rubric is addressed

| Rubric example | Addition |
|---|---|
| Simple chatbot → RAG | `/api/chat` now agentic, with `searchTracks` backed by a real vector index |
| External API → own API | The tool-calling loop + NDJSON action stream is a custom orchestration layer on top of the Anthropic Messages API |
| Fix accuracy | MP3 playback + Web Audio RMS replace the `Math.random()` simulation on the energy channel |
| New functionality/tabs | Live DJ deck control, live audio meter, agent action feed inside Learning Loop |

---

## Difficulties and how AI was leveraged

- **Fuzzy filename matching** — my first scorer accepted single-token overlaps, so *"24 (Turn It Up) (+6)"* stole *"Turn It Around (Tom Novy Deep House Remix).mp3"*. Iterating with Claude Code, I added stop-token filtering, minimum-hit gates, and confidence-sorted greedy assignment. The fix came from describing the symptom, not from hand-debugging the regex.
- **`ReadableStream is already closed`** — the initial streaming route double-closed the controller on client abort. The fix was a `closed` flag + `try/catch` around `controller.close()` and `controller.abort()` — a pattern suggested by Claude once I showed it the stack trace.
- **Mixing server-side and client-side tools** — standard Anthropic tool use expects the tool call to be resolved on the server before the loop continues. For actions that only make sense client-side (play/pause/skip), I fiat success on the server and emit an `action` event so the browser executes the real effect. The agent's belief about the world is corrected on the next user turn (the updated `currentTrack` is re-sent). This is pragmatic fiction, but it keeps the protocol stateless.
- **Prompt caching** — the library context at 58 tracks (~1.4K tokens) is below Haiku 4.5's 4 096-token cache minimum. I left the `cache_control` scaffolding out and noted it as future work: once the library grows, caching the stable prefix would cut per-turn input cost by an order of magnitude.

Throughout, AI (Claude Code) was used as a pair programmer: I described intent and constraints, read its proposals, and accepted/rewrote them. The scoring algorithm in `map-audio-files.mjs`, the NDJSON protocol, and the Web Audio RMS loop were all iterated this way — design I directed, implementation I co-wrote and reviewed.

---

## Limitations

- The full 45-track `/songs/` library and full-quality DJ-set video are local-only (each file is over GitHub's 100 MB per-file limit or too bulky for a serverless bundle). The Vercel deploy ships **8 compressed demo tracks** (`/public/demo-songs/`, 96 kbps) and a **compressed 720p version of the camera video** (`/public/videos/dj-set-demo.mp4`) so the agent, RAG, playback, and Connect-Camera flow all work end-to-end on the hosted URL too. The audio route prefers `/songs/` (full quality) and falls back to the compressed set transparently.
- Dense-vector RAG runs locally via `@xenova/transformers` (dev-only dependency); on Vercel the package isn't in the serverless function bundle, so the agent's `searchTracks` tool falls back to a lexical score over a rich per-track description (name + artist + genres + BPM/energy bands + playlist tags). Ranking is still content-aware, just not in the 384-dim semantic space.
- BPM is still metadata-derived, not audio-measured. Extending the `AnalyserNode` pipeline with autocorrelation-based BPM detection is the natural next step — noted in README §10.
