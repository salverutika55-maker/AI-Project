"use client";

import { useState, useEffect } from "react";
import { 
  X, BrainCircuit, Activity, TrendingUp, AlertTriangle, Target, CheckCircle2, 
  Zap, PieChart, Users, Building, ShieldAlert, FileText, Banknote, ShieldCheck, 
  RefreshCw, Briefcase, FileSignature, Presentation
} from "lucide-react";

interface AICFOReportProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  selectedYear: number;
}

export default function AICFOReport({ isOpen, onClose, clientId, clientName, selectedYear }: AICFOReportProps) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      fetch(`/api/clients/${clientId}/ai-cfo?year=${selectedYear}`)
        .then(res => res.json())
        .then(data => {
          setReport(data);
          setLoading(false);
        })
        .catch(err => {
          console.error("Failed to load CFO Report", err);
          setLoading(false);
        });
    } else {
      setReport(null);
    }
  }, [isOpen, clientId, selectedYear]);

  if (!isOpen) return null;

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="fixed inset-0 z-[100] flex justify-center bg-[#0A0A0C]/90 backdrop-blur-md animate-in fade-in duration-300">
      
      {/* Main Document Container */}
      <div className="w-full max-w-5xl bg-[#0A0A0C] border-x border-white/10 shadow-2xl flex flex-col h-full relative animate-in slide-in-from-bottom-10 duration-500">
        
        {/* Sticky Header */}
        <div className="h-24 border-b border-white/5 bg-[#0A0A0C]/90 backdrop-blur-xl flex items-center justify-between px-8 shrink-0 sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-2xl flex items-center justify-center border border-indigo-500/30">
              <BrainCircuit className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-tight">AI 360° CFO Report</h1>
              <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mt-1">{clientName} • FY {selectedYear}-{selectedYear+1}</p>
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
        <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 p-8 md:p-12">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-indigo-400">
              <div className="relative w-32 h-32 mb-8">
                <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                <BrainCircuit className="absolute inset-0 m-auto w-10 h-10 text-indigo-500 animate-pulse" />
              </div>
              <h3 className="text-2xl font-black text-white mb-2 tracking-tight">Compiling 360° Analysis...</h3>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">Running Financial & Forensic Models</p>
            </div>
          ) : report ? (
            <div className="max-w-4xl mx-auto space-y-16 pb-20 animate-in fade-in duration-700">
              
              {/* SECTION 1: Health & Executive Summary */}
              <section className="space-y-6">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <Activity className="w-6 h-6 text-indigo-400" />
                  <h2 className="text-2xl font-black text-white">Executive Summary</h2>
                </div>
                
                <div className="flex flex-col md:flex-row gap-6">
                  {/* Big Score */}
                  <div className="md:w-1/3 flex flex-col items-center justify-center bg-gradient-to-b from-indigo-500/10 to-transparent border border-indigo-500/20 p-8 rounded-3xl text-center">
                    <Target className="w-8 h-8 text-indigo-400 mb-4" />
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Overall Health Index</p>
                    <h2 className="text-6xl font-black text-white tracking-tighter">{report.scoring.financialHealth}</h2>
                    <p className="text-sm text-slate-500 font-bold mt-1">/ 100</p>
                  </div>
                  
                  {/* Mini Grid */}
                  <div className="md:w-2/3 grid grid-cols-2 md:grid-cols-3 gap-4">
                    {[
                      { l: "Total Revenue", v: formatCurrency(report.executiveSummary.totalRevenue) },
                      { l: "EBITDA", v: formatCurrency(report.executiveSummary.ebitda) },
                      { l: "Net Profit (PAT)", v: formatCurrency(report.executiveSummary.netProfit) },
                      { l: "Gross Margin", v: report.executiveSummary.grossMargin.toFixed(1) + "%" },
                      { l: "Net Margin", v: report.executiveSummary.netMargin.toFixed(1) + "%" },
                      { l: "Cash Position", v: formatCurrency(report.executiveSummary.cashPosition) }
                    ].map((m, i) => (
                      <div key={i} className="bg-[#13131A] p-5 rounded-2xl border border-white/5 flex flex-col justify-center">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">{m.l}</p>
                        <p className="text-lg text-white font-black">{m.v}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-indigo-500/5 p-6 md:p-8 rounded-3xl border border-indigo-500/20 mt-6">
                  <div className="flex items-center gap-3 mb-4">
                    <BrainCircuit className="w-5 h-5 text-indigo-400" />
                    <h3 className="text-sm font-black text-indigo-400 uppercase tracking-widest">AI Management Commentary</h3>
                  </div>
                  <p className="text-lg text-slate-300 leading-relaxed font-medium">
                    {report.aiManagementCommentary}
                  </p>
                </div>
              </section>

              {/* SECTION 2: Working Capital & Liquidity */}
              <section className="space-y-6">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <RefreshCw className="w-6 h-6 text-cyan-400" />
                  <h2 className="text-2xl font-black text-white">Liquidity & Working Capital</h2>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="col-span-2 md:col-span-4 bg-[#13131A] p-6 rounded-3xl border border-white/5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-500 uppercase mb-1">Net Working Capital</p>
                      <p className={`text-4xl font-black tracking-tight ${report.workingCapitalAnalysis.netWorkingCapital < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {formatCurrency(report.workingCapitalAnalysis.netWorkingCapital)}
                      </p>
                    </div>
                    {report.workingCapitalAnalysis.netWorkingCapital < 0 && (
                      <div className="px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                        <span className="text-rose-400 font-bold text-sm flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Deficit Detected</span>
                      </div>
                    )}
                  </div>
                  <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Total Receivables</p>
                    <p className="text-xl font-black text-white">{formatCurrency(report.workingCapitalAnalysis.receivables)}</p>
                  </div>
                  <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Total Payables</p>
                    <p className="text-xl font-black text-white">{formatCurrency(report.workingCapitalAnalysis.payables)}</p>
                  </div>
                  <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Inventory Value</p>
                    <p className="text-xl font-black text-white">{formatCurrency(report.workingCapitalAnalysis.inventory)}</p>
                  </div>
                </div>
              </section>

              {/* SECTION 3: Key Dependencies (Customers/Vendors) */}
              <section className="space-y-6">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <Users className="w-6 h-6 text-amber-400" />
                  <h2 className="text-2xl font-black text-white">Concentration Risks</h2>
                </div>

                {report.revenueIntelligence.concentrationWarning && (
                  <div className="p-5 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-4">
                    <div className="w-10 h-10 bg-rose-500/20 rounded-xl flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-5 h-5 text-rose-500" />
                    </div>
                    <div>
                      <p className="text-base font-black text-rose-400 mb-1">High Customer Concentration</p>
                      <p className="text-sm text-rose-300/80 leading-relaxed">A significant portion of your revenue and outstanding receivables are tied to a small number of clients. Diversification is highly recommended to mitigate cash flow disruption risks.</p>
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5">
                    <h3 className="text-sm font-black text-white mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" /> Top Debtors</h3>
                    <ul className="space-y-4">
                      {report.customerAnalysis.topCustomers.map((c: any, i: number) => (
                        <li key={i} className="flex justify-between items-center border-b border-white/5 pb-4 last:border-0 last:pb-0">
                          <span className="text-sm font-semibold text-slate-300">{c.name}</span>
                          <span className="text-sm font-black text-white">{formatCurrency(c.balance)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5">
                    <h3 className="text-sm font-black text-white mb-4 flex items-center gap-2"><Building className="w-4 h-4 text-rose-400" /> Top Creditors</h3>
                    <ul className="space-y-4">
                      {report.vendorAnalysis.topVendors.map((v: any, i: number) => (
                        <li key={i} className="flex justify-between items-center border-b border-white/5 pb-4 last:border-0 last:pb-0">
                          <span className="text-sm font-semibold text-slate-300">{v.name}</span>
                          <span className="text-sm font-black text-white">{formatCurrency(v.balance)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>

              {/* SECTION 4: CFO Recommendations */}
              <section className="space-y-6">
                <div className="flex items-center gap-3 border-b border-white/10 pb-4">
                  <Briefcase className="w-6 h-6 text-emerald-400" />
                  <h2 className="text-2xl font-black text-white">Strategic Action Plan</h2>
                </div>

                <div className="space-y-8">
                  <div className="bg-[#13131A] p-8 rounded-3xl border border-rose-500/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none"><Zap className="w-32 h-32 text-rose-500" /></div>
                    <h3 className="text-lg font-black text-rose-400 mb-6 flex items-center gap-2 relative z-10"><Zap className="w-5 h-5" /> Immediate Priorities (0-30 Days)</h3>
                    <ul className="space-y-4 relative z-10">
                      {report.cfoRecommendations.immediate.length > 0 ? report.cfoRecommendations.immediate.map((rec: string, i: number) => (
                        <li key={i} className="flex items-start gap-4 p-4 bg-white/5 rounded-2xl">
                          <div className="w-6 h-6 bg-rose-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-rose-400 font-black text-xs">{i+1}</span>
                          </div>
                          <p className="text-sm text-slate-200 font-semibold leading-relaxed">{rec}</p>
                        </li>
                      )) : <p className="text-slate-500">No immediate crisis actions required.</p>}
                    </ul>
                  </div>

                  <div className="bg-[#13131A] p-8 rounded-3xl border border-emerald-500/20 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none"><Target className="w-32 h-32 text-emerald-500" /></div>
                    <h3 className="text-lg font-black text-emerald-400 mb-6 flex items-center gap-2 relative z-10"><Target className="w-5 h-5" /> Strategic Initiatives (90-365 Days)</h3>
                    <ul className="space-y-4 relative z-10">
                      {report.cfoRecommendations.strategic.length > 0 ? report.cfoRecommendations.strategic.map((rec: string, i: number) => (
                        <li key={i} className="flex items-start gap-4 p-4 bg-white/5 rounded-2xl">
                          <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-emerald-400 font-black text-xs">{i+1}</span>
                          </div>
                          <p className="text-sm text-slate-200 font-semibold leading-relaxed">{rec}</p>
                        </li>
                      )) : <p className="text-slate-500">Maintain current strategic trajectory.</p>}
                    </ul>
                  </div>

                  <div className="bg-[#13131A] p-8 rounded-3xl border border-white/5">
                    <h3 className="text-lg font-black text-white mb-6 flex items-center gap-2"><Presentation className="w-5 h-5 text-cyan-400" /> Board Meeting Talking Points</h3>
                    <div className="space-y-4">
                      {report.boardMeetingInsights.map((insight: string, idx: number) => (
                        <div key={idx} className="flex items-start gap-4 p-5 bg-cyan-500/5 rounded-2xl border-l-4 border-cyan-500">
                          <p className="text-sm text-slate-300 font-medium leading-relaxed">{insight}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
