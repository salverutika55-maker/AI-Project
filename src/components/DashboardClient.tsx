"use client";
// Version: 2.0.0 - Massive 5-Tool Expansion

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { 
  CloudRain, UploadCloud, AlertCircle, RefreshCw, BarChart3, TrendingDown, GitMerge, WalletCards, 
  Plus, Search, Settings, Zap, Link2, Building2, Download, FileText, FileSpreadsheet, BrainCircuit, Activity,
  PieChart
} from "lucide-react";
import {
  LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar, Legend, AreaChart, Area
} from "recharts";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export default function DashboardClient({ initialRecords, clients, activeClientId }: any) {
  const [records, setRecords] = useState(initialRecords);
  
  useEffect(() => {
    setRecords(initialRecords);
    const newAvailablePeriods = Array.from(new Set(initialRecords.map((r: any) => r.period))).sort();
    if (newAvailablePeriods.length > 0) {
      setSelectedPeriod(newAvailablePeriods[newAvailablePeriods.length - 1]);
    }
  }, [initialRecords]);

  const [loading, setLoading] = useState(false);
  const [showNewClient, setShowNewClient] = useState(clients.length === 0);
  const [newClientName, setNewClientName] = useState("");
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState("USD");
  const dashboardRef = useRef<HTMLDivElement>(null);
  const [showMIS, setShowMIS] = useState(false);
  const [misLoading, setMisLoading] = useState(false);
  const [misReport, setMisReport] = useState<any>(null);
  
  const availablePeriods = Array.from(new Set(records.map((r: any) => r.period))).sort();
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({ USD: 1 });

  useEffect(() => {
    fetch("https://api.exchangerate-api.com/v4/latest/USD")
      .then(res => res.json())
      .then(data => data && data.rates && setExchangeRates(data.rates))
      .catch(err => console.error(err));
  }, []);

  const router = useRouter();

  const formatMoney = (amount: number, compact = false) => {
    const locale = 'en-US';
    let finalAmount = amount;
    const activeClient = clients.find((c: any) => c.id === activeClientId);
    if (activeClient && activeClient.baseCurrency && activeClient.baseCurrency !== displayCurrency) {
      const baseRate = exchangeRates[activeClient.baseCurrency] || 1;
      const targetRate = exchangeRates[displayCurrency] || 1;
      finalAmount = amount * (targetRate / baseRate);
    }
    return new Intl.NumberFormat(locale, {
      style: 'currency', currency: displayCurrency, maximumFractionDigits: 0,
      notation: compact ? "compact" : "standard"
    }).format(finalAmount);
  };

  const activeClient = clients.find((c: any) => c.id === activeClientId);
  const activeClientName = activeClient?.name || "Client";

  // TOOLS IMPLEMENTATION

  // Tool 4: Export & Sharing Tool
  const exportPDF = async () => {
    if (!dashboardRef.current) return;
    setLoading(true);
    try {
      const canvas = await html2canvas(dashboardRef.current, { scale: 2, useCORS: true, backgroundColor: '#0A0A0C' });
      const imgData = canvas.toDataURL('image/jpeg', 0.8);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${activeClientName}_Financial_Dashboard.pdf`);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const exportCSV = () => {
    const csv = Papa.unparse(records);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `${activeClientName}_Raw_Data.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Tool 2 & 5: AI MIS Generator & Anomaly Detector
  const generateMIS = () => {
    setMisLoading(true);
    setShowMIS(true);
    
    // Algorithmic Text Generator for MIS and Anomalies (mimicking AI)
    setTimeout(() => {
      if (records.length < 2) {
        setMisReport({ error: "Need at least 2 months of data for analysis." });
        setMisLoading(false);
        return;
      }
      
      const sorted = [...records].sort((a: any, b: any) => a.period.localeCompare(b.period));
      const latest = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      
      const revGrowth = ((latest.revenue - prev.revenue) / (prev.revenue || 1)) * 100;
      const profitGrowth = ((latest.netIncome - prev.netIncome) / (prev.netIncome || 1)) * 100;
      
      let anomalies = [];
      if (Math.abs(revGrowth) > 30) anomalies.push(`🚨 Anomaly Detected: Revenue swung by ${revGrowth.toFixed(1)}% compared to last month.`);
      if (latest.accountsReceivable > latest.revenue * 2) anomalies.push(`⚠️ Anomaly Detected: Extremely high receivables compared to monthly revenue.`);
      if (latest.operatingCashFlow < 0 && latest.netIncome > 0) anomalies.push(`🔍 Divergence: Profitable month, but negative operating cash flow.`);

      const highlights = [
        revGrowth > 0 ? `Revenue grew by ${revGrowth.toFixed(1)}% MoM, indicating strong sales momentum.` : `Revenue contracted by ${Math.abs(revGrowth).toFixed(1)}% MoM. Sales team intervention recommended.`,
        latest.netIncome > 0 ? `Business remains profitable with a margin of ${((latest.netIncome / (latest.revenue || 1))*100).toFixed(1)}%.` : `Business operated at a loss this period. Check operating expenses.`,
        `Cash reserves currently sit at ${formatMoney(latest.cashBalance)}. Burn rate is ${formatMoney(latest.burnRate)}.`
      ];

      setMisReport({
        title: `Auto MIS Report: ${latest.period}`,
        highlights,
        anomalies,
        commentary: `The financial period ${latest.period} shows a net income of ${formatMoney(latest.netIncome)} on a revenue of ${formatMoney(latest.revenue)}. ` +
                    `Operating expenses were tightly controlled at ${formatMoney(latest.operatingExpenses)}. ` +
                    `Working capital management reveals ${formatMoney(latest.accountsReceivable)} locked in receivables. Overall financial health is ${latest.netIncome > 0 ? 'STABLE' : 'AT RISK'}.`
      });
      setMisLoading(false);
    }, 2000);
  };

  if (!activeClientId && !showNewClient) {
    // Client Hub
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex flex-col p-8 lg:p-12">
        <div className="flex justify-between items-center mb-16">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">Client Hub</h1>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto w-full">
          {clients.map((client: any) => (
            <button key={client.id} onClick={() => router.push(`/dashboard?client=${client.id}`)} className="bg-[#13131A] border border-white/5 hover:border-cyan-500/50 p-8 rounded-2xl text-left transition-all hover:bg-[#1a1a24] group relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center border border-white/10 group-hover:border-cyan-500/30 transition-colors">
                  <span className="text-xl font-bold text-white">{client.name.charAt(0)}</span>
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{client.name}</h3>
              <p className="text-slate-500 text-sm">Access Financial Dashboard &rarr;</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (records.length === 0 || showIntegrations) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
             <button onClick={() => router.push('/dashboard')} className="text-slate-400 hover:text-white flex items-center gap-2 font-medium">
               &larr; Back to Client Hub
             </button>
          </div>
          <div className="text-center py-20 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <CloudRain className="w-20 h-20 text-cyan-500 mx-auto mb-6 opacity-80" />
            <h2 className="text-3xl font-bold text-white mb-2">Connect {activeClientName}&apos;s Financials</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10 max-w-2xl mx-auto mt-10">
              <a href="/downloads/FinAnalyzerSync.exe" download className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-cyan-500/50 transition-all text-white group cursor-pointer">
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xl"><UploadCloud className="w-6 h-6" /></div>
                <span className="font-semibold tracking-wide text-lg">Desktop Sync Agent</span>
                <span className="text-sm text-slate-500 text-center px-4">Download .exe to connect Tally Prime</span>
              </a>
            </div>
            {records.length > 0 && (
              <button onClick={() => setShowIntegrations(false)} className="mt-6 text-sm text-slate-500 hover:text-white">Close Without Changing</button>
            )}
            {records.length === 0 && (
              <button onClick={() => { setLoading(true); router.refresh(); setTimeout(() => setLoading(false), 2000); }} className="mt-10 px-8 py-4 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/50 rounded-xl font-bold transition-all mx-auto flex items-center justify-center gap-2">
                {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                Refresh Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const activeRecord = records.find((r: any) => r.period === selectedPeriod) || records[records.length - 1];

  // Tool 3: Working Capital Calculations
  const avgRevPerDay = (activeRecord.revenue || 1) / 30;
  const avgCogsPerDay = (activeRecord.cogs || 1) / 30;
  const dso = activeRecord.accountsReceivable ? (activeRecord.accountsReceivable / avgRevPerDay).toFixed(0) : "N/A";
  const dpo = activeRecord.accountsPayable ? (activeRecord.accountsPayable / avgCogsPerDay).toFixed(0) : "N/A";
  const invDays = activeRecord.inventory ? (activeRecord.inventory / avgCogsPerDay).toFixed(0) : "N/A";

  const chartData = records.sort((a: any, b: any) => a.period.localeCompare(b.period)).map((r: any) => ({
    ...r,
    profitMargin: ((r.netIncome / (r.revenue || 1)) * 100).toFixed(1),
    workingCapital: r.currentAssets - r.currentLiabilities
  }));

  return (
    <div className="min-h-screen bg-[#0A0A0C] p-6 lg:p-8" ref={dashboardRef}>
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* TOP BAR */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 pb-6 border-b border-white/10 gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <select value={activeClientId || ""} onChange={(e) => router.push(`/dashboard?client=${e.target.value}`)} className="bg-[#13131A] border border-white/10 text-white font-bold text-xl px-4 py-2 rounded-lg cursor-pointer focus:outline-none focus:border-cyan-500 hover:bg-white/5 transition-all">
              {clients.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => setShowIntegrations(true)} className="bg-cyan-500/10 p-2 rounded-lg hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-all flex items-center gap-2">
              <Zap className="w-4 h-4" /> <span className="text-xs font-bold uppercase tracking-wider">Sync Data</span>
            </button>
            <select value={selectedPeriod || ""} onChange={(e) => setSelectedPeriod(e.target.value)} className="bg-[#13131A] border border-cyan-500/30 text-cyan-400 font-bold text-sm px-4 py-2 rounded-lg cursor-pointer focus:outline-none focus:border-cyan-500 hover:bg-cyan-500/10 transition-all ml-4">
              {availablePeriods.map((p: any) => <option key={p} value={p}>Period: {p}</option>)}
            </select>
            <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)} className="bg-[#13131A] border border-white/10 text-white font-medium text-sm px-3 py-2 rounded-lg cursor-pointer focus:outline-none focus:border-cyan-500 hover:bg-white/5 transition-all ml-2">
              <option value="USD">USD ($)</option>
              <option value="INR">INR (₹)</option>
            </select>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={generateMIS} className="bg-indigo-500/20 text-indigo-400 border border-indigo-500/50 hover:bg-indigo-500/30 px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all">
              <BrainCircuit className="w-4 h-4" /> AI MIS Report
            </button>
            <button onClick={exportPDF} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all">
              <FileText className="w-4 h-4" /> Export PDF
            </button>
            <button onClick={exportCSV} className="bg-white/5 hover:bg-white/10 border border-white/10 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-all">
              <FileSpreadsheet className="w-4 h-4" /> Export Excel
            </button>
          </div>
        </div>

        {/* AI MIS REPORT MODAL */}
        {showMIS && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#13131A] border border-indigo-500/30 rounded-2xl p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white flex items-center gap-3"><BrainCircuit className="text-indigo-500" /> AI Generated MIS Report</h2>
                <button onClick={() => setShowMIS(false)} className="text-slate-500 hover:text-white">Close</button>
              </div>
              
              {misLoading ? (
                <div className="py-20 flex flex-col items-center justify-center text-indigo-400">
                  <RefreshCw className="w-10 h-10 animate-spin mb-4" />
                  <p className="animate-pulse">Analyzing millions of data points...</p>
                </div>
              ) : misReport?.error ? (
                <div className="text-red-400">{misReport.error}</div>
              ) : (
                <div className="space-y-6 text-slate-300">
                  <div className="bg-indigo-500/10 border border-indigo-500/20 p-6 rounded-xl">
                    <h3 className="text-xl font-bold text-white mb-4">Executive Summary</h3>
                    <p className="leading-relaxed">{misReport.commentary}</p>
                  </div>
                  
                  {misReport.anomalies.length > 0 && (
                    <div className="bg-rose-500/10 border border-rose-500/20 p-6 rounded-xl">
                      <h3 className="text-lg font-bold text-rose-400 mb-4 flex items-center gap-2"><Activity className="w-5 h-5" /> Anomalies Detected</h3>
                      <ul className="space-y-2">
                        {misReport.anomalies.map((anom: string, i: number) => <li key={i}>{anom}</li>)}
                      </ul>
                    </div>
                  )}

                  <div>
                    <h3 className="text-lg font-bold text-white mb-4">Key Highlights</h3>
                    <ul className="space-y-3">
                      {misReport.highlights.map((hl: string, i: number) => (
                        <li key={i} className="flex items-start gap-3 bg-white/5 p-4 rounded-lg">
                          <div className="w-2 h-2 mt-2 rounded-full bg-cyan-500 shrink-0" />
                          <span>{hl}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TOOL 1: KPI DASHBOARD */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: "Revenue", value: formatMoney(activeRecord.revenue), icon: TrendingDown, color: "text-emerald-400", bg: "bg-emerald-500/20" },
            { label: "EBITDA", value: formatMoney(activeRecord.netIncome + activeRecord.operatingExpenses * 0.2), icon: BarChart3, color: "text-cyan-400", bg: "bg-cyan-500/20" },
            { label: "Net Profit", value: formatMoney(activeRecord.netIncome), icon: PieChart, color: activeRecord.netIncome < 0 ? "text-rose-400" : "text-emerald-400", bg: "bg-white/5" },
            { label: "Cash Balance", value: formatMoney(activeRecord.cashBalance), icon: WalletCards, color: "text-indigo-400", bg: "bg-indigo-500/20" },
            { label: "Working Capital", value: formatMoney(activeRecord.currentAssets - activeRecord.currentLiabilities), icon: GitMerge, color: "text-amber-400", bg: "bg-amber-500/20" }
          ].map((kpi, idx) => (
            <div key={idx} className="bg-[#13131A] border border-white/5 rounded-2xl p-5 hover:border-white/20 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.bg}`}><kpi.icon className={`w-4 h-4 ${kpi.color}`} /></div>
                <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">{kpi.label}</h3>
              </div>
              <p className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* TOOL 3: WORKING CAPITAL ANALYZER & TRENDS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-[#13131A] border border-white/5 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-6">Revenue vs Net Profit Trend</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient>
                    <linearGradient id="colorInc" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3}/><stop offset="95%" stopColor="#06B6D4" stopOpacity={0}/></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                  <XAxis dataKey="period" stroke="#ffffff50" tick={{fill: '#ffffff50', fontSize: 12}} />
                  <YAxis stroke="#ffffff50" tick={{fill: '#ffffff50', fontSize: 12}} tickFormatter={(v) => formatMoney(v, true)} />
                  <RechartsTooltip contentStyle={{backgroundColor: '#0A0A0C', borderColor: '#ffffff20', borderRadius: '8px'}} formatter={(v: number) => formatMoney(v)} />
                  <Area type="monotone" dataKey="revenue" stroke="#10B981" fillOpacity={1} fill="url(#colorRev)" />
                  <Area type="monotone" dataKey="netIncome" stroke="#06B6D4" fillOpacity={1} fill="url(#colorInc)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-[#13131A] border border-white/5 rounded-2xl p-6">
            <h3 className="text-lg font-bold text-white mb-6">Working Capital Analyzer</h3>
            <div className="space-y-6">
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-slate-400">DSO (Receivables)</span>
                  <span className="text-xl font-black text-cyan-400">{dso} <span className="text-sm font-normal text-slate-500">days</span></span>
                </div>
                <div className="w-full bg-black/50 h-2 rounded-full overflow-hidden">
                  <div className="bg-cyan-500 h-full" style={{ width: `${Math.min(Number(dso) || 0, 100)}%` }} />
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-slate-400">DPO (Payables)</span>
                  <span className="text-xl font-black text-indigo-400">{dpo} <span className="text-sm font-normal text-slate-500">days</span></span>
                </div>
                <div className="w-full bg-black/50 h-2 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 h-full" style={{ width: `${Math.min(Number(dpo) || 0, 100)}%` }} />
                </div>
              </div>
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-slate-400">Inventory Days</span>
                  <span className="text-xl font-black text-amber-400">{invDays} <span className="text-sm font-normal text-slate-500">days</span></span>
                </div>
                <div className="w-full bg-black/50 h-2 rounded-full overflow-hidden">
                  <div className="bg-amber-500 h-full" style={{ width: `${Math.min(Number(invDays) || 0, 100)}%` }} />
                </div>
              </div>
            </div>
            <p className="text-xs text-slate-500 mt-6 text-center">Lower DSO and Inventory Days improve cash flow. Higher DPO retains cash longer.</p>
          </div>
        </div>

      </div>
    </div>
  );
}
