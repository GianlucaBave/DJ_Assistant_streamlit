// RAG over the track library.
// - Embeddings are pre-computed offline (scripts/embed-tracks.mjs) and shipped
//   as src/data/track_embeddings.json.
// - At runtime we embed the user's query with the same model and do cosine
//   similarity across all tracks. Since the stored vectors are already L2-
//   normalized, cosine similarity reduces to a plain dot product.

import embeddingsData from "@/data/track_embeddings.json";

type EmbeddingsFile = {
  model: string;
  dim: number;
  vectors: Record<string, number[]>;
};

type SearchHit = {
  trackName: string;
  similarity: number;
};

const DATA = embeddingsData as EmbeddingsFile;

// Turbopack/Webpack don't like `@xenova/transformers` being bundled into the
// route, so we import it dynamically on first call and cache the pipeline.
type EmbedOutput = { data: Float32Array | number[] };
type Embedder = (text: string, opts: { pooling: "mean"; normalize: boolean }) => Promise<EmbedOutput>;

let embedderPromise: Promise<Embedder> | null = null;

async function getEmbedder(): Promise<Embedder> {
  if (!embedderPromise) {
    embedderPromise = (async () => {
      const { pipeline } = await import("@xenova/transformers");
      return (await pipeline("feature-extraction", DATA.model)) as unknown as Embedder;
    })();
  }
  return embedderPromise;
}

function dot(a: number[], b: number[] | Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

export async function semanticSearch(
  query: string,
  topK: number = 5,
): Promise<SearchHit[]> {
  if (!query || !query.trim()) return [];

  const embedder = await getEmbedder();
  const out = await embedder(query, { pooling: "mean", normalize: true });
  const q = out.data;

  const hits: SearchHit[] = [];
  for (const [trackName, vec] of Object.entries(DATA.vectors)) {
    hits.push({ trackName, similarity: dot(vec, q) });
  }
  hits.sort((a, b) => b.similarity - a.similarity);
  return hits.slice(0, topK);
}
