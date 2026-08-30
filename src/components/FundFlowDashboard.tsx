"use client";

import { useState, useEffect, useMemo, Fragment } from "react";
import { 
  Waves, ArrowUpRight, ArrowDownRight, RefreshCw, Layers, TrendingUp, TrendingDown,
  DollarSign, Activity, FileSpreadsheet, FileText, ChevronRight, X, Search,
  CheckCircle2, AlertCircle, AlertTriangle, HelpCircle, ArrowRightLeft, Factory, Briefcase, BarChart3, PieChart, ShieldCheck
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend
} from "recharts";
import Papa from "papaparse";

interface FundFlowDashboardProps {
  clientId: string;
  selectedYear: number;
  client: any;
  displayCurrency?: string;
}

export default function FundFlowDashboard({
  clientId,
  selectedYear,
  client,
  displayCurrency = "INR"
}: FundFlowDashboardProps) {
  const [viewMode, setViewMode] = useState<"MONTHLY" | "CUMULATIVE">("MONTHLY");
  const [selectedMonth, setSelectedMonth] = useState<string>("Mar");
  const [selectedChartId, setSelectedChartId] = useState<string>("net_fund_flow_trend");
  const [loading, setLoading] = useState(true);
  const [fundFlowData, setFundFlowData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Drilldown state
  const [drilldownModal, setDrilldownModal] = useState<{
    isOpen: boolean;
    categoryKey: string;
    categoryTitle: string;
    month: string;
    loading: boolean;
    data: any | null;
    searchQuery: string;
  }>({
    isOpen: false,
    categoryKey: "",
    categoryTitle: "",
    month: "all",
    loading: false,
    data: null,
    searchQuery: ""
  });

  useEffect(() => {
    fetchFundFlowData();
  }, [clientId, selectedYear]);

  const fetchFundFlowData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/fund-flow?year=${selectedYear}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to load Fund Flow data");
      }
      const data = await res.json();
      setFundFlowData(data);
    } catch (err: any) {
      console.error("Fund Flow fetch error:", err);
      setError(err.message || "Failed to load Fund Flow");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDrilldown = async (categoryKey: string, categoryTitle: string, month: string = "all") => {
    setDrilldownModal({
      isOpen: true,
      categoryKey,
      categoryTitle,
      month,
      loading: true,
      data: null,
      searchQuery: ""
    });

    try {
      const res = await fetch(`/api/clients/${clientId}/fund-flow/drilldown?category=${encodeURIComponent(categoryKey)}&month=${month}&year=${selectedYear}`);
      if (!res.ok) throw new Error("Failed to fetch drilldown");
      const data = await res.json();
      setDrilldownModal(prev => ({ ...prev, loading: false, data }));
    } catch (err: any) {
      console.error("Drilldown error:", err);
      setDrilldownModal(prev => ({ ...prev, loading: false, data: null }));
    }
  };

  const formatCurrency = (val: number, compact = false) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: displayCurrency,
      maximumFractionDigits: 0,
      notation: compact ? "compact" : "standard"
    }).format(val || 0);
  };

  const sector = fundFlowData?.sector || client?.sector || "TRADING";
  const SectorIcon = sector === "MANUFACTURING" ? Factory : sector === "SERVICE" ? Briefcase : ArrowRightLeft;

  const monthsList = fundFlowData?.visibleMonths || ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

  // Selected chart config
  const activeChart = useMemo(() => {
    if (!fundFlowData?.charts) return null;
    return fundFlowData.charts.find((c: any) => c.id === selectedChartId) || fundFlowData.charts[0];
  }, [fundFlowData?.charts, selectedChartId]);

  // Export to CSV
  const handleExportCSV = () => {
    if (!fundFlowData) return;
    const rows: any[] = [];

    rows.push({ Section: "WORKING CAPITAL STATEMENT" });
    rows.push({ Category: "Current Assets" });
    fundFlowData.workingCapitalStatement.currentAssets.forEach((item: any) => {
      const rowObj: any = { Item: item.displayName };
      monthsList.forEach((m: string) => rowObj[m] = item.values[m] || 0);
      rowObj["Closing"] = item.values["Closing"] || 0;
      rows.push(rowObj);
    });

    rows.push({ Section: "SOURCES OF FUNDS" });
    fundFlowData.sourcesOfFunds.forEach((item: any) => {
      const rowObj: any = { Item: item.displayName };
      monthsList.forEach((m: string) => rowObj[m] = item.values[m] || 0);
      rowObj["Closing (Cumulative)"] = item.values["Closing"] || 0;
      rows.push(rowObj);
    });

    rows.push({ Section: "APPLICATIONS OF FUNDS" });
    fundFlowData.applicationsOfFunds.forEach((item: any) => {
      const rowObj: any = { Item: item.displayName };
      monthsList.forEach((m: string) => rowObj[m] = item.values[m] || 0);
      rowObj["Closing (Cumulative)"] = item.values["Closing"] || 0;
      rows.push(rowObj);
    });

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Fund_Flow_${client.name}_${selectedYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="min-h-[500px] flex flex-col items-center justify-center p-12 bg-[#13131A] rounded-3xl border border-white/5">
        <RefreshCw className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
        <h3 className="text-lg font-black text-white">Analyzing Financial Statements & Cash Movements...</h3>
        <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Generating sector-aware Fund Flow working papers</p>
      </div>
    );
  }

  if (error || !fundFlowData) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center p-12 bg-rose-500/5 rounded-3xl border border-rose-500/20 text-center">
        <AlertTriangle className="w-12 h-12 text-rose-400 mb-4" />
        <h3 className="text-lg font-black text-white">Fund Flow Analysis Unavailable</h3>
        <p className="text-sm text-slate-400 max-w-md mt-2 mb-6">{error || "Insufficient accounting data available to generate Fund Flow statements for this client."}</p>
        <button
          onClick={fetchFundFlowData}
          className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Retry Analysis
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 1. TOP HEADER & VIEW TOGGLES */}
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Waves className="w-6 h-6 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-black text-white">Fund Flow Statement & Working Capital</h2>
              <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-[10px] font-black text-cyan-400 uppercase tracking-widest flex items-center gap-1.5">
                <SectorIcon className="w-3 h-3" /> {sector} MODEL
              </span>
            </div>
            <p className="text-xs text-slate-500 font-bold mt-1">
              Audit working paper tracking sources, deployments, and working capital liquidity
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Monthly vs Cumulative Switcher */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-1 flex">
            <button
              onClick={() => setViewMode("MONTHLY")}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                viewMode === "MONTHLY" ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20" : "text-slate-400 hover:text-white"
              }`}
            >
              Monthly Fund Flow
            </button>
            <button
              onClick={() => setViewMode("CUMULATIVE")}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${
                viewMode === "CUMULATIVE" ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20" : "text-slate-400 hover:text-white"
              }`}
            >
              Cumulative Fund Flow
            </button>
          </div>

          <button
            onClick={handleExportCSV}
            className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            title="Export CSV"
          >
            <FileSpreadsheet className="w-4 h-4" />
          </button>

          <button
            onClick={fetchFundFlowData}
            className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. SECTOR-AWARE MANAGEMENT KPIS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {fundFlowData.kpis.map((kpi: any) => (
          <div key={kpi.id} className="bg-[#13131A] border border-white/5 rounded-2xl p-5 hover:border-white/20 transition-all shadow-md group">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest line-clamp-1">{kpi.label}</span>
              {kpi.trend === "UP" ? (
                <ArrowUpRight className="w-4 h-4 text-emerald-400" />
              ) : kpi.trend === "DOWN" ? (
                <ArrowDownRight className="w-4 h-4 text-rose-400" />
              ) : (
                <Activity className="w-4 h-4 text-cyan-400" />
              )}
            </div>
            <p className="text-lg font-black text-white font-mono">{kpi.displayValue}</p>
            <p className="text-[10px] text-slate-500 font-medium mt-2 line-clamp-2 leading-relaxed">{kpi.description}</p>
          </div>
        ))}
      </div>

      {/* 3. MANAGEMENT INSIGHTS */}
      {fundFlowData.insights && fundFlowData.insights.length > 0 && (
        <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl">
          <h3 className="text-sm font-black text-white uppercase tracking-widest mb-4 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> Data-Driven Management Observations
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fundFlowData.insights.map((ins: any) => (
              <div
                key={ins.id}
                className={`p-4 rounded-2xl border transition-all ${
                  ins.type === "POSITIVE"
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : ins.type === "WARNING"
                    ? "bg-amber-500/5 border-amber-500/20"
                    : "bg-blue-500/5 border-blue-500/20"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      ins.type === "POSITIVE" ? "bg-emerald-400" : ins.type === "WARNING" ? "bg-amber-400" : "bg-blue-400"
                    }`}
                  />
                  <h4 className="text-xs font-black text-white">{ins.title}</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">{ins.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. SMART CHART SELECTOR & VISUALIZATION */}
      {activeChart && (
        <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/5">
            <div>
              <h3 className="text-lg font-black text-white">{activeChart.title}</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">{activeChart.description}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Select Metric:</span>
              <select
                value={selectedChartId}
                onChange={e => setSelectedChartId(e.target.value)}
                className="bg-[#181821] border border-white/10 rounded-xl px-4 py-2 text-xs font-black text-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
              >
                {fundFlowData.charts.map((c: any) => (
                  <option key={c.id} value={c.id} className="bg-[#13131A] text-white">
                    {c.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {activeChart.type === "bar" ? (
                <BarChart data={activeChart.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="name" stroke="#ffffff30" tick={{ fill: "#ffffff60", fontSize: 10, fontWeight: "bold" }} />
                  <YAxis stroke="#ffffff30" tick={{ fill: "#ffffff60", fontSize: 10, fontWeight: "bold" }} tickFormatter={v => formatCurrency(v, true)} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff20", borderRadius: "16px", color: "#fff" }}
                    formatter={(v: any) => formatCurrency(Number(v))}
                  />
                  <Legend wrapperStyle={{ paddingTop: "12px", fontSize: "11px", fontWeight: "bold" }} />
                  {activeChart.dataKeys.map((dk: any) => (
                    <Bar key={dk.key} dataKey={dk.key} name={dk.label} fill={dk.color} radius={[6, 6, 0, 0]} />
                  ))}
                </BarChart>
              ) : activeChart.type === "area" ? (
                <AreaChart data={activeChart.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="name" stroke="#ffffff30" tick={{ fill: "#ffffff60", fontSize: 10, fontWeight: "bold" }} />
                  <YAxis stroke="#ffffff30" tick={{ fill: "#ffffff60", fontSize: 10, fontWeight: "bold" }} tickFormatter={v => formatCurrency(v, true)} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff20", borderRadius: "16px", color: "#fff" }}
                    formatter={(v: any) => formatCurrency(Number(v))}
                  />
                  <Legend wrapperStyle={{ paddingTop: "12px", fontSize: "11px", fontWeight: "bold" }} />
                  {activeChart.dataKeys.map((dk: any) => (
                    <Area key={dk.key} type="monotone" dataKey={dk.key} name={dk.label} stroke={dk.color} fill={dk.color} fillOpacity={0.2} strokeWidth={3} />
                  ))}
                </AreaChart>
              ) : (
                <LineChart data={activeChart.data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="name" stroke="#ffffff30" tick={{ fill: "#ffffff60", fontSize: 10, fontWeight: "bold" }} />
                  <YAxis stroke="#ffffff30" tick={{ fill: "#ffffff60", fontSize: 10, fontWeight: "bold" }} tickFormatter={v => formatCurrency(v, true)} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff20", borderRadius: "16px", color: "#fff" }}
                    formatter={(v: any) => formatCurrency(Number(v))}
                  />
                  <Legend wrapperStyle={{ paddingTop: "12px", fontSize: "11px", fontWeight: "bold" }} />
                  {activeChart.dataKeys.map((dk: any) => (
                    <Line key={dk.key} type="monotone" dataKey={dk.key} name={dk.label} stroke={dk.color} strokeWidth={3} dot={{ r: 4, fill: dk.color }} />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 5. FUND FLOW TABLES */}
      <div className="space-y-8">
        {/* A. SOURCES OF FUNDS */}
        <div className="bg-[#13131A] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 bg-[#181821] border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <ArrowDownRight className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Sources of Funds (Inflows)</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Operations, Asset Liquidations & Funding Additions</p>
              </div>
            </div>
            <span className="text-xs font-mono font-black text-emerald-400">
              Total: {formatCurrency(fundFlowData.summaryStatement.find((s: any) => s.id === "total_sources_of_funds")?.values["Closing"] || 0)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.01]">
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[280px]">Particulars</th>
                  {monthsList.map((m: string) => (
                    <th key={m} className="p-3 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[110px] border-l border-white/5">
                      {m}
                    </th>
                  ))}
                  <th className="p-4 text-center text-[10px] font-black text-emerald-400 uppercase tracking-widest min-w-[140px] border-l border-white/10 bg-emerald-500/5">
                    {viewMode === "MONTHLY" ? "FY Total" : "Cumulative"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {fundFlowData.sourcesOfFunds.map((item: any) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="p-4 font-bold text-slate-300">
                      <button
                        onClick={() => handleOpenDrilldown(item.category, item.displayName)}
                        className="text-left hover:text-cyan-400 hover:underline flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>{item.displayName}</span>
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" />
                      </button>
                    </td>
                    {monthsList.map((m: string) => {
                      const val = item.values[m] || 0;
                      return (
                        <td key={m} className="p-3 text-center font-mono font-bold text-slate-400 border-l border-white/5">
                          {val > 0 ? (
                            <button
                              onClick={() => handleOpenDrilldown(item.category, item.displayName, m)}
                              className="hover:text-cyan-400 hover:underline transition-colors"
                            >
                              {formatCurrency(val)}
                            </button>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-4 text-center font-mono font-black text-emerald-400 border-l border-white/10 bg-emerald-500/5">
                      {formatCurrency(item.values["Closing"] || 0)}
                    </td>
                  </tr>
                ))}

                {/* Total Sources Row */}
                {(() => {
                  const tot = fundFlowData.summaryStatement.find((s: any) => s.id === "total_sources_of_funds");
                  if (!tot) return null;
                  return (
                    <tr className="bg-emerald-500/10 font-black border-t-2 border-emerald-500/30">
                      <td className="p-4 text-emerald-300 uppercase tracking-wider">{tot.displayName}</td>
                      {monthsList.map((m: string) => (
                        <td key={m} className="p-3 text-center font-mono text-emerald-300 border-l border-white/5">
                          {formatCurrency(tot.values[m] || 0)}
                        </td>
                      ))}
                      <td className="p-4 text-center font-mono text-emerald-300 border-l border-white/10 bg-emerald-500/20">
                        {formatCurrency(tot.values["Closing"] || 0)}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* B. APPLICATIONS OF FUNDS */}
        <div className="bg-[#13131A] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 bg-[#181821] border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Applications of Funds (Deployments)</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">CapEx, Debt Repayment, Working Capital Absorption</p>
              </div>
            </div>
            <span className="text-xs font-mono font-black text-rose-400">
              Total: {formatCurrency(fundFlowData.summaryStatement.find((s: any) => s.id === "total_applications_of_funds")?.values["Closing"] || 0)}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.01]">
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[280px]">Particulars</th>
                  {monthsList.map((m: string) => (
                    <th key={m} className="p-3 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[110px] border-l border-white/5">
                      {m}
                    </th>
                  ))}
                  <th className="p-4 text-center text-[10px] font-black text-rose-400 uppercase tracking-widest min-w-[140px] border-l border-white/10 bg-rose-500/5">
                    {viewMode === "MONTHLY" ? "FY Total" : "Cumulative"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {fundFlowData.applicationsOfFunds.map((item: any) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors group">
                    <td className="p-4 font-bold text-slate-300">
                      <button
                        onClick={() => handleOpenDrilldown(item.category, item.displayName)}
                        className="text-left hover:text-cyan-400 hover:underline flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <span>{item.displayName}</span>
                        <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 text-cyan-400 transition-opacity" />
                      </button>
                    </td>
                    {monthsList.map((m: string) => {
                      const val = item.values[m] || 0;
                      return (
                        <td key={m} className="p-3 text-center font-mono font-bold text-slate-400 border-l border-white/5">
                          {val > 0 ? (
                            <button
                              onClick={() => handleOpenDrilldown(item.category, item.displayName, m)}
                              className="hover:text-cyan-400 hover:underline transition-colors"
                            >
                              {formatCurrency(val)}
                            </button>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="p-4 text-center font-mono font-black text-rose-400 border-l border-white/10 bg-rose-500/5">
                      {formatCurrency(item.values["Closing"] || 0)}
                    </td>
                  </tr>
                ))}

                {/* Total Applications Row */}
                {(() => {
                  const tot = fundFlowData.summaryStatement.find((s: any) => s.id === "total_applications_of_funds");
                  if (!tot) return null;
                  return (
                    <tr className="bg-rose-500/10 font-black border-t-2 border-rose-500/30">
                      <td className="p-4 text-rose-300 uppercase tracking-wider">{tot.displayName}</td>
                      {monthsList.map((m: string) => (
                        <td key={m} className="p-3 text-center font-mono text-rose-300 border-l border-white/5">
                          {formatCurrency(tot.values[m] || 0)}
                        </td>
                      ))}
                      <td className="p-4 text-center font-mono text-rose-300 border-l border-white/10 bg-rose-500/20">
                        {formatCurrency(tot.values["Closing"] || 0)}
                      </td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>

        {/* C. NET FUND FLOW & WORKING CAPITAL RECONCILIATION SUMMARY */}
        <div className="bg-[#13131A] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
          <div className="p-5 bg-[#181821] border-b border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                <Layers className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Net Fund Flow & Working Capital Movement</h3>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Reconciliation of Net Fund Inflows with Working Capital</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.01]">
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[280px]">Summary Item</th>
                  <th className="p-3 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[110px]">Opening</th>
                  {monthsList.map((m: string) => (
                    <th key={m} className="p-3 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[110px] border-l border-white/5">
                      {m}
                    </th>
                  ))}
                  <th className="p-4 text-center text-[10px] font-black text-cyan-400 uppercase tracking-widest min-w-[140px] border-l border-white/10 bg-cyan-500/5">
                    Closing
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs font-mono font-bold">
                {fundFlowData.workingCapitalStatement.workingCapitalSummary.map((item: any) => (
                  <tr key={item.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4 font-sans text-slate-300 font-bold">{item.displayName}</td>
                    <td className="p-3 text-center text-slate-400">{formatCurrency(item.values["Opening"] || 0)}</td>
                    {monthsList.map((m: string) => (
                      <td key={m} className="p-3 text-center text-slate-300 border-l border-white/5">
                        {formatCurrency(item.values[m] || 0)}
                      </td>
                    ))}
                    <td className="p-4 text-center font-black text-cyan-400 border-l border-white/10 bg-cyan-500/5">
                      {formatCurrency(item.values["Closing"] || 0)}
                    </td>
                  </tr>
                ))}

                {/* Net Fund Flow Row */}
                {(() => {
                  const net = fundFlowData.summaryStatement.find((s: any) => s.id === "net_fund_flow");
                  if (!net) return null;
                  return (
                    <tr className="bg-cyan-500/10 font-black border-t-2 border-cyan-500/30 text-cyan-300">
                      <td className="p-4 font-sans uppercase tracking-wider">{net.displayName}</td>
                      <td className="p-3 text-center">-</td>
                      {monthsList.map((m: string) => (
                        <td key={m} className="p-3 text-center border-l border-white/5">
                          {formatCurrency(net.values[m] || 0)}
                        </td>
                      ))}
                      <td className="p-4 text-center border-l border-white/10 bg-cyan-500/20">
                        {formatCurrency(net.values["Closing"] || 0)}
                      </td>
                    </tr>
                  );
                })()}

                {/* Reconciliation Check Row */}
                <tr className="bg-black/30 font-bold text-slate-400">
                  <td className="p-4 font-sans text-[11px] uppercase tracking-wider text-slate-500">Reconciliation Variance</td>
                  <td className="p-3 text-center">-</td>
                  {monthsList.map((m: string) => {
                    const recon = fundFlowData.reconciliation[m];
                    const diff = recon ? recon.difference : 0;
                    return (
                      <td key={m} className="p-3 text-center border-l border-white/5">
                        {Math.abs(diff) < 1 ? (
                          <span className="text-[10px] text-emerald-400 font-sans font-bold flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Reconciled
                          </span>
                        ) : (
                          <span className="text-amber-400 font-mono text-xs">{formatCurrency(diff)}</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="p-4 text-center border-l border-white/10 bg-black/40">
                    {Math.abs(fundFlowData.reconciliation["Cumulative"]?.difference || 0) < 1 ? (
                      <span className="text-[10px] text-emerald-400 font-sans font-bold flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Reconciled
                      </span>
                    ) : (
                      <span className="text-amber-400 font-mono text-xs font-black">
                        {formatCurrency(fundFlowData.reconciliation["Cumulative"]?.difference || 0)}
                      </span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 6. DEEP TRANSACTION DRILLDOWN MODAL */}
      {drilldownModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-[#13131A] border border-white/10 rounded-3xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#181821]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                  <Search className="w-5 h-5 text-cyan-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-white">{drilldownModal.categoryTitle}</h3>
                    <span className="px-2.5 py-0.5 bg-white/10 rounded text-[10px] font-mono text-slate-300">
                      {drilldownModal.month.toUpperCase()} {selectedYear}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-bold mt-0.5">
                    Constituent client ledgers and underlying transaction vouchers
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDrilldownModal(prev => ({ ...prev, isOpen: false }))}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {drilldownModal.loading ? (
                <div className="py-20 flex flex-col items-center justify-center text-center">
                  <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mb-3" />
                  <p className="text-xs font-bold text-slate-400">Loading constituent vouchers...</p>
                </div>
              ) : drilldownModal.data ? (
                <div className="space-y-6">
                  {/* Summary Bar */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-2xl bg-[#181821] border border-white/5">
                    <div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Matched Ledgers</span>
                      <p className="text-lg font-black text-white font-mono">{drilldownModal.data.totalMatchedLedgers}</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Vouchers</span>
                      <p className="text-lg font-black text-cyan-400 font-mono">{drilldownModal.data.totalVouchers}</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Debits</span>
                      <p className="text-lg font-black text-emerald-400 font-mono">
                        {formatCurrency(drilldownModal.data.summary?.totalDebit || 0)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Total Credits</span>
                      <p className="text-lg font-black text-rose-400 font-mono">
                        {formatCurrency(drilldownModal.data.summary?.totalCredit || 0)}
                      </p>
                    </div>
                  </div>

                  {/* Constituent Ledgers List */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Constituent Ledgers</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {drilldownModal.data.ledgers.map((l: any) => (
                        <div key={l.id} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-white">{l.name}</p>
                            <p className="text-[10px] text-slate-500">{l.groupName} ({l.nature})</p>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-xs font-bold text-cyan-400">{formatCurrency(l.closingBalance)}</span>
                            <p className="text-[9px] text-slate-500">{l.voucherCount} vouchers</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Underlying Vouchers Table */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Underlying Transactions</h4>
                      <input
                        type="text"
                        placeholder="Search vouchers or narration..."
                        value={drilldownModal.searchQuery}
                        onChange={e => setDrilldownModal(prev => ({ ...prev, searchQuery: e.target.value }))}
                        className="bg-[#181821] border border-white/10 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 w-64"
                      />
                    </div>

                    <div className="border border-white/5 rounded-2xl overflow-hidden">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-[#181821] border-b border-white/10 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            <th className="p-3">Date</th>
                            <th className="p-3">Voucher #</th>
                            <th className="p-3">Type</th>
                            <th className="p-3">Ledger Name</th>
                            <th className="p-3">Narration</th>
                            <th className="p-3 text-right">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 font-mono">
                          {drilldownModal.data.vouchers
                            .filter((v: any) => {
                              if (!drilldownModal.searchQuery) return true;
                              const q = drilldownModal.searchQuery.toLowerCase();
                              return (
                                v.voucherNumber.toLowerCase().includes(q) ||
                                v.ledgerName.toLowerCase().includes(q) ||
                                (v.narration && v.narration.toLowerCase().includes(q))
                              );
                            })
                            .map((v: any) => (
                              <tr key={v.id} className="hover:bg-white/[0.02] transition-colors">
                                <td className="p-3 font-sans text-slate-400">{v.date}</td>
                                <td className="p-3 text-cyan-400 font-bold">{v.voucherNumber}</td>
                                <td className="p-3">
                                  <span className="px-2 py-0.5 rounded bg-white/5 text-[10px] text-slate-300 font-sans">
                                    {v.type}
                                  </span>
                                </td>
                                <td className="p-3 font-sans text-white">{v.ledgerName}</td>
                                <td className="p-3 font-sans text-slate-400 max-w-xs truncate">{v.narration || "-"}</td>
                                <td className={`p-3 text-right font-bold ${v.entryType === "DEBIT" ? "text-emerald-400" : "text-rose-400"}`}>
                                  {v.entryType === "DEBIT" ? "+" : "-"} {formatCurrency(v.amount)}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs text-slate-500 py-12">No voucher records found for this category.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
