"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PdfReportTemplate } from "@/components/PdfReportTemplate";

export default function ReportPage() {
  const [reportData, setReportData] = useState<any>(null);
  const [isMounted, setIsMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
    // Retrieve the session data that was serialized by the dashboard
    const savedData = sessionStorage.getItem('crowdloop_report_data');
    
    if (savedData) {
      try {
        setReportData(JSON.parse(savedData));
      } catch (err) {
        console.error("Failed to parse report session data");
        router.push('/');
      }
    } else {
      // If no data exists (user navigated here directly or refreshed), send them back
      router.push('/');
    }
  }, [router]);

  // Loading state while verifying session data
  if (!isMounted || !reportData) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-t-2 border-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <PdfReportTemplate 
      currentTrack={reportData.currentTrack}
      energyHistory={reportData.energyHistory}
      crowdHistory={reportData.crowdHistory}
      bpmHistory={reportData.bpmHistory}
      keyHistory={reportData.keyHistory}
      feedbackLog={reportData.feedbackLog}
      crowdSize={reportData.crowdSize}
      energy={reportData.energy}
      setDuration={reportData.setDuration}
      aiAnalysis={reportData.aiAnalysis}
    />
  );
}
