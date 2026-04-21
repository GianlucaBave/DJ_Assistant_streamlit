"use client";

import { useState, useEffect, useRef } from "react";
import tracksData from "@/data/tracks.json";
import playlistsData from "@/data/playlists.json";
import { Track, Playlist } from "@/lib/types";
import { getRecommendations, getCompatibleKeys } from "@/lib/recommender";
import { AreaChart, Area, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { fetchAiAnalysis } from "@/lib/pdfGenerator";
import { useRouter } from 'next/navigation';

const tracks = tracksData as Track[];
const playlists = playlistsData as Playlist[];

export default function Dashboard() {
  const [currentTrack, setCurrentTrack] = useState<Track>(tracks[0]);
  const [energy, setEnergy] = useState(50);
  const [crowdSize, setCrowdSize] = useState(120);
  const [energyHistory, setEnergyHistory] = useState<number[]>([50]);
  const [crowdHistory, setCrowdHistory] = useState<number[]>([120]);
  const [bpmHistory, setBpmHistory] = useState<number[]>([tracksData[0].Tempo]);
  const [keyHistory, setKeyHistory] = useState<string[]>([tracksData[0].Key]);
  const [feedbackLog, setFeedbackLog] = useState<string[]>([]);
  const [harmonicMode, setHarmonicMode] = useState(false);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [chatMessages, setChatMessages] = useState<{role: 'user'|'assistant'; content: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);

  // Audio playback state
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [userHasInteracted, setUserHasInteracted] = useState(false);

  // Web Audio analyser for real-time energy extraction from the playing MP3.
  // Replaces the Math.random() simulation with RMS loudness measured off the
  // actual audio buffer.
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const [liveAudioEnergy, setLiveAudioEnergy] = useState<number | null>(null);

  // Simulated camera feed — when "connected", a looping DJ-set video takes over
  // the Live Floor Scan card to make the crowd-detection feel more grounded.
  const [cameraConnected, setCameraConnected] = useState(false);

  // Song picker state (Browse Library section in the left sidebar)
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState("");

  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);

    // Stop timer if report is generating
    if (isGeneratingReport) return;

    // Start Live Set Timer
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isGeneratingReport]);

  // Load the current track's MP3 and (after first user interaction) auto-play
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const file = currentTrack.file;
    if (!file) {
      audio.removeAttribute("src");
      audio.load();
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
      return;
    }

    audio.src = `/api/audio/${encodeURIComponent(file)}`;
    audio.load();
    if (userHasInteracted) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    }
  }, [currentTrack, userHasInteracted]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setUserHasInteracted(true);
    // Resume audio context if it was created in suspended state (autoplay policy)
    if (audioCtxRef.current?.state === "suspended") {
      audioCtxRef.current.resume().catch(() => {});
    }
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !isFinite(seconds)) return;
    audio.currentTime = seconds;
    setCurrentTime(seconds);
  };

  const formatTime = (s: number) => {
    if (!isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Minimal markdown rendering: **bold** → <strong>. Newlines preserved via
  // whitespace-pre-wrap on the bubble container.
  const renderChatContent = (content: string) => {
    const parts = content.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={idx} className="font-bold text-white">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={idx}>{part}</span>;
    });
  };

  // Auto-scroll the chat to the newest message
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [chatMessages]);

  // Wire a Web Audio AnalyserNode to the <audio> element and drive liveAudioEnergy
  // from real-time RMS. Must run AFTER user interaction (autoplay policy).
  useEffect(() => {
    if (!userHasInteracted || !audioRef.current) return;
    if (audioCtxRef.current) return; // already wired

    const AudioCtxCtor = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext) as typeof AudioContext;
    if (!AudioCtxCtor) return;

    const ctx = new AudioCtxCtor();
    const source = ctx.createMediaElementSource(audioRef.current);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    source.connect(analyser);
    analyser.connect(ctx.destination); // keep audible

    audioCtxRef.current = ctx;
    analyserRef.current = analyser;
    audioSourceRef.current = source;

    const buf = new Uint8Array(analyser.fftSize);
    let lastUpdate = 0;
    let raf = 0;
    const loop = (ts: number) => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(buf);
      // RMS deviation from silent center (128)
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length); // 0..1
      // Throttle state updates to ~4 Hz
      if (ts - lastUpdate > 250) {
        lastUpdate = ts;
        // Non-linear mapping: RMS tends to sit around 0.1-0.3 for house music,
        // so we expand the visible range.
        const pct = Math.max(0, Math.min(99, Math.round(rms * 330)));
        setLiveAudioEnergy(pct);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [userHasInteracted]);

  // When real audio is playing, the energy meter reflects the live signal.
  // When paused / no file, fall back to the simulated track-driven value.
  const displayEnergy = isPlaying && liveAudioEnergy != null ? liveAudioEnergy : energy;

  // Only suggest tracks we can actually play — tracks without a mapped MP3
  // would load to silence, which is a worse UX than just not showing them.
  const playableTracks = tracks.filter((t) => t.file);
  const suggestions = getRecommendations(
    playableTracks,
    currentTrack.Tempo,
    energy,
    harmonicMode,
    currentTrack.Key,
  );

  const compatibleKeys = getCompatibleKeys(currentTrack.Key);

  const playTrack = (track: Track, isAi: boolean = true) => {
    setUserHasInteracted(true);
    const oldEnergy = energy;
    const oldCrowd = crowdSize;

    const trackEnergyScore = track.Energy * 100;
    // Calculate new energy with resistance at the top end to avoid plateauing at 100%
    // If track energy is lower than current, drop faster. If higher, climb slower the closer we get to 100.
    const energyDiff = trackEnergyScore - oldEnergy;
    const climbFactor = energyDiff > 0 ? (100 - oldEnergy) / 100 : 1.2; 
    
    let newEnergy = oldEnergy + (energyDiff * 0.4 * climbFactor) + (Math.random() * 8 - 4);
    // Add a natural decay if playing low energy tracks consistently
    if (trackEnergyScore < 60) newEnergy -= 2;
    
    newEnergy = Math.max(10, Math.min(99, Math.floor(newEnergy)));
    
    const crowdShift = Math.floor((track.Popularity - 50) * 0.3 + (Math.random() * 7 - 3));
    const newCrowd = Math.max(10, Math.min(800, oldCrowd + crowdShift));

    setEnergy(newEnergy);
    setCrowdSize(newCrowd);
    // Generate micro-points between oldEnergy and newEnergy for dense waveform
    const NUM_MICRO = 7;
    const microPoints: number[] = Array.from({ length: NUM_MICRO }, (_, idx) => {
      const t = (idx + 1) / (NUM_MICRO + 1);
      const baseInterp = oldEnergy + (newEnergy - oldEnergy) * t;
      const noise = (Math.random() - 0.5) * 8;
      return Math.max(10, Math.min(99, Math.round(baseInterp + noise)));
    });
    setEnergyHistory(prev => [...prev, ...microPoints, newEnergy]);
    setCrowdHistory(prev => [...prev, newCrowd]);
    setBpmHistory(prev => [...prev, track.Tempo]);
    setKeyHistory(prev => [...prev, track.Key]);
    setCurrentTrack(track);

    if (isAi) {
      const log = newEnergy >= oldEnergy && newCrowd >= oldCrowd
        ? `✅ [+Reinforced] '${track["Track Name"]}' was a hit! Energy: ${newEnergy.toFixed(0)}% | Crowd: +${newCrowd - oldCrowd}`
        : newEnergy >= oldEnergy
        ? `⚠️ [Mixed] '${track["Track Name"]}' boosted energy, but lost ${oldCrowd - newCrowd} people.`
        : `❌ [-Penalized] '${track["Track Name"]}' flopped. Energy dropped to ${newEnergy.toFixed(0)}%.`;
      setFeedbackLog(prev => [log, ...prev].slice(0, 15));
    }
  };

  const dismissTrack = (track: Track) => {
    const newEnergy = Math.max(10, energy - Math.floor(Math.random() * 4 + 2));
    const newCrowd = Math.max(10, crowdSize - Math.floor(Math.random() * 4 + 2));
    setEnergy(newEnergy);
    setCrowdSize(newCrowd);
    setEnergyHistory(prev => [...prev, newEnergy]);
    setCrowdHistory(prev => [...prev, newCrowd]);
    setFeedbackLog(prev => [`👀 [Log] DJ dismissed '${track["Track Name"]}'. Crowd waiting...`, ...prev].slice(0, 15));
  };

  const skipTrack = (direction: "next" | "prev") => {
    let listToNavigate = tracks;
    if (activePlaylist) {
      listToNavigate = activePlaylist.tracks
        .map((trackName: string) => tracks.find((t) => t["Track Name"] === trackName))
        .filter(Boolean) as Track[];
    }

    if (listToNavigate.length === 0) return;

    // Skip over tracks with no MP3 file so we never silently land on a dead track.
    const playableList = listToNavigate.filter((t) => t.file);
    if (playableList.length === 0) {
      // Nothing playable in this playlist — fall back to any playable track
      const anyPlayable = tracks.find((t) => t.file);
      if (anyPlayable) playTrack(anyPlayable, false);
      return;
    }

    const currentIdxInPlayable = playableList.findIndex(
      (t) => t["Track Name"] === currentTrack["Track Name"],
    );
    const step = direction === "next" ? 1 : -1;
    // If the current track isn't in the playable list (e.g. user loaded something
    // outside the playlist), start from the top of the playable list.
    let nextIdx = currentIdxInPlayable === -1 ? 0 : currentIdxInPlayable + step;
    if (nextIdx >= playableList.length) nextIdx = 0;
    if (nextIdx < 0) nextIdx = playableList.length - 1;

    playTrack(playableList[nextIdx], false);
  };

  const handleViewReport = async () => {
    setIsGeneratingReport(true);
    try {
      // 1. Fetch AI Analysis from Next API
      const analysis = await fetchAiAnalysis({
        currentTrack,
        energyHistory,
        crowdHistory,
        feedbackLog,
        crowdSize,
        energy
      });
      
      // 2. Serialize full session data to sessionStorage
      const sessionData = {
        currentTrack,
        energyHistory,
        crowdHistory,
        bpmHistory,
        keyHistory,
        feedbackLog,
        crowdSize,
        energy,
        setDuration: elapsedSeconds,
        aiAnalysis: analysis
      };
      
      sessionStorage.setItem('crowdloop_report_data', JSON.stringify(sessionData));
      
      // 3. Navigate to dedicated report route
      router.push('/report');
      
    } catch (error) {
      console.error("Failed to generate report:", error);
      alert("Failed to generate AI report. Check console for details.");
      setIsGeneratingReport(false); // Only set false on error, keep loading state if redirecting
    }
  };

  // Execute a client-side action that Claude requested via a tool call.
  const executeAgentAction = (tool: string, args: Record<string, unknown>) => {
    setUserHasInteracted(true);
    switch (tool) {
      case "playTrack": {
        const name = String(args.trackName ?? "");
        const t = tracks.find((x) => x["Track Name"] === name);
        if (t) {
          playTrack(t, true);
          setFeedbackLog((prev) => [`🤖 [Agent] queued '${name}'`, ...prev].slice(0, 15));
        } else {
          setFeedbackLog((prev) => [`⚠️ [Agent] unknown track: '${name}'`, ...prev].slice(0, 15));
        }
        break;
      }
      case "pauseTrack": {
        audioRef.current?.pause();
        setFeedbackLog((prev) => ["🤖 [Agent] paused deck", ...prev].slice(0, 15));
        break;
      }
      case "skipNext": {
        skipTrack("next");
        setFeedbackLog((prev) => ["🤖 [Agent] skipped forward", ...prev].slice(0, 15));
        break;
      }
      case "skipPrevious": {
        skipTrack("prev");
        setFeedbackLog((prev) => ["🤖 [Agent] skipped back", ...prev].slice(0, 15));
        break;
      }
      case "switchPlaylist": {
        const id = String(args.playlistId ?? "");
        const pl = playlists.find((p) => p.id === id);
        if (pl) {
          setActivePlaylist(pl);
          const first = tracks.find((t) => t["Track Name"] === pl.tracks[0]);
          if (first) playTrack(first, false);
          setFeedbackLog((prev) => [`🤖 [Agent] switched to '${pl.name}'`, ...prev].slice(0, 15));
        }
        break;
      }
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg = { role: "user" as const, content: chatInput.trim() };
    const updatedMsgs = [...chatMessages, userMsg];
    setChatMessages(updatedMsgs);
    setChatInput("");
    setIsChatLoading(true);
    setUserHasInteracted(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMsgs,
          currentTrack,
          energy,
          crowdSize,
          activePlaylistId: activePlaylist?.id ?? null,
        }),
      });

      if (!res.ok || !res.body) throw new Error("Chat stream error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantText = "";
      setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      // NDJSON: parse one event per line
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: { type: string; [k: string]: unknown };
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }

          if (ev.type === "text") {
            assistantText += String(ev.text ?? "");
            setChatMessages((prev) => {
              const msgs = [...prev];
              msgs[msgs.length - 1] = { role: "assistant", content: assistantText };
              return msgs;
            });
          } else if (ev.type === "tool_use") {
            // Surface server-side tool use in the feedback log (UX signal)
            const tool = String(ev.tool ?? "");
            if (tool === "searchTracks") {
              const q = (ev.args as { query?: string } | undefined)?.query ?? "";
              setFeedbackLog((prev) => [`🔍 [RAG] searching: "${q}"`, ...prev].slice(0, 15));
            }
          } else if (ev.type === "action") {
            executeAgentAction(
              String(ev.tool ?? ""),
              (ev.args as Record<string, unknown>) ?? {},
            );
          } else if (ev.type === "error") {
            assistantText += `\n\n⚠️ ${String(ev.message ?? "error")}`;
            setChatMessages((prev) => {
              const msgs = [...prev];
              msgs[msgs.length - 1] = { role: "assistant", content: assistantText };
              return msgs;
            });
          }
        }
      }
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Connection error. Retry." },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <main className="relative h-screen bg-[#050505] text-white p-4 font-sans selection:bg-cyan-500/30 overflow-hidden flex flex-col">
      {/* Hidden audio element — wired to currentTrack.file via effect above */}
      <audio
        ref={audioRef}
        preload="metadata"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(e) => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
        onEnded={() => {
          setIsPlaying(false);
          skipTrack('next');
        }}
      />
      {/* Main Content Dashboard */}
      <div className="relative z-10 flex-1 max-w-[1600px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4 w-full h-full">
        
        {/* Left Sidebar */}
        <aside className="lg:col-span-3 flex flex-col h-full gap-4 overflow-hidden">
          <div className="bg-[#111111] border border-white/5 p-5 rounded-2xl shadow-2xl flex flex-col h-full overflow-hidden gap-3">
            
            {/* Header */}
            <div className="flex-shrink-0">
              <h1 className="text-xl font-black bg-gradient-to-r from-cyan-400 to-fuchsia-500 bg-clip-text text-transparent mb-0.5">
                CROWDLOOP AI
              </h1>
              <div className="flex items-center justify-between">
                <p className="text-white/40 text-[10px] uppercase tracking-widest font-bold">Live DJ Copilot</p>
                <div className="flex items-center gap-1.5 px-2 py-1 bg-white/5 border border-white/10 rounded font-mono text-[9px] text-white/60">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  {Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
                </div>
              </div>
            </div>

            {/* Playlist Selector */}
            <div className="flex-shrink-0">
              <p className="text-[9px] text-white/30 uppercase font-bold mb-2 tracking-wider">Active Playlist</p>
              <div className="grid grid-cols-2 gap-1.5">
                {playlists.map((pl: Playlist) => (
                  <button
                    key={pl.id}
                    onClick={() => {
                      setActivePlaylist(pl.id === activePlaylist?.id ? null : pl);
                      // Auto-load first *playable* track of playlist (skip any without MP3)
                      if (pl.id !== activePlaylist?.id) {
                        const firstPlayable = pl.tracks
                          .map((name) => tracks.find((t) => t["Track Name"] === name))
                          .find((t): t is Track => !!t && !!t.file);
                        if (firstPlayable) playTrack(firstPlayable, false);
                      }
                    }}
                    className={`text-left px-2 py-1.5 rounded-lg border text-[10px] transition-all ${
                      activePlaylist?.id === pl.id
                        ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    <div className="font-bold truncate">{pl.emoji} {pl.name}</div>
                    <div className="text-[8px] text-white/30 truncate">{pl.tracks.length} tracks</div>
                  </button>
                ))}
              </div>
              {activePlaylist && (
                <p className="text-[8px] text-white/30 italic mt-1 truncate">{activePlaylist.vibe}</p>
              )}
            </div>


            {/* Browse Library — manual song picker (playable tracks only) */}
            <div className="flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsLibraryOpen((v) => !v)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
              >
                <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest flex items-center gap-1.5">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.657-1.79 3-4 3s-4-1.343-4-3 1.79-3 4-3 4 1.343 4 3zm12-3c0 1.657-1.79 3-4 3s-4-1.343-4-3 1.79-3 4-3 4 1.343 4 3zM9 10l12-3" />
                  </svg>
                  Browse Library
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[9px] font-mono text-white/30">{playableTracks.length}</span>
                  <svg className={`w-3 h-3 text-white/40 transition-transform ${isLibraryOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>
              {isLibraryOpen && (
                <div className="mt-1.5 bg-white/5 border border-white/10 rounded-lg overflow-hidden">
                  <input
                    type="text"
                    value={librarySearch}
                    onChange={(e) => setLibrarySearch(e.target.value)}
                    placeholder="Search by title, artist, or BPM…"
                    className="w-full bg-transparent border-b border-white/10 px-2.5 py-1.5 text-[10px] text-white placeholder:text-white/30 focus:outline-none"
                    autoFocus
                  />
                  <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                    {(() => {
                      const q = librarySearch.trim().toLowerCase();
                      const filtered = playableTracks.filter((t) => {
                        if (!q) return true;
                        const hay = [
                          t["Track Name"],
                          t["Artist Name(s)"],
                          t.Genres ?? "",
                          String(t.Tempo),
                          t.Key,
                        ]
                          .join(" ")
                          .toLowerCase();
                        return hay.includes(q);
                      });
                      if (filtered.length === 0) {
                        return <p className="text-[10px] text-white/30 italic p-3 text-center">No match.</p>;
                      }
                      return filtered.map((t) => {
                        const isCurrent = t["Track Name"] === currentTrack["Track Name"];
                        return (
                          <button
                            key={t["Track Name"]}
                            type="button"
                            onClick={() => {
                              playTrack(t, false);
                              setIsLibraryOpen(false);
                              setLibrarySearch("");
                            }}
                            className={`w-full text-left px-2.5 py-1.5 flex items-center justify-between gap-2 border-b border-white/5 last:border-b-0 transition-colors ${
                              isCurrent ? "bg-cyan-500/10" : "hover:bg-white/5"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className={`text-[10px] font-bold truncate ${isCurrent ? "text-cyan-300" : "text-white/80"}`}>
                                {t["Track Name"]}
                              </p>
                              <p className="text-[9px] text-white/40 truncate">{t["Artist Name(s)"]}</p>
                            </div>
                            <div className="flex-shrink-0 flex items-center gap-1 text-[8px] font-mono">
                              <span className="px-1 py-0.5 bg-cyan-500/10 text-cyan-400/80 rounded">{t.Tempo}</span>
                              <span className="px-1 py-0.5 bg-fuchsia-500/10 text-fuchsia-400/80 rounded">{t.Key}</span>
                            </div>
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}
            </div>

            {/* Now Playing - Redesigned Card */}
            <div className="p-3 bg-white/5 rounded-xl border border-white/10 relative overflow-hidden flex-shrink-0">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent pointer-events-none" />
              <div className="min-w-0">
                <p className="text-[9px] text-white/30 uppercase font-bold mb-0.5">Now Playing</p>
                <p className="font-bold text-sm truncate leading-tight">{currentTrack["Track Name"]}</p>
                <p className="text-[10px] text-white/50 truncate">{currentTrack["Artist Name(s)"]}</p>
                <div className="flex gap-1.5 text-[9px] font-mono mt-1.5">
                  <span className="px-1.5 py-0.5 bg-cyan-500/20 text-cyan-400 rounded">{currentTrack.Tempo} BPM</span>
                  <span className="px-1.5 py-0.5 bg-fuchsia-500/20 text-fuchsia-400 rounded">{currentTrack.Key}</span>
                </div>
              </div>
              {/* Queue context from active playlist */}
              {activePlaylist && (() => {
                const plTracks = activePlaylist.tracks.map((name: string) => tracks.find(t => t["Track Name"] === name)).filter(Boolean) as Track[];
                const idx = plTracks.findIndex(t => t["Track Name"] === currentTrack["Track Name"]);
                if (idx === -1) return null;
                const prev = plTracks[idx - 1];
                const next = plTracks[idx + 1];
                return (
                  <div className="border-t border-white/10 pt-2 mt-2 space-y-1">
                    {prev && <div className="flex gap-2 opacity-40 items-center"><span className="text-[8px] text-white/40 w-3">↑</span><span className="text-[8px] text-white/60 truncate">{prev["Track Name"]}</span></div>}
                    <div className="flex gap-2 items-center"><div className="w-1.5 h-1.5 bg-cyan-400 rounded-full animate-pulse flex-shrink-0" /><span className="text-[8px] text-cyan-400 font-bold truncate">{currentTrack["Track Name"]}</span><span className="text-[8px] text-white/30 ml-auto flex-shrink-0">{idx+1}/{plTracks.length}</span></div>
                    {next && <div className="flex gap-2 opacity-40 items-center"><span className="text-[8px] text-white/40 w-3">↓</span><span className="text-[8px] text-white/60 truncate">{next["Track Name"]}</span></div>}
                  </div>
                );
              })()}
            </div>


            {/* Vibe Copilot Chatbot */}
            <div className="flex-1 flex flex-col bg-white/5 rounded-xl border border-white/10 overflow-hidden min-h-0">
              <div className="px-3 pt-2.5 pb-2 border-b border-white/10 flex-shrink-0 flex items-center justify-between">
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-fuchsia-500 rounded-full animate-pulse" />
                  Vibe Copilot
                </p>
                {activePlaylist && <span className="text-[8px] text-fuchsia-400 truncate max-w-[80px]">{activePlaylist.emoji} {activePlaylist.name}</span>}
              </div>
              <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {chatMessages.length === 0 ? (
                  <div className="px-1 py-3 space-y-2">
                    <p className="text-[10px] text-white/40 italic">
                      {activePlaylist
                        ? `Ask about "${activePlaylist.name}" or give me a command.`
                        : "Select a playlist or just tell me what you want."}
                    </p>
                    <div className="space-y-1 pt-1">
                      <p className="text-[9px] uppercase font-bold text-white/20 tracking-widest">Try</p>
                      <ul className="space-y-1 text-[10px] text-white/50">
                        <li>• &quot;find me something uplifting at 128 BPM and play it&quot;</li>
                        <li>• &quot;peak hour now&quot;</li>
                        <li>• &quot;skip&quot;  /  &quot;pause&quot;</li>
                        <li>• &quot;bridge into afro-house&quot;</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] text-[11px] leading-[1.55] px-3 py-2 rounded-xl whitespace-pre-wrap break-words ${
                        msg.role === 'user'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/20'
                          : 'bg-white/5 text-white/80 border border-white/10'
                      }`}>
                        {msg.content
                          ? renderChatContent(msg.content)
                          : <span className="opacity-50 animate-pulse">●●●</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-3 pb-3 pt-2 border-t border-white/10 flex-shrink-0">
                <div className="flex gap-2">
                  <input
                    type="text" value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                    placeholder={activePlaylist ? `Ask about ${activePlaylist.name}...` : 'Describe a vibe...'}
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-[10px] text-white placeholder:text-white/30 focus:outline-none focus:border-cyan-500/40"
                    disabled={isChatLoading}
                  />
                  <button onClick={sendChatMessage} disabled={isChatLoading || !chatInput.trim()}
                    className="w-8 h-8 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 flex items-center justify-center text-black transition-all flex-shrink-0">
                    {isChatLoading ? (
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"/><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75"/></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    )}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </aside>

        {/* Main Dashboard */}
        <section className="lg:col-span-6 flex flex-col h-full gap-4 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_2.2fr_1fr] gap-4 flex-shrink-0">
             <div className="bg-[#111111] border border-white/5 p-4 rounded-2xl min-h-[180px] flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <p className="text-[10px] text-white/40 uppercase font-bold">Energy Level</p>
                  {isPlaying && liveAudioEnergy != null && (
                    <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" title="Live RMS from the actual audio signal">
                      LIVE
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-5xl font-black text-cyan-400 leading-none">{displayEnergy.toFixed(0)}<span className="text-2xl text-cyan-400/60">%</span></p>
                  <div className="w-full h-1 bg-white/5 mt-3 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${displayEnergy}%` }} />
                  </div>
                </div>
             </div>

             {/* Live Floor Scan - Center Header */}
             <div className="bg-[#111111] border border-white/5 p-4 rounded-2xl h-full relative overflow-hidden flex items-end justify-center gap-[5px] min-h-[180px]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,255,0.05),transparent)] pointer-events-none" />

                {/* Live camera feed (simulated by a looping DJ-set video) */}
                {cameraConnected && (
                  <>
                    <video
                      src="/videos/dj-set-app.mp4"
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {/* Dark vignette + CRT scanline feel for UX flavour */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none" />
                    <div className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.04)_0px,rgba(255,255,255,0.04)_1px,transparent_1px,transparent_3px)] pointer-events-none mix-blend-overlay opacity-50" />
                  </>
                )}

                {/* Header badge */}
                <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest">
                    Live Floor Scan
                  </span>
                  {cameraConnected && (
                    <span className="text-[8px] font-mono px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                      CAM LIVE
                    </span>
                  )}
                </div>

                {/* Disconnect chip (top-right when connected) */}
                {cameraConnected && (
                  <button
                    type="button"
                    onClick={() => setCameraConnected(false)}
                    className="absolute top-3 right-3 z-10 text-[8px] font-mono px-2 py-0.5 rounded bg-black/50 hover:bg-black/70 text-white/60 hover:text-white border border-white/10 transition-colors"
                    title="Disconnect camera"
                  >
                    ✕ DISCONNECT
                  </button>
                )}

                {/* Empty state + Connect Camera button (centered when off) */}
                {!cameraConnected && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
                    <svg className="w-10 h-10 text-white/15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      <line x1="3" y1="3" x2="21" y2="21" strokeWidth={1.5} strokeLinecap="round" />
                    </svg>
                    <button
                      type="button"
                      onClick={() => setCameraConnected(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-[9px] font-bold uppercase tracking-widest transition-all shadow-[0_0_20px_rgba(0,255,255,0.15)]"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      Connect Camera
                    </button>
                  </div>
                )}
             </div>

             <div className="bg-[#111111] border border-white/5 p-4 rounded-2xl min-h-[180px] flex flex-col justify-between">
                <p className="text-[10px] text-white/40 uppercase font-bold">People Detected</p>
                <div>
                  <p className="text-5xl font-black text-fuchsia-500 leading-none">{crowdSize}</p>
                  <p className="text-[9px] text-white/40 mt-3 font-mono uppercase tracking-tighter opacity-60 truncate">DANCEFLOOR OCCUPANCY: {crowdSize > 250 ? 'PACKED' : crowdSize > 120 ? 'HIGH' : 'MEDIUM'}</p>
                </div>
             </div>
          </div>

          {/* Center Component: Spinning Vinyl Player */}
          <div className="bg-[#111111] border border-white/5 rounded-2xl flex-shrink-0 relative overflow-hidden flex flex-col items-center justify-center p-6 pb-8 h-72 min-h-[288px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(217,70,239,0.05),transparent)] pointer-events-none" />
            
            <div className="flex items-center justify-between w-full max-w-md z-10">
              {/* Previous Track Button */}
              <button 
                onClick={() => skipTrack('prev')}
                className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-cyan-400 transition-all border border-white/10 group flex-shrink-0"
              >
                <svg className="w-6 h-6 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>

              {/* Spinning Vinyl Record (click to play/pause) */}
              <button
                type="button"
                onClick={togglePlayPause}
                aria-label={isPlaying ? "Pause" : "Play"}
                className="relative w-40 h-40 flex items-center justify-center flex-shrink-0 mx-4 group cursor-pointer"
              >
                {/* Vinyl Grooves */}
                <div
                  className="absolute inset-0 rounded-full border-[20px] border-[#0a0a0a] shadow-2xl animate-[spin_4s_linear_infinite]"
                  style={{
                    background: 'radial-gradient(circle, #1a1a1a 30%, #050505 70%)',
                    animationPlayState: isPlaying ? 'running' : 'paused',
                  }}
                >
                  <div className="absolute inset-0 rounded-full border border-white/5 m-2" />
                  <div className="absolute inset-0 rounded-full border border-white/5 m-4" />
                  <div className="absolute inset-0 rounded-full border border-white/5 m-6" />
                </div>
                {/* Vinyl Label */}
                <div
                  className="absolute w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-fuchsia-500 animate-[spin_4s_linear_infinite] flex items-center justify-center shadow-inner"
                  style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                >
                  <div className="w-3 h-3 bg-[#050505] rounded-full" />
                </div>
                {/* Tonearm Accents */}
                <div className="absolute -right-6 top-4 w-2 h-20 bg-gradient-to-b from-zinc-700 to-zinc-900 rounded-full rotate-[15deg] origin-top opacity-50 shadow-lg pointer-events-none" />
                {/* Play/pause glyph overlay (fades in when paused OR on hover) */}
                <div
                  className={`absolute inset-0 flex items-center justify-center rounded-full transition-opacity duration-200 ${
                    isPlaying ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center border border-white/20">
                    {isPlaying ? (
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
                    ) : (
                      <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    )}
                  </div>
                </div>
              </button>

              {/* Next Track Button */}
              <button 
                onClick={() => skipTrack('next')}
                className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-cyan-400 transition-all border border-white/10 group flex-shrink-0"
              >
                <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            
            {/* Track Info Overlay */}
            <div className="mt-6 text-center z-10 w-full max-w-sm flex flex-col items-center gap-2">
               <h3 className="font-black text-lg truncate bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">{currentTrack["Track Name"]}</h3>
               <p className="text-xs text-white/40 truncate">{currentTrack["Artist Name(s)"]}</p>

               {/* Seek bar (visible when an audio file is mapped) */}
               {currentTrack.file ? (
                 <div className="w-full flex items-center gap-2 px-2 mt-1">
                   <span className="text-[9px] font-mono text-white/40 w-8 text-right">{formatTime(currentTime)}</span>
                   <input
                     type="range"
                     min={0}
                     max={duration || 0}
                     step={0.1}
                     value={currentTime}
                     onChange={(e) => seekTo(Number(e.target.value))}
                     className="flex-1 h-1 accent-cyan-400 cursor-pointer"
                   />
                   <span className="text-[9px] font-mono text-white/40 w-8">{formatTime(duration)}</span>
                 </div>
               ) : (
                 <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest mt-1">
                   Preview unavailable · drop MP3 in /songs
                 </div>
               )}
            </div>

            {/* Harmonic toggle - floating corner */}
            <div className="absolute bottom-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full">
              <span className="text-[8px] uppercase font-bold text-white/40">Harmonic</span>
              <button 
                onClick={() => setHarmonicMode(!harmonicMode)}
                className={`w-8 h-4 rounded-full transition-colors relative ${harmonicMode ? 'bg-cyan-500' : 'bg-white/10'}`}
              >
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${harmonicMode ? 'left-4.5' : 'left-0.5'}`} />
              </button>
            </div>
          </div>

          <div className="flex flex-col flex-1 overflow-hidden space-y-3 pb-2">
            <h2 className="text-base font-bold flex items-center gap-2 flex-shrink-0">
              <span className="w-1.5 h-1.5 bg-cyan-500 rounded-full" />
              AI TRACK PREDICTOR
            </h2>
            <div className="flex-1 overflow-y-auto pr-1 space-y-2 custom-scrollbar">
              {suggestions.map((track, i) => {
                const isHarmonic = compatibleKeys.includes(track.Key);
                return (
                  <div key={i} className="bg-[#111] border border-white/5 p-3 rounded-xl flex items-center justify-between group hover:border-white/20 transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center font-bold text-lg ${isHarmonic ? 'bg-fuchsia-500/10 text-fuchsia-500' : 'bg-cyan-500/10 text-cyan-400'}`}>
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm flex items-center gap-2 truncate">
                          {track["Track Name"]}
                          {isHarmonic && <span className="text-[8px] bg-fuchsia-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-tighter flex-shrink-0">Harmonic</span>}
                        </p>
                        <p className="text-[11px] text-white/40 truncate">{track["Artist Name(s)"]}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                       <div className="text-right items-end hidden sm:flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold text-white/20 uppercase tracking-tighter text-[8px]">MATCH SCORE</span>
                          <span className="text-[10px] font-mono text-cyan-400">BPM {track.Tempo} • NRG {Math.floor(track.Energy * 100)}</span>
                       </div>
                       <div className="flex gap-1.5">
                         <button onClick={() => dismissTrack(track)} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-white/40 hover:text-white">✖</button>
                         <button onClick={() => playTrack(track)} className="bg-white text-black font-bold px-3 py-1.5 rounded-lg text-[10px] hover:bg-cyan-400 transition-all transform active:scale-95">LOAD</button>
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Right Panel: Analytics & Learning Loop */}
        <section className="lg:col-span-3 flex flex-col h-full gap-4 overflow-hidden">
           <div className="bg-[#111111] border border-white/5 p-5 rounded-2xl h-full flex flex-col overflow-hidden gap-4">
              
              {/* Performance Graph (Moved to Top) */}
              <div className="pb-4 border-b border-white/5 flex-shrink-0 flex-[3] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] font-bold text-white/40 uppercase tracking-tighter underline decoration-cyan-500/50 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                    Performance Graph
                  </p>
                  <button 
                    onClick={handleViewReport}
                    disabled={isGeneratingReport}
                    className="flex items-center gap-1.5 text-[10px] font-black bg-cyan-500 text-black hover:bg-cyan-400 px-4 py-2 rounded-lg transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(0,255,255,0.3)] hover:shadow-[0_0_25px_rgba(0,255,255,0.5)] transform hover:-translate-y-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    {isGeneratingReport ? 'ANALYZING SET...' : 'VIEW AI REPORT'}
                  </button>
                </div>
                <div className="flex-1 w-full -ml-2 min-h-0 mt-3">
                   <ResponsiveContainer width="100%" height="100%">
                     <AreaChart data={energyHistory.slice(-30).map((e, i) => ({ index: i, energy: e }))}>
                       <defs>
                         <linearGradient id="colorEnergy" x1="0" y1="0" x2="0" y2="1">
                           <stop offset="5%" stopColor="#00FFFF" stopOpacity={0.5}/>
                           <stop offset="95%" stopColor="#00FFFF" stopOpacity={0}/>
                         </linearGradient>
                       </defs>
                       <Tooltip 
                         contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(0,255,255,0.2)', borderRadius: '8px', fontSize: '10px' }}
                         itemStyle={{ color: '#00FFFF' }}
                       />
                       <YAxis domain={[0, 100]} hide />
                       <Area 
                         type="monotone" 
                         dataKey="energy" 
                         stroke="#00FFFF" 
                         fillOpacity={1} 
                         fill="url(#colorEnergy)" 
                         strokeWidth={2}
                       />
                     </AreaChart>
                   </ResponsiveContainer>
                </div>
              </div>

              {/* Learning Loop Log */}
              <div className="flex-[7] flex flex-col overflow-hidden">
                <h2 className="text-xs font-bold uppercase tracking-widest text-white/40 mb-3 flex items-center gap-2 flex-shrink-0">
                  <span className="w-1.5 h-1.5 bg-fuchsia-500 rounded-full" />
                  Learning Loop
                </h2>
                
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar pb-2">
                  {feedbackLog.length === 0 ? (
                    <div className="text-center py-6 opacity-20">
                       <p className="text-[10px] font-mono uppercase">Awaiting DJ Actions</p>
                    </div>
                  ) : (
                    feedbackLog.map((log, i) => (
                      <div key={i} className="text-[10px] font-mono leading-relaxed bg-white/5 border border-white/5 p-3 rounded-lg animate-in slide-in-from-right duration-300">
                         <span className={log.includes('✅') ? 'text-cyan-400' : log.includes('❌') ? 'text-red-400' : 'text-fuchsia-400'}>
                           {log}
                         </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

           </div>
        </section>

      </div>

      <style jsx global>{`
        @keyframes bounce {
          to { transform: translateY(-50%); }
        }
        @keyframes equalizer-pulse {
          0%   { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
        @keyframes club-pulse {
          0% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.05); filter: brightness(1.2) contrast(1.1); }
          100% { transform: scale(1); filter: brightness(1); }
        }
        .animate-club-pulse {
          animation: club-pulse 4s infinite alternate ease-in-out;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 10px;
        }
      `}</style>

      {/* Full-Screen Loading Overlay */}
      {isGeneratingReport && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center p-8 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="flex flex-col items-center gap-6">
             <div className="relative w-24 h-24 flex items-center justify-center">
               <div className="absolute inset-0 rounded-full border-t-2 border-r-2 border-cyan-400 animate-spin" />
               <div className="absolute inset-2 rounded-full border-b-2 border-l-2 border-fuchsia-500 animate-[spin_1.5s_linear_infinite_reverse]" />
               <div className="w-4 h-4 rounded-full bg-white animate-pulse" />
             </div>
             
             <div className="text-center space-y-2">
               <h2 className="text-2xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500">
                 GENERATING REPORT
               </h2>
               <p className="text-white/40 text-[10px] uppercase font-mono tracking-widest">
                 Synthesizing Claude analysis...
               </p>
             </div>
           </div>
        </div>
      )}
    </main>
  );
}
