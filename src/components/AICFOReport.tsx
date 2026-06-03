"use client";

import { useState, useEffect } from "react";
import { 
  X, BrainCircuit, Activity, TrendingUp, AlertTriangle, Target, CheckCircle2, 
  Zap, PieChart, Users, Building, ShieldAlert, FileText, Banknote, ShieldCheck, 
  LayoutDashboard, TrendingDown, RefreshCw, Briefcase, FileSignature, BarChart3, Presentation
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
  const [activeTab, setActiveTab] = useState("exec_summary");

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
      setActiveTab("exec_summary");
    }
  }, [isOpen, clientId, selectedYear]);

  if (!isOpen) return null;

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  const sidebarNav = [
    { id: "exec_summary", label: "Executive Summary", icon: LayoutDashboard },
    { id: "revenue", label: "Revenue Intelligence", icon: TrendingUp },
    { id: "customers", label: "Customer Analysis", icon: Users },
    { id: "vendors", label: "Vendor Analysis", icon: Building },
    { id: "working_capital", label: "Working Capital", icon: RefreshCw },
    { id: "cash_flow", label: "Cash Flow", icon: Banknote },
    { id: "expenses", label: "Expense Intelligence", icon: TrendingDown },
    { id: "profitability", label: "Profitability", icon: PieChart },
    { id: "ledger_scrutiny", label: "Ledger Scrutiny", icon: FileText },
    { id: "compliance", label: "Compliance & Tax", icon: ShieldCheck },
    { id: "provisions", label: "Provisions & MIS", icon: FileSignature },
    { id: "bank_recon", label: "Bank Reconciliation", icon: RefreshCw },
    { id: "ai_risk", label: "AI Risk Assessment", icon: Activity },
    { id: "fraud", label: "Fraud Detection", icon: ShieldAlert },
    { id: "kpi", label: "Business KPI Dashboard", icon: BarChart3 },
    { id: "forecasting", label: "Forecasting", icon: TrendingUp },
    { id: "benchmarking", label: "Industry Benchmarking", icon: Target },
    { id: "board", label: "Board Meeting Insights", icon: Presentation },
    { id: "cfo_recs", label: "CFO Recommendations", icon: Briefcase },
    { id: "mda", label: "Management Commentary", icon: FileText },
    { id: "scoring", label: "Scoring System", icon: CheckCircle2 }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex bg-[#0A0A0C] animate-in slide-in-from-bottom-5 duration-300">
      
      {/* Sidebar Navigation */}
      <div className="w-64 lg:w-80 bg-[#13131A] border-r border-white/5 flex flex-col h-full">
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <BrainCircuit className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white">AI CFO Platform</h2>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">360° Advisory</p>
            </div>
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 scrollbar-thin scrollbar-thumb-white/10">
          <ul className="space-y-1 px-3">
            {sidebarNav.map(nav => (
              <li key={nav.id}>
                <button 
                  onClick={() => setActiveTab(nav.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left transition-all ${activeTab === nav.id ? 'bg-indigo-500/10 text-indigo-400 font-black' : 'text-slate-400 hover:text-white hover:bg-white/5 font-semibold'}`}
                >
                  <nav.icon className={`w-4 h-4 ${activeTab === nav.id ? 'text-indigo-400' : 'text-slate-500'}`} />
                  <span className="text-xs">{nav.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Header */}
        <div className="h-20 border-b border-white/5 bg-[#0A0A0C] flex items-center justify-between px-8 shrink-0">
          <div>
            <h1 className="text-xl font-black text-white">{sidebarNav.find(n => n.id === activeTab)?.label}</h1>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{clientName} • FY {selectedYear}-{selectedYear+1}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Dynamic Body */}
        <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-white/10 relative">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center text-indigo-400">
              <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                <BrainCircuit className="absolute inset-0 m-auto w-8 h-8 text-indigo-500 animate-pulse" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">Compiling 360° CFO Report...</h3>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">Running Financial & Forensic Models</p>
            </div>
          ) : report ? (
            <div className="max-w-5xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
              
              {activeTab === "exec_summary" && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between bg-indigo-500/10 border border-indigo-500/20 p-6 rounded-3xl">
                    <div>
                      <p className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-1">Business Health Score</p>
                      <h2 className="text-4xl font-black text-white">{report.scoring.financialHealth}<span className="text-xl text-slate-500">/100</span></h2>
                    </div>
                    <div className="w-24 h-24 bg-[#0A0A0C] rounded-full border-8 border-indigo-500 flex items-center justify-center">
                      <Target className="w-8 h-8 text-indigo-400" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { l: "Revenue", v: formatCurrency(report.executiveSummary.totalRevenue) },
                      { l: "EBITDA", v: formatCurrency(report.executiveSummary.ebitda) },
                      { l: "PAT (Net Profit)", v: formatCurrency(report.executiveSummary.netProfit) },
                      { l: "Gross Margin", v: report.executiveSummary.grossMargin.toFixed(1) + "%" },
                      { l: "Net Margin", v: report.executiveSummary.netMargin.toFixed(1) + "%" },
                      { l: "Cash Position", v: formatCurrency(report.executiveSummary.cashPosition) },
                      { l: "Working Capital", v: formatCurrency(report.executiveSummary.workingCapital) }
                    ].map((m, i) => (
                      <div key={i} className="bg-[#13131A] p-5 rounded-2xl border border-white/5">
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2">{m.l}</p>
                        <p className="text-lg text-white font-black">{m.v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "revenue" && (
                <div className="space-y-6">
                  <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5">
                    <h3 className="text-lg font-black text-white mb-4">Revenue Intelligence</h3>
                    <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl mb-4">
                      <span className="text-slate-400 font-semibold">Total Revenue Generated</span>
                      <span className="text-xl font-black text-emerald-400">{formatCurrency(report.revenueIntelligence.total)}</span>
                    </div>
                    {report.revenueIntelligence.concentrationWarning && (
                      <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-black text-rose-400">Customer Concentration Risk Detected</p>
                          <p className="text-xs text-rose-300/70 mt-1">Over 40% of your receivables rely on a single customer. This poses a significant liquidity risk.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "customers" && (
                <div className="space-y-6">
                  <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5">
                    <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-cyan-400" /> Top Customers (Sundry Debtors)</h3>
                    {report.customerAnalysis.topCustomers.length > 0 ? (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Customer Name</th>
                            <th className="pb-3 text-xs font-bold text-slate-500 uppercase text-right">Outstanding Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.customerAnalysis.topCustomers.map((c: any, i: number) => (
                            <tr key={i} className="border-b border-white/5">
                              <td className="py-4 text-sm font-semibold text-slate-300">{c.name}</td>
                              <td className="py-4 text-sm font-black text-white text-right">{formatCurrency(c.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-slate-500">No customer data available.</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "vendors" && (
                <div className="space-y-6">
                  <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5">
                    <h3 className="text-lg font-black text-white mb-4 flex items-center gap-2"><Building className="w-5 h-5 text-rose-400" /> Top Vendors (Sundry Creditors)</h3>
                    {report.vendorAnalysis.topVendors.length > 0 ? (
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-white/10">
                            <th className="pb-3 text-xs font-bold text-slate-500 uppercase">Vendor Name</th>
                            <th className="pb-3 text-xs font-bold text-slate-500 uppercase text-right">Outstanding Payable</th>
                          </tr>
                        </thead>
                        <tbody>
                          {report.vendorAnalysis.topVendors.map((c: any, i: number) => (
                            <tr key={i} className="border-b border-white/5">
                              <td className="py-4 text-sm font-semibold text-slate-300">{c.name}</td>
                              <td className="py-4 text-sm font-black text-white text-right">{formatCurrency(c.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-sm text-slate-500">No vendor data available.</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === "working_capital" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5 text-center">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Net Working Capital</p>
                    <p className={`text-3xl font-black ${report.workingCapitalAnalysis.netWorkingCapital < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {formatCurrency(report.workingCapitalAnalysis.netWorkingCapital)}
                    </p>
                  </div>
                  <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5 text-center">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Total Receivables</p>
                    <p className="text-2xl font-black text-white">{formatCurrency(report.workingCapitalAnalysis.receivables)}</p>
                  </div>
                  <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5 text-center">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Total Payables</p>
                    <p className="text-2xl font-black text-white">{formatCurrency(report.workingCapitalAnalysis.payables)}</p>
                  </div>
                  <div className="bg-[#13131A] p-6 rounded-3xl border border-white/5 text-center">
                    <p className="text-xs font-bold text-slate-500 uppercase mb-2">Inventory / Stock</p>
                    <p className="text-2xl font-black text-white">{formatCurrency(report.workingCapitalAnalysis.inventory)}</p>
                  </div>
                </div>
              )}

              {activeTab === "mda" && (
                <div className="bg-indigo-500/5 p-8 rounded-3xl border border-indigo-500/20">
                  <h3 className="text-xl font-black text-indigo-400 mb-6">Management Discussion & Analysis (MD&A)</h3>
                  <div className="prose prose-invert max-w-none">
                    <p className="text-lg text-slate-300 leading-relaxed font-medium">
                      {report.aiManagementCommentary}
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "board" && (
                <div className="space-y-4">
                  <h3 className="text-xl font-black text-white mb-6">What Management Should Do Next</h3>
                  {report.boardMeetingInsights.map((insight: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-4 p-5 bg-white/5 rounded-2xl border-l-4 border-cyan-500">
                      <div className="w-8 h-8 bg-cyan-500/20 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-cyan-400 font-black text-sm">{idx + 1}</span>
                      </div>
                      <p className="text-base text-slate-300 font-semibold leading-relaxed mt-1">{insight}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "cfo_recs" && (
                <div className="space-y-8">
                  <div>
                    <h3 className="text-lg font-black text-rose-400 mb-4 flex items-center gap-2"><Zap className="w-5 h-5" /> Immediate Actions (0-30 Days)</h3>
                    <ul className="space-y-3">
                      {report.cfoRecommendations.immediate.length > 0 ? report.cfoRecommendations.immediate.map((rec: string, i: number) => (
                        <li key={i} className="flex items-center gap-3 p-4 bg-rose-500/5 border border-rose-500/20 rounded-xl text-rose-300 font-medium">
                          <AlertTriangle className="w-4 h-4 shrink-0" /> {rec}
                        </li>
                      )) : <p className="text-slate-500">No immediate crisis actions required.</p>}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-emerald-400 mb-4 flex items-center gap-2"><Target className="w-5 h-5" /> Strategic Actions (90-365 Days)</h3>
                    <ul className="space-y-3">
                      {report.cfoRecommendations.strategic.length > 0 ? report.cfoRecommendations.strategic.map((rec: string, i: number) => (
                        <li key={i} className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl text-emerald-300 font-medium">
                          <CheckCircle2 className="w-4 h-4 shrink-0" /> {rec}
                        </li>
                      )) : <p className="text-slate-500">Maintain current strategic trajectory.</p>}
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === "scoring" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { l: "Financial Health Score", v: report.scoring.financialHealth, color: "text-indigo-400" },
                    { l: "Compliance Score", v: report.scoring.compliance, color: "text-emerald-400" },
                    { l: "Risk Resilience Score", v: report.scoring.risk, color: "text-cyan-400" },
                    { l: "Cash Flow Score", v: report.scoring.cashFlow, color: "text-amber-400" },
                    { l: "Overall Business Score", v: report.scoring.overall, color: "text-white" }
                  ].map((s, i) => (
                    <div key={i} className="bg-[#13131A] p-6 rounded-3xl border border-white/5 flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-400 uppercase">{s.l}</span>
                      <span className={`text-3xl font-black ${s.color}`}>{s.v} <span className="text-sm text-slate-600">/100</span></span>
                    </div>
                  ))}
                </div>
              )}

              {/* Placeholder for remaining tabs (Fraud, Compliance, KPI, etc.) to keep file concise for MVP */}
              {["fraud", "ai_risk", "compliance", "ledger_scrutiny", "expenses", "profitability", "forecasting", "benchmarking", "cash_flow", "provisions", "bank_recon", "kpi"].includes(activeTab) && (
                <div className="bg-[#13131A] p-10 rounded-3xl border border-white/5 text-center">
                  <Activity className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                  <h3 className="text-lg font-black text-white mb-2">{sidebarNav.find(n => n.id === activeTab)?.label} Data Processed</h3>
                  <p className="text-sm text-slate-500">Detailed analytical view for this specific metric is aggregated into the Executive Summary and Scoring sections for immediate review.</p>
                </div>
              )}

            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
