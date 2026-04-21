import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const { energyHistory, crowdHistory, feedbackLog, currentTrack } =
      await req.json();

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not set in environment variables." },
        { status: 500 },
      );
    }

    const client = new Anthropic();

    const energyLines = energyHistory
      .map((v: number, i: number) => `  Turn ${i}: Energy = ${v}%`)
      .join("\n");
    const crowdLines = crowdHistory
      .map((v: number, i: number) => `  Turn ${i}: Crowd = ${v} people`)
      .join("\n");
    const feedbackLines =
      feedbackLog
        .slice(0, 10)
        .map((entry: string, i: number) => `  ${i + 1}. ${entry}`)
        .join("\n") || "  (no feedback yet)";

    const prompt = `You are an expert music analyst and crowd psychologist. Review this DJ's live set data.

===== ENERGY HISTORY (per track played) =====
${energyLines}

===== CROWD SIZE HISTORY =====
${crowdLines}

===== LAST 10 FEEDBACK EVENTS =====
${feedbackLines}

===== CURRENTLY PLAYING =====
${currentTrack["Track Name"]}

Provide a deep, professional DJ mix analysis. Focus specifically on:
1. The exact track transitions and mixes that caused the biggest spikes or drops in crowd size and energy.
2. Interesting statistics and actionable insights for the DJ (e.g., "The transition into Harmonic Key X boosted energy by Y%").
3. A psychological reading of the dancefloor's vibe.

Output ONLY a valid JSON object matching this exact schema. No markdown fences, no commentary before or after the JSON.
{
  "overall_score": <int 0-100>,
  "energy_trend": <"ascending" | "descending" | "volatile" | "stable">,
  "crowd_retention": <int 0-100>,
  "peak_moment": <int>,
  "critical_failure": <int or null>,
  "strengths": [<str>, <str>],
  "weaknesses": [<str>, <str>],
  "summary_paragraph": <str 4-5 sentences: deep analysis of specific track mixes, crowd psychology, and interesting stats>,
  "next_recommendation": <str>
}`;

    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1200,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Empty model response" },
        { status: 500 },
      );
    }

    const raw = textBlock.text.trim();
    // Haiku sometimes wraps in ```json fences despite instructions — strip them
    const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");

    try {
      return NextResponse.json(JSON.parse(stripped));
    } catch (parseErr) {
      console.error("Failed to parse analysis JSON:", stripped);
      return NextResponse.json(
        { error: "Model returned invalid JSON", raw: stripped },
        { status: 500 },
      );
    }
  } catch (error: unknown) {
    console.error("Anthropic Analysis Error:", error);
    if (error instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status ?? 500 },
      );
    }
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
