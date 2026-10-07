"use client";

import React, { useState, useEffect } from "react";
import { 
  Building2, 
  ShieldCheck, 
  ShieldAlert, 
  AlertTriangle, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  ArrowRight, 
  Calendar, 
  FileText, 
  TrendingUp, 
  Layers, 
  Eye, 
  Info, 
  Link2, 
  Unlink, 
  DownloadCloud, 
  Search, 
  Filter, 
  HelpCircle,
  Clock,
  Briefcase,
  AlertCircle
} from "lucide-react";
import { getFinancialYearMonths } from "@/lib/financial-periods";

interface GSTConnectDashboardProps {
  clientId: string;
  clientName: string;
  fiscalYearStartMonth?: number;
  initialYear?: number;
}

export function GSTConnectDashboard({
  clientId,
  clientName,
  fiscalYearStartMonth = 4,
  initialYear = 2025
}: GSTConnectDashboardProps) {
  // Connection State
  const [connection, setConnection] = useState<any>(null);
  const [loadingConn, setLoadingConn] = useState(true);
  const [connectGstinInput, setConnectGstinInput] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  // Period State
  const [selectedYear, setSelectedYear] = useState<number>(initialYear);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>("Mar");
  
  // Active Sub-Tab
  const [subTab, setSubTab] = useState<"overview" | "gstr1" | "gstr2b" | "gstr3b" | "compliance" | "insights">("overview");

  // Reconciliation Data State
  const [reconData, setReconData] = useState<any>(null);
  const [complianceData, setComplianceData] = useState<any>(null);
  const [loadingRecon, setLoadingRecon] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccessMsg, setSyncSuccessMsg] = useState<string | null>(null);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);

  // Drilldown Modal State
  const [drilldownItem, setDrilldownItem] = useState<any>(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Generate Canonical Months for selected FY
  const fyMonths = getFinancialYearMonths(selectedYear, "APR_MAR", fiscalYearStartMonth);
  const currentSelectedMonth = fyMonths.find(m => m.monthName.toLowerCase() === selectedMonthKey.toLowerCase()) || fyMonths[fyMonths.length - 1];
  const activePeriodStr = currentSelectedMonth.periodKey; // e.g. "2026-03"

  // 1. Fetch Connection Status
  const fetchConnection = async () => {
    try {
      setLoadingConn(true);
      const res = await fetch(`/api/clients/${clientId}/gst/connection`);
      if (res.ok) {
        const data = await res.json();
        setConnection(data);
      }
    } catch (err) {
      console.error("Failed to fetch GST connection:", err);
    } finally {
      setLoadingConn(false);
    }
  };

  useEffect(() => {
    fetchConnection();
  }, [clientId]);

  // 2. Fetch Reconciliation & Compliance Data
  const fetchData = async () => {
    if (!connection?.isConnected) return;
    try {
      setLoadingRecon(true);
      const [reconRes, compRes] = await Promise.all([
        fetch(`/api/clients/${clientId}/gst/reconciliation?period=${activePeriodStr}&type=ALL`),
        fetch(`/api/clients/${clientId}/gst/compliance?period=${activePeriodStr}`)
      ]);

      if (reconRes.ok) {
        const rData = await reconRes.json();
        setReconData(rData);
      }
      if (compRes.ok) {
        const cData = await compRes.json();
        setComplianceData(cData);
      }
    } catch (err) {
      console.error("Failed to load GST data:", err);
    } finally {
      setLoadingRecon(false);
    }
  };

  useEffect(() => {
    if (connection?.isConnected) {
      fetchData();
    }
  }, [clientId, connection?.isConnected, activePeriodStr]);

  // 3. Connect Handler
  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connectGstinInput) return;
    setIsConnecting(true);
    setConnectError(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/gst/connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gstin: connectGstinInput.trim() })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Connection failed.");
      }
      await fetchConnection();
    } catch (err: any) {
      setConnectError(err?.message || "Failed to connect GSTIN.");
    } finally {
      setIsConnecting(false);
    }
  };

  // 4. Disconnect Handler
  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect GST integration? This will revoke active API tokens.")) return;
    try {
      const res = await fetch(`/api/clients/${clientId}/gst/connection`, { method: "DELETE" });
      if (res.ok) {
        await fetchConnection();
        setReconData(null);
        setComplianceData(null);
      }
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  };

  // 5. Sync Handler
  const handleSync = async (dataType: string = "ALL") => {
    setSyncing(true);
    setSyncSuccessMsg(null);
    setSyncErrorMsg(null);

    try {
      const res = await fetch(`/api/clients/${clientId}/gst/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period: activePeriodStr,
          dataType,
          financialYear: `FY ${selectedYear}-${(selectedYear + 1).toString().slice(-2)}`
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Sync failed.");
      }
      setSyncSuccessMsg(`Successfully synchronized ${data.recordsFetched} GST records for ${activePeriodStr}.`);
      await fetchConnection();
      await fetchData();
    } catch (err: any) {
      setSyncErrorMsg(err?.message || "Failed to synchronize GST data.");
    } finally {
      setSyncing(false);
    }
  };

  const formatCurrency = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
    if (abs >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
    return `₹${val.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  };

  if (loadingConn) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-[#13131A] rounded-2xl border border-white/5 space-y-4">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
        <p className="text-slate-400 font-medium">Checking GST Connect integration status...</p>
      </div>
    );
  }

  // DISCONNECTED STATE
  if (!connection?.isConnected) {
    return (
      <div className="space-y-6">
        <div className="bg-gradient-to-br from-[#13131A] to-[#181824] p-8 md:p-12 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          
          <div className="max-w-2xl space-y-6 relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-black uppercase tracking-wider">
              <Link2 className="w-3.5 h-3.5" /> GSP / GSTN API Integration
            </div>
            
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
              Connect GSTIN for {clientName}
            </h1>
            
            <p className="text-slate-400 text-base leading-relaxed">
              Synchronize GSTR-1, GSTR-2B, and GSTR-3B filings directly through compliant GSTN-authorized GSP APIs. Enable automated 3-way sales reconciliation, ITC leakage detection, and statutory CFO compliance insights.
            </p>

            <form onSubmit={handleConnect} className="space-y-4 pt-2">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300">Enter Taxpayer GSTIN</label>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="text"
                    value={connectGstinInput}
                    onChange={(e) => setConnectGstinInput(e.target.value.toUpperCase())}
                    placeholder="e.g. 27AAAAA0000A1Z5"
                    maxLength={15}
                    className="flex-1 px-4 py-3.5 bg-black/40 border border-white/10 rounded-xl text-white font-mono text-base focus:outline-none focus:border-cyan-500 transition-colors uppercase placeholder:text-slate-600"
                  />
                  <button
                    type="submit"
                    disabled={isConnecting || !connectGstinInput}
                    className="px-6 py-3.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-black rounded-xl transition-all shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    {isConnecting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" /> Authenticating...
                      </>
                    ) : (
                      <>
                        <Link2 className="w-4 h-4" /> Connect GSTIN
                      </>
                    )}
                  </button>
                </div>
              </div>

              {connectError && (
                <div className="flex items-center gap-2 p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{connectError}</span>
                </div>
              )}
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/5">
              <div className="flex items-center gap-3 text-slate-400 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>GSTN-Authorized APIs</span>
              </div>
              <div className="flex items-center gap-3 text-slate-400 text-xs">
                <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Strict Tenant Isolation</span>
              </div>
              <div className="flex items-center gap-3 text-slate-400 text-xs">
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />
                <span>Zero Portal Scraping</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // CONNECTED STATE
  return (
    <div className="space-y-6">
      {/* 1. TOP BAR: CONNECTION PROFILE & PERIOD SELECTOR */}
      <div className="bg-[#13131A] p-6 rounded-3xl border border-white/10 shadow-xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/5">
          {/* Left: GSTIN & Taxpayer Profile */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 mt-1">
              <Building2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-black text-white tracking-tight">{connection.legalName || clientName}</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300 text-xs font-mono font-bold">
                  {connection.gstin}
                </span>
              </div>
              <p className="text-xs text-slate-400 flex flex-wrap items-center gap-3">
                <span>State Code: <strong className="text-slate-200">{connection.stateCode}</strong></span>
                <span>•</span>
                <span>Type: <strong className="text-slate-200">{connection.taxpayerType || "Regular"}</strong></span>
                <span>•</span>
                <span>Status: <strong className="text-emerald-400">{connection.registrationStatus || "Active"}</strong></span>
                <span>•</span>
                <span>Provider: <strong className="text-cyan-400">{connection.provider}</strong></span>
              </p>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => handleSync("ALL")}
              disabled={syncing}
              className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-black rounded-xl transition-all shadow-md shadow-cyan-500/20 flex items-center gap-2 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Synchronizing GST Data..." : "Sync GST Data"}
            </button>
            <button
              onClick={handleDisconnect}
              className="px-3.5 py-2.5 bg-white/5 hover:bg-red-500/10 hover:text-red-400 text-slate-400 rounded-xl transition-colors border border-white/5 flex items-center gap-2 text-xs font-bold"
            >
              <Unlink className="w-3.5 h-3.5" /> Disconnect
            </button>
          </div>
        </div>

        {/* Sync feedback alerts */}
        {syncSuccessMsg && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{syncSuccessMsg}</span>
          </div>
        )}
        {syncErrorMsg && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{syncErrorMsg}</span>
          </div>
        )}

        {/* Period Selector Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Analysis Period:</span>
            <span className="text-xs font-black text-white bg-black/40 px-3 py-1 rounded-lg border border-white/5">
              {currentSelectedMonth.label} ({activePeriodStr})
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1">
            {fyMonths.map((m) => {
              const isActive = m.monthName.toLowerCase() === selectedMonthKey.toLowerCase();
              return (
                <button
                  key={m.periodKey}
                  onClick={() => setSelectedMonthKey(m.monthName)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    isActive
                      ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-black"
                      : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {m.monthName}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. SUB-TAB NAVIGATION */}
      <div className="flex flex-wrap items-center gap-1 bg-[#13131A] p-1.5 rounded-2xl border border-white/5 w-fit shadow-lg">
        <button
          onClick={() => setSubTab("overview")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
            subTab === "overview" ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20" : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> Overview
        </button>
        <button
          onClick={() => setSubTab("gstr1")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
            subTab === "gstr1" ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20" : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <FileText className="w-3.5 h-3.5" /> GSTR-1 vs Books (Sales)
        </button>
        <button
          onClick={() => setSubTab("gstr2b")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
            subTab === "gstr2b" ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20" : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <DownloadCloud className="w-3.5 h-3.5" /> GSTR-2B vs Books (ITC)
        </button>
        <button
          onClick={() => setSubTab("gstr3b")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
            subTab === "gstr3b" ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20" : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" /> GSTR-3B 3-Way Recon
        </button>
        <button
          onClick={() => setSubTab("compliance")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
            subTab === "compliance" ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20" : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" /> Compliance & Audit
        </button>
        <button
          onClick={() => setSubTab("insights")}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
            subTab === "insights" ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20" : "text-slate-400 hover:text-white hover:bg-white/5"
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" /> CFO Insights
        </button>
      </div>

      {loadingRecon ? (
        <div className="flex flex-col items-center justify-center p-20 bg-[#13131A] rounded-2xl border border-white/5 space-y-4">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-slate-400 font-medium text-sm">Evaluating GST reconciliations and compliance rules for {activePeriodStr}...</p>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* TAB 1: OVERVIEW */}
          {subTab === "overview" && (
            <div className="space-y-6">
              {/* Return Filing Status Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-[#13131A] p-5 rounded-2xl border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">GSTR-1 Outward Status</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> FILED
                    </span>
                  </div>
                  <div className="text-xl font-black text-white">
                    {formatCurrency(reconData?.salesRecon?.summary?.totalGstTaxable || 0)}
                  </div>
                  <p className="text-xs text-slate-500">Reported B2B & B2C Taxable Turnover</p>
                </div>

                <div className="bg-[#13131A] p-5 rounded-2xl border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">GSTR-2B ITC Status</span>
                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-xs font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> AVAILABLE
                    </span>
                  </div>
                  <div className="text-xl font-black text-white">
                    {formatCurrency(reconData?.itcRecon?.summary?.totalGst2bITC || 0)}
                  </div>
                  <p className="text-xs text-slate-500">Auto-Drafted Eligible Input Tax Credit</p>
                </div>

                <div className="bg-[#13131A] p-5 rounded-2xl border border-white/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">GSTR-3B Monthly Return</span>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {reconData?.gstr3bRecon?.filingStatus || "FILED"}
                    </span>
                  </div>
                  <div className="text-xl font-black text-white">
                    {formatCurrency(reconData?.gstr3bRecon?.gstr3bOutwardTaxable || reconData?.salesRecon?.summary?.totalGstTaxable || 0)}
                  </div>
                  <p className="text-xs text-slate-500">Tax Discharged in Return</p>
                </div>
              </div>

              {/* Core Reconciliation KPIs */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[#13131A] p-5 rounded-2xl border border-white/5 space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase">Sales Match Rate</span>
                  <div className="text-2xl font-black text-emerald-400">
                    {reconData?.salesRecon?.summary?.matchRatePct ?? 100}%
                  </div>
                  <p className="text-xs text-slate-500">
                    {reconData?.salesRecon?.summary?.matchedCount || 0} Matched / {reconData?.salesRecon?.summary?.mismatchedCount || 0} Mismatched
                  </p>
                </div>

                <div className="bg-[#13131A] p-5 rounded-2xl border border-white/5 space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase">Turnover Variance</span>
                  <div className={`text-2xl font-black ${(reconData?.salesRecon?.summary?.taxableVariance || 0) === 0 ? "text-slate-200" : "text-amber-400"}`}>
                    {formatCurrency(reconData?.salesRecon?.summary?.taxableVariance || 0)}
                  </div>
                  <p className="text-xs text-slate-500">Books vs GSTR-1 Difference</p>
                </div>

                <div className="bg-[#13131A] p-5 rounded-2xl border border-white/5 space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase">Unmatched ITC</span>
                  <div className={`text-2xl font-black ${(reconData?.itcRecon?.summary?.itcVariance || 0) <= 0 ? "text-slate-200" : "text-rose-400"}`}>
                    {formatCurrency(reconData?.itcRecon?.summary?.itcVariance || 0)}
                  </div>
                  <p className="text-xs text-slate-500">In Books but Missing in 2B</p>
                </div>

                <div className="bg-[#13131A] p-5 rounded-2xl border border-white/5 space-y-1">
                  <span className="text-xs font-bold text-slate-400 uppercase">Compliance Alerts</span>
                  <div className="text-2xl font-black text-cyan-400">
                    {complianceData?.compliance?.totalFindings || 0}
                  </div>
                  <p className="text-xs text-slate-500">
                    {complianceData?.compliance?.highRiskCount || 0} High Priority Exceptions
                  </p>
                </div>
              </div>

              {/* Quick Summary Card */}
              <div className="bg-[#13131A] p-6 rounded-2xl border border-white/5 space-y-4">
                <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  Executive GST Diagnostic Summary ({activePeriodStr})
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {reconData?.gstr3bRecon?.riskSummary || "All synchronized GST datasets are reconciled with accounting records."}
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: GSTR-1 VS BOOKS (SALES) */}
          {subTab === "gstr1" && (
            <div className="space-y-6">
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#13131A] p-4 rounded-xl border border-white/5">
                  <span className="text-xs text-slate-400">Books Taxable Turnover</span>
                  <div className="text-lg font-black text-white">{formatCurrency(reconData?.salesRecon?.summary?.totalBooksTaxable || 0)}</div>
                </div>
                <div className="bg-[#13131A] p-4 rounded-xl border border-white/5">
                  <span className="text-xs text-slate-400">GSTR-1 Taxable Turnover</span>
                  <div className="text-lg font-black text-cyan-400">{formatCurrency(reconData?.salesRecon?.summary?.totalGstTaxable || 0)}</div>
                </div>
                <div className="bg-[#13131A] p-4 rounded-xl border border-white/5">
                  <span className="text-xs text-slate-400">Taxable Variance</span>
                  <div className={`text-lg font-black ${(reconData?.salesRecon?.summary?.taxableVariance || 0) === 0 ? "text-emerald-400" : "text-amber-400"}`}>
                    {formatCurrency(reconData?.salesRecon?.summary?.taxableVariance || 0)}
                  </div>
                </div>
                <div className="bg-[#13131A] p-4 rounded-xl border border-white/5">
                  <span className="text-xs text-slate-400">Match Rate</span>
                  <div className="text-lg font-black text-emerald-400">{reconData?.salesRecon?.summary?.matchRatePct ?? 100}%</div>
                </div>
              </div>

              {/* Table */}
              <div className="bg-[#13131A] rounded-2xl border border-white/5 overflow-hidden">
                <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row justify-between gap-3">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-cyan-400" /> Sales Documents Reconciled ({reconData?.salesRecon?.items?.length || 0})
                  </h3>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Search document / party..."
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      className="px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-slate-400 font-bold uppercase tracking-wider border-b border-white/5">
                      <tr>
                        <th className="p-3.5">Invoice #</th>
                        <th className="p-3.5">Customer / Party</th>
                        <th className="p-3.5 text-right">Books Taxable</th>
                        <th className="p-3.5 text-right">GSTR-1 Taxable</th>
                        <th className="p-3.5 text-right">Variance</th>
                        <th className="p-3.5 text-center">Status</th>
                        <th className="p-3.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {(reconData?.salesRecon?.items || [])
                        .filter((it: any) => {
                          if (!filterSearch) return true;
                          const s = filterSearch.toLowerCase();
                          return (it.documentNumber || "").toLowerCase().includes(s) || (it.customerName || "").toLowerCase().includes(s);
                        })
                        .map((it: any) => (
                          <tr key={it.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="p-3.5 font-mono font-bold text-white">{it.documentNumber}</td>
                            <td className="p-3.5">
                              <div>{it.customerName || "B2B Customer"}</div>
                              {it.customerGSTIN && <div className="text-[10px] text-slate-500 font-mono">{it.customerGSTIN}</div>}
                            </td>
                            <td className="p-3.5 text-right font-mono">{formatCurrency(it.booksTaxable)}</td>
                            <td className="p-3.5 text-right font-mono text-cyan-400">{formatCurrency(it.gstTaxable)}</td>
                            <td className={`p-3.5 text-right font-mono font-bold ${it.taxableDiff === 0 ? "text-slate-400" : "text-amber-400"}`}>
                              {formatCurrency(it.taxableDiff)}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                it.status === "MATCHED" 
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : it.status === "MISSING_IN_GST"
                                    ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                    : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              }`}>
                                {it.status}
                              </span>
                            </td>
                            <td className="p-3.5 text-center">
                              <button
                                onClick={() => setDrilldownItem(it)}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GSTR-2B VS BOOKS (ITC) */}
          {subTab === "gstr2b" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#13131A] p-4 rounded-xl border border-white/5">
                  <span className="text-xs text-slate-400">Books ITC Claimed</span>
                  <div className="text-lg font-black text-white">{formatCurrency(reconData?.itcRecon?.summary?.totalBooksITC || 0)}</div>
                </div>
                <div className="bg-[#13131A] p-4 rounded-xl border border-white/5">
                  <span className="text-xs text-slate-400">GSTR-2B Available ITC</span>
                  <div className="text-lg font-black text-cyan-400">{formatCurrency(reconData?.itcRecon?.summary?.totalGst2bITC || 0)}</div>
                </div>
                <div className="bg-[#13131A] p-4 rounded-xl border border-white/5">
                  <span className="text-xs text-slate-400">Unmatched ITC Gap</span>
                  <div className={`text-lg font-black ${(reconData?.itcRecon?.summary?.itcVariance || 0) <= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {formatCurrency(reconData?.itcRecon?.summary?.itcVariance || 0)}
                  </div>
                </div>
                <div className="bg-[#13131A] p-4 rounded-xl border border-white/5">
                  <span className="text-xs text-slate-400">2B Match Rate</span>
                  <div className="text-lg font-black text-emerald-400">{reconData?.itcRecon?.summary?.matchRatePct ?? 100}%</div>
                </div>
              </div>

              <div className="bg-[#13131A] rounded-2xl border border-white/5 overflow-hidden">
                <div className="p-4 border-b border-white/5 flex flex-col sm:flex-row justify-between gap-3">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <DownloadCloud className="w-4 h-4 text-cyan-400" /> Supplier Invoices Reconciled ({reconData?.itcRecon?.items?.length || 0})
                  </h3>
                  <input
                    type="text"
                    placeholder="Search supplier / invoice..."
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    className="px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-slate-400 font-bold uppercase tracking-wider border-b border-white/5">
                      <tr>
                        <th className="p-3.5">Invoice #</th>
                        <th className="p-3.5">Supplier</th>
                        <th className="p-3.5">Supplier GSTIN</th>
                        <th className="p-3.5 text-right">Books ITC</th>
                        <th className="p-3.5 text-right">GSTR-2B ITC</th>
                        <th className="p-3.5 text-right">ITC Diff</th>
                        <th className="p-3.5 text-center">Match Status</th>
                        <th className="p-3.5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {(reconData?.itcRecon?.items || [])
                        .filter((it: any) => {
                          if (!filterSearch) return true;
                          const s = filterSearch.toLowerCase();
                          return (it.invoiceNumber || "").toLowerCase().includes(s) || (it.supplierName || "").toLowerCase().includes(s) || (it.supplierGSTIN || "").toLowerCase().includes(s);
                        })
                        .map((it: any) => (
                          <tr key={it.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="p-3.5 font-mono font-bold text-white">{it.invoiceNumber}</td>
                            <td className="p-3.5">{it.supplierName || "Sundry Creditor"}</td>
                            <td className="p-3.5 font-mono text-[10px] text-slate-400">{it.supplierGSTIN}</td>
                            <td className="p-3.5 text-right font-mono">{formatCurrency(it.booksTotalITC)}</td>
                            <td className="p-3.5 text-right font-mono text-cyan-400">{formatCurrency(it.gst2bTotalITC)}</td>
                            <td className={`p-3.5 text-right font-mono font-bold ${it.itcDiff === 0 ? "text-slate-400" : "text-rose-400"}`}>
                              {formatCurrency(it.itcDiff)}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                it.status === "MATCHED"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                              }`}>
                                {it.status}
                              </span>
                            </td>
                            <td className="p-3.5 text-center">
                              <button
                                onClick={() => setDrilldownItem(it)}
                                className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: GSTR-3B 3-WAY RECON */}
          {subTab === "gstr3b" && (
            <div className="space-y-6">
              <div className="bg-[#13131A] p-6 rounded-2xl border border-white/5 space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-cyan-400" />
                    3-Way Return Reconciliation (Books ↔ GSTR-1 ↔ GSTR-3B)
                  </h3>
                  <span className="text-xs text-slate-400">Period: {activePeriodStr}</span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-white/5 text-slate-400 font-bold uppercase tracking-wider border-b border-white/5">
                      <tr>
                        <th className="p-3.5">Reconciliation Component</th>
                        <th className="p-3.5 text-right">Accounting Books</th>
                        <th className="p-3.5 text-right">GSTR-1</th>
                        <th className="p-3.5 text-right">GSTR-3B</th>
                        <th className="p-3.5 text-right">Net Variance</th>
                        <th className="p-3.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      <tr>
                        <td className="p-3.5 font-bold text-white">Outward Taxable Supplies</td>
                        <td className="p-3.5 text-right font-mono">{formatCurrency(reconData?.gstr3bRecon?.booksOutwardTaxable || 0)}</td>
                        <td className="p-3.5 text-right font-mono text-cyan-400">{formatCurrency(reconData?.gstr3bRecon?.gstr1OutwardTaxable || 0)}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-400">{formatCurrency(reconData?.gstr3bRecon?.gstr3bOutwardTaxable || 0)}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-amber-400">{formatCurrency(reconData?.gstr3bRecon?.outwardTaxableVariance || 0)}</td>
                        <td className="p-3.5 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">BALANCED</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3.5 font-bold text-white">Output Tax Liability (IGST+CGST+SGST)</td>
                        <td className="p-3.5 text-right font-mono">{formatCurrency(reconData?.gstr3bRecon?.booksOutputTax || 0)}</td>
                        <td className="p-3.5 text-right font-mono text-cyan-400">{formatCurrency(reconData?.gstr3bRecon?.gstr1OutputTax || 0)}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-400">{formatCurrency(reconData?.gstr3bRecon?.gstr3bOutputTax || 0)}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-amber-400">{formatCurrency(reconData?.gstr3bRecon?.outputTaxVariance || 0)}</td>
                        <td className="p-3.5 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold">BALANCED</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="p-3.5 font-bold text-white">Input Tax Credit (ITC) Available vs Claimed</td>
                        <td className="p-3.5 text-right font-mono">{formatCurrency(reconData?.gstr3bRecon?.booksItcTotal || 0)}</td>
                        <td className="p-3.5 text-right font-mono text-cyan-400">{formatCurrency(reconData?.gstr3bRecon?.gstr2bItcTotal || 0)}</td>
                        <td className="p-3.5 text-right font-mono text-indigo-400">{formatCurrency(reconData?.gstr3bRecon?.gstr3bItcClaimed || 0)}</td>
                        <td className="p-3.5 text-right font-mono font-bold text-rose-400">{formatCurrency(reconData?.gstr3bRecon?.itcVariance || 0)}</td>
                        <td className="p-3.5 text-center">
                          <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-bold">MATCHED</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: COMPLIANCE & AUDIT */}
          {subTab === "compliance" && (
            <div className="space-y-4">
              {(complianceData?.compliance?.findings || []).length === 0 ? (
                <div className="bg-[#13131A] p-12 rounded-2xl border border-white/5 text-center space-y-2">
                  <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                  <h3 className="text-base font-bold text-white">Zero Compliance Exceptions Detected</h3>
                  <p className="text-xs text-slate-400">All outward turnover, ITC claims, and return filing dates comply with GST rules for {activePeriodStr}.</p>
                </div>
              ) : (
                complianceData.compliance.findings.map((f: any, idx: number) => (
                  <div key={idx} className="bg-[#13131A] p-5 rounded-2xl border border-white/5 space-y-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            f.severity === "HIGH" ? "bg-rose-500/10 text-rose-400 border border-rose-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}>
                            {f.severity}
                          </span>
                          <span className="text-xs font-mono text-slate-500">{f.ruleCode}</span>
                        </div>
                        <h4 className="text-sm font-black text-white">{f.title}</h4>
                      </div>
                      {f.impactAmount > 0 && (
                        <div className="text-right">
                          <div className="text-xs text-slate-400">Exposure</div>
                          <div className="text-sm font-mono font-bold text-amber-400">{formatCurrency(f.impactAmount)}</div>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{f.description}</p>
                    <div className="p-3 bg-black/40 rounded-xl border border-white/5 text-xs text-slate-400">
                      <strong className="text-cyan-400">Suggested Action: </strong>{f.suggestedAction}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 6: CFO INSIGHTS */}
          {subTab === "insights" && (
            <div className="space-y-4">
              {(complianceData?.insights || []).length === 0 ? (
                <div className="bg-[#13131A] p-12 rounded-2xl border border-white/5 text-center space-y-2">
                  <Info className="w-10 h-10 text-cyan-400 mx-auto" />
                  <h3 className="text-base font-bold text-white">No Material Anomalies</h3>
                  <p className="text-xs text-slate-400">GST filings and ledger records match consistently for {activePeriodStr}.</p>
                </div>
              ) : (
                complianceData.insights.map((ins: any) => (
                  <div key={ins.id} className="bg-[#13131A] p-6 rounded-2xl border border-white/5 space-y-4 shadow-lg">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ins.severity === "HIGH" ? "bg-rose-500/10 text-rose-400" : "bg-cyan-500/10 text-cyan-400"
                          }`}>
                            {ins.category}
                          </span>
                        </div>
                        <h4 className="text-base font-black text-white">{ins.title}</h4>
                      </div>
                      <div className="px-3 py-1 bg-black/40 rounded-lg text-xs font-mono font-bold text-cyan-400 border border-white/5">
                        {ins.metricValue}
                      </div>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div><strong className="text-slate-200">Observation: </strong><span className="text-slate-300">{ins.observation}</span></div>
                      <div><strong className="text-slate-200">Underlying Driver: </strong><span className="text-slate-400">{ins.driver}</span></div>
                      <div><strong className="text-slate-200">Financial Impact: </strong><span className="text-amber-400">{ins.financialImpact}</span></div>
                      <div><strong className="text-slate-200">Statutory Risk: </strong><span className="text-rose-400">{ins.risk}</span></div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="p-3 bg-cyan-500/5 rounded-xl border border-cyan-500/10 text-xs">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-400 mb-1">Recommended Action</div>
                        <p className="text-slate-300">{ins.managementAction}</p>
                      </div>
                      <div className="p-3 bg-indigo-500/5 rounded-xl border border-indigo-500/10 text-xs">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-400 mb-1">Key Question for Team</div>
                        <p className="text-slate-300">{ins.cfoQuestion}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

        </div>
      )}

      {/* DRILLDOWN MODAL */}
      {drilldownItem && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#13131A] rounded-3xl border border-white/10 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-black text-white">Reconciliation Line Drill-Down</h3>
                <p className="text-xs text-slate-400">Doc: {drilldownItem.documentNumber || drilldownItem.invoiceNumber}</p>
              </div>
              <button
                onClick={() => setDrilldownItem(null)}
                className="p-2 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-2">
                <span className="text-xs font-bold uppercase text-slate-400">Books Record</span>
                <div className="space-y-1 text-xs text-slate-300">
                  <div>Date: <strong className="text-white">{drilldownItem.documentDate || drilldownItem.invoiceDate}</strong></div>
                  <div>Taxable: <strong className="text-white">{formatCurrency(drilldownItem.booksTaxable || 0)}</strong></div>
                  <div>IGST: <strong className="text-white">{formatCurrency(drilldownItem.booksIgst || 0)}</strong></div>
                  <div>CGST: <strong className="text-white">{formatCurrency(drilldownItem.booksCgst || 0)}</strong></div>
                  <div>SGST: <strong className="text-white">{formatCurrency(drilldownItem.booksSgst || 0)}</strong></div>
                  <div className="pt-2 border-t border-white/5 font-bold text-cyan-400">
                    Total: {formatCurrency(drilldownItem.booksTotal || drilldownItem.booksTotalITC || 0)}
                  </div>
                </div>
              </div>

              <div className="p-4 bg-black/40 rounded-xl border border-white/5 space-y-2">
                <span className="text-xs font-bold uppercase text-cyan-400">GST Portal Record</span>
                <div className="space-y-1 text-xs text-slate-300">
                  <div>GSTIN: <strong className="text-white">{drilldownItem.customerGSTIN || drilldownItem.supplierGSTIN || "N/A"}</strong></div>
                  <div>Taxable: <strong className="text-white">{formatCurrency(drilldownItem.gstTaxable || drilldownItem.gst2bTaxable || 0)}</strong></div>
                  <div>IGST: <strong className="text-white">{formatCurrency(drilldownItem.gstIgst || drilldownItem.gst2bIgst || 0)}</strong></div>
                  <div>CGST: <strong className="text-white">{formatCurrency(drilldownItem.gstCgst || drilldownItem.gst2bCgst || 0)}</strong></div>
                  <div>SGST: <strong className="text-white">{formatCurrency(drilldownItem.gstSgst || drilldownItem.gst2bSgst || 0)}</strong></div>
                  <div className="pt-2 border-t border-white/5 font-bold text-cyan-400">
                    Total: {formatCurrency(drilldownItem.gstTotal || drilldownItem.gst2bTotalITC || 0)}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-cyan-500/5 rounded-xl border border-cyan-500/10 space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">Audit Diagnosis</span>
              <p className="text-xs text-slate-300 leading-relaxed">{drilldownItem.explanation}</p>
            </div>

            <div className="text-right">
              <button
                onClick={() => setDrilldownItem(null)}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
