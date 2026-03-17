import { Track } from "./types";

export function getCompatibleKeys(key: string): string[] {
  const k = key.trim().toUpperCase();
  if (k.length < 2) return [];

  const letter = k.slice(-1);
  const numberStr = k.slice(0, -1);
  if (isNaN(Number(numberStr))) return [];
  const number = parseInt(numberStr);

  const opposite = letter === "A" ? "B" : "A";
  const prevNum = number === 1 ? 12 : number - 1;
  const nextNum = number === 12 ? 1 : number + 1;

  return [`${prevNum}${letter}`, `${nextNum}${letter}`, `${number}${opposite}`];
}

export function getRecommendations(
  tracks: Track[],
  currentBpm: number,
  crowdEnergy: number,
  harmonicMode: boolean = false,
  currentKey: string = ""
): Track[] {
  // 1. Filter by BPM (+/- 5)
  let filtered = tracks.filter(t => t.Tempo >= currentBpm - 5 && t.Tempo <= currentBpm + 5);

  if (filtered.length === 0) filtered = [...tracks];

  // 2. Harmonic Filter
  if (harmonicMode && currentKey) {
    const compatible = getCompatibleKeys(currentKey);
    const harmonicMatches = filtered.filter(t => compatible.includes(t.Key));
    if (harmonicMatches.length > 0) {
      filtered = harmonicMatches;
    }
  }

  // 3. AI logic based on energy
  if (crowdEnergy < 50) {
    // Save the dancefloor: High Energy + High Popularity
    return [...filtered].sort((a, b) => b.Energy - a.Energy || b.Popularity - a.Popularity).slice(0, 3);
  } else {
    // Keep the flow: Similar energy
    return [...filtered]
      .sort((a, b) => {
        const diffA = Math.abs(a.Energy * 100 - crowdEnergy);
        const diffB = Math.abs(b.Energy * 100 - crowdEnergy);
        return diffA - diffB || b.Popularity - a.Popularity;
      })
      .slice(0, 3);
  }
}
