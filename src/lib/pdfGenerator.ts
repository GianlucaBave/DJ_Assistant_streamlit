import { Track } from "./types";

interface PdfData {
  currentTrack: Track;
  energyHistory: number[];
  crowdHistory: number[];
  feedbackLog: string[];
  crowdSize: number;
  energy: number;
}

export async function fetchAiAnalysis(data: PdfData) {
  const res = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      energyHistory: data.energyHistory,
      crowdHistory: data.crowdHistory,
      feedbackLog: data.feedbackLog,
      currentTrack: data.currentTrack
    })
  });

  if (!res.ok) {
    throw new Error(`API Error: ${res.statusText}`);
  }

  return await res.json();
}
