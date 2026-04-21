export interface Track {
  "Track Name": string;
  "Artist Name(s)": string;
  "Album Name"?: string;
  Genres?: string | null;
  Energy: number;
  Danceability?: number;
  Popularity: number;
  Tempo: number;
  Key: string;
  file?: string | null;
}

export interface SessionState {
  currentTrack: Track;
  energy: number;
  crowdSize: number;
  feedbackLog: string[];
  energyHistory: number[];
  crowdHistory: number[];
}
export interface Playlist {
  id: string;
  name: string;
  emoji: string;
  vibe: string;
  tracks: string[]; // List of track names
}
