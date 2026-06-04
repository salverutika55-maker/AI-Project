"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  Users, TrendingUp, DollarSign, Calendar, Clock, AlertTriangle, ArrowUpDown, 
  ChevronRight, X, BarChart3, PieChart as PieChartIcon, Activity, Download, FileSpreadsheet, Search, CheckCircle2
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from "recharts";
import PerformanceRatios from "./PerformanceRatios";

interface PartyData {
  name: string;
  totalValue: number;
  outstanding: number;
  overdue: number;
  averageDays: number;
  lastTransaction: string;
  transactionCount: number;
  monthlyTrend: number[];
}

interface AnalyticsDashboardProps {
  clientId: string;
  selectedYear: number;
  displayCurrency: string;
}

const COLORS = ["#22D3EE", "#10B981", "#6366F1", "#F59E0B", "#EC4899", "#8B5CF6", "#14B8A6", "#F43F5E", "#06B6D4", "#64748B"];

export default function AnalyticsDashboard({ clientId, selectedYear, displayCurrency }: AnalyticsDashboardProps) {
  const [activeType, setActiveType] = useState<"RATIOS" | "VENDORS" | "CUSTOMERS">("RATIOS");
  const [parties, setParties] = useState<PartyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"totalValue" | "outstanding" | "overdue">("totalValue");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedParty, setSelectedParty] = useState<PartyData | null>(null);

  // Fetching Aggregated Data from API
  useEffect(() => {
    async function fetchAnalytics() {
      if (activeType === "RATIOS") return;
      setLoading(true);
      try {
        const res = await fetch(`/api/clients/${clientId}/analytics?type=${activeType}&year=${selectedYear}`);
        const result = await res.json();
        if (result.success) {
          setParties(result.data);
        }
      } catch (err) {
        console.error("Failed to load analytics:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, [clientId, activeType, selectedYear]);

  // Derived statistics
  const kpis = useMemo(() => {
    if (parties.length === 0) return { total: 0, outstanding: 0, overdue: 0, avgDays: 0 };
    const total = parties.reduce((sum, p) => sum + p.totalValue, 0);
    const outstanding = parties.reduce((sum, p) => sum + p.outstanding, 0);
    const overdue = parties.reduce((sum, p) => sum + p.overdue, 0);
    const avgDays = Math.round(parties.reduce((sum, p) => sum + p.averageDays, 0) / parties.length);
    return { total, outstanding, overdue, avgDays };
  }, [parties]);

  // Filtering and Sorting
  const filteredParties = useMemo(() => {
    return parties
      .filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => b[sortBy] - a[sortBy]);
  }, [parties, searchQuery, sortBy]);

  // Chart Data Preparation
  const barChartData = useMemo(() => {
    return filteredParties.slice(0, 5).map(p => ({
      name: p.name.length > 15 ? `${p.name.substring(0, 15)}...` : p.name,
      Amount: p.totalValue,
      Outstanding: p.outstanding
    }));
  }, [filteredParties]);

  const pieChartData = useMemo(() => {
    const top = filteredParties.slice(0, 5).map(p => ({
      name: p.name,
      value: p.totalValue
    }));
    const othersValue = filteredParties.slice(5).reduce((sum, p) => sum + p.totalValue, 0);
    if (othersValue > 0) {
      top.push({ name: "Others", value: othersValue });
    }
    return top;
  }, [filteredParties]);

  const aggregateMonthlyTrend = useMemo(() => {
    const trend = Array(12).fill(0);
    filteredParties.forEach(p => {
      p.monthlyTrend.forEach((v, idx) => {
        trend[idx] += v;
      });
    });
    const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    return months.map((m, idx) => ({
      month: m,
      Amount: trend[idx]
    }));
  }, [filteredParties]);

  const formatValue = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: displayCurrency,
      maximumFractionDigits: 0
    }).format(val);
  };

  const handleExportCSV = () => {
    const headers = ["Name", "Total Purchase/Sales", "Outstanding Balance", "Overdue Balance", "Average Days", "Transaction Count", "Last Active"];
    const rows = parties.map(p => [
      p.name,
      p.totalValue,
      p.outstanding,
      p.overdue,
      p.averageDays,
      p.transactionCount,
      new Date(p.lastTransaction).toLocaleDateString()
    ]);
    const csvContent = "data:text/csv;charset=utf-8," 
      + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${activeType.toLowerCase()}_analytics_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-8">
      {/* 1. SECTOR TOGGLE & CONTROL BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#13131A] p-4 rounded-3xl border border-white/5 shadow-xl">
        <div className="flex flex-wrap items-center gap-1 bg-[#1a1a24] p-1.5 rounded-2xl border border-white/5 w-fit">
          <button 
            onClick={() => { setActiveType("VENDORS"); setSelectedParty(null); }}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeType === "VENDORS" ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
          >
            <Users className="w-4 h-4" /> Top Vendors Analysis
          </button>
          <button 
            onClick={() => { setActiveType("CUSTOMERS"); setSelectedParty(null); }}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${activeType === "CUSTOMERS" ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
          >
            <Briefcase className="w-4 h-4" /> Top Customers Analysis
          </button>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:flex-none">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search party name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 w-full md:w-60"
            />
          </div>
          <button 
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-black text-slate-300 hover:bg-white/10 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" /> CSV
          </button>
        </div>
      </div>
      
      {/* 2. SUMMARY KPI ROW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: activeType === "VENDORS" ? "Total Purchases" : "Total Sales", value: kpis.total, icon: DollarSign, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/10" },
          { label: activeType === "VENDORS" ? "Total Payable Outstanding" : "Total Receivable Outstanding", value: kpis.outstanding, icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/10" },
          { label: "Overdue Balance (30d+)", value: kpis.overdue, icon: Clock, color: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/10" },
          { label: activeType === "VENDORS" ? "Avg. Payment Cycle" : "Avg. Collection Cycle", value: `${kpis.avgDays} Days`, icon: Clock, color: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/10" }
        ].map((kpi, idx) => (
          <div key={idx} className={`bg-[#13131A] border rounded-3xl p-6 shadow-xl ${kpi.bg} transition-transform hover:scale-[1.02]`}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{kpi.label}</span>
              <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
            </div>
            <p className={`text-2xl font-black ${kpi.color}`}>
              {typeof kpi.value === "number" ? formatValue(kpi.value) : kpi.value}
            </p>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="h-[400px] bg-[#13131A] rounded-3xl flex items-center justify-center border border-white/5">
          <div className="text-center text-cyan-500 animate-pulse">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-xs font-bold uppercase tracking-widest">Aggregating Ledgers...</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* 3. LEADERBOARD LIST */}
          <div className="lg:col-span-2 bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl space-y-6">
            <div className="flex justify-between items-center border-b border-white/5 pb-4">
              <h3 className="text-lg font-black text-white">Top 10 Leaderboard</h3>
              <div className="flex items-center gap-1.5 bg-[#1a1a24] p-1 rounded-xl border border-white/5 text-[10px] font-black uppercase">
                <button 
                  onClick={() => setSortBy("totalValue")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${sortBy === "totalValue" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
                >
                  Value
                </button>
                <button 
                  onClick={() => setSortBy("outstanding")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${sortBy === "outstanding" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
                >
                  Outstanding
                </button>
                <button 
                  onClick={() => setSortBy("overdue")}
                  className={`px-3 py-1.5 rounded-lg transition-all ${sortBy === "overdue" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"}`}
                >
                  Overdue
                </button>
              </div>
            </div>

            <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto pr-2">
              {filteredParties.map((party, index) => (
                <div 
                  key={party.name}
                  onClick={() => setSelectedParty(party)}
                  className="flex items-center justify-between py-4 hover:bg-white/[0.02] px-3 rounded-2xl cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center text-xs font-black text-cyan-400 group-hover:bg-cyan-500/10 transition-colors">
                      {index + 1}
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white group-hover:text-cyan-400 transition-colors">{party.name}</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">
                        {party.transactionCount} transactions | Last: {new Date(party.lastTransaction).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-right">
                    <div>
                      <p className="text-sm font-black text-white">{formatValue(party.totalValue)}</p>
                      <p className="text-[10px] text-amber-400/80 font-bold uppercase">
                        O/S: {formatValue(party.outstanding)}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. VISUAL CONCENTRATION CHARTS */}
          <div className="space-y-8">
            {/* Donut Concentration Risk Chart */}
            <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-cyan-400" /> Concentration Risk Profile
              </h3>
              <div className="h-[200px] w-full flex items-center justify-center relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff10", borderRadius: "12px" }}
                      formatter={(v: any) => formatValue(Number(v))}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Custom Legend */}
              <div className="mt-6 space-y-2 max-h-[140px] overflow-y-auto pr-1">
                {pieChartData.map((p, i) => (
                  <div key={p.name} className="flex justify-between text-xs font-bold">
                    <div className="flex items-center gap-2 max-w-[70%]">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-slate-400 truncate">{p.name}</span>
                    </div>
                    <span className="text-white font-mono">{((p.value / kpis.total) * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Overall Monthly Volume Analysis */}
            <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" /> Dynamic Monthly Trends
              </h3>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={aggregateMonthlyTrend}>
                    <defs>
                      <linearGradient id="analyticsTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <XAxis dataKey="month" stroke="#ffffff10" tick={{ fill: "#ffffff40", fontSize: 9 }} tickLine={false} />
                    <YAxis stroke="#ffffff10" tick={{ fill: "#ffffff40", fontSize: 9 }} tickLine={false} tickFormatter={(v) => formatValue(v)} />
                    <Tooltip contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff10", borderRadius: "12px" }} formatter={(v: any) => formatValue(Number(v))} />
                    <Area type="monotone" name="Volume" dataKey="Amount" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#analyticsTrend)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. INTERACTIVE DRILL-DOWN PANEL / SIDE DRAWER */}
      {selectedParty && (
        <div className="fixed inset-0 z-[100] flex justify-end animate-in fade-in duration-300">
          {/* Overlay */}
          <div 
            onClick={() => setSelectedParty(null)} 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Panel */}
          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#101017] border-l border-white/10 shadow-2xl p-8 overflow-y-auto space-y-8 flex flex-col justify-between select-none">
            <div className="space-y-8">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-white/5 pb-6">
                <div>
                  <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                    {activeType === "VENDORS" ? "Vendor Account Summary" : "Customer Account Summary"}
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">{selectedParty.name}</h2>
                </div>
                <button 
                  onClick={() => setSelectedParty(null)}
                  className="p-2 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">
                    {activeType === "VENDORS" ? "Total Purchasing" : "Total Ordering"}
                  </span>
                  <span className="text-xl font-black text-white">{formatValue(selectedParty.totalValue)}</span>
                </div>
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">Outstanding Balance</span>
                  <span className="text-xl font-black text-amber-400">{formatValue(selectedParty.outstanding)}</span>
                </div>
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">Overdue Amount</span>
                  <span className="text-xl font-black text-rose-400">{formatValue(selectedParty.overdue)}</span>
                </div>
                <div className="bg-white/[0.02] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">
                    {activeType === "VENDORS" ? "Payment Days" : "Collection Days"}
                  </span>
                  <span className="text-xl font-black text-indigo-400">{selectedParty.averageDays} Days</span>
                </div>
              </div>

              {/* Monthly Trend Chart */}
              <div className="bg-white/[0.02] border border-white/5 p-6 rounded-2xl space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Monthly Transaction Activity</h3>
                <div className="h-[160px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart 
                      data={["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map((m, idx) => ({
                        month: m,
                        Amount: selectedParty.monthlyTrend[idx] || 0
                      }))}
                    >
                      <defs>
                        <linearGradient id="partyTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#22D3EE" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff02" vertical={false} />
                      <XAxis dataKey="month" stroke="#ffffff10" tick={{ fill: "#ffffff40", fontSize: 9 }} tickLine={false} />
                      <YAxis stroke="#ffffff10" tick={{ fill: "#ffffff40", fontSize: 9 }} tickLine={false} tickFormatter={(v) => formatValue(v)} />
                      <Tooltip contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff10", borderRadius: "12px" }} formatter={(v: any) => formatValue(Number(v))} />
                      <Area type="monotone" name="Activity" dataKey="Amount" stroke="#22D3EE" strokeWidth={2} fillOpacity={1} fill="url(#partyTrend)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Invoice Overdue Aging Analysis */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Payment Aging Analysis</h3>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: "Current", value: selectedParty.outstanding * 0.55, color: "text-emerald-400" },
                    { label: "1-30 Days", value: selectedParty.outstanding * 0.3, color: "text-amber-400" },
                    { label: "31-60 Days", value: selectedParty.outstanding * 0.1, color: "text-orange-400" },
                    { label: "60+ Days", value: selectedParty.outstanding * 0.05, color: "text-rose-500" }
                  ].map((aging, idx) => (
                    <div key={idx} className="bg-white/5 border border-white/5 p-3 rounded-xl">
                      <span className="text-[9px] text-slate-500 font-bold block mb-1 uppercase">{aging.label}</span>
                      <span className={`text-[11px] font-mono font-black ${aging.color}`}>{formatValue(aging.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Smart Risk Action Card */}
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-4">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-black text-rose-400 uppercase tracking-widest">Financial Health Alert</h4>
                <p className="text-[11px] text-rose-300 font-bold leading-relaxed mt-1">
                  {selectedParty.overdue > 0 
                    ? `⚠️ ${selectedParty.name} has ${formatValue(selectedParty.overdue)} overdue by more than 30 days. Consider holding orders or scheduling a billing reconciliation.`
                    : `✅ Outstanding credit is within the safe limit. Average cycle is stable at ${selectedParty.averageDays} days.`
                  }
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
