import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { messages, currentTrack, energy, crowdSize, activePlaylist } = await req.json();

    if (!process.env.GROQ_API_KEY) {
      return new Response('GROQ_API_KEY not set', { status: 500 });
    }

    const playlistContext = activePlaylist 
      ? `Active Playlist: "${activePlaylist.name}" (${activePlaylist.vibe}). Tracks: ${activePlaylist.tracks.join(', ')}.`
      : "No playlist selected. Use general knowledge to suggest tracks/vibes.";

    const systemPrompt = `You are CrowdLoop Vibe Copilot, an expert AI DJ assistant.
The DJ is currently playing: "${currentTrack?.["Track Name"] || "Unknown"}" by ${currentTrack?.["Artist Name(s)"] || "Unknown"}.
Current energy level: ${energy}% | Crowd: ${crowdSize} dancers. BPM: ${currentTrack?.Tempo || "N/A"} | Key: ${currentTrack?.Key || "N/A"}.

${playlistContext}

Your job:
- Suggest which track from the ACTIVE PLAYLIST to play next based on energy/vibe.
- If no track in the active playlist fits, suggest tracks from ALL PLAYLISTS: ${activePlaylist?.allPlaylists?.map((p: any) => p.name).join(', ') || "N/A"}.
- Provide mixing advice (Harmonic, Energy, BPM).

Keep responses concise (2-4 sentences). Be the ultimate DJ partner.`;

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
