"use client";

import { useState, useEffect } from "react";
import { 
  ArrowUpRight, ArrowDownRight, ArrowRight, BrainCircuit, Activity, 
  RefreshCw, ShieldCheck, TrendingUp, Target, ShieldAlert, CheckCircle2, AlertTriangle, Calculator, Presentation, FileText
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PerformanceRatiosProps {
  clientId: string;
  selectedYear: number;
}

export default function PerformanceRatios({ clientId, selectedYear }: PerformanceRatiosProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [selectedRatio, setSelectedRatio] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/clients/${clientId}/ratios?year=${selectedYear}`)
      .then(res => res.json())
      .then(resData => {
        if (!resData.error) {
          setData(resData);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clientId, selectedYear]);

  if (loading) {
    return (
      <div className="bg-[#0A0A0C] border border-white/5 rounded-3xl p-8 shadow-2xl flex flex-col items-center justify-center min-h-[500px]">
        <RefreshCw className="w-10 h-10 text-cyan-500 animate-spin mb-4" />
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest animate-pulse">Initializing Executive Dashboard...</p>
      </div>
    );
  }

  if (!data || !data.categories) {
    return (
      <div className="bg-[#0A0A0C] border border-white/5 rounded-3xl p-8 shadow-2xl text-center min-h-[300px] flex items-center justify-center">
        <p className="text-slate-500 font-bold uppercase tracking-widest">Failed to load performance metrics.</p>
      </div>
    );
  }

  const { scores, categories } = data;

  const getStatusDot = (status: string) => {
    if (status === "EXCELLENT") return "🟢";
    if (status === "AVERAGE") return "🟡";
    if (status === "WARNING") return "🔴";
    return "⚪";
  };

  const getTrendIcon = (trend: string, status: string) => {
    const color = status === "EXCELLENT" ? "text-emerald-400" : status === "WARNING" ? "text-rose-400" : "text-amber-400";
    if (trend === "UP") return <ArrowUpRight className={`w-3 h-3 ${color}`} />;
    if (trend === "DOWN") return <ArrowDownRight className={`w-3 h-3 ${color}`} />;
    return <ArrowRight className={`w-3 h-3 text-slate-400`} />;
  };

  const getProgressWidth = (ratio: any) => {
    if (ratio.value === "N/A" || ratio.targetVal === 0) return 0;
    const actual = ratio.actualVal;
    const target = ratio.targetVal;
    let pct = (actual / target) * 100;
    if (ratio.inverse) { // e.g., DSO where lower is better
      pct = (target / actual) * 100;
    }
    return Math.min(100, Math.max(0, pct));
  };

  return (
    <div className="space-y-8">
      {/* 1. Executive Summary Scores Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
        {[
          { label: "Financial Health", score: scores.financialHealth, icon: Activity, color: "cyan" },
          { label: "Compliance", score: scores.compliance, icon: ShieldCheck, color: "emerald" },
          { label: "Cash Flow", score: scores.cashFlow, icon: RefreshCw, color: "indigo" },
          { label: "Risk Resilience", score: scores.risk, icon: ShieldAlert, color: "rose" },
          { label: "Growth Potential", score: scores.growth, icon: TrendingUp, color: "amber" }
        ].map((score, idx) => (
          <div key={idx} className="bg-[#13131A] p-5 rounded-2xl border border-white/5 flex items-center justify-between shadow-xl">
            <div>
              <div className={`w-8 h-8 rounded-full bg-${score.color}-500/10 flex items-center justify-center mb-2`}>
                <score.icon className={`w-4 h-4 text-${score.color}-400`} />
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{score.label}</p>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-white">{score.score}</span>
              <span className="text-xs text-slate-500 font-bold">/100</span>
            </div>
          </div>
        ))}
      </div>

      {/* 2. CFO Performance Metrics Grid */}
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
        {/* Background Accent */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="flex items-center gap-3 mb-10 border-b border-white/5 pb-6">
          <Presentation className="w-8 h-8 text-cyan-400" />
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Enterprise Ratios</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Board-Level Financial Metrics</p>
          </div>
        </div>

        <div className="space-y-12 relative z-10">
          {categories.map((cat: any) => (
            <div key={cat.id} className="space-y-5">
              <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest flex items-center gap-2">
                <Target className="w-4 h-4 text-slate-500" /> {cat.name}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
                {cat.ratios.map((ratio: any) => (
                  <motion.div 
                    whileHover={{ y: -4 }}
                    key={ratio.id} 
                    onClick={() => setSelectedRatio(ratio)}
                    className="bg-[#181821] hover:bg-[#1C1C26] p-5 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition-all cursor-pointer shadow-lg group flex flex-col justify-between"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{ratio.shortName}</p>
                          <p className="text-xs font-black text-slate-300 leading-tight">{ratio.name}</p>
                        </div>
                        <div className="text-[10px] font-black uppercase flex flex-col items-end gap-1">
                          <span className={ratio.status === "EXCELLENT" ? "text-emerald-400" : ratio.status === "WARNING" ? "text-rose-400" : "text-amber-400"}>
                            {getStatusDot(ratio.status)} {ratio.status}
                          </span>
                        </div>
                      </div>
                      
                      {/* Metric Value */}
                      <div className="flex items-end gap-2 mb-6">
                        <h4 className="text-4xl font-black text-white tracking-tighter">
                          {ratio.value === "N/A" ? <span className="text-slate-600 text-3xl">--</span> : ratio.value}
                        </h4>
                        {ratio.value !== "N/A" && (
                          <div className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-500 mb-1.5 px-2 py-0.5 bg-black/30 rounded-md">
                            {getTrendIcon(ratio.trend, ratio.status)} {ratio.trend}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Benchmark Mini Bar */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                        <span className="text-slate-500">Benchmark</span>
                        <span className="text-cyan-400">{ratio.benchmark}</span>
                      </div>
                      <div className="h-1.5 w-full bg-black/40 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-1000 ${ratio.status === "EXCELLENT" ? "bg-emerald-400" : ratio.status === "WARNING" ? "bg-rose-400" : "bg-amber-400"}`}
                          style={{ width: ratio.value === "N/A" ? '0%' : `${getProgressWidth(ratio)}%` }} 
                        />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Dedicated AI Financial Insights Panel */}
      <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-3xl p-6 md:p-10 shadow-2xl">
        <div className="flex items-center gap-3 mb-8 pb-4 border-b border-indigo-500/20">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
            <BrainCircuit className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-indigo-100">AI Financial Insights</h3>
            <p className="text-xs font-bold text-indigo-400/70 uppercase tracking-widest">Automated Management Commentary</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6">
          {categories.flatMap((c: any) => c.ratios).map((r: any) => (
            <div key={r.id} className="flex gap-4">
              <span className="mt-1 text-sm shrink-0">{getStatusDot(r.status)}</span>
              <div>
                <span className="text-sm font-black text-white">{r.name}: </span>
                <span className="text-sm font-medium text-slate-300 leading-relaxed">{r.insight}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Drill-Down Modal */}
      <AnimatePresence>
        {selectedRatio && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setSelectedRatio(null)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-[#13131A] border border-white/10 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden z-10"
            >
              <div className="p-8 border-b border-white/5 bg-[#181821] flex justify-between items-start">
                <div>
                  <p className="text-[10px] font-black text-cyan-400 uppercase tracking-widest mb-2">Detailed Metric Analysis</p>
                  <h3 className="text-2xl font-black text-white">{selectedRatio.name}</h3>
                </div>
                <button onClick={() => setSelectedRatio(null)} className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                  ✕
                </button>
              </div>

              <div className="p-8 space-y-8">
                {/* Metric Hero */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Current Value</p>
                    <p className="text-4xl font-black text-white">{selectedRatio.value === "N/A" ? "--" : selectedRatio.value}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Status</p>
                    <div className={`px-3 py-1.5 rounded-lg border text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 ${selectedRatio.status === "EXCELLENT" ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" : selectedRatio.status === "WARNING" ? "text-rose-400 bg-rose-500/10 border-rose-500/20" : "text-amber-400 bg-amber-500/10 border-amber-500/20"}`}>
                      {getStatusDot(selectedRatio.status)} {selectedRatio.status}
                    </div>
                  </div>
                </div>

                {/* Calculation Breakdown */}
                <div className="bg-black/30 border border-white/5 p-6 rounded-2xl">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 mb-4">
                    <Calculator className="w-4 h-4" /> Calculation Logic
                  </p>
                  <div className="px-4 py-3 bg-[#181821] rounded-xl border border-white/5 font-mono text-xs text-cyan-400 mb-6">
                    {selectedRatio.formula}
                  </div>
                  
                  <div className="space-y-3">
                    {selectedRatio.components.map((c: any, i: number) => (
                      <div key={i} className="flex justify-between items-center text-sm">
                        <span className="text-slate-400 font-medium">{c.name}</span>
                        <span className="text-white font-mono font-bold">
                          {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(c.val || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* AI Insight */}
                <div className="bg-indigo-500/10 border border-indigo-500/20 p-6 rounded-2xl flex items-start gap-4">
                  <BrainCircuit className="w-6 h-6 text-indigo-400 shrink-0" />
                  <p className="text-sm text-indigo-100 leading-relaxed font-medium">
                    {selectedRatio.value === "N/A" 
                      ? "The calculation engine could not compute this ratio because the required ledger groups were not found in the sync data." 
                      : selectedRatio.insight}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
