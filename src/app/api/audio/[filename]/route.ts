import { NextRequest } from "next/server";
import { createReadStream, statSync } from "node:fs";
import { resolve, basename, normalize } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SONGS_DIR = resolve(process.cwd(), "songs");

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ filename: string }> },
) {
  const { filename } = await params;
  const decoded = decodeURIComponent(filename);
  const safeName = basename(normalize(decoded));
  const fullPath = resolve(SONGS_DIR, safeName);

  if (!fullPath.startsWith(SONGS_DIR + "/")) {
    return new Response("Forbidden", { status: 403 });
  }

  let stats;
  try {
    stats = statSync(fullPath);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const total = stats.size;
  const range = req.headers.get("range");

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) return new Response("Invalid range", { status: 416 });
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : total - 1;
    if (start >= total || end >= total) {
      return new Response("Range not satisfiable", {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }

    const stream = createReadStream(fullPath, { start, end });
    return new Response(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(end - start + 1),
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  const stream = createReadStream(fullPath);
  return new Response(stream as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Length": String(total),
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
