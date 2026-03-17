import { NextResponse } from 'next/server';
import Groq from 'groq-sdk';

export async function POST(req: Request) {
  try {
    const { energyHistory, crowdHistory, feedbackLog, currentTrack } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      console.warn('GROQ_API_KEY is missing. Returning 500.');
      return NextResponse.json({ error: 'GROQ_API_KEY is not set in environment variables.' }, { status: 500 });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const energyLines = energyHistory.map((v: number, i: number) => `  Turn ${i}: Energy = ${v}%`).join('\n');
    const crowdLines = crowdHistory.map((v: number, i: number) => `  Turn ${i}: Crowd = ${v} people`).join('\n');
    const feedbackLines = feedbackLog.slice(0, 10).map((entry: string, i: number) => `  ${i + 1}. ${entry}`).join('\n') || "  (no feedback yet)";

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

Output ONLY a valid JSON object matching this schema. No markdown fences.
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
}
`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile', // Using the current Llama 3.3 70B for strong reasoning
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });

    const reportContent = chatCompletion.choices[0]?.message?.content || '{}';
    return NextResponse.json(JSON.parse(reportContent));

  } catch (error: any) {
    console.error('Groq Analysis Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
