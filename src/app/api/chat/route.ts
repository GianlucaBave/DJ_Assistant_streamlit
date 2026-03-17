import Groq from 'groq-sdk';

export async function POST(req: Request) {
  try {
    const { messages, currentTrack, energy, crowdSize, activePlaylist } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      console.warn('GROQ_API_KEY is missing. Returning 500.');
      return new Response('GROQ_API_KEY not set', { status: 500 });
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const isActive = !!activePlaylist?.name;
    const playlistContext = isActive
      ? `Active Playlist: "${activePlaylist.name}" (${activePlaylist.vibe}). Tracks: ${activePlaylist.tracks.join(', ')}.`
      : "No playlist selected. Use general knowledge to suggest tracks/vibes.";

    const systemPrompt = `You are the ultimate DJ Vibe Copilot—a high-end, expert DJ consultant.
Style: Punchy, professional, and confident. No fluff, just pure elite club advice.

CONTEXT:
Playing: "${currentTrack?.["Track Name"] || "Unknown"}" | ${currentTrack?.Tempo || "???"} BPM | ${currentTrack?.Key || "???"}
Energy: ${energy}% | Crowd: ${crowdSize} dancers.
${playlistContext}

YOUR MISSION:
1. Identify the vibe immediately. 
2. Recommend the KILLER next track from the context or general industry knowledge.
3. Give precise mixing advice (BPM match, harmonic blend, or energy boost).

Max 2-3 short sentences. Be the partner every headline DJ needs.`;

    const stream = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
      temperature: 0.8,
      max_tokens: 400,
      stream: true,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content || '';
          if (text) {
            controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    return new Response(error.message || 'Internal Server Error', { status: 500 });
  }
}
