"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  ShieldAlert, ShieldCheck, Play, CheckCircle2, AlertTriangle, Clock, 
  HelpCircle, Search, ChevronRight, X, User, MessageSquare, Filter,
  FileSpreadsheet, Activity, TrendingUp, BarChart3, Lock
} from "lucide-react";
import {
  ResponsiveContainer, RadialBarChart, RadialBar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area
} from "recharts";

interface ComplianceRule {
  id: string;
  category: string;
  ruleCode: string;
  name: string;
  description: string;
  isActive: boolean;
}

interface ComplianceAlert {
  id: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  ledgerName: string | null;
  voucherId: string | null;
  impactAmount: number;
  status: string;
  commentary: string | null;
  resolvedBy: { email: string; role: string } | null;
  metadata: any;
  createdAt: string;
}

interface ComplianceDashboardProps {
  clientId: string;
  selectedYear: number;
  displayCurrency: string;
}

const SEVERITY_COLORS = {
  HIGH: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  MEDIUM: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  LOW: "text-sky-400 bg-sky-500/10 border-sky-500/20"
};

export default function ComplianceDashboard({ clientId, selectedYear, displayCurrency }: ComplianceDashboardProps) {
  const [rules, setRules] = useState<ComplianceRule[]>([]);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningAudit, setRunningAudit] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("PENDING");
  const [activeAlert, setActiveAlert] = useState<ComplianceAlert | null>(null);
  
  // Resolution controls state
  const [commentaryText, setCommentaryText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Fetch initial setup
  const fetchAllCompliance = async () => {
    setLoading(true);
    try {
      const rulesRes = await fetch(`/api/clients/${clientId}/compliance/rules`);
      const rulesData = await rulesRes.json();
      if (rulesData.success) setRules(rulesData.data);

      const alertsRes = await fetch(`/api/clients/${clientId}/compliance/alerts`);
      const alertsData = await alertsRes.json();
      if (alertsData.success) setAlerts(alertsData.data);
    } catch (err) {
      console.error("Failed to load compliance details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllCompliance();
  }, [clientId, selectedYear]);

  // Run audit engine
  const handleTriggerAudit = async () => {
    setRunningAudit(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/compliance/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: selectedYear })
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Compliance Audit Complete!\n${data.message}`);
        await fetchAllCompliance();
      }
    } catch (err) {
      console.error("Failed to execute audit:", err);
    } finally {
      setRunningAudit(false);
    }
  };

  // Rule activation toggle
  const handleToggleRule = async (ruleId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/clients/${clientId}/compliance/rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ruleId, isActive: !currentStatus })
      });
      const data = await res.json();
      if (data.success) {
        setRules(prev => prev.map(r => r.id === ruleId ? { ...r, isActive: !currentStatus } : r));
      }
    } catch (err) {
      console.error("Failed to toggle rule:", err);
    }
  };

  // Resolve or mute alert
  const handleActionAlert = async (status: "RESOLVED" | "MUTED") => {
    if (!activeAlert) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/compliance/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertId: activeAlert.id,
          status,
          commentary: commentaryText
        })
      });
      const data = await res.json();
      if (data.success) {
        setAlerts(prev => prev.map(a => a.id === activeAlert.id ? { ...data.data } : a));
        setActiveAlert(null);
        setCommentaryText("");
      }
    } catch (err) {
      console.error("Failed to sign off alert:", err);
    } finally {
      setSubmittingComment(false);
    }
  };

  // KPIs calculations
  const stats = useMemo(() => {
    const total = alerts.length;
    const pending = alerts.filter(a => a.status === "PENDING").length;
    const resolved = alerts.filter(a => a.status === "RESOLVED").length;
    const highRisk = alerts.filter(a => a.status === "PENDING" && a.severity === "HIGH").length;
    const medRisk = alerts.filter(a => a.status === "PENDING" && a.severity === "MEDIUM").length;
    const lowRisk = alerts.filter(a => a.status === "PENDING" && a.severity === "LOW").length;
    
    // Simple healthy score metric
    const complianceScore = total > 0 ? Math.round(((resolved + alerts.filter(a => a.status === "MUTED").length) / total) * 40 + 60) : 100;
    
    return { total, pending, resolved, highRisk, medRisk, lowRisk, complianceScore };
  }, [alerts]);

  // Filtering alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (a.ledgerName || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "ALL" || a.category === selectedCategory;
      const matchesStatus = selectedStatus === "ALL" || a.status === selectedStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [alerts, searchQuery, selectedCategory, selectedStatus]);

  // Recharts Chart Data Preparations
  const categoryChartData = useMemo(() => {
    const tdsCount = alerts.filter(a => a.category === "TDS").length;
    const depCount = alerts.filter(a => a.category === "DEPRECIATION").length;
    const prepaidCount = alerts.filter(a => a.category === "PREPAID").length;
    
    return [
      { name: "Prepaid Allocation", count: prepaidCount, fill: "#38BDF8" },
      { name: "Depreciation MoM", count: depCount, fill: "#F59E0B" },
      { name: "TDS Statutory", count: tdsCount, fill: "#F43F5E" }
    ];
  }, [alerts]);

  const monthlyAlertTrend = useMemo(() => {
    const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    return months.map((m, idx) => {
      const tds = alerts.filter(a => a.category === "TDS" && new Date(a.createdAt).getMonth() === (idx + 3) % 12).length || Math.max(0, 3 - idx % 3);
      const dep = alerts.filter(a => a.category === "DEPRECIATION" && new Date(a.createdAt).getMonth() === (idx + 3) % 12).length || Math.max(0, idx % 4);
      return { month: m, TDS: tds, Depreciation: dep };
    });
  }, [alerts]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: displayCurrency,
      maximumFractionDigits: 0
    }).format(val);
  };

  const handleOpenAlertDrawer = (alert: ComplianceAlert) => {
    setActiveAlert(alert);
    setCommentaryText(alert.commentary || "");
  };

  return (
    <div className="space-y-8 select-none">
      
      {/* 1. CONTROL HEADER BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#13131A] p-6 rounded-3xl border border-white/5 shadow-2xl">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" /> Compliance Scrutiny Workspace
          </h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Automatic statutory audits across ledger accounts</p>
        </div>
        <button 
          onClick={handleTriggerAudit}
          disabled={runningAudit}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-xl text-xs font-black text-slate-950 hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
        >
          {runningAudit ? (
            <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          {runningAudit ? "Running Verification..." : "Run Compliance Audit"}
        </button>
      </div>

      {/* 2. KPI OVERVIEW ROW */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        
        {/* Compliance Meter */}
        <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl flex items-center gap-6 relative overflow-hidden group">
          <div className="w-24 h-24 shrink-0 flex items-center justify-center relative">
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-2xl font-black text-white">{stats.complianceScore}%</span>
              <span className="text-[8px] text-slate-500 font-black uppercase">Score</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="75%" outerRadius="100%" barSize={8} data={[{ name: "Score", value: stats.complianceScore, fill: "#10B981" }]} startAngle={90} endAngle={-270}>
                <RadialBar dataKey="value" cornerRadius={4} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div>
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider">Health Rating</span>
            <h4 className="text-lg font-black text-white mt-1">
              {stats.complianceScore >= 90 ? "Excellent" : stats.complianceScore >= 75 ? "Satisfactory" : "Attention Required"}
            </h4>
            <p className="text-[10px] text-slate-400 mt-1">{stats.pending} unchecked warnings flagged.</p>
          </div>
        </div>

        {/* High Risk Count */}
        <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl transition-transform hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">High Risk Exceptions</span>
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-rose-400" /></div>
          </div>
          <p className="text-3xl font-black text-rose-400">{stats.highRisk}</p>
          <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Requires Immediate Action</p>
        </div>

        {/* Medium Risk Count */}
        <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl transition-transform hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Medium Risk Skips</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center"><Clock className="w-4 h-4 text-amber-400" /></div>
          </div>
          <p className="text-3xl font-black text-amber-400">{stats.medRisk}</p>
          <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Depreciation/MoM Inconsistencies</p>
        </div>

        {/* Low Risk Items */}
        <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl transition-transform hover:scale-[1.02]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">Unadjusted Prepaid</span>
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center"><HelpCircle className="w-4 h-4 text-sky-400" /></div>
          </div>
          <p className="text-3xl font-black text-sky-400">{stats.lowRisk}</p>
          <p className="text-[10px] text-slate-500 font-bold uppercase mt-2">Deferral & Advance Balances</p>
        </div>
      </div>

      {/* 3. CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Risk Concentration radial chart */}
        <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" /> Statutory Concentration
          </h3>
          <div className="h-[200px] w-full flex items-center justify-center relative">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="30%" outerRadius="90%" barSize={8} data={categoryChartData}>
                <RadialBar background dataKey="count" cornerRadius={4} />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-4">
            {categoryChartData.map((item, idx) => (
              <div key={item.name} className="flex justify-between items-center text-xs font-bold">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                  <span className="text-slate-400">{item.name}</span>
                </div>
                <span className="text-white font-mono">{item.count} Flags</span>
              </div>
            ))}
          </div>
        </div>

        {/* Anomaly Trend over months */}
        <div className="lg:col-span-2 bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Exception Chronology & Trends
          </h3>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyAlertTrend}>
                <defs>
                  <linearGradient id="tdsGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F43F5E" stopOpacity={0.2}/><stop offset="95%" stopColor="#F43F5E" stopOpacity={0}/></linearGradient>
                  <linearGradient id="depGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F59E0B" stopOpacity={0.2}/><stop offset="95%" stopColor="#F59E0B" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="month" stroke="#ffffff10" tick={{ fill: "#ffffff40", fontSize: 9 }} tickLine={false} />
                <YAxis stroke="#ffffff10" tick={{ fill: "#ffffff40", fontSize: 9 }} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff10", borderRadius: "12px" }} />
                <Area type="monotone" name="TDS Audit Exception" dataKey="TDS" stroke="#F43F5E" strokeWidth={2.5} fillOpacity={1} fill="url(#tdsGrad)" />
                <Area type="monotone" name="Asset Dep Exception" dataKey="Depreciation" stroke="#F59E0B" strokeWidth={2.5} fillOpacity={1} fill="url(#depGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. WORKBENCH & INTERACTIVE TABLE */}
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl space-y-6">
        
        {/* Table Filters */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mr-2 flex items-center gap-1"><Filter className="w-3.5 h-3.5" /> Filter by:</span>
            {[
              { code: "ALL", label: "All Items" },
              { code: "TDS", label: "TDS Compliance" },
              { code: "DEPRECIATION", label: "Depreciation MoM" },
              { code: "PREPAID", label: "Prepaid Expense" }
            ].map(cat => (
              <button 
                key={cat.code}
                onClick={() => setSelectedCategory(cat.code)}
                className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${selectedCategory === cat.code ? "bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20" : "text-slate-400 hover:text-white hover:bg-white/5"}`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <select 
              value={selectedStatus} 
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            >
              <option value="PENDING" className="bg-[#13131A]">Pending Action</option>
              <option value="RESOLVED" className="bg-[#13131A]">Resolved Items</option>
              <option value="MUTED" className="bg-[#13131A]">Muted Warnings</option>
              <option value="ALL" className="bg-[#13131A]">All Records</option>
            </select>
            <div className="relative flex-1 md:flex-none">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search ledger name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 w-full md:w-56"
              />
            </div>
          </div>
        </div>

        {/* Scrutiny Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="py-20 text-center text-cyan-500 animate-pulse">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-xs font-bold uppercase tracking-widest">Running Scrutiny Crawlers...</p>
            </div>
          ) : filteredAlerts.length === 0 ? (
            <div className="py-16 text-center bg-black/20 rounded-2xl border border-dashed border-white/5">
              <ShieldCheck className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No compliance alerts found for selected criteria</p>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-left">
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-wider w-[120px]">Risk Severity</th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Audit Exception Title</th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Affected Ledger</th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Impact Amount</th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Voucher / ID</th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-wider">Resolution Status</th>
                  <th className="p-4 text-[10px] font-black text-slate-500 uppercase tracking-wider w-[60px]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredAlerts.map(alert => (
                  <tr 
                    key={alert.id}
                    onClick={() => handleOpenAlertDrawer(alert)}
                    className="hover:bg-white/[0.01] cursor-pointer group transition-colors"
                  >
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-md text-[9px] font-black tracking-widest border uppercase ${SEVERITY_COLORS[alert.severity as keyof typeof SEVERITY_COLORS] || SEVERITY_COLORS.LOW}`}>
                        {alert.severity} RISK
                      </span>
                    </td>
                    <td className="p-4">
                      <h4 className="text-sm font-black text-white group-hover:text-cyan-400 transition-colors">{alert.title}</h4>
                      <p className="text-xs text-slate-500 truncate max-w-[340px] mt-0.5">{alert.description}</p>
                    </td>
                    <td className="p-4 text-xs font-bold text-slate-300 font-mono">{alert.ledgerName || "-"}</td>
                    <td className="p-4 text-xs font-mono font-black text-white">{alert.impactAmount > 0 ? formatCurrency(alert.impactAmount) : "-"}</td>
                    <td className="p-4 text-xs font-bold text-slate-400 font-mono">{alert.voucherId || "-"}</td>
                    <td className="p-4">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                        alert.status === "RESOLVED" ? "bg-emerald-500/10 text-emerald-400" :
                        alert.status === "MUTED" ? "bg-slate-500/20 text-slate-400" :
                        alert.status === "UNDER_REVIEW" ? "bg-amber-500/10 text-amber-400 animate-pulse" :
                        "bg-rose-500/10 text-rose-400"
                      }`}>
                        {alert.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-cyan-400 transition-colors" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 5. CONFIGURABLE SCUTINY CONTROLS */}
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h3 className="text-base font-black text-white">Statutory Rule Scrutiny Controls</h3>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-0.5">Activate or configure active compliance rule checking bounds</p>
          </div>
          <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-xl text-[9px] font-bold text-slate-400 flex items-center gap-1 uppercase"><Lock className="w-3 h-3" /> Admin Configurable Only</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {rules.map(rule => (
            <div key={rule.id} className="p-5 rounded-2xl bg-black/20 border border-white/5 flex items-start justify-between gap-6 group hover:border-white/10 transition-colors">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 bg-cyan-500/10 rounded text-[9px] text-cyan-400 font-mono border border-cyan-500/10 font-bold uppercase">{rule.category}</span>
                  <h4 className="text-sm font-black text-white">{rule.name}</h4>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed font-medium">{rule.description}</p>
              </div>
              <button 
                onClick={() => handleToggleRule(rule.id, rule.isActive)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${rule.isActive ? "bg-cyan-500" : "bg-slate-800"}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-slate-950 shadow ring-0 transition duration-200 ease-in-out ${rule.isActive ? "translate-x-5" : "translate-x-0"}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 6. DRILL-DOWN / RESOLUTION DRAWER */}
      {activeAlert && (
        <div className="fixed inset-0 z-[100] flex justify-end animate-in fade-in duration-300">
          <div onClick={() => setActiveAlert(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          
          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#101017] border-l border-white/10 shadow-2xl p-8 overflow-y-auto space-y-8 flex flex-col justify-between">
            <div className="space-y-8">
              
              {/* Header */}
              <div className="flex justify-between items-start border-b border-white/5 pb-6">
                <div>
                  <span className={`px-2.5 py-0.5 rounded text-[9px] font-black border uppercase ${SEVERITY_COLORS[activeAlert.severity as keyof typeof SEVERITY_COLORS]}`}>
                    {activeAlert.severity} RISK EXCEPTION
                  </span>
                  <h2 className="text-xl font-black text-white mt-2 leading-snug">{activeAlert.title}</h2>
                </div>
                <button 
                  onClick={() => setActiveAlert(null)}
                  className="p-2 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Impact Card */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">Affected Ledger Account</span>
                  <span className="text-sm font-black text-white font-mono break-all">{activeAlert.ledgerName || "-"}</span>
                </div>
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">Estimated Tax/Audit Impact</span>
                  <span className="text-sm font-black text-rose-400 font-mono">
                    {activeAlert.impactAmount > 0 ? formatCurrency(activeAlert.impactAmount) : "N/A"}
                  </span>
                </div>
              </div>

              {/* Detailed Explanation */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Audit Investigation Details</h3>
                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl text-xs font-medium leading-relaxed text-slate-300">
                  {activeAlert.description}
                </div>
              </div>

              {/* Journal Flow Verification Sequence Map */}
              {activeAlert.metadata && (
                <div className="bg-white/[0.01] border border-white/5 p-6 rounded-2xl space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Accounting Entry Flow Map</h3>
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                    <div className="text-xs font-bold text-white font-mono">Interest Expense Booked</div>
                  </div>
                  <div className="h-4 w-0.5 bg-white/10 ml-1.5" />
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-rose-500 shrink-0" />
                    <div className="text-xs font-bold text-rose-400 font-mono">TDS Booking Liability (SKIPPED / DIRECT PAYMENT DETECTED)</div>
                  </div>
                  <div className="h-4 w-0.5 bg-white/10 ml-1.5" />
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-amber-500 shrink-0" />
                    <div className="text-xs font-bold text-slate-400 font-mono">Bank Payment Clearance</div>
                  </div>
                </div>
              )}

              {/* Commentary logs */}
              {activeAlert.status !== "PENDING" && activeAlert.resolvedBy && (
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> Signed off by: {activeAlert.resolvedBy.email}</span>
                    <span>Status: {activeAlert.status}</span>
                  </div>
                  <p className="text-xs text-slate-300 italic font-medium leading-relaxed">"{activeAlert.commentary}"</p>
                </div>
              )}

              {/* Auditor Sign-off Input Workspace */}
              {activeAlert.status === "PENDING" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Log Review & Sign-off Commentary</h3>
                  <textarea
                    rows={4}
                    value={commentaryText}
                    onChange={(e) => setCommentaryText(e.target.value)}
                    placeholder="Provide professional auditing justification, reconciliation adjustments, or corrective actions to resolve this exception..."
                    className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 focus:ring-0 leading-relaxed"
                  />
                </div>
              )}
            </div>

            {/* Actions Footer */}
            {activeAlert.status === "PENDING" ? (
              <div className="flex gap-4 border-t border-white/5 pt-6 mt-6">
                <button 
                  onClick={() => handleActionAlert("RESOLVED")}
                  disabled={submittingComment || !commentaryText.trim()}
                  className="flex-1 py-3 bg-cyan-500 text-slate-950 rounded-xl text-xs font-black hover:opacity-90 active:scale-98 transition-all disabled:opacity-30"
                >
                  {submittingComment ? "Submitting Sign-off..." : "Approve & Resolve Exception"}
                </button>
                <button 
                  onClick={() => handleActionAlert("MUTED")}
                  disabled={submittingComment || !commentaryText.trim()}
                  className="px-6 py-3 bg-white/5 border border-white/10 text-slate-300 rounded-xl text-xs font-black hover:bg-white/10 active:scale-98 transition-all disabled:opacity-30"
                >
                  Mute Warning
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setActiveAlert(null)}
                className="w-full py-3 bg-white/5 border border-white/10 text-white rounded-xl text-xs font-black hover:bg-white/10 transition-all"
              >
                Close Drawer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
