"use client";

import { useState, useEffect } from "react";
import { 
  AlertOctagon, 
  AlertTriangle, 
  Info, 
  BellRing, 
  ArrowRight, 
  Activity, 
  TrendingUp, 
  TrendingDown, 
  ShieldAlert, 
  Box, 
  CheckCircle2, 
  HelpCircle, 
  X, 
  Calculator, 
  Layers, 
  Sparkles, 
  ArrowUpRight,
  Calendar,
  Clock
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { EarlyWarningAlert, EarlyWarningResult } from "@/lib/services/early-warning-engine";

export default function EarlyWarningSystem({ 
  clientId, 
  selectedYear,
  selectedMonth = "Apr",
  fyType = "APR_MAR"
}: { 
  clientId: string; 
  selectedYear: number;
  selectedMonth?: string;
  fyType?: "APR_MAR" | "JAN_DEC";
}) {
  const [data, setData] = useState<EarlyWarningResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<EarlyWarningAlert | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setData(null); // Clear previous month data immediately to prevent stale values

    async function fetchWarnings() {
      try {
        const res = await fetch(
          `/api/clients/${clientId}/early-warnings?year=${selectedYear}&month=${encodeURIComponent(selectedMonth)}&fyType=${fyType}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}: Failed to load early warnings`);
        }
        const json = await res.json();
        if (isMounted) {
          setData(json.data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err.message || "Failed to load risk warnings");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    fetchWarnings();

    return () => {
      isMounted = false;
    };
  }, [clientId, selectedYear, selectedMonth, fyType]);

  const getAlertStyles = (type: string) => {
    switch (type) {
      case "CRITICAL": return "bg-rose-500/10 border-rose-500/30 text-rose-400 hover:border-rose-500/60";
      case "HIGH": return "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:border-amber-500/60";
      case "MEDIUM": return "bg-yellow-500/10 border-yellow-500/30 text-yellow-400 hover:border-yellow-500/60";
      case "LOW": return "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:border-blue-500/60";
      default: return "bg-slate-500/10 border-slate-500/30 text-slate-400 hover:border-slate-500/60";
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "CRITICAL": return <AlertOctagon className="w-5 h-5 text-rose-400" />;
      case "HIGH": return <AlertTriangle className="w-5 h-5 text-amber-400" />;
      case "MEDIUM": return <Info className="w-5 h-5 text-yellow-400" />;
      case "LOW": return <BellRing className="w-5 h-5 text-blue-400" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "CASH_FLOW": return <Activity className="w-3.5 h-3.5" />;
      case "RECEIVABLES": return <TrendingUp className="w-3.5 h-3.5" />;
      case "COMPLIANCE": return <ShieldAlert className="w-3.5 h-3.5" />;
      case "OPERATIONAL": return <ArrowRight className="w-3.5 h-3.5" />;
      case "INVENTORY": return <Box className="w-3.5 h-3.5" />;
      default: return <Activity className="w-3.5 h-3.5" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-[#13131A] rounded-3xl border border-white/5 p-6 md:p-8 shadow-2xl">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-white/5 animate-pulse" />
            <div className="space-y-2">
              <div className="h-5 w-48 bg-white/5 rounded-md animate-pulse" />
              <div className="h-3 w-32 bg-white/5 rounded-md animate-pulse" />
            </div>
          </div>
          <div className="h-8 w-28 bg-white/5 rounded-xl animate-pulse" />
        </div>
        <div className="space-y-3">
          <div className="h-24 bg-white/5 rounded-2xl animate-pulse" />
          <div className="h-24 bg-white/5 rounded-2xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#13131A] rounded-3xl border border-rose-500/20 p-6 shadow-xl">
        <div className="flex items-center gap-3 text-rose-400">
          <AlertOctagon className="w-5 h-5" />
          <span className="text-sm font-semibold">Unable to calculate early warnings: {error}</span>
        </div>
      </div>
    );
  }

  const alerts = data?.alerts || [];
  const summary = data?.summary || { criticalCount: 0, highCount: 0, mediumCount: 0, lowCount: 0, totalCount: 0 };
  const dataSufficiency = data?.dataSufficiency;

  return (
    <div className="bg-[#13131A] rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden">
      {/* Dynamic Background Glow based on highest severity */}
      <div 
        className={`absolute top-0 right-0 w-[350px] h-[350px] rounded-full blur-[120px] pointer-events-none transition-all ${
          summary.criticalCount > 0 
            ? "bg-rose-500/10" 
            : summary.highCount > 0 
              ? "bg-amber-500/10" 
              : "bg-cyan-500/10"
        }`} 
      />

      {/* Header */}
      <div className="p-6 md:p-8 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border transition-all ${
            summary.criticalCount > 0
              ? "bg-gradient-to-br from-rose-500/20 to-amber-500/20 border-rose-500/30"
              : summary.highCount > 0
                ? "bg-gradient-to-br from-amber-500/20 to-yellow-500/20 border-amber-500/30"
                : "bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border-cyan-500/30"
          }`}>
            <BellRing className={`w-6 h-6 ${
              summary.criticalCount > 0 
                ? "text-rose-400 animate-pulse" 
                : summary.highCount > 0 
                  ? "text-amber-400" 
                  : "text-cyan-400"
            }`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-white tracking-tight">AI Early Warning System</h2>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-400">
                {data?.sector || "GENERAL"}
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {data?.periodLabel}
              </span>
            </div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
              Period-Aware CFO Risk Diagnostics • Window: {data?.calculationPeriod?.start} → {data?.calculationPeriod?.end}
            </p>
          </div>
        </div>

        {/* Live Dynamic Severity Counters */}
        <div className="flex items-center gap-2 flex-wrap">
          {summary.criticalCount > 0 && (
            <div className="px-3.5 py-1.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
              <span className="text-xs font-black text-rose-400">{summary.criticalCount} Critical</span>
            </div>
          )}
          {summary.highCount > 0 && (
            <div className="px-3.5 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span className="text-xs font-black text-amber-400">{summary.highCount} High Risk</span>
            </div>
          )}
          {summary.mediumCount > 0 && (
            <div className="px-3.5 py-1.5 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
              <span className="text-xs font-black text-yellow-400">{summary.mediumCount} Moderate</span>
            </div>
          )}
          {summary.totalCount === 0 && (
            <div className="px-3.5 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-black text-emerald-400">All Metrics Healthy for {data?.periodLabel}</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 md:p-8 relative z-10">
        {alerts.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#161622] border border-white/5 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-base font-bold text-white mb-1">
              No Material Early Warnings Detected for {data?.periodLabel}
            </h3>
            <p className="text-xs text-slate-400 max-w-md mb-4">
              All calculated financial indicators (Liquidity Runway, DSO, Concentration, Tax Accounts) for {data?.clientName} are within standard operating benchmarks for the period {data?.calculationPeriod?.start} to {data?.calculationPeriod?.end}.
            </p>
            {dataSufficiency && dataSufficiency.status !== "SUFFICIENT" && (
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-slate-400 text-[11px]">
                <Info className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  {dataSufficiency.totalVouchersInPeriod === 0 
                    ? `Based on ${dataSufficiency.totalLedgers} mapped ledger accounts.` 
                    : `Evaluated across ${dataSufficiency.totalVouchersInPeriod} synced vouchers in ${data?.periodLabel}.`}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence mode="wait">
              {alerts.map((alert, index) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08 }}
                  key={alert.id}
                  onClick={() => setSelectedAlert(alert)}
                  className={`flex flex-col md:flex-row gap-4 p-5 rounded-2xl border ${getAlertStyles(alert.type)} bg-[#171722] transition-all cursor-pointer group`}
                >
                  {/* Icon & Severity Badge */}
                  <div className="flex md:flex-col items-center justify-between md:justify-center gap-2 shrink-0 md:w-24">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-black/30 shadow-inner">
                      {getAlertIcon(alert.type)}
                    </div>
                    <span className="text-[9px] font-black uppercase tracking-[0.2em]">{alert.type}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest opacity-80">
                        {getCategoryIcon(alert.category)} {alert.category.replace("_", " ")}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-0.5 rounded border border-white/5">
                          {data?.periodLabel}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                          View Math & Audit Trail <ArrowUpRight className="w-3.5 h-3.5" />
                        </span>
                      </div>
                    </div>
                    <h3 className="text-base font-black text-white mb-1.5 group-hover:text-cyan-300 transition-colors">
                      {alert.title}
                    </h3>
                    <p className="text-sm font-medium opacity-90 leading-relaxed text-slate-300 max-w-3xl">
                      {alert.description}
                    </p>
                  </div>

                  {/* Metric Display */}
                  {alert.metric && (
                    <div className="flex flex-row md:flex-col justify-between md:justify-center items-center md:items-end shrink-0 md:pl-5 md:border-l border-white/5 pt-3 md:pt-0 border-t md:border-t-0">
                      <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">
                        Key Metric
                      </span>
                      <div className="flex items-center gap-2">
                        {alert.trend === "UP" && <TrendingUp className="w-4 h-4 text-rose-400" />}
                        {alert.trend === "DOWN" && <TrendingDown className="w-4 h-4 text-amber-400" />}
                        <span className="text-xl font-black text-white font-mono">{alert.metric}</span>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Audit Drill-Down Modal */}
      <AnimatePresence>
        {selectedAlert && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#161622] border border-white/10 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl relative text-slate-200"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-white/10 flex items-center justify-between sticky top-0 bg-[#161622]/95 backdrop-blur-md z-10">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-xl bg-black/40 border ${getAlertStyles(selectedAlert.type)}`}>
                    {getAlertIcon(selectedAlert.type)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Audit Drill-Down • {selectedAlert.category.replace("_", " ")}
                      </span>
                      <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                        {data?.periodLabel}
                      </span>
                    </div>
                    <h3 className="text-lg font-black text-white">{selectedAlert.title}</h3>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAlert(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* Period & Timeframe Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-black/30 border border-white/5 rounded-2xl p-4">
                  <div>
                    <span className="text-slate-400 flex items-center gap-1.5 mb-1 font-bold">
                      <Calendar className="w-3.5 h-3.5 text-cyan-400" /> Selected Period Window
                    </span>
                    <span className="font-mono font-bold text-white text-xs">
                      {selectedAlert.drilldown.periodAnalyzed}
                    </span>
                  </div>
                  {selectedAlert.drilldown.comparisonPeriod && (
                    <div>
                      <span className="text-slate-400 flex items-center gap-1.5 mb-1 font-bold">
                        <Clock className="w-3.5 h-3.5 text-amber-400" /> Comparison Prior Window
                      </span>
                      <span className="font-mono font-bold text-slate-300 text-xs">
                        {selectedAlert.drilldown.comparisonPeriod}
                      </span>
                    </div>
                  )}
                </div>

                {/* Mathematical Calculation & Formula */}
                <div className="bg-black/30 border border-white/5 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2 text-cyan-400">
                    <Calculator className="w-4 h-4" />
                    <h4 className="text-xs font-black uppercase tracking-wider">Calculation Formula & Math</h4>
                  </div>
                  <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-xl font-mono text-xs text-cyan-200 mb-3">
                    {selectedAlert.drilldown.formula}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-white/5 rounded-xl">
                      <span className="text-slate-400 block mb-1">Calculated Outcome</span>
                      <span className="font-bold text-white text-sm">{selectedAlert.drilldown.calculatedValue}</span>
                    </div>
                    <div className="p-3 bg-white/5 rounded-xl">
                      <span className="text-slate-400 block mb-1">Trigger Threshold</span>
                      <span className="font-bold text-amber-300 text-sm">{selectedAlert.drilldown.threshold}</span>
                    </div>
                  </div>
                </div>

                {/* Why Triggered */}
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Why Was This Warning Generated?</h4>
                  <p className="text-sm bg-white/5 border border-white/5 rounded-xl p-4 text-slate-300 leading-relaxed">
                    {selectedAlert.drilldown.reason}
                  </p>
                </div>

                {/* Strategic CFO Recommendation */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <Sparkles className="w-4 h-4" />
                    <h4 className="text-xs font-black uppercase tracking-wider">CFO Action Plan & Recommendation</h4>
                  </div>
                  <p className="text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-emerald-200 leading-relaxed font-medium">
                    {selectedAlert.drilldown.recommendation}
                  </p>
                </div>

                {/* Supporting Source Ledgers */}
                {selectedAlert.drilldown.supportingLedgers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-400">
                      <Layers className="w-4 h-4" />
                      <h4 className="text-xs font-black uppercase tracking-wider">Supporting Synced Ledgers (as of {data?.periodLabel})</h4>
                    </div>
                    <div className="border border-white/5 rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-white/5 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                          <tr>
                            <th className="p-2.5">Ledger Name</th>
                            <th className="p-2.5">Group</th>
                            <th className="p-2.5 text-right">Balance as of Month-End</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                          {selectedAlert.drilldown.supportingLedgers.map((l, i) => (
                            <tr key={i} className="hover:bg-white/5">
                              <td className="p-2.5">{l.name}</td>
                              <td className="p-2.5 text-slate-400">{l.group}</td>
                              <td className="p-2.5 text-right font-mono font-bold text-white">
                                ₹{Math.abs(l.amount).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-white/10 flex justify-end bg-black/20">
                <button
                  onClick={() => setSelectedAlert(null)}
                  className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all"
                >
                  Close Audit View
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
