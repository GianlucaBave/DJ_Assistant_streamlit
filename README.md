# CrowdLoop AI — Live DJ Assistant & Track Predictor

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)](https://dj-assistant-streamlit.vercel.app/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38B2AC?logo=tailwind-css)](https://tailwindcss.com/)
[![Groq AI](https://img.shields.io/badge/Groq-Llama--3.3--70B-orange)](https://groq.com/)

## Why CrowdLoop AI?

For many DJs, particularly those early in their careers or performing in high-pressure environments, the challenge of "reading the room" can be overwhelming. Relying solely on intuition often leads to missed opportunities for raising energy or, worse, losing the dancefloor entirely. **CrowdLoop AI** addresses this gap by providing a real-time, data-driven command center. By merging environmental scanning with an elite AI DJ consultant, CrowdLoop empowers performers to make smarter, faster decisions while maintaining the flow of the set.

---

## 1. Overview

**CrowdLoop AI** is a high-fidelity, real-time DJ performance dashboard designed and built as **Assignment 2** for a university course on prototyping. The project represents a significant evolution from its predecessor, moving from a static Python-based simulation to a full-stack Next.js application with deep LLM (Large Language Model) integration.

The system simulates a live DJ environment where the "room" state—crowd density, energy levels, and harmonic compatibility—is constantly monitored. Leveraging the **Groq Llama-3.3-70B** model, CrowdLoop provides two non-trivial AI features:
1. **Vibe Copilot**: A stateful, library-aware chatbot designed to act as a Headline DJ's partner.
2. **AI Set Analysis**: A post-session performance engine that converts telemetry data into structured insights and professional reports.

---

## 2. Evolution & Design Rationale

The transition from the initial prototype (Assignment 1) to the current CrowdLoop architecture was driven by specific technical limitations encountered during the first phase of development.

### Abandoning Streamlit
While Streamlit was effective for a rapid proof-of-concept in Assignment 1, its execution model proved insufficient for a high-fidelity DJ dashboard. Streamlit’s "top-down" rerun model—where the entire script re-executes on every user interaction—precluded the implementation of true real-time streaming for LLM responses and complex, persistent UI animations like the spinning vinyl player. Furthermore, Streamlit offers limited control over granular CSS layouts, which was a barrier to achieving the premium, "mission control" aesthetic required for this assignment.

### The Shift to TypeScript & Next.js
Rebuilding the application in **TypeScript** was a deliberate choice to manage the increased complexity of the session state. In Assignment 2, the application must track an intertwined web of objects: track history, energy logs, crowd reactions, and multi-turn conversation history. TypeScript’s static typing ensures that these objects remain consistent as they are passed between frontend components and server-side API routes.

**Next.js 15 (App Router)** was selected as the core framework because its built-in **Route Handlers** (`/api/chat`, `/api/analyze`) allowed for a secure, server-side integration of the LLM. This architectural decision keeps the sensitive `GROQ_API_KEY` entirely out of the client-side bundle while enabling the use of Node.js streams for immediate feedback.

### Why Groq?
In a live performance context, **latency is the primary enemy**. A DJ cannot pause for 3–5 seconds while an LLM processes a suggestion. Groq's LPU (Language Processing Unit) inference engine provides sub-500ms time-to-first-token, making the Vibe Copilot feel like a live partner rather than a slow search engine. This speed was the decisive factor in choosing Groq over competitors like OpenAI or Anthropic for this specific live-use case.

---

## 3. Technical Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Framework** | Next.js 15 | Enables secure API routes and high-performance server-side logic. |
| **Logic** | TypeScript 5 | Essential for managing the complex, typed data structures of a DJ set. |
| **Styling** | Tailwind CSS 4 | Custom design system optimized for dark-mode high-fidelity UIs. |
| **AI Engine** | Groq (Llama-3.3-70B) | Industry-leading inference speeds critical for real-time performance. |
| **Charts** | Recharts | Visualizes energy volatility to provide DJs with actionable visual feedback. |
| **PDF Engine** | jsPDF / Custom | Serializes LLM-generated JSON into professional offline reports. |
| **Data** | Static JSON | High-speed local indices for track and playlist metadata. |

---

## 4. Repository Structure

```text
/
├── src/
│   ├── app/
│   │   ├── page.tsx                # Main dashboard entry point & state management
│   │   └── api/
│   │       ├── chat/route.ts       # LLM Chatbot endpoint (Streaming + Context injection)
│   │       └── analyze/route.ts    # JSON analysis / report generator endpoint
│   ├── components/
│   │   ├── PdfReportTemplate.tsx   # Professional PDF layout and styling
│   │   └── ...                     # Modular dashboard widgets (Vinyl, Charts)
│   ├── data/
│   │   ├── tracks.json             # DB of 100+ tracks with BPM and Camelot Key metadata
│   │   └── playlists.json          # Curated playlist definitions
│   └── lib/
│       ├── recommender.ts          # Heuristic logic for track scoring
│       ├── pdfGenerator.ts         # Logic for session-to-PDF serialization
│       └── types.ts                # Application-wide interfaces
├── public/                         # Visual assets and simulation images
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
- A **Groq API Key** ([console.groq.com](https://console.groq.com/))

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
    Add your key: `GROQ_API_KEY=your_key_here`
4.  **Run**:
    ```bash
    npm run dev
    ```

---

## 9. Deployment

CrowdLoop AI is deployed on **Vercel** with automatic redeployment on every push.
Ensure `GROQ_API_KEY` is configured in your Vercel Project Settings under "Environment Variables".

**Live URL**: [https://dj-assistant-streamlit.vercel.app/](https://dj-assistant-streamlit.vercel.app/)

---

## 10. Known Limitations & Future Work

Current limitations and planned enhancements for the next iteration:
- **Websocket Integration**: Move from HTTP polling/streaming to WebSockets for even lower latency in environment simulation.
- **Spotify API**: Integration with the Spotify Web API to allow DJs to use their real personal libraries instead of the static JSON dataset.
- **Vision Layer**: Using the WebCam API to implement a real "Floor Scan" using TensorFlow.js to detect actual crowd density and movement.

---

*Project developed for Prototyping II - Assignment 2.*
*Author: Gianluca Bavelloni*
*Institution: [INSERT UNIVERSITY NAME]*
