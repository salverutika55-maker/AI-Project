"use client";

import { useState, useEffect } from "react";
import { BrainCircuit, Briefcase, Presentation, Target, Zap, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function StrategicAdvisoryDashboard({ clientId, selectedYear }: any) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/clients/${clientId}/ai-cfo?year=${selectedYear}`)
      .then(res => res.json())
      .then(resData => {
        setData(resData);
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to load Advisory Data", err);
        setLoading(false);
      });
  }, [clientId, selectedYear]);

  if (loading) {
    return (
      <div className="bg-[#13131A] rounded-3xl border border-white/5 p-8 shadow-xl flex items-center justify-center h-64">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mb-4" />
          <p className="text-slate-500 font-bold tracking-widest text-[10px] uppercase">Generating Strategic Advisory...</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 p-6 md:p-8 rounded-3xl border border-indigo-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-2xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="flex items-center gap-6 relative z-10">
          <div className="w-16 h-16 bg-[#13131A] rounded-2xl flex items-center justify-center border border-indigo-500/30 shadow-[0_0_30px_rgba(99,102,241,0.2)] shrink-0">
            <Briefcase className="w-8 h-8 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">Strategic CFO Advisory</h2>
            <p className="text-[11px] font-black text-indigo-400 uppercase tracking-[0.2em] mt-1">Automated Board Prep & Action Plans</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Board Meeting Prep & Management Commentary */}
        <div className="space-y-8">
          {/* Management Commentary */}
          <div className="bg-[#13131A] p-6 md:p-8 rounded-3xl border border-white/5 shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <BrainCircuit className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-black text-white">AI Management Commentary</h3>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed font-medium">
              {data.aiManagementCommentary}
            </p>
          </div>

          {/* Board Meeting Talking Points */}
          <div className="bg-[#13131A] p-6 md:p-8 rounded-3xl border border-white/5 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Presentation className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-black text-white">Board Meeting Insights</h3>
              </div>
              <button className="text-[10px] font-black uppercase tracking-widest text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1">
                Export Slides <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            
            <div className="space-y-4">
              {data.boardMeetingInsights.map((insight: string, idx: number) => (
                <div key={idx} className="flex items-start gap-4 p-4 bg-cyan-500/5 rounded-2xl border-l-2 border-cyan-500/50 hover:border-cyan-500 transition-colors">
                  <div className="w-6 h-6 bg-cyan-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-cyan-400 font-black text-[10px]">{idx + 1}</span>
                  </div>
                  <p className="text-sm text-slate-300 font-medium leading-relaxed">{insight}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: CFO Recommendations */}
        <div className="space-y-8">
          <div className="bg-[#13131A] p-6 md:p-8 rounded-3xl border border-white/5 shadow-xl h-full">
            <h3 className="text-lg font-black text-white mb-2">CFO Action Plan</h3>
            <p className="text-xs text-slate-500 font-medium mb-8">Prioritized operational and strategic directives based on current financial health.</p>

            {/* Immediate */}
            <div className="mb-10">
              <h4 className="text-sm font-black text-rose-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                <Zap className="w-4 h-4" /> Immediate Priorities (0-30 Days)
              </h4>
              <ul className="space-y-3">
                {data.cfoRecommendations.immediate.length > 0 ? data.cfoRecommendations.immediate.map((rec: string, i: number) => (
                  <motion.li 
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                    key={i} className="flex items-start gap-3 p-4 bg-rose-500/5 border border-rose-500/10 rounded-xl group hover:border-rose-500/30 transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" /> 
                    <span className="text-sm text-slate-300 font-medium">{rec}</span>
                  </motion.li>
                )) : <p className="text-slate-500 text-sm">No immediate crisis actions required.</p>}
              </ul>
            </div>

            {/* Strategic */}
            <div>
              <h4 className="text-sm font-black text-emerald-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                <Target className="w-4 h-4" /> Strategic Initiatives (90-365 Days)
              </h4>
              <ul className="space-y-3">
                {data.cfoRecommendations.strategic.length > 0 ? data.cfoRecommendations.strategic.map((rec: string, i: number) => (
                  <motion.li 
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + (i * 0.1) }}
                    key={i} className="flex items-start gap-3 p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-xl group hover:border-emerald-500/30 transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> 
                    <span className="text-sm text-slate-300 font-medium">{rec}</span>
                  </motion.li>
                )) : <p className="text-slate-500 text-sm">Maintain current strategic trajectory.</p>}
              </ul>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
