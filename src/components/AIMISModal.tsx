"use client";

import { useState, useEffect } from "react";
import { X, BrainCircuit, Activity, TrendingUp, AlertTriangle, Target, CheckCircle2, Zap } from "lucide-react";

interface AIMISModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  getRowTotal: (item: string) => number;
  formatCurrency: (val: number, compact?: boolean) => string;
  customSubHeads: any[];
  visibleMonths: string[];
  gridData: Record<string, Record<string, number>>;
}

export default function AIMISModal({ isOpen, onClose, clientName, getRowTotal, formatCurrency, customSubHeads, visibleMonths, gridData }: AIMISModalProps) {
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<any>(null);

  useEffect(() => {
    if (isOpen) {
      setLoading(true);
      // Simulate AI generation time
      const timer = setTimeout(() => {
        generateAdvancedInsights();
      }, 2500);
      return () => clearTimeout(timer);
    } else {
      setReport(null);
    }
  }, [isOpen]);

  const generateAdvancedInsights = () => {
    const totalRev = getRowTotal("Total Revenue");
    const totalNP = getRowTotal("Net Profit Before Tax");
    const totalExp = getRowTotal("Total Indirect Expenses");
    const grossProfit = getRowTotal("Gross Profit");
    const cogs = getRowTotal("COGS") || (totalRev - grossProfit);

    const gpMargin = totalRev > 0 ? (grossProfit / totalRev) * 100 : 0;
    const npMargin = totalRev > 0 ? (totalNP / totalRev) * 100 : 0;
    const opexRatio = totalRev > 0 ? (totalExp / totalRev) * 100 : 0;

    const focusAreas = [];
    const strengths = [];
    const risks = [];

    // Detailed Ledger Analysis
    const getLedgerTotals = (headNames: string[]) => {
      return customSubHeads
        .filter(sh => headNames.includes(sh.headName))
        .map(sh => {
          const total = visibleMonths.reduce((sum, m) => sum + (gridData[m]?.[sh.name] || 0), 0);
          return { name: sh.name, total };
        })
        .filter(l => l.total > 0)
        .sort((a, b) => b.total - a.total);
    };

    const topOpex = getLedgerTotals(["Indirect Expenses", "Administrative & General Expenses"]);
    const topRevenue = getLedgerTotals(["Revenue from Operation", "Sales Income", "Operating Revenue"]);
    const topCogs = getLedgerTotals(["Cost of Goods Sold", "Trading Cost", "Service Delivery Costs (Direct)"]);

    const formatLedgerList = (ledgers: any[]) => ledgers.slice(0, 3).map(l => `${l.name} (${formatCurrency(l.total, true)})`).join(", ");

    // Heuristics Engine for Actionable Focus Areas
    if (gpMargin < 30 && totalRev > 0) {
      const cogsDetail = topCogs.length > 0 ? ` Your highest direct costs are ${formatLedgerList(topCogs)}.` : "";
      focusAreas.push({
        title: "COGS & Vendor Negotiation",
        desc: `Your Gross Margin is low at ${gpMargin.toFixed(1)}%.${cogsDetail} Focus immediately on renegotiating supplier contracts, optimizing raw material costs, or adjusting pricing strategy to improve baseline profitability.`
      });
      risks.push(`High Direct Costs (${formatCurrency(cogs, true)}) are severely eating into your gross margins.`);
    } else if (gpMargin >= 40) {
      strengths.push(`Strong Gross Margin at ${gpMargin.toFixed(1)}%, indicating excellent pricing power and direct cost management.`);
    }

    if (opexRatio > 35) {
      const opexDetail = topOpex.length > 0 ? ` Your top 3 expenses driving this are ${formatLedgerList(topOpex)}.` : "";
      focusAreas.push({
        title: "OPEX Rationalization",
        desc: `Indirect expenses are consuming ${opexRatio.toFixed(1)}% of your revenue (${formatCurrency(totalExp, true)}).${opexDetail} Conduct a line-by-line audit of these specific cost centers to identify leakages and improve efficiency.`
      });
    } else if (opexRatio > 0 && opexRatio <= 25) {
      strengths.push(`Highly efficient OPEX management, consuming only ${opexRatio.toFixed(1)}% of revenue.`);
    }

    if (topRevenue.length > 0) {
      const primaryRevenue = topRevenue[0];
      const revenueConcentration = (primaryRevenue.total / totalRev) * 100;
      if (revenueConcentration > 80 && topRevenue.length > 1) {
        risks.push(`High Revenue Concentration: ${revenueConcentration.toFixed(1)}% of your revenue comes from a single stream (${primaryRevenue.name}). Consider diversifying income sources.`);
      } else {
        strengths.push(`Primary revenue driver is performing well: ${primaryRevenue.name} generated ${formatCurrency(primaryRevenue.total, true)}.`);
      }
    }

    if (totalNP < 0) {
      focusAreas.push({
        title: "Immediate Profitability Turnaround",
        desc: `The business is operating at a net loss of ${formatCurrency(Math.abs(totalNP))}. Immediate action is required to slash non-essential OPEX (such as ${topOpex[0]?.name || 'administrative costs'}) or aggressively drive high-margin sales.`
      });
      risks.push("Sustained net losses could lead to cash flow insolvency if not addressed immediately.");
    } else if (npMargin < 5 && totalRev > 0) {
      focusAreas.push({
        title: "Net Margin Expansion",
        desc: `While profitable, your Net Margin is razor-thin at ${npMargin.toFixed(1)}%. Focus on high-ticket sales and aggressively cutting bottom-tier expenses to build a cash buffer.`
      });
    } else if (npMargin >= 15) {
      strengths.push(`Exceptional Net Profit Margin of ${npMargin.toFixed(1)}%, signaling a highly lucrative and scalable business model.`);
    }

    if (totalRev === 0) {
      focusAreas.push({
        title: "Revenue Activation",
        desc: "No revenue has been recorded for the selected period. Ensure that sales invoices are being synced properly, or focus on activating the sales pipeline immediately."
      });
    }

    // Default fallbacks if heuristics don't trigger anything critical
    if (focusAreas.length === 0) {
      focusAreas.push({
        title: "Scale & Expansion",
        desc: "Financials are extremely healthy across the board. The primary focus should shift from optimization to aggressive scaling, market expansion, and deploying surplus cash into growth channels."
      });
    }
    if (strengths.length === 0) {
      strengths.push("Business operations are stable with no immediate systemic failures detected.");
    }
    if (risks.length === 0) {
      risks.push("No critical financial anomalies or immediate liquidity risks detected in the current data snapshot.");
    }

    setReport({
      executiveSummary: `For the selected period, ${clientName} generated ${formatCurrency(totalRev)} in Total Revenue, culminating in a Net Profit of ${formatCurrency(totalNP)}. Direct costs amounted to ${formatCurrency(cogs)}, while indirect operating expenses were ${formatCurrency(totalExp)}.`,
      focusAreas,
      strengths,
      risks,
      metrics: { gpMargin, npMargin, opexRatio }
    });
    setLoading(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative w-full max-w-5xl bg-[#0A0A0C] border border-white/10 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#13131A]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-500/20 rounded-xl flex items-center justify-center">
              <BrainCircuit className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-white tracking-tight">AI MIS Assistant</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{clientName} • Strategic Analysis</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 md:p-10 scrollbar-thin scrollbar-thumb-white/10">
          {loading ? (
            <div className="h-full flex flex-col items-center justify-center py-20 text-indigo-400">
              <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 border-4 border-indigo-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-indigo-500 rounded-full border-t-transparent animate-spin"></div>
                <BrainCircuit className="absolute inset-0 m-auto w-8 h-8 text-indigo-500 animate-pulse" />
              </div>
              <h3 className="text-xl font-black text-white mb-2">Analyzing Financials...</h3>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">Running Deep Diagnostic Algorithms</p>
            </div>
          ) : report ? (
            <div className="space-y-10 animate-in fade-in duration-700">
              
              {/* Executive Summary */}
              <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-6 md:p-8 relative overflow-hidden">
                <Zap className="absolute -top-10 -right-10 w-40 h-40 text-indigo-500/10 rotate-12" />
                <h3 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-4">Executive Summary</h3>
                <p className="text-lg md:text-xl text-slate-300 font-medium leading-relaxed relative z-10">
                  {report.executiveSummary}
                </p>
              </div>

              {/* Core Focus Areas */}
              <div>
                <h3 className="text-xl font-black text-white mb-6 flex items-center gap-3">
                  <Target className="w-6 h-6 text-cyan-400" /> 
                  Strategic Focus Areas
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {report.focusAreas.map((area: any, idx: number) => (
                    <div key={idx} className="bg-[#13131A] border border-cyan-500/30 rounded-2xl p-6 shadow-lg shadow-cyan-500/5 hover:border-cyan-500/60 transition-colors group">
                      <div className="w-10 h-10 bg-cyan-500/10 rounded-lg flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                        <span className="text-cyan-400 font-black">{idx + 1}</span>
                      </div>
                      <h4 className="text-lg font-black text-white mb-3">{area.title}</h4>
                      <p className="text-sm text-slate-400 font-medium leading-relaxed">{area.desc}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Strengths */}
                <div className="bg-[#13131A] border border-emerald-500/20 rounded-2xl p-6 md:p-8">
                  <h3 className="text-lg font-black text-emerald-400 flex items-center gap-2 mb-6">
                    <TrendingUp className="w-5 h-5" /> Key Strengths
                  </h3>
                  <ul className="space-y-4">
                    {report.strengths.map((s: string, i: number) => (
                      <li key={i} className="flex items-start gap-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-sm text-slate-300 font-medium leading-relaxed">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Anomalies / Risks */}
                <div className="bg-[#13131A] border border-rose-500/20 rounded-2xl p-6 md:p-8">
                  <h3 className="text-lg font-black text-rose-400 flex items-center gap-2 mb-6">
                    <AlertTriangle className="w-5 h-5" /> Risks & Anomalies
                  </h3>
                  <ul className="space-y-4">
                    {report.risks.map((r: string, i: number) => (
                      <li key={i} className="flex items-start gap-3">
                        <Activity className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                        <span className="text-sm text-slate-300 font-medium leading-relaxed">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
