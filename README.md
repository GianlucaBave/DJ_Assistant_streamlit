# CrowdLoop AI — Live DJ Assistant & Track Predictor

[![Vercel Deployment](https://img.shields.io/badge/Vercel-Deployed-black?logo=vercel)]([INSERT DEPLOYMENT URL])
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

## 2. Concept & Evolution

### Concept
CrowdLoop is not just a tracklist. It is a **Live DJ Copilot**. It tracks transitions, evaluates crowd feedback, and uses advanced prompt engineering to ensure that every recommendation is grounded in the DJ's actual track library. The goal is to provide a "second pair of eyes" on the dancefloor, allowing the DJ to focus on the technicals of the mix while the AI handles vibe-matching and harmonic analysis.

### Evolution from Assignment 1
- **Assignment 1 (Streamlit Prototype):** Focused on a basic heuristic for crowd simulation and simple BPM-based track matching. It lacked real-time interactivity beyond basic UI sliders and had no intelligence layer.
- **Assignment 2 (Full-Stack Next.js):** A complete ground-up rebuild.
    - **Language**: Migrated from Python to **TypeScript**, ensuring type safety across complex session states.
    - **Frontend**: Switched to **Next.js 15 (React 19)** for a more responsive, premium UI.
    - **Intelligence**: Integrated an LLM layer that performs multi-turn reasoning and structured data analysis.
    - **Reporting**: Added a dynamic PDF generation engine that exports AI-generated insights into professional documents.

---

## 3. Technical Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Framework** | Next.js 15 | Provides the performance and API routing necessary for a real-time dashboard. |
| **Logic** | TypeScript 5 | Essential for managing complex state and track metadata. |
| **Styling** | Tailwind CSS 4 | Used for a custom, glassmorphic dark-mode design system. |
| **AI Engine** | Groq (Llama-3.3-70B) | Chosen for its ultra-low latency and sophisticated reasoning capabilities. |
| **Charts** | Recharts | Visualizes energy trends to help DJs spot "dead moments" in their set. |
| **PDF Engine** | jsPDF / Built-in | Converts session data into static performance artifacts. |
| **Data** | Static JSON | High-performance local library storage (Tracks/Playlists). |

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
│   │   └── ...                     # Modular dashboard widgets
│   ├── data/
│   │   ├── tracks.json             # DB of 100+ tracks with BPM and Camelot Key metadata
│   │   └── playlists.json          # Curated playlist definitions (Deep House, Peak, etc.)
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
The sidebar serves as the DJ's logistical hub.
- **Active Playlist Selector**: Choose between 4 professionally curated playlists. Selecting a playlist instantly reloads the track matcher and identifies the "lead-in" track.
- **Now Playing Panel**: A high-density card showing current track metadata (BPM, Key) and a "Queue Context" that identifies the surrounding tracks in the active list.
- **Vibe Copilot Chatbot (LLM-Powered)**:
    - **Elite Persona**: Acts as a high-end DJ consultant.
    - **Context Awareness**: Automatically "sees" your current BPM, Key, and the full contents of your library.
    - **Streaming**: Responses appear letter-by-letter, providing a seamless live experience.

### 2. Environmental Scanning (Center Header)
Displays the "Health" of the room via three dedicated modules:
- **Energy Level**: Monitors the current "vibe" percentage.
- **Live Floor Scan**: A symmetric waveform visualization that pulse-syncs with the crowd's energy level.
- **People Detected**: Simulated headcount monitoring dense, medium, or scattered dancefloor scenarios.

### 3. Vinyl Player (Center)
The visual centerpiece of the dashboard.
- **3D Record Animation**: A spinning vinyl that reacts to playback.
- **Harmonic Mixing Toggle**: Filters recommendations to only show tracks within a +/- 1 semitone (Camelot Wheel) range.
- **Navigation Controls**: Prev/Next buttons allow for quick sets-skipping during rehearsals.

### 4. Performance Analytics (Right Sidebar)
- **Energy Trend Chart**: A Recharts-powered area graph showing energy volatility over time.
- **Learning Loop**: A live log of every DJ action and the resulting crowd reaction (e.g., "Mix Success: +5%").
- **AI Set Analysis**: Click "View AI Report" to trigger a comprehensive post-session evaluation. The engine analyzes the entire set and returns a structured performance scorecard.

---

## 6. LLM Integration Details (Non-Trivial Usage)

As per the course requirements, CrowdLoop uses a **non-straightforward** LLM pattern that avoids simple "completion" calls in favor of complex prompt engineering and structured data processing.

### Feature 1 — Vibe Copilot (Contextual Streaming Agent)
This feature does more than answer questions. It acts as an **augmented reality layer** for the DJ's library.
1. **Dynamic Prompt Injection**: Every messsage sent to the LLM is wrapped in a massive, hidden "System Perspective" block. This block contains the **entire track library**, the current **Live State** (BPM, Key, Energy), and the active playlist.
2. **Stateful Conversation**: The model remembers the nuances of your previous requests (e.g., "They liked that Latin track, what's next?").
3. **Strict Grounding**: The LLM is hard-coded to **never** suggest tracks from outside the library. This required complex "Negative Constraint" prompting to ensure 100% accuracy.

### Feature 2 — AI Set Analysis (Structured JSON Engine)
The analysis engine treats the LLM as a **data processor** rather than a writer.
1. **Data Deserialization**: The entire session log (BPM trends, track history, energy swings) is compressed into a data block and sent to the LLM.
2. **JSON Constraint**: The LLM is instructed to return **only valid JSON**. This allows the frontend to parse the "thoughts" of the model and render them as high-precision UI elements (e.g., Score bars, bulleted lists).
3. **Automated Reporting**: Once the JSON is parsed, it feeds into the **PDF Generation** layer, creating a tangible takeaway for the DJ.

---

## 7. Setup & Local Development

### Prerequisites
- Node.js 18.x or higher
- A **Groq API Key** (Get one at [console.groq.com](https://console.groq.com/))

### Installation
1. **Clone the repository**:
   ```bash
   git clone https://github.com/GianlucaBave/[REPO_NAME].git
   cd [REPO_NAME]
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Configure the environment**:
   ```bash
   cp .env.local.example .env.local
   ```
   Open `.env.local` and add your key:
   `GROQ_API_KEY=gsk_your_key_here`

4. **Launch the app**:
   ```bash
   npm run dev
   ```
   The dashboard will be available at `http://localhost:3000`.

---

## 8. Deployment

CrowdLoop AI is optimized for **Vercel**. 

- **Auto-Redeploy**: Every push to the `main` branch triggers an automated build and deployment.
- **Environment Management**: Ensure that `GROQ_API_KEY` is added to the **Environment Variables** section in your Vercel project settings.

Live deployment URL: `[INSERT DEPLOYMENT URL]`

---

## 9. Known Limitations & Future Work

While the current prototype fulfills all academic requirements, several areas are earmarked for future development:
- **Real-time Sensor Integration**: Replacing the simulated energy levels with real-world computer vision data (e.g., using a webcam to detect dance move intensity).
- **RL Sequence Agent**: Training a Reinforcement Learning agent to predict track sequences, allowing the Copilot to learn from a DJ's specific style over several weeks.
- **Spotify/Tidal API Integration**: Moving beyond a static JSON library to allow DJs to sync their actual cloud-based libraries in real-time.

---

*This project was developed for Prototyping II - Assignment 2.*
*Author: Gianluca Bavelloni*
*Institution: [INSERT UNIVERSITY NAME]*
