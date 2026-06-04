"use client";

import { useState, useEffect } from "react";
import { 
  ArrowUpRight, ArrowDownRight, ArrowRight, BrainCircuit, Activity, 
  RefreshCw, ShieldCheck, TrendingUp, Target, ShieldAlert, Calculator, Presentation, FileText, ChevronRight, X, BarChart3
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PerformanceRatiosProps {
  clientId: string;
  selectedYear: number;
  mode?: "scores" | "ratios" | "all";
}

export default function PerformanceRatios({ clientId, selectedYear, mode = "all" }: PerformanceRatiosProps) {
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
    if (trend === "UP") return <ArrowUpRight className={`w-4 h-4 ${color}`} />;
    if (trend === "DOWN") return <ArrowDownRight className={`w-4 h-4 ${color}`} />;
    return <ArrowRight className={`w-4 h-4 text-slate-400`} />;
  };

  // Flatten ratios for tables and insights
  const allRatios = categories.flatMap((c: any) => c.ratios);

  return (
    <div className="space-y-8">
      {/* 1. Executive Summary Scorecards */}
      {(mode === "scores" || mode === "all") && (
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
      )}

      {/* 2. CFO Performance Metrics Grid (Ultra-Minimalist) */}
      {(mode === "ratios" || mode === "all") && (
        <>
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
        {/* Background Accent */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="flex items-center gap-3 mb-10 border-b border-white/5 pb-6 relative z-10">
          <Presentation className="w-8 h-8 text-cyan-400" />
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Executive Ratios</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Click any tile for detailed analysis</p>
          </div>
        </div>

        <div className="space-y-12 relative z-10">
          {categories.map((cat: any) => (
            <div key={cat.id} className="space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">{cat.name}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {cat.ratios.map((ratio: any) => (
                  <motion.div 
                    whileHover={{ y: -2, scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    key={ratio.id} 
                    onClick={() => setSelectedRatio(ratio)}
                    className="bg-[#1A1A24] hover:bg-[#20202A] p-6 rounded-2xl border border-white/5 hover:border-cyan-500/30 transition-all cursor-pointer shadow-lg flex flex-col justify-between h-32"
                  >
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-bold text-slate-300 leading-tight pr-4">{ratio.name}</p>
                      <span className="text-base shrink-0" title={ratio.status}>{getStatusDot(ratio.status)}</span>
                    </div>
                    
                    <div className="flex justify-between items-end">
                      <h4 className="text-3xl font-black text-white tracking-tighter">
                        {ratio.value === "N/A" ? <span className="text-slate-600 text-2xl">--</span> : ratio.value}
                      </h4>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 3. AI Financial Insights Panel */}
      <div className="bg-[#13131A] border border-indigo-500/20 rounded-3xl p-6 md:p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="flex items-center gap-3 mb-8 pb-6 border-b border-white/5 relative z-10">
          <BrainCircuit className="w-8 h-8 text-indigo-400" />
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">AI Financial Insights</h2>
            <p className="text-xs font-bold text-indigo-400/70 uppercase tracking-widest mt-1">Automated Management Commentary</p>
          </div>
        </div>

        <div className="space-y-6 relative z-10">
          {allRatios.map((r: any) => (
            <div key={r.id} className="flex gap-4 p-4 rounded-xl hover:bg-white/5 transition-colors">
              <span className="mt-0.5 text-lg shrink-0">{getStatusDot(r.status)}</span>
              <div>
                <p className="text-sm font-black text-white mb-1">{r.name}</p>
                <p className="text-sm font-medium text-slate-400 leading-relaxed">
                  {r.value === "N/A" 
                    ? "Data Unavailable: Insufficient ledger data mapped to calculate this metric." 
                    : r.insight}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Benchmark Comparison Table */}
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 md:p-10 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 mb-8 pb-6 border-b border-white/5">
          <BarChart3 className="w-8 h-8 text-emerald-400" />
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">Benchmark Comparison</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Industry Standard Targets vs Actuals</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs font-black text-slate-500 uppercase tracking-widest">
                <th className="py-4 px-4 font-black">Ratio</th>
                <th className="py-4 px-4 text-right">Company Actual</th>
                <th className="py-4 px-4 text-right text-emerald-400">Industry Target</th>
                <th className="py-4 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {allRatios.map((r: any, idx: number) => (
                <tr key={r.id} className={`border-b border-white/5 hover:bg-white/5 transition-colors ${idx % 2 === 0 ? 'bg-black/10' : ''}`}>
                  <td className="py-4 px-4 text-sm font-bold text-slate-300">{r.name}</td>
                  <td className="py-4 px-4 text-sm font-black text-white text-right">{r.value === "N/A" ? "--" : r.value}</td>
                  <td className="py-4 px-4 text-sm font-bold text-slate-400 text-right">{r.benchmark}</td>
                  <td className="py-4 px-4 text-center">{getStatusDot(r.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* 5. Click-to-Expand Side Drawer */}
      <AnimatePresence>
        {selectedRatio && (
          <>
            {/* Backdrop */}
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm"
              onClick={() => setSelectedRatio(null)}
            />
            {/* Drawer */}
            <motion.div 
              initial={{ x: "100%" }} 
              animate={{ x: 0 }} 
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 z-[210] w-full max-w-md bg-[#13131A] border-l border-white/10 shadow-2xl flex flex-col"
            >
              <div className="p-6 border-b border-white/5 bg-[#181821] flex justify-between items-center shrink-0">
                <h3 className="text-xl font-black text-white">{selectedRatio.shortName} Details</h3>
                <button 
                  onClick={() => setSelectedRatio(null)} 
                  className="w-8 h-8 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex-1 space-y-8">
                {/* Header */}
                <div>
                  <p className="text-sm font-bold text-slate-400 mb-1">{selectedRatio.name}</p>
                  <div className="flex items-end gap-4">
                    <p className="text-5xl font-black text-white">{selectedRatio.value === "N/A" ? "--" : selectedRatio.value}</p>
                    <div className="mb-2">{getStatusDot(selectedRatio.status)}</div>
                  </div>
                </div>

                {/* Target & Trend Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-black/30 border border-white/5 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Target</p>
                    <p className="text-sm font-black text-cyan-400">{selectedRatio.benchmark}</p>
                  </div>
                  <div className="bg-black/30 border border-white/5 p-4 rounded-2xl">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Trend</p>
                    <div className="flex items-center gap-2">
                      {getTrendIcon(selectedRatio.trend, selectedRatio.status)}
                      <span className="text-sm font-black text-white">{selectedRatio.trend}</span>
                    </div>
                  </div>
                </div>

                {/* Calculation Details */}
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Calculator className="w-4 h-4" /> Calculation
                  </h4>
                  <div className="px-4 py-3 bg-[#181821] rounded-xl border border-white/5 font-mono text-xs text-emerald-400">
                    {selectedRatio.formula}
                  </div>
                  
                  <div className="space-y-3 bg-black/20 p-4 rounded-2xl border border-white/5">
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
                <div className="space-y-4">
                  <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4" /> AI Commentary
                  </h4>
                  <div className="bg-indigo-500/10 border border-indigo-500/20 p-5 rounded-2xl">
                    <p className="text-sm text-indigo-100 leading-relaxed font-medium">
                      {selectedRatio.value === "N/A" 
                        ? "The calculation engine could not compute this ratio because the required ledger groups were not found in the sync data." 
                        : selectedRatio.insight}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
