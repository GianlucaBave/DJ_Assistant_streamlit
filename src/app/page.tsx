"use client";

import { useState, useEffect, useMemo } from "react";
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
  
  const router = useRouter();

  // Stable bar configs — generated once, not on every energy re-render (avoids jolt)
  const barConfigs = useMemo(() => {
    return Array.from({ length: 18 }, () => ({
      variance: Math.random() * 0.6 + 0.4,
      duration: 0.12 + Math.random() * 0.28,
      delay: Math.random() * 0.3,
    }));
  }, []);

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

  const suggestions = getRecommendations(
    tracks,
    currentTrack.Tempo,
    energy,
    harmonicMode,
    currentTrack.Key
  );

  const compatibleKeys = getCompatibleKeys(currentTrack.Key);

  const playTrack = (track: Track, isAi: boolean = true) => {
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

  const skipTrack = (direction: 'next' | 'prev') => {
    let listToNavigate = tracks;
    if (activePlaylist) {
       listToNavigate = activePlaylist.tracks.map((trackName: string) => tracks.find(t => t["Track Name"] === trackName)).filter(Boolean) as Track[];
    }
    
    if (listToNavigate.length === 0) return;

    const currentIndex = listToNavigate.findIndex(t => t["Track Name"] === currentTrack["Track Name"]);
    let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    
    if (nextIndex >= listToNavigate.length) nextIndex = 0;
    if (nextIndex < 0) nextIndex = listToNavigate.length - 1;
    
    playTrack(listToNavigate[nextIndex], false);
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

  const sendChatMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg = { role: 'user' as const, content: chatInput.trim() };
    const updatedMsgs = [...chatMessages, userMsg];
    setChatMessages(updatedMsgs);
    setChatInput('');
    setIsChatLoading(true);
    
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: updatedMsgs,
          currentTrack,
          energy,
          crowdSize,
          activePlaylist: activePlaylist ? {
            name: activePlaylist.name,
            vibe: activePlaylist.vibe,
            tracks: activePlaylist.tracks,
            allPlaylists: playlists.map((p: Playlist) => ({ id: p.id, name: p.name, emoji: p.emoji, vibe: p.vibe, tracks: p.tracks }))
          } : { allPlaylists: playlists.map((p: Playlist) => ({ id: p.id, name: p.name, emoji: p.emoji, vibe: p.vibe, tracks: p.tracks })) }
        })
      });

      if (!res.ok || !res.body) throw new Error('Chat stream error');
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';
      // Add placeholder assistant message
      setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        assistantContent += decoder.decode(value, { stream: true });
        // Update last assistant message in place
        setChatMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1] = { role: 'assistant', content: assistantContent };
          return msgs;
        });
      }
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: '⚠️ Errore di connessione. Riprova.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <main className="relative h-screen bg-[#050505] text-white p-4 font-sans selection:bg-cyan-500/30 overflow-hidden flex flex-col">
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
                      // Auto-load first track of playlist
                      if (pl.id !== activePlaylist?.id) {
                        const firstTrack = tracks.find(t => t["Track Name"] === pl.tracks[0]);
                        if (firstTrack) playTrack(firstTrack, false);
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
              <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-4">
                    <p className="text-[10px] text-white/30 italic">{activePlaylist ? `Ask me about "${activePlaylist.name}" order or alternatives...` : 'Select a playlist or ask about vibes...'}</p>
                  </div>
                ) : (
                  chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] text-[10px] leading-relaxed px-2.5 py-2 rounded-xl ${
                        msg.role === 'user'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/20'
                          : 'bg-white/5 text-white/80 border border-white/10'
                      }`}>
                        {msg.content || <span className="opacity-50 animate-pulse">●●●</span>}
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-shrink-0">
             <div className="bg-[#111111] border border-white/5 p-4 rounded-2xl">
                <p className="text-[10px] text-white/40 uppercase font-bold mb-1">Energy Level</p>
                <p className="text-3xl font-black text-cyan-400">{energy.toFixed(0)}%</p>
                <div className="w-full h-1 bg-white/5 mt-3 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 transition-all duration-500" style={{ width: `${energy}%` }} />
                </div>
             </div>

             {/* Live Floor Scan - Center Header */}
             <div className="bg-[#111111] border border-white/5 p-4 rounded-2xl h-full relative overflow-hidden flex items-end justify-center gap-[5px] min-h-[96px]">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(0,255,255,0.05),transparent)] pointer-events-none" />
                <div className="absolute top-4 left-4 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Live Floor Scan</span>
                </div>
                {barConfigs.map((cfg, i) => {
                  const maxBarHeight = (energy / 100) * 50 + 10;
                  const barHeightPct = Math.max(6, maxBarHeight * cfg.variance);
                  const opacity = (energy / 100) * 0.7 + 0.3;
                  return (
                    <div key={i} className="flex-shrink-0 rounded-full bg-gradient-to-b from-cyan-400 via-cyan-500 to-fuchsia-500"
                      style={{ width: '4px', height: `${barHeightPct}%`, opacity, transformOrigin: 'center', animationName: 'equalizer-pulse', animationDuration: `${cfg.duration}s`, animationIterationCount: 'infinite', animationDirection: 'alternate', animationTimingFunction: 'ease-in-out', animationDelay: `${cfg.delay}s` }}
                    />
                  );
                })}
             </div>

             <div className="bg-[#111111] border border-white/5 p-4 rounded-2xl">
                <p className="text-[10px] text-white/40 uppercase font-bold mb-1">People Detected</p>
                <p className="text-3xl font-black text-fuchsia-500">{crowdSize}</p>
                <p className="text-[9px] text-white/40 mt-1 font-mono uppercase tracking-tighter opacity-50 truncate">DANCEFLOOR OCCUPANCY: HIGH</p>
             </div>
          </div>

          {/* Center Component: Spinning Vinyl Player */}
          <div className="bg-[#111111] border border-white/5 rounded-2xl flex-shrink-0 relative overflow-hidden flex flex-col items-center justify-center p-6 h-64 min-h-[256px]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(217,70,239,0.05),transparent)] pointer-events-none" />
            
            <div className="flex items-center justify-between w-full max-w-md z-10">
              {/* Previous Track Button */}
              <button 
                onClick={() => skipTrack('prev')}
                className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-cyan-400 transition-all border border-white/10 group flex-shrink-0"
              >
                <svg className="w-6 h-6 group-hover:-translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              </button>

              {/* Spinning Vinyl Record */}
              <div className="relative w-40 h-40 flex items-center justify-center flex-shrink-0 mx-4">
                {/* Vinyl Grooves */}
                <div className="absolute inset-0 rounded-full border-[20px] border-[#0a0a0a] shadow-2xl animate-[spin_4s_linear_infinite]"
                     style={{
                       background: 'radial-gradient(circle, #1a1a1a 30%, #050505 70%)',
                     }}>
                  <div className="absolute inset-0 rounded-full border border-white/5 m-2" />
                  <div className="absolute inset-0 rounded-full border border-white/5 m-4" />
                  <div className="absolute inset-0 rounded-full border border-white/5 m-6" />
                </div>
                {/* Vinyl Label */}
                <div className="absolute w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-fuchsia-500 animate-[spin_4s_linear_infinite] flex items-center justify-center shadow-inner">
                  <div className="w-3 h-3 bg-[#050505] rounded-full" />
                </div>
                {/* Tonearm Accents */}
                <div className="absolute -right-6 top-4 w-2 h-20 bg-gradient-to-b from-zinc-700 to-zinc-900 rounded-full rotate-[15deg] origin-top opacity-50 shadow-lg pointer-events-none" />
              </div>

              {/* Next Track Button */}
              <button 
                onClick={() => skipTrack('next')}
                className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-cyan-400 transition-all border border-white/10 group flex-shrink-0"
              >
                <svg className="w-6 h-6 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>
            
            {/* Track Info Overlay */}
            <div className="mt-6 text-center z-10 w-full max-w-sm flex flex-col items-center">
               <h3 className="font-black text-lg truncate bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">{currentTrack["Track Name"]}</h3>
               <p className="text-xs text-white/40 truncate">{currentTrack["Artist Name(s)"]}</p>
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
                 Synthesizing Groq LLM Analysis...
               </p>
             </div>
           </div>
        </div>
      )}
    </main>
  );
}
