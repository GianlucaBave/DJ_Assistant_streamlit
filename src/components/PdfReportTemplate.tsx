"use client";

import React, { forwardRef, useState } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, CartesianGrid, ResponsiveContainer, YAxis, Tooltip } from 'recharts';
import { Track } from '@/lib/types';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';

interface PdfTemplateProps {
  currentTrack: Track;
  energyHistory: number[];
  crowdHistory: number[];
  bpmHistory: number[];
  keyHistory: string[];
  feedbackLog: string[];
  crowdSize: number;
  energy: number;
  setDuration: number;
  aiAnalysis: any;
}

export const PdfReportTemplate = forwardRef<HTMLDivElement, PdfTemplateProps>(
  ({ currentTrack, energyHistory, crowdHistory, bpmHistory, keyHistory, feedbackLog, crowdSize, energy, setDuration, aiAnalysis }, ref) => {
    
    // Safety check for empty analysis
    const analysis = aiAnalysis || {};
    const strengths = analysis.strengths || [];
    const weaknesses = analysis.weaknesses || [];
    const summary = analysis.summary_paragraph || "Analysis pending... Perform more actions to generate a detailed summary.";
    
    const [isExporting, setIsExporting] = useState(false);
    
    const handlePdfExport = async () => {
      const element = document.getElementById("pdf-report-content");
      if (!element) return;
      
      setIsExporting(true);
      try {
        // Temporarily hide close buttons from capture
        const actions = document.getElementById("pdf-actions");
        if (actions) actions.style.display = "none";
        
        // Capture exact pixels of the layout
        const dataUrl = await htmlToImage.toPng(element, {
          quality: 1.0,
          pixelRatio: 2,
          backgroundColor: '#050505',
          style: { transform: 'none' }
        });
        
        if (actions) actions.style.display = "flex";

        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
        });
        
        // Fit exactly to A4 proportions (210x297mm)
        pdf.addImage(dataUrl, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
        
        // Force foolproof download using exact mime type and file-saver
        const blob = pdf.output('blob');
        saveAs(blob, "crowdloop-ai-report.pdf");

      } catch (err) {
        console.error("PDF Export failed", err);
        alert("Failed to export PDF. Check console.");
      } finally {
        setIsExporting(false);
      }
    };
    
    return (
      <div 
        ref={ref} 
        className="w-full bg-[#050505] animate-in fade-in duration-500 font-sans"
      >
        <style>{`
          @media print {
            body * {
              visibility: hidden;
            }
            .print-container, .print-container * {
              visibility: visible;
            }
            .print-container {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              height: 100%;
              max-height: none !important;
              overflow: visible !important;
              box-shadow: none !important;
              border: none !important;
              background: #050505 !important;
            }
            .no-print {
              display: none !important;
            }
            @page {
              size: A4;
              margin: 10mm;
            }
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
          }
        `}</style>
        
        <div id="pdf-report-content" className="print-container relative w-full bg-[#050505] pb-12">
          
          {/* Top Left Navigation */}
          <div className="absolute top-4 left-4 sm:top-8 sm:left-8 z-50 no-print">
            <button 
              onClick={() => window.location.href = "/"}
              className="flex items-center gap-2 h-10 px-4 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-full font-bold text-[10px] tracking-wider transition-colors border border-white/10"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              DASHBOARD
            </button>
          </div>

          {/* Action Buttons (Right) */}
          <div id="pdf-actions" className="absolute top-4 right-4 sm:top-8 sm:right-8 z-50 flex gap-3 no-print">
            <button 
              onClick={handlePdfExport}
              disabled={isExporting}
              className="flex items-center gap-2 px-4 h-10 bg-cyan-500/20 hover:bg-cyan-500/40 text-cyan-400 rounded-full font-bold text-[10px] tracking-wider transition-colors border border-cyan-500/30 disabled:opacity-50"
            >
              {isExporting ? "CAPTURING..." : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  DOWNLOAD AS PDF
                </>
              )}
            </button>
          </div>

          <div className="pt-20 sm:pt-24 px-8 sm:px-12 relative max-w-[1400px] mx-auto w-full pb-20">
            {/* Decorative Background Elements */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px] pointer-events-none -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-96 h-96 bg-fuchsia-500/10 rounded-full blur-[100px] pointer-events-none translate-y-1/2 -translate-x-1/2" />

            {/* Header */}
            <div className="flex justify-between items-end border-b border-white/10 pb-6 mb-8 relative z-10 pr-12">
              <div>
                <h1 className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-cyan-400 to-fuchsia-500 bg-clip-text text-transparent mb-2 tracking-tight">
                  CROWDLOOP AI
                </h1>
                <p className="text-white/40 text-xs sm:text-sm uppercase tracking-widest font-bold">
                  Post-Set Analytics Report
                </p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-white/60 text-xs font-mono">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-white/40 text-[10px] uppercase mt-1">
                  Generated via Live Copilot
                </p>
              </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10 flex-1">
              
              {/* Left Column (AI Analysis & Set Metrics) */}
              <div className="lg:col-span-8 flex flex-col gap-6">
                
                {/* KPI Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                   <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                     <p className="text-[10px] text-white/40 uppercase font-bold mb-1">Set Duration</p>
                     <p className="text-2xl sm:text-3xl font-black text-white">{Math.floor(setDuration / 60)}m {setDuration % 60}s</p>
                     <p className="text-[9px] text-cyan-400/80 mt-1 uppercase">Live Elapsed Time</p>
                   </div>
                   <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                     <p className="text-[10px] text-white/40 uppercase font-bold mb-1">AI Score</p>
                     <p className="text-2xl sm:text-3xl font-black text-white">{analysis.overall_score || "N/A"}</p>
                     <p className="text-[9px] text-cyan-400/80 mt-1 uppercase">Out of 100</p>
                   </div>
                   <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                     <p className="text-[10px] text-white/40 uppercase font-bold mb-1">Energy Peak</p>
                     <p className="text-2xl sm:text-3xl font-black text-white">{Math.round(Math.max(...(energyHistory.length ? energyHistory : [0])))}%</p>
                     <p className="text-[9px] text-fuchsia-400/80 mt-1 uppercase">Max Crowd Energy</p>
                   </div>
                   <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                     <p className="text-[10px] text-white/40 uppercase font-bold mb-1">Energy Trend</p>
                     <p className="text-lg sm:text-xl font-black text-white capitalize mt-2 truncate">{analysis.energy_trend || "Stable"}</p>
                     <p className="text-[9px] text-white/40 mt-1 uppercase">Set trajectory</p>
                   </div>
                </div>

                {/* AI Diagnosis Details */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-6 flex-1">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-400 mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                    Copilot Executive Summary
                  </h2>
                  
                  <p className="text-sm text-white/90 leading-relaxed mb-6 italic border-l-2 border-cyan-500/50 pl-4 py-1">
                    "{summary}"
                  </p>

                  <div className="space-y-6">
                    {/* Strengths */}
                    <div>
                      <h3 className="text-xs font-bold text-[#00FF00] uppercase mb-3">Strengths Identified</h3>
                      <ul className="space-y-2">
                        {strengths.length > 0 ? strengths.map((s: string, i: number) => (
                          <li key={i} className="text-sm text-white/80 leading-relaxed flex items-start gap-2">
                            <span className="text-[#00FF00] mt-0.5">✓</span> {s}
                          </li>
                        )) : <li className="text-sm text-white/40 italic">No significant strengths detected.</li>}
                      </ul>
                    </div>

                    {/* Weaknesses */}
                    <div>
                      <h3 className="text-xs font-bold text-[#FF4444] uppercase mb-3">Areas for Improvement</h3>
                      <ul className="space-y-2">
                        {weaknesses.length > 0 ? weaknesses.map((w: string, i: number) => (
                          <li key={i} className="text-sm text-white/80 leading-relaxed flex items-start gap-2">
                            <span className="text-[#FF4444] mt-0.5">✕</span> {w}
                          </li>
                        )) : <li className="text-sm text-white/40 italic">No critical weaknesses detected.</li>}
                      </ul>
                    </div>

                    <div className="h-px w-full bg-white/10 my-4" />

                    {/* Recommendation */}
                    <div>
                      <h3 className="text-xs font-bold text-[#FFA500] uppercase mb-2">Copilot Recommendation</h3>
                      <p className="text-base text-white font-medium leading-relaxed bg-[#FFA500]/10 border border-[#FFA500]/20 p-4 rounded-lg">
                        {analysis.next_recommendation || "Maintain current trajectory while monitoring crowd flow."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column (Graph & Log) */}
              <div className="lg:col-span-4 flex flex-col gap-6">
                
                {/* Performance Graph */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 h-64 flex flex-col">
                  <h3 className="text-[10px] text-white/40 uppercase font-bold mb-4">Energy Performance</h3>
                  <div className="flex-1 w-full -ml-3">
                     <ResponsiveContainer width="100%" height="100%">
                       <AreaChart data={energyHistory.map((e, i) => ({ index: i, energy: e }))}>
                         <defs>
                           <linearGradient id="colorEnergyPdf" x1="0" y1="0" x2="0" y2="1">
                             <stop offset="5%" stopColor="#00FFFF" stopOpacity={0.8}/>
                             <stop offset="95%" stopColor="#00FFFF" stopOpacity={0}/>
                           </linearGradient>
                         </defs>
                         <YAxis domain={[0, 100]} hide />
                         <Area 
                           type="monotone" 
                           dataKey="energy" 
                           stroke="#00FFFF" 
                           fillOpacity={1} 
                           fill="url(#colorEnergyPdf)" 
                           strokeWidth={2}
                         />
                       </AreaChart>
                     </ResponsiveContainer>
                  </div>
                </div>

                {/* Track Feedback Log */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-5 flex-1 flex flex-col max-h-[400px]">
                  <h3 className="text-[10px] text-white/40 uppercase font-bold mb-4 flex-shrink-0">Track Event Log</h3>
                  <div className="space-y-3 overflow-y-auto custom-scrollbar pr-2 pb-2 flex-1">
                    {feedbackLog.map((log, i) => {
                      const isPositive = log.includes('✅');
                      const isNegative = log.includes('❌');
                      const textClass = isPositive ? 'text-cyan-400' : isNegative ? 'text-red-400' : 'text-fuchsia-400';
                      const bgClass = isPositive ? 'bg-cyan-400/10 border-cyan-400/20' : isNegative ? 'bg-red-400/10 border-red-400/20' : 'bg-fuchsia-400/10 border-fuchsia-400/20';
                      
                      return (
                        <div key={i} className={`text-[9px] font-mono leading-relaxed border p-2 rounded-lg ${bgClass}`}>
                           <span className={textClass}>
                             {log.replace(/[✅❌⚠️👀]/g, "").trim()}
                           </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

            {/* Bottom Row (Technical Graphs) */}
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
               {/* BPM Evolution Graph */}
               <div className="bg-white/5 border border-white/10 rounded-xl p-5 h-56 flex flex-col">
                  <h3 className="text-[10px] text-cyan-400 uppercase font-bold mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                    Tempo Progression (BPM)
                  </h3>
                  <div className="flex-1 w-full -ml-4">
                     <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={bpmHistory.map((bpm, i) => ({ index: i, bpm }))}>
                         <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                         <XAxis dataKey="index" hide />
                         <YAxis domain={['dataMin - 5', 'dataMax + 5']} tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.4)' }} axisLine={false} tickLine={false} width={30} />
                         <Tooltip 
                           contentStyle={{ backgroundColor: '#111', border: '1px solid rgba(0,255,255,0.2)', borderRadius: '8px', fontSize: '10px' }}
                           itemStyle={{ color: '#00FFFF' }}
                         />
                         <Line type="stepAfter" dataKey="bpm" stroke="#00FFFF" strokeWidth={2} dot={{ r: 2, fill: '#00FFFF' }} activeDot={{ r: 4 }} />
                       </LineChart>
                     </ResponsiveContainer>
                  </div>
               </div>

               {/* Harmonic Key Evolution */}
               <div className="bg-white/5 border border-white/10 rounded-xl p-5 h-56 flex flex-col">
                  <h3 className="text-[10px] text-fuchsia-400 uppercase font-bold mb-4 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-fuchsia-400 rounded-full" />
                    Harmonic Journey (Camelot Wheel)
                  </h3>
                  <div className="flex-1 w-full overflow-x-auto custom-scrollbar flex items-center pt-2 pb-4">
                    <div className="flex gap-2 min-w-max items-center h-12 px-2">
                      {keyHistory.map((k, i) => (
                        <div key={i} className="flex items-center">
                          <div className={`flex items-center justify-center h-8 px-3 rounded-lg text-xs font-bold font-mono transition-all border ${
                            i === keyHistory.length - 1 ? 'bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/50 shadow-[0_0_10px_rgba(217,70,239,0.3)]' : 'bg-white/5 text-white/60 border-white/10'
                          }`}>
                            {k}
                          </div>
                          {i < keyHistory.length - 1 && (
                            <div className="w-4 h-0.5 bg-white/10 mx-1" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="text-[9px] text-white/30 italic mt-auto">Displays the sequence of musical keys mixed during the set.</p>
               </div>
            </div>
            
            {/* Footer */}
            <div className="mt-12 pt-4 border-t border-white/10 text-center relative z-10">
               <p className="text-[9px] text-white/20 uppercase tracking-widest font-mono">
                 CROWDLOOP AI DJ COPILOT — PROPRIETARY ALGORITHMIC ANALYSIS
               </p>
            </div>

          </div>
        </div>
      </div>
    );
  }
);

PdfReportTemplate.displayName = "PdfReportTemplate";
