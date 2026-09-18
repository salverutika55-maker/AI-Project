"use client";

import { useState, useEffect } from "react";
import { 
  X, BrainCircuit, Activity, TrendingUp, TrendingDown, AlertTriangle, Target, CheckCircle2, 
  Zap, PieChart, Users, Building, ShieldAlert, FileText, Banknote, ShieldCheck, 
  RefreshCw, Briefcase, FileSignature, Presentation, HelpCircle, Layers, Calculator,
  ArrowUpRight, Clock, Calendar, Sparkles, ChevronRight, AlertOctagon, Scale
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { CfoMisReportResult, CfoInsightCard } from "@/lib/services/cfo-mis-engine";

interface AICFOReportProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  selectedYear: number;
  selectedMonth?: string;
  fyType?: "APR_MAR" | "JAN_DEC";
}

export default function AICFOReport({ 
  isOpen, 
  onClose, 
  clientId, 
  clientName, 
  selectedYear,
  selectedMonth = "Apr",
  fyType = "APR_MAR"
}: AICFOReportProps) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<CfoMisReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedDrilldown, setSelectedDrilldown] = useState<CfoInsightCard | null>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      setError(null);
      setReport(null);

      fetch(`/api/clients/${clientId}/ai-cfo?year=${selectedYear}&month=${encodeURIComponent(selectedMonth)}&fyType=${fyType}`, {
        cache: "no-store"
      })
        .then(async res => {
          if (!res.ok) {
            const errJson = await res.json().catch(() => ({}));
            throw new Error(errJson.error || `HTTP ${res.status}: Failed to generate CFO report`);
          }
          return res.json();
        })
        .then(data => {
          setReport(data);
          setLoading(false);
        })
        .catch(err => {
          console.error("Failed to load CFO Report", err);
          setError(err.message || "Failed to load CFO report");
          setLoading(false);
        });
    } else {
      setReport(null);
    }
  }, [isOpen, clientId, selectedYear, selectedMonth, fyType]);

  if (!isOpen) return null;

  const formatCurrency = (val: number, compact = false) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
      notation: compact ? "compact" : "standard"
    }).format(val);
  };

  const getPriorityStyle = (priority: string) => {
    switch (priority) {
      case "IMMEDIATE":
        return "bg-rose-500/10 border-rose-500/30 text-rose-400";
      case "MANAGEMENT_ATTENTION":
        return "bg-amber-500/10 border-amber-500/30 text-amber-400";
      default:
        return "bg-cyan-500/10 border-cyan-500/30 text-cyan-400";
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex justify-center bg-[#0A0A0C]/95 backdrop-blur-md animate-in fade-in duration-300">
      
      {/* Main Document Container */}
      <div className="w-full max-w-6xl bg-[#0A0A0C] border-x border-white/10 shadow-2xl flex flex-col h-full relative animate-in slide-in-from-bottom-8 duration-500">
        
        {/* Sticky Header */}
        <div className="h-24 border-b border-white/5 bg-[#0A0A0C]/90 backdrop-blur-xl flex items-center justify-between px-6 md:px-10 shrink-0 sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/30 shadow-lg shadow-indigo-500/10">
              <BrainCircuit className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl md:text-2xl font-black text-white tracking-tight">AI CFO MIS Insight Engine</h1>
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                  {report?.sector || "CORPORATE"}
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">
                  {report?.periodLabel || `${selectedMonth} ${selectedYear}`}
                </span>
              </div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                {clientName} • Data-Driven CFO Management Decision Support
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-3 bg-white/5 hover:bg-rose-500/20 rounded-xl text-slate-400 hover:text-rose-400 transition-colors border border-transparent hover:border-rose-500/30"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Document Body */}
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 p-6 md:p-10">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-indigo-400 min-h-[500px]">
              <div className="relative w-28 h-28 mb-8">
                <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                <BrainCircuit className="absolute inset-0 m-auto w-10 h-10 text-indigo-500 animate-pulse" />
              </div>
              <h3 className="text-2xl font-black text-white mb-2 tracking-tight">Generating CFO MIS Insights...</h3>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest animate-pulse">
                Auditing Ledger Elasticity • Calculating Working Capital Velocity • Generating Management Questions
              </p>
            </div>
          ) : error ? (
            <div className="p-8 rounded-3xl bg-rose-500/10 border border-rose-500/20 text-center max-w-xl mx-auto my-12">
              <AlertOctagon className="w-10 h-10 text-rose-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-white mb-2">Unable to Generate CFO Report</h3>
              <p className="text-sm text-slate-400 leading-relaxed mb-4">{error}</p>
              <button 
                onClick={onClose}
                className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold text-white transition-all"
              >
                Close Report
              </button>
            </div>
          ) : report ? (
            <div className="max-w-5xl mx-auto space-y-12 pb-20 animate-in fade-in duration-700">
              
              {/* ========================================================================= */}
              {/* SECTION 1: EXECUTIVE CFO TAKEAWAY & HEADLINE KPI CARDS                   */}
              {/* ========================================================================= */}
              <section className="space-y-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <Activity className="w-6 h-6 text-indigo-400" />
                    <h2 className="text-xl font-black text-white">Executive CFO Takeaway</h2>
                  </div>
                  <span className="text-xs font-mono text-slate-400">
                    Window: {report.calculationPeriod.start} → {report.calculationPeriod.end}
                  </span>
                </div>

                {/* KPI Cards Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                  {[
                    { label: "Revenue", val: formatCurrency(report.executiveTakeaway.headlineMetrics.revenue, true), sub: `${report.executiveTakeaway.headlineMetrics.revenueGrowthPct >= 0 ? "+" : ""}${report.executiveTakeaway.headlineMetrics.revenueGrowthPct.toFixed(1)}% vs Prior`, color: "text-emerald-400" },
                    { label: "Gross Profit", val: formatCurrency(report.executiveTakeaway.headlineMetrics.grossProfit, true), sub: `${report.executiveTakeaway.headlineMetrics.grossMarginPct.toFixed(1)}% Margin`, color: "text-cyan-400" },
                    { label: "Net Profit", val: formatCurrency(report.executiveTakeaway.headlineMetrics.netProfit, true), sub: `${report.executiveTakeaway.headlineMetrics.netMarginPct.toFixed(1)}% Margin`, color: report.executiveTakeaway.headlineMetrics.netProfit < 0 ? "text-rose-400" : "text-emerald-400" },
                    { label: "Cash & Bank", val: formatCurrency(report.executiveTakeaway.headlineMetrics.cashBalance, true), sub: `${report.executiveTakeaway.headlineMetrics.cashRunwayDays > 365 ? "> 1 Yr" : `${report.executiveTakeaway.headlineMetrics.cashRunwayDays}d`} Runway`, color: report.executiveTakeaway.headlineMetrics.cashRunwayDays < 30 ? "text-amber-400" : "text-emerald-400" },
                    { label: "Trade Receivables", val: formatCurrency(report.executiveTakeaway.headlineMetrics.totalReceivables, true), sub: "Sundry Debtors", color: "text-indigo-400" },
                    { label: "Net Working Capital", val: formatCurrency(report.executiveTakeaway.headlineMetrics.netWorkingCapital, true), sub: report.executiveTakeaway.headlineMetrics.netWorkingCapital < 0 ? "Deficit" : "Surplus", color: report.executiveTakeaway.headlineMetrics.netWorkingCapital < 0 ? "text-rose-400" : "text-cyan-400" }
                  ].map((kpi, idx) => (
                    <div key={idx} className="bg-[#13131A] p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{kpi.label}</p>
                      <p className={`text-lg font-black ${kpi.color}`}>{kpi.val}</p>
                      <p className="text-[10px] text-slate-400 font-medium mt-1">{kpi.sub}</p>
                    </div>
                  ))}
                </div>

                {/* Synthesis Grid */}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-[#13131A] p-5 rounded-2xl border border-white/5 space-y-3">
                    <div className="flex items-center gap-2 text-indigo-400">
                      <Sparkles className="w-4 h-4" />
                      <h4 className="text-xs font-black uppercase tracking-wider">Overall Financial Posture</h4>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed font-medium">
                      {report.executiveTakeaway.overallPosition}
                    </p>
                  </div>

                  <div className="bg-rose-500/10 p-5 rounded-2xl border border-rose-500/20 space-y-3">
                    <div className="flex items-center gap-2 text-rose-400">
                      <Zap className="w-4 h-4" />
                      <h4 className="text-xs font-black uppercase tracking-wider">Immediate Management Priority</h4>
                    </div>
                    <p className="text-sm text-rose-200 leading-relaxed font-medium">
                      {report.executiveTakeaway.immediateManagementAttention}
                    </p>
                  </div>
                </div>
              </section>

              {/* ========================================================================= */}
              {/* SECTION 2: WHAT CHANGED THIS PERIOD (MATERIAL MOVEMENTS)                 */}
              {/* ========================================================================= */}
              <section className="space-y-4">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <RefreshCw className="w-6 h-6 text-cyan-400" />
                  <h2 className="text-xl font-black text-white">What Changed This Period (Variance Analysis)</h2>
                </div>

                <div className="border border-white/5 rounded-2xl overflow-hidden bg-[#13131A]">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-white/5 text-slate-400 uppercase font-black tracking-wider text-[10px] border-b border-white/5">
                      <tr>
                        <th className="p-3.5">Financial Metric</th>
                        <th className="p-3.5 text-right">{report.selectedMonth} (Current)</th>
                        <th className="p-3.5 text-right">Previous Period</th>
                        <th className="p-3.5 text-right">Absolute Change</th>
                        <th className="p-3.5 text-right">% Change</th>
                        <th className="p-3.5 text-center">Direction</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                      {report.materialMovements.map((mov, i) => (
                        <tr key={i} className="hover:bg-white/5 transition-colors">
                          <td className="p-3.5 font-bold text-white">{mov.metric}</td>
                          <td className="p-3.5 text-right font-mono font-bold text-white">{formatCurrency(mov.currentValue)}</td>
                          <td className="p-3.5 text-right font-mono text-slate-400">{formatCurrency(mov.previousValue)}</td>
                          <td className={`p-3.5 text-right font-mono font-bold ${mov.absoluteChange >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {mov.absoluteChange >= 0 ? "+" : ""}{formatCurrency(mov.absoluteChange)}
                          </td>
                          <td className="p-3.5 text-right font-mono font-bold">
                            {mov.percentageChange >= 0 ? "+" : ""}{mov.percentageChange}%
                          </td>
                          <td className="p-3.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              mov.direction === "IMPROVING" 
                                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" 
                                : mov.direction === "DETERIORATING"
                                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                  : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                            }`}>
                              {mov.direction}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ========================================================================= */}
              {/* SECTION 3: CORE CFO MANAGEMENT INSIGHTS (OBSERVATION -> ACTION)           */}
              {/* ========================================================================= */}
              <section className="space-y-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <Target className="w-6 h-6 text-emerald-400" />
                    <h2 className="text-xl font-black text-white">CFO Management Diagnostic Findings</h2>
                  </div>
                  <span className="text-xs text-slate-400 font-bold">
                    {report.structuredInsights.length} Material Insights Generated
                  </span>
                </div>

                <div className="space-y-5">
                  {report.structuredInsights.map((insight) => (
                    <div 
                      key={insight.id}
                      className="bg-[#13131A] rounded-3xl border border-white/5 p-6 hover:border-white/20 transition-all shadow-xl space-y-4"
                    >
                      {/* Insight Top Row */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${getPriorityStyle(insight.priority)}`}>
                            {insight.priority.replace("_", " ")}
                          </span>
                          <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                            {insight.category.replace("_", " ")}
                          </span>
                        </div>
                        {insight.metricValue && (
                          <div className="flex items-center gap-2">
                            {insight.metricTrend === "UP" && <TrendingUp className="w-4 h-4 text-rose-400" />}
                            {insight.metricTrend === "DOWN" && <TrendingDown className="w-4 h-4 text-amber-400" />}
                            <span className="text-sm font-black font-mono text-white bg-white/5 px-2.5 py-1 rounded-lg border border-white/10">
                              {insight.metricValue}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Insight Title */}
                      <h3 className="text-base font-black text-white tracking-tight">
                        {insight.title}
                      </h3>

                      {/* 6-Part CFO Framework Grid */}
                      <div className="grid md:grid-cols-2 gap-4 text-xs">
                        {/* 1. Observation */}
                        <div className="p-3.5 bg-white/5 rounded-2xl space-y-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Activity className="w-3 h-3 text-cyan-400" /> 1. Observation (What Changed?)
                          </span>
                          <p className="text-slate-300 font-medium leading-relaxed">{insight.observation}</p>
                        </div>

                        {/* 2. Driver */}
                        <div className="p-3.5 bg-white/5 rounded-2xl space-y-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <BrainCircuit className="w-3 h-3 text-indigo-400" /> 2. Underlying Driver (Why?)
                          </span>
                          <p className="text-slate-300 font-medium leading-relaxed">{insight.driver}</p>
                        </div>

                        {/* 3. Impact */}
                        <div className="p-3.5 bg-white/5 rounded-2xl space-y-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Scale className="w-3 h-3 text-amber-400" /> 3. Financial & Business Impact
                          </span>
                          <p className="text-slate-300 font-medium leading-relaxed">{insight.impact}</p>
                        </div>

                        {/* 4. Risk */}
                        <div className="p-3.5 bg-rose-500/5 border border-rose-500/10 rounded-2xl space-y-1">
                          <span className="text-[10px] font-black uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                            <ShieldAlert className="w-3 h-3 text-rose-400" /> 4. Emerging Risk If Unresolved
                          </span>
                          <p className="text-rose-200 font-medium leading-relaxed">{insight.risk}</p>
                        </div>
                      </div>

                      {/* 5. Action & 6. CFO Question Banner */}
                      <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl space-y-2">
                        <div className="flex items-center gap-2 text-emerald-400">
                          <Sparkles className="w-4 h-4" />
                          <span className="text-xs font-black uppercase tracking-wider">5. Recommended Management Action</span>
                        </div>
                        <p className="text-xs text-emerald-200 font-medium leading-relaxed">
                          {insight.action}
                        </p>
                      </div>

                      <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl space-y-2">
                        <div className="flex items-center gap-2 text-indigo-400">
                          <HelpCircle className="w-4 h-4" />
                          <span className="text-xs font-black uppercase tracking-wider">6. CFO Question For Department Head</span>
                        </div>
                        <p className="text-xs text-indigo-200 font-semibold italic leading-relaxed">
                          &ldquo;{insight.cfoQuestion}&rdquo;
                        </p>
                      </div>

                      {/* Drilldown Trigger */}
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => setSelectedDrilldown(insight)}
                          className="text-xs font-bold text-slate-400 hover:text-cyan-400 transition-colors flex items-center gap-1.5 cursor-pointer"
                        >
                          <Calculator className="w-3.5 h-3.5" /> View Math & Supporting Ledgers <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ========================================================================= */}
              {/* SECTION 4: CROSS-METRIC CORRELATION ("SO WHAT?" ANALYSIS)                 */}
              {/* ========================================================================= */}
              <section className="space-y-4">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <Layers className="w-6 h-6 text-amber-400" />
                  <h2 className="text-xl font-black text-white">Cross-Metric Correlations (&ldquo;So What?&rdquo; Analysis)</h2>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  {report.crossMetricCorrelations.map((cor, i) => (
                    <div key={i} className="bg-[#13131A] p-5 rounded-3xl border border-white/5 space-y-3 shadow-xl">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-black text-white">{cor.title}</h4>
                      </div>
                      <div className="p-2.5 bg-black/40 border border-white/5 rounded-xl font-mono text-xs text-amber-300 font-bold">
                        {cor.pattern}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        {cor.implication}
                      </p>
                      <div className="pt-2 border-t border-white/5">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-1">CFO Strategy</span>
                        <p className="text-xs text-emerald-400 font-medium">{cor.managementAction}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ========================================================================= */}
              {/* SECTION 5: SECTOR-SPECIFIC DIAGNOSTIC & CONTROL FINDINGS                  */}
              {/* ========================================================================= */}
              <section className="grid md:grid-cols-2 gap-6">
                {/* Sector Diagnostics */}
                <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5 space-y-4">
                  <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                    <Building className="w-5 h-5 text-cyan-400" />
                    <h3 className="text-base font-black text-white">{report.sector} Sector Diagnostics</h3>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {report.sectorSpecificInsights.keyMetrics.map((m, idx) => (
                      <div key={idx} className="p-3 bg-white/5 rounded-xl text-center">
                        <p className="text-[9px] text-slate-400 font-bold uppercase truncate">{m.label}</p>
                        <p className="text-sm font-black text-white font-mono mt-0.5">{m.value}</p>
                        <span className="text-[9px] text-cyan-400 font-bold uppercase">{m.assessment}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {report.sectorSpecificInsights.analysis}
                  </p>
                </div>

                {/* Accounting & Scrutiny */}
                <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5 space-y-4">
                  <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                    <ShieldCheck className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-base font-black text-white">Accounting & Scrutiny Observations</h3>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl">
                    <span className="text-xs text-slate-300 font-medium">GST Reconciliation Status</span>
                    <span className="text-xs font-black text-cyan-400">{report.accountingControlFindings.gstReconciliationStatus}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {report.accountingControlFindings.summary}
                  </p>
                  {report.accountingControlFindings.keyExceptions.length > 0 && (
                    <ul className="space-y-1.5 text-xs text-slate-400">
                      {report.accountingControlFindings.keyExceptions.map((ex, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {ex}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              {/* ========================================================================= */}
              {/* SECTION 6: CFO QUESTIONS FOR MANAGEMENT                                   */}
              {/* ========================================================================= */}
              <section className="space-y-4">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <Presentation className="w-6 h-6 text-indigo-400" />
                  <h2 className="text-xl font-black text-white">CFO Questions for Management / Team Review</h2>
                </div>

                <div className="space-y-3">
                  {report.cfoQuestions.map((q, idx) => (
                    <div key={q.id} className="p-4 bg-indigo-950/20 border border-indigo-500/20 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-black flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400">
                            {q.area.replace("_", " ")}
                          </span>
                        </div>
                        <p className="text-sm font-bold text-white leading-relaxed">
                          {q.question}
                        </p>
                        <p className="text-xs text-slate-400 font-medium">
                          Context: {q.context}
                        </p>
                      </div>
                      <div className="shrink-0 bg-black/40 px-3 py-1.5 rounded-xl border border-white/5 text-[11px] font-mono text-slate-400">
                        Trace: {q.dataTrace}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ========================================================================= */}
              {/* SECTION 7: STRATEGIC & IMMEDIATE MANAGEMENT ACTION PLAN                   */}
              {/* ========================================================================= */}
              <section className="space-y-4">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <Briefcase className="w-6 h-6 text-emerald-400" />
                  <h2 className="text-xl font-black text-white">Recommended Management Action Plan</h2>
                </div>

                <div className="space-y-3">
                  {report.managementActionPlan.map((act) => (
                    <div key={act.id} className="p-5 bg-[#13131A] border border-white/5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-white/20 transition-all">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            act.priority.includes("Immediate") 
                              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" 
                              : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          }`}>
                            {act.priority}
                          </span>
                          <span className="text-xs font-black text-slate-400 uppercase tracking-wider">
                            {act.responsibleArea}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-white">{act.issue}</h4>
                        <p className="text-xs text-slate-300 font-medium leading-relaxed">{act.recommendedAction}</p>
                        <p className="text-[11px] text-slate-400">Impact: {act.financialImpact}</p>
                      </div>
                      <div className="shrink-0 bg-white/5 px-3 py-2 rounded-xl border border-white/10 text-center">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-500 block">Horizon</span>
                        <span className="text-xs font-mono font-bold text-cyan-400">{act.timeHorizon}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

            </div>
          ) : null}
        </div>
      </div>

      {/* Audit Math & Supporting Ledgers Modal */}
      <AnimatePresence>
        {selectedDrilldown && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#161622] border border-white/10 rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl relative text-slate-200 p-6 space-y-6"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                    <Calculator className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Audit Calculation & Source Breakdown
                    </span>
                    <h3 className="text-base font-black text-white">{selectedDrilldown.title}</h3>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedDrilldown(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Formula & Calculation Box */}
              <div className="bg-black/30 border border-white/5 rounded-2xl p-4 space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                  <Calculator className="w-3.5 h-3.5" /> Mathematical Formula
                </div>
                <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-xl font-mono text-xs text-cyan-200">
                  {selectedDrilldown.drilldown.formula}
                </div>
                <div className="p-3 bg-white/5 rounded-xl text-xs space-y-1">
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Calculated Output</span>
                  <span className="font-bold text-white text-sm">{selectedDrilldown.drilldown.calculatedValue}</span>
                </div>
              </div>

              {/* Supporting Synced Ledgers Table */}
              {selectedDrilldown.drilldown.supportingLedgers.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">Supporting Synced Ledgers</h4>
                  <div className="border border-white/5 rounded-xl overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-white/5 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                        <tr>
                          <th className="p-2.5">Ledger Name</th>
                          <th className="p-2.5">Group</th>
                          <th className="p-2.5 text-right">Balance / Volume</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                        {selectedDrilldown.drilldown.supportingLedgers.map((l, i) => (
                          <tr key={i} className="hover:bg-white/5">
                            <td className="p-2.5">{l.name}</td>
                            <td className="p-2.5 text-slate-400">{l.group}</td>
                            <td className="p-2.5 text-right font-mono font-bold text-white">
                              {formatCurrency(l.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-white/10">
                <button
                  onClick={() => setSelectedDrilldown(null)}
                  className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Close Audit Drilldown
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
