import { listAvailableAudio } from "@/lib/audioFiles";

export const runtime = "nodejs";

// Returns the set of MP3 filenames the server can actually stream. The
// dashboard uses this to filter the library down to playable tracks — so
// on Vercel (where /songs/ is absent) only the shipped demo set shows up,
// and locally (where /songs/ is populated) the full library does.
export async function GET() {
  const files = [...listAvailableAudio()].sort();
  return Response.json({ files });
}
