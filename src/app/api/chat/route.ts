import Anthropic from "@anthropic-ai/sdk";
import tracksData from "@/data/tracks.json";
import playlistsData from "@/data/playlists.json";
import { semanticSearch } from "@/lib/rag";
import type { Track, Playlist } from "@/lib/types";

export const runtime = "nodejs";
// Tool-calling agent loop can take several seconds when tools chain.
export const maxDuration = 60;

const tracks = tracksData as Track[];
const playlists = playlistsData as Playlist[];

// Client-side tools: the server "fiats" their success and emits an ACTION event
// to the stream so the browser can actually do the thing (play/pause/skip).
const CLIENT_TOOLS = new Set([
  "playTrack",
  "pauseTrack",
  "skipNext",
  "skipPrevious",
  "switchPlaylist",
]);

const TOOLS = [
  {
    name: "searchTracks",
    description:
      "Semantic search over the DJ's track library. Use this whenever the DJ describes a vibe, mood, or transition idea in natural language (e.g. 'something more uplifting at 128 BPM', 'bridge from deep to afro'). Returns ranked tracks with BPM, Key, Energy, and Danceability. Always prefer this to guessing track names from memory.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "Natural-language description of the vibe/mood/transition the DJ wants.",
        },
        topK: {
          type: "integer" as const,
          description: "How many matches to return. 3–8 is typical.",
          default: 5,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "playTrack",
    description:
      "Start playing a specific track on the live deck. The track name MUST be an exact match to an entry in the library (use searchTracks first if you're unsure).",
    input_schema: {
      type: "object" as const,
      properties: {
        trackName: {
          type: "string" as const,
          description: "Exact track name from the library (copy verbatim from searchTracks output).",
        },
      },
      required: ["trackName"],
    },
  },
  {
    name: "pauseTrack",
    description: "Pause the currently-playing track.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "skipNext",
    description: "Skip to the next track in the active playlist.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "skipPrevious",
    description: "Go back to the previous track in the active playlist.",
    input_schema: { type: "object" as const, properties: {} },
  },
  {
    name: "switchPlaylist",
    description:
      "Switch the active playlist. Valid IDs: deep-house-midnight, warm-up-groovy, peak-hour-bangers, afro-festival.",
    input_schema: {
      type: "object" as const,
      properties: {
        playlistId: {
          type: "string" as const,
          enum: playlists.map((p) => p.id),
        },
      },
      required: ["playlistId"],
    },
  },
];

async function executeServerTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === "searchTracks") {
    const query = String(input.query ?? "");
    const topK = Math.max(1, Math.min(10, Number(input.topK ?? 5)));
    const hits = await semanticSearch(query, topK);
    const enriched = hits.map((h) => {
      const t = tracks.find((tr) => tr["Track Name"] === h.trackName);
      return {
        trackName: h.trackName,
        similarity: Number(h.similarity.toFixed(3)),
        artist: t?.["Artist Name(s)"] ?? null,
        bpm: t?.Tempo ?? null,
        key: t?.Key ?? null,
        energy: t?.Energy ?? null,
        danceability: t?.Danceability ?? null,
        genres: t?.Genres ?? null,
        playable: !!t?.file,
      };
    });
    return JSON.stringify(enriched);
  }
  return JSON.stringify({ error: `Unknown server tool: ${name}` });
}

function buildSystem(
  currentTrack: Track | undefined,
  energy: number,
  crowdSize: number,
  activePlaylist: Playlist | null,
): string {
  const playlistList = playlists
    .map((p) => `  - ${p.id} (${p.emoji} ${p.name}): ${p.vibe}`)
    .join("\n");

  const activeLine = activePlaylist
    ? `ACTIVE PLAYLIST: "${activePlaylist.name}" (${activePlaylist.vibe}). Upcoming tracks: ${activePlaylist.tracks.slice(0, 8).join(", ")}`
    : "No active playlist.";

  return `You are the DJ Vibe Copilot — an AGENT that controls the DJ's live deck in real time.

You have tools. USE THEM. Do not just describe what you'd do — actually do it.

TOOL PLAYBOOK:
- For any "find me something" / "play something with vibe X" request: ALWAYS call searchTracks first, then decide whether to playTrack the top hit.
- For direct "play <name>" commands: use playTrack immediately.
- For "next" / "skip" / "pause" / "back": use the corresponding control tool.
- For "switch to <mood>" or "peak hour now": use switchPlaylist.
- Announce briefly (1 short sentence, DJ-punchy) BEFORE the tool call so the DJ sees what you're about to do.
- After tools return, give a tight follow-up (1-2 sentences max) — BPM/Key rationale or the next move. No lectures.

PLAYABILITY RULE:
- searchTracks results include a \`playable\` flag. ONLY playTrack a track where \`playable: true\` — \`playable: false\` means no audio file is available and calling playTrack will silently fail.
- If the top hit has \`playable: false\`, prefer the next playable result and mention the substitution briefly ("Top match isn't in the local library — going with X instead").

PLAYLISTS:
${playlistList}

CURRENT DECK STATE:
Now playing: "${currentTrack?.["Track Name"] ?? "nothing"}" by ${currentTrack?.["Artist Name(s)"] ?? "—"} | ${currentTrack?.Tempo ?? "?"} BPM | Key ${currentTrack?.Key ?? "?"}
Crowd energy: ${energy}% | People on floor: ${crowdSize}
${activeLine}

STYLE: Elite DJ consultant. Confident, punchy, zero fluff. Reference BPM, key compatibility, and energy like a pro.`;
}

export async function POST(req: Request) {
  try {
    const { messages, currentTrack, energy, crowdSize, activePlaylistId } =
      await req.json();

    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response("ANTHROPIC_API_KEY not set", { status: 500 });
    }

    const activePlaylist =
      playlists.find((p) => p.id === activePlaylistId) ?? null;

    const client = new Anthropic();
    const system = buildSystem(currentTrack, energy, crowdSize, activePlaylist);

    // Running conversation transcript we'll extend as the agent loops
    const convo: Anthropic.MessageParam[] = messages.map(
      (m: { role: "user" | "assistant"; content: string }) => ({
        role: m.role,
        content: m.content,
      }),
    );

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        let closed = false;
        const write = (obj: unknown) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
          } catch {
            closed = true;
          }
        };
        const safeClose = () => {
          if (closed) return;
          closed = true;
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        };

        const MAX_TURNS = 6;
        let globalHasWrittenText = false;
        try {
          for (let turn = 0; turn < MAX_TURNS; turn++) {
            const stream = client.messages.stream({
              model: "claude-haiku-4-5",
              max_tokens: 800,
              system,
              tools: TOOLS,
              messages: convo,
            });

            let turnHasWrittenText = false;
            for await (const event of stream) {
              if (closed) break;
              if (
                event.type === "content_block_delta" &&
                event.delta.type === "text_delta"
              ) {
                // Insert a paragraph break between agent speech segments that
                // are separated by tool calls, so the chat bubble reads as
                // discrete thoughts rather than one run-on sentence.
                if (globalHasWrittenText && !turnHasWrittenText) {
                  write({ type: "text", text: "\n\n" });
                }
                write({ type: "text", text: event.delta.text });
                globalHasWrittenText = true;
                turnHasWrittenText = true;
              }
            }

            const final = await stream.finalMessage();
            convo.push({ role: "assistant", content: final.content });

            if (final.stop_reason === "end_turn" || closed) break;

            if (final.stop_reason !== "tool_use") break;

            const toolResults: Anthropic.ToolResultBlockParam[] = [];
            for (const block of final.content) {
              if (block.type !== "tool_use") continue;
              const name = block.name;
              const input = (block.input ?? {}) as Record<string, unknown>;
              write({ type: "tool_use", tool: name, args: input });

              if (CLIENT_TOOLS.has(name)) {
                write({ type: "action", tool: name, args: input });
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: JSON.stringify({
                    success: true,
                    note: `Action '${name}' dispatched to the live deck.`,
                  }),
                });
              } else {
                try {
                  const result = await executeServerTool(name, input);
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: result,
                  });
                  write({ type: "tool_result", tool: name, content: result });
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  toolResults.push({
                    type: "tool_result",
                    tool_use_id: block.id,
                    content: msg,
                    is_error: true,
                  });
                }
              }
            }
            convo.push({ role: "user", content: toolResults });
          }
        } catch (err) {
          console.error("Agent loop error:", err);
          const msg = err instanceof Error ? err.message : String(err);
          write({ type: "error", message: msg });
        } finally {
          write({ type: "done" });
          safeClose();
        }
      },
      cancel() {
        // If client aborts, nothing to do — next write() is a no-op via `closed`
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: unknown) {
    console.error("Chat API Error:", error);
    if (error instanceof Anthropic.APIError) {
      return new Response(error.message, { status: error.status ?? 500 });
    }
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return new Response(message, { status: 500 });
  }
}
