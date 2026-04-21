# CrowdLoop AI — Live DJ Assistant & Track Predictor

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://dj-assistant-streamlit.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Anthropic](https://img.shields.io/badge/Anthropic-Claude_Haiku_4.5-D97757)](https://www.anthropic.com/)
[![RAG](https://img.shields.io/badge/RAG-MiniLM_L6_v2-5B21B6)](https://huggingface.co/Xenova/all-MiniLM-L6-v2)

> **Assignment 3 (current version):** The chatbot is now an **agent** that actually controls the deck via tool use (play, pause, skip, switch playlist, semantic search). The track library is **RAG-indexed** (local 384-dim embeddings, cosine similarity). The dashboard now plays **real audio** from a local MP3 folder, and the energy meter reads a **live RMS signal** from the Web Audio API instead of `Math.random()`. See §11 — *Assignment 3 Additions* for the full delta vs. A2.

## Why CrowdLoop AI?

For many DJs, particularly those early in their careers or performing in high-pressure environments, the challenge of "reading the room" can be overwhelming. Relying solely on intuition often leads to missed opportunities for raising energy or, worse, losing the dancefloor entirely. **CrowdLoop AI** addresses this gap by providing a real-time, data-driven command center. By merging environmental scanning with an elite AI DJ consultant, CrowdLoop empowers performers to make smarter, faster decisions while maintaining the flow of the set.

---

## 1. Overview

**CrowdLoop AI** is a high-fidelity, real-time DJ performance dashboard designed and built as **Assignment 2** for a university course on prototyping. The project represents a significant evolution from its predecessor, moving from a static Python-based simulation to a full-stack Next.js application with deep LLM (Large Language Model) integration.

The system simulates a live DJ environment where the "room" state—crowd density, energy levels, and harmonic compatibility—is constantly monitored. Leveraging **Anthropic Claude Haiku 4.5** with native tool-calling, CrowdLoop provides three non-trivial AI features:
1. **Vibe Copilot Agent**: A tool-calling agent that actually controls the deck — searches the library via RAG, plays tracks, skips, and switches playlists in response to natural-language commands.
2. **AI Set Analysis**: A post-session performance engine that converts telemetry data into structured insights and professional reports.
3. **Semantic Library Search (RAG)**: A local, embedding-based retrieval system (`all-MiniLM-L6-v2`, 384-dim) that powers the agent's `searchTracks` tool — no external embedding API required.

---

## 2. Evolution & Design Rationale

The transition from the initial prototype (Assignment 1) to the current CrowdLoop architecture was driven by specific technical limitations encountered during the first phase of development.

### Abandoning Streamlit
While Streamlit was effective for a rapid proof-of-concept in Assignment 1, its execution model proved insufficient for a high-fidelity DJ dashboard. Streamlit’s "top-down" rerun model—where the entire script re-executes on every user interaction—precluded the implementation of true real-time streaming for LLM responses and complex, persistent UI animations like the spinning vinyl player. Furthermore, Streamlit offers limited control over granular CSS layouts, which was a barrier to achieving the premium, "mission control" aesthetic required for this assignment.

### The Shift to TypeScript & Next.js
Rebuilding the application in **TypeScript** was a deliberate choice to manage the increased complexity of the session state. In Assignment 2, the application must track an intertwined web of objects: track history, energy logs, crowd reactions, and multi-turn conversation history. TypeScript’s static typing ensures that these objects remain consistent as they are passed between frontend components and server-side API routes.

**Next.js 15 (App Router)** was selected as the core framework because its built-in **Route Handlers** (`/api/chat`, `/api/analyze`) allowed for a secure, server-side integration of the LLM. This architectural decision keeps the sensitive `GROQ_API_KEY` entirely out of the client-side bundle while enabling the use of Node.js streams for immediate feedback.

### From Groq to Anthropic Claude (A3)
A2 used Groq Llama-3.3-70B for its ultra-low latency. For A3, the requirement shifted from "fast chat" to "agentic control" — Claude Haiku 4.5 supports native tool use and structured outputs, which were needed to turn the copilot from a describer into a doer. Haiku 4.5 is also Anthropic's cheapest current model (~$1/MTok in / $5/MTok out), so the cost profile stays friendly while the capabilities jump. Typical turn latency with tool-chaining is 3–5 seconds end-to-end, which is acceptable because the agent is now *executing actions*, not just chatting.

---

## 3. Technical Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Framework** | Next.js 16 | Enables secure API routes and high-performance server-side logic. |
| **Logic** | TypeScript 5 | Essential for managing the complex, typed data structures of a DJ set. |
| **Styling** | Tailwind CSS 4 | Custom design system optimized for dark-mode high-fidelity UIs. |
| **AI Engine** | Anthropic Claude Haiku 4.5 | Native tool use, structured outputs, cost-efficient ($1/$5 per MTok). |
| **RAG** | `@xenova/transformers` + `all-MiniLM-L6-v2` | Local 384-dim embeddings; zero external API, runs in Node. |
| **Audio** | Web Audio API (`AnalyserNode`) | Real-time RMS extraction from the playing MP3 → live energy meter. |
| **Charts** | Recharts | Visualizes energy volatility to provide DJs with actionable visual feedback. |
| **PDF Engine** | jsPDF / Custom | Serializes LLM-generated JSON into professional offline reports. |
| **Data** | Static JSON + `track_embeddings.json` | Typed library + pre-computed embedding index for semantic search. |

---

## 4. Repository Structure

```text
/
├── src/
│   ├── app/
│   │   ├── page.tsx                # Main dashboard + audio playback + agent action dispatch
│   │   └── api/
│   │       ├── chat/route.ts       # Tool-calling agent loop (NDJSON streaming, 6 tools)
│   │       ├── analyze/route.ts    # Structured-JSON set analysis via Claude
│   │       └── audio/[filename]/route.ts  # MP3 streaming with byte-range support
│   ├── components/
│   │   └── PdfReportTemplate.tsx   # Professional PDF layout and styling
│   ├── data/
│   │   ├── tracks.json             # 58 tracks with BPM, Camelot Key, Energy, `file` mapping
│   │   ├── playlists.json          # Curated playlist definitions (4 vibes)
│   │   └── track_embeddings.json   # Pre-computed 384-dim embeddings for RAG (~460KB)
│   └── lib/
│       ├── rag.ts                  # Semantic search — loads embeddings, embeds queries, cosine sim
│       ├── recommender.ts          # Heuristic BPM/Key scoring (still used for AI Track Predictor)
│       ├── pdfGenerator.ts         # Session-to-PDF serialization
│       └── types.ts                # Application-wide interfaces
├── scripts/
│   ├── map-audio-files.mjs         # Fuzzy-matches MP3 filenames in /songs/ to tracks.json
│   ├── embed-tracks.mjs            # Offline embedding computation (runs MiniLM-L6-v2)
│   └── test-rag.mjs                # Sanity-check script for the RAG pipeline
├── songs/                          # Local MP3 library (gitignored — user-local)
├── public/                         # Visual assets
├── .env.local.example              # Template for environment variables
├── package.json                    # Dependency and script manifests
└── README.md                       # This documentation
```

---

## 5. Core Features

### 1. Command Center (Left Sidebar)
- **Active Playlist Selector**: Four professionally curated vibe-based playlists. Selecting one instantly reloads the dashboard’s predictive engine.
- **Now Playing Panel**: Displays rich metadata including Artist, BPM, and Camelot Key, alongside a dynamic "Queue Context" that identifies the surrounding tracks in the current playlist.
- **Vibe Copilot Chatbot**: An LLM-powered assistant with an expert DJ persona, capable of suggesting tracks only from the available library.

### 2. Environmental Scanning (Center Header)
Displays the "Health" of the room via a three-column synchronized grid:
- **Energy Level**: Monitors the "vibe" percentage (0–99%).
- **Live Floor Scan**: A symmetric waveform visualization that reacts to simulated energy peaks.
- **People Detected**: Headcount monitoring (Dense/Medium/Scattered).

### 3. Vinyl Player (Center)
The visual centerpiece featuring a 3D-effect spinning vinyl. It includes a **Harmonic Mixing Toggle** to filter recommendations by musical compatibility and integrated playback navigation controls.

### 4. Performance Analytics (Right Sidebar)
- **Energy Trend Chart**: A real-time Recharts area graph tracking volatility over the last 30 intervals.
- **Learning Loop**: A dynamic feedback log recording interactions and crowd reactions.
- **AI Set Analysis**: Triggers the structured report generation engine.

---

## 6. LLM Integration Details (Non-Trivial Usage)

The core requirement for Assignment 2 was a **non-straightforward** LLM implementation. CrowdLoop achieves this through two distinct architectural patterns.

### Feature 1 — Vibe Copilot (Contextual Streaming Agent)
This is not a generic chatbot. It is a **context-injected expert system**.

- **System Prompt Construction**: The system prompt is rebuilt server-side on **every** API call. This is necessary because the DJ's state (BPM, Energy, Crowd) is volatile. The constructor assembles:
    1.  The "Elite DJ Consultant" persona.
    2.  A serialized snapshot of the **entire track library**.
    3.  The current live session metrics (Active BPM, Key, Energy).
    4.  Strict negative constraints to prevent hallucination.
- **Multi-turn History**: The client maintains the `messages[]` array in React state, providing the model with conversational memory. By prepending the fresh system prompt to this history on every call, the model remains "aware" of the live environment even as it discusses past tracks.
- **Streaming Implementation**: The `/api/chat` route leverages `TransformStream` to pipe tokens from Groq's SDK directly to the client. This provides perceived zero-latency, which is essential for a DJ who needs an answer *now*, not in 3 seconds.
- **Grounding & Iteration**: Initial testing showed the model suggesting popular radio hits not in the library. This was solved through iterative prompt engineering—specifically, injecting the library as a strictly indexed block and instructing the LLM to cross-reference every suggestion against that list before emitting a result.

### Feature 2 — AI Set Analysis (Structured JSON Engine)
This feature treats the LLM as a **computational analyst** rather than a text generator.

- **Data Serialization**: Upon clicking "View AI Report", the client serializes the full session history—including the energy timeline (30 samples), the feedback log, and the track sequence—into a condensed JSON context block.
- **Structured Output Contract**: The model is forced to return **only** a valid JSON object matching a specific schema. This architecture enables the frontend to parse the "thoughts" of the model and render them as high-precision UI components (score bars, peak moment lists) rather than a wall of prose.
- **Reliability Engineering**: To ensure 100% parseable JSON, the prompt uses explicit schema definitions and negative examples. We set the LLM `temperature` to 0 to ensure deterministic analysis across set reviews.
- **Post-Processing & PDF**: The parsed JSON feeds both the UI Report Card and the `pdfGenerator.ts` module. The latter maps the structured AI insights directly onto a fixed-coordinate PDF template, creating a downloadable professional artifact.

---

## 7. Build Process

The development of CrowdLoop AI was a multi-stage engineering journey:

1.  **Architecture Design**: I began by porting the heuristic recommendation logic (BPM/Key scoring) from Python to TypeScript. The decision was made early to store the 100+ tracks in a typed JSON format to facilitate instant filtering and clean LLM prompt injection.
2.  **Dashboard Integration**: The UI was built around a centralized state in `page.tsx`. This central "brain" manages the synchronized animations between the vinyl player, the energy chart, and the floor scan waveform.
3.  **Chatbot Implementation**: The Vibe Copilot was the first AI layer. The biggest challenge was the transition from static responses to a streaming model. Implementing the `ReadableStream` on the backend and an async reader on the frontend was critical for the app's professional feel.
4.  **Analysis Pivot**: Originally, the Set Analysis returned a paragraph of text. I pivoted to the **Structured JSON** approach to allow for the dynamic "Report Card" UI and the automated PDF generation. This required the most significant amount of prompt tuning.
5.  **PDF Generation**: The PDF template was built manually using absolute positioning. Mapping the nested objects from the LLM’s JSON output to the PDF’s layout required a custom serialization layer in `lib/pdfGenerator.ts`.

---

## 8. Setup & Local Development

### Prerequisites
- Node.js 18.x or higher
- An **Anthropic API Key** ([console.anthropic.com](https://console.anthropic.com/))

### Installation
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/GianlucaBave/DJ_Assistant_streamlit.git
    cd DJ_Assistant_streamlit
    ```
2.  **Install dependencies**:
    ```bash
    npm install
    ```
3.  **Configure environment**:
    ```bash
    cp .env.local.example .env.local
    ```
    Add your key: `ANTHROPIC_API_KEY=sk-ant-your_key_here`
4.  **(Optional) Drop an MP3 library into `/songs/`**, then map filenames to the library and rebuild embeddings:
    ```bash
    node scripts/map-audio-files.mjs    # fuzzy-matches MP3s → tracks.json
    node scripts/embed-tracks.mjs       # ~1 min; downloads MiniLM-L6-v2 on first run
    ```
5.  **Run**:
    ```bash
    npm run dev
    ```

---

## 9. Deployment

CrowdLoop AI is deployed on **Vercel** with automatic redeployment on every push.
Ensure `ANTHROPIC_API_KEY` is configured in your Vercel Project Settings under "Environment Variables".

> Note on audio: the `/songs/` folder is gitignored (user-local library). In a deployed environment the dashboard still works — it just shows "Preview unavailable" on tracks without an MP3 and falls back to the simulated energy curve. The agent, RAG, and analysis features work identically with or without local audio.

**Live URL**: [https://dj-assistant-streamlit.vercel.app/](https://dj-assistant-streamlit.vercel.app/)

---

## 10. Known Limitations & Future Work

- **Websocket Integration**: Move from HTTP streaming to WebSockets for even lower latency in the agent loop.
- **Spotify API**: Enrich tracks with real Spotify audio features (danceability, valence) to replace metadata gaps.
- **Vision Layer**: Use the WebCam API + TensorFlow.js for actual crowd density / movement detection.
- **BPM detection**: Extend the Web Audio analyser from RMS energy to autocorrelation-based BPM so the reported tempo also becomes live-measured, not metadata-derived.
- **Agent memory**: Persist past sessions + their outcomes, and RAG over them so the copilot learns which transitions *actually* worked for this DJ.

---

## 11. Assignment 3 Additions

A3 is graded independently, so the delta from A2 is made explicit here:

| Area | Assignment 2 | Assignment 3 |
|---|---|---|
| **LLM provider** | Groq (Llama-3.3-70B) | Anthropic Claude Haiku 4.5 |
| **Copilot shape** | Single-prompt chatbot (describes suggestions) | Tool-calling **agent** with 6 tools (searches, plays, skips, switches playlist) |
| **Library retrieval** | Whole library stuffed into the system prompt | **RAG**: pre-computed 384-dim embeddings + cosine similarity (local `all-MiniLM-L6-v2`) |
| **Audio playback** | None — vinyl animation was cosmetic only | **Real MP3 playback** from a local `/songs/` folder with range-request streaming and seeking |
| **Energy meter** | `Math.random()` perturbations around track metadata | **Live RMS** from `AnalyserNode` on the actual audio buffer |
| **Stream protocol** | Plain text chunks | **NDJSON events** (`text` / `tool_use` / `action` / `done`) — client dispatches actions in real time |

### New tools available to the agent
- `searchTracks(query, topK)` — server-side RAG (the A3 headline feature)
- `playTrack(trackName)` / `pauseTrack()` / `skipNext()` / `skipPrevious()` — client-side deck control
- `switchPlaylist(playlistId)` — swaps the active vibe

### Why these choices
The A3 rubric rewards **substantial refinement**. Each change maps to a specific rubric example:
- "Chatbot → RAG" → the embedding index + semantic search
- "External API → own API" → the tool-calling agent loop is a custom orchestration API on top of the Messages endpoint
- "Accuracy" → real audio playback + real RMS energy kill the `Math.random()` simulation in favor of measurement

The 2-pager describing the additions is at `ASSIGNMENT3_ADDITIONS.md`.

---

*Project developed for Prototyping II - Assignment 3 (optional final submission).*
*Author: Gianluca Bavelloni*
