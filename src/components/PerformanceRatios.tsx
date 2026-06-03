"use client";

import { useState, useEffect, useMemo } from "react";
import { ArrowUpRight, ArrowDownRight, ArrowRight, BrainCircuit, Activity, RefreshCw } from "lucide-react";

interface PerformanceRatiosProps {
  clientId: string;
  selectedYear: number;
}

export default function PerformanceRatios({ clientId, selectedYear }: PerformanceRatiosProps) {
  const [loading, setLoading] = useState(true);
  const [ratios, setRatios] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/clients/${clientId}/ratios?year=${selectedYear}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setRatios(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clientId, selectedYear]);

  const categories = useMemo(() => {
    const cats: Record<string, any[]> = {};
    ratios.forEach(r => {
      if (!cats[r.category]) cats[r.category] = [];
      cats[r.category].push(r);
    });
    return cats;
  }, [ratios]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "EXCELLENT": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "AVERAGE": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "WARNING": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      default: return "text-slate-400 bg-white/5 border-white/10";
    }
  };

  const getStatusDot = (status: string) => {
    switch (status) {
      case "EXCELLENT": return "🟢";
      case "AVERAGE": return "🟡";
      case "WARNING": return "🔴";
      default: return "⚪";
    }
  };

  const getTrendIcon = (trend: string, status: string) => {
    const color = status === "EXCELLENT" ? "text-emerald-400" : status === "WARNING" ? "text-rose-400" : "text-amber-400";
    if (trend === "UP") return <ArrowUpRight className={`w-4 h-4 ${color}`} />;
    if (trend === "DOWN") return <ArrowDownRight className={`w-4 h-4 ${color}`} />;
    return <ArrowRight className={`w-4 h-4 text-slate-400`} />;
  };

  if (loading) {
    return (
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-8 shadow-xl flex flex-col items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin mb-4" />
        <p className="text-sm font-bold text-slate-400 uppercase tracking-widest animate-pulse">Running Financial Models...</p>
      </div>
    );
  }

  return (
    <div className="bg-[#13131A] border border-white/5 rounded-3xl p-8 shadow-xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h3 className="text-xl font-black text-white flex items-center gap-3">
            <Activity className="w-6 h-6 text-indigo-400" /> CFO Performance Dashboard
          </h3>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">AI-Powered Financial Intelligence</p>
        </div>
      </div>

      {Object.keys(categories).length === 0 ? (
        <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl">
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Insufficient ledger data to calculate ratios</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(categories).map(([category, items]) => (
            <div key={category} className="space-y-4">
              <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest pb-2 border-b border-white/5">{category} Ratios</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {items.map((ratio) => (
                  <div key={ratio.id} className="bg-black/20 p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex flex-col 2xl:flex-row justify-between items-start gap-3 mb-4">
                        <p className="text-xs font-black text-slate-300 uppercase tracking-wide leading-relaxed">{ratio.name}</p>
                        <div className={`px-2 py-1 rounded border text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shrink-0 ${getStatusColor(ratio.status)}`}>
                          {getStatusDot(ratio.status)} {ratio.status}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-end gap-3 mb-4">
                        <p className="text-3xl font-black text-white">{ratio.value}</p>
                        {ratio.value !== "N/A" && (
                          <div className="flex items-center gap-1 text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5" title="Trend vs Prev. Period">
                            {getTrendIcon(ratio.trend, ratio.status)} {ratio.trend}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center bg-white/5 px-3 py-2 rounded-lg mb-4 gap-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Benchmark</span>
                        <span className="text-[10px] font-black text-cyan-400">{ratio.benchmark}</span>
                      </div>
                    </div>

                    <div className="bg-indigo-500/5 border border-indigo-500/10 p-4 rounded-xl flex items-start gap-3 mt-2">
                      <BrainCircuit className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-slate-300 font-medium leading-relaxed">{ratio.insight}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
