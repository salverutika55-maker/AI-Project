"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { 
  CloudRain, 
  UploadCloud, 
  AlertCircle, 
  RefreshCw,
  BarChart3,
  TrendingDown,
  GitMerge,
  WalletCards,
  Building2,
  Plus
} from "lucide-react";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from "recharts";

export default function DashboardClient({ 
  initialRecords, 
  clients, 
  activeClientId 
}: { 
  initialRecords: any[], 
  clients: any[], 
  activeClientId: string | null 
}) {
  const [records, setRecords] = useState(initialRecords);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showNewClient, setShowNewClient] = useState(clients.length === 0);
  const [newClientName, setNewClientName] = useState("");
  const [syncModalSource, setSyncModalSource] = useState<string | null>(null);
  const [syncStep, setSyncStep] = useState(0); // 0=Idle, 1=Credentials, 2=TimePeriod
  const [syncCreds, setSyncCreds] = useState({ username: "", password: "" });
  const [syncRange, setSyncRange] = useState({
    startMonth: "01", startYear: "2023",
    endMonth: "12", endYear: "2023"
  });
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState("USD");
  const router = useRouter();

  const CURRENCY_LOCALES: Record<string, string> = {
    USD: 'en-US',
    INR: 'en-IN',
    EUR: 'de-DE',
    GBP: 'en-GB',
    AUD: 'en-AU',
    CAD: 'en-CA',
    JPY: 'ja-JP'
  };

  const MONTHS = [
    { v: "01", l: "Jan" }, { v: "02", l: "Feb" }, { v: "03", l: "Mar" }, { v: "04", l: "Apr" },
    { v: "05", l: "May" }, { v: "06", l: "Jun" }, { v: "07", l: "Jul" }, { v: "08", l: "Aug" },
    { v: "09", l: "Sep" }, { v: "10", l: "Oct" }, { v: "11", l: "Nov" }, { v: "12", l: "Dec" }
  ];
  const YEARS = ["2022", "2023", "2024", "2025", "2026"];

  const formatMoney = (amount: number, compact = false) => {
    const locale = CURRENCY_LOCALES[displayCurrency] || 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: displayCurrency,
      maximumFractionDigits: 0,
      notation: compact ? "compact" : "standard"
    }).format(amount);
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newClientName })
      });
      if (!res.ok) throw new Error("Failed to create client");
      const data = await res.json();
      router.push(`/dashboard?client=${data.client.id}`);
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (!activeClientId) return setError("Please select a client first.");
    const file = e.dataTransfer.files[0];
    if (file && file.type === "text/csv") {
      processCsv(file);
    } else {
      setError("Please drop a valid CSV file.");
    }
  };

  const processCsv = (file: File) => {
    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ records: results.data, clientId: activeClientId }),
          });
          if (!res.ok) throw new Error("Failed to upload CSV");
          window.location.reload();
        } catch (err: any) {
          setError(err.message);
          setLoading(false);
        }
      },
      error: (err) => {
        setError(err.message);
        setLoading(false);
      }
    });
  };

  const openWizard = (source: string) => {
    setSyncModalSource(source);
    setSyncStep(1); // Open Credentials
    setError("");
  };

  const submitCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncCreds.username || !syncCreds.password) {
      return setError("Please enter valid integration credentials");
    }
    setError("");
    setSyncStep(2); // Proceed to Time Period
  };

  const handleMockSyncFinal = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeClientId || !syncModalSource) return setError("Missing parameters");
    
    const startDate = `${syncRange.startYear}-${syncRange.startMonth}`;
    const endDate = `${syncRange.endYear}-${syncRange.endMonth}`;

    if (new Date(startDate) > new Date(endDate)) {
      return setError("Start date cannot be after end date.");
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          source: syncModalSource, 
          clientId: activeClientId,
          startDate,
          endDate
        }),
      });
      if (!res.ok) throw new Error("Authentication failed. " + (await res.json()).message);
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  // Safe manual override function when users click "Force Sync" on TopBar
  const handleQuickForceSync = async (source: string) => {
    if (!activeClientId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          source, 
          clientId: activeClientId,
          startDate: "2023-01", // Defaults for quick sync
          endDate: "2024-04"
        }),
      });
      if (res.ok) window.location.reload();
      else { setLoading(false); setError("Sync failed"); }
    } catch {
      setLoading(false);
    }
  };

  if (showNewClient) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="w-full max-w-md bg-[#13131A] border border-white/10 p-8 rounded-2xl shadow-xl">
          <Building2 className="w-12 h-12 text-cyan-400 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Create New Client</h2>
          <p className="text-sm text-slate-400 mb-6">Enter the business name of your client to isolate their financial data.</p>
          
          {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
          
          <form onSubmit={handleCreateClient}>
            <input 
              type="text" 
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              placeholder="e.g., Acme Corp LLC"
              className="w-full bg-[#0A0A0C] border border-white/10 rounded-lg px-4 py-3 text-white mb-4 focus:outline-none focus:border-cyan-500"
              required
            />
            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {loading && <RefreshCw className="w-4 h-4 animate-spin" />}
              {loading ? "Creating..." : "Initialize Client"}
            </button>
            {clients.length > 0 && (
              <button 
                type="button" 
                onClick={() => setShowNewClient(false)}
                className="w-full mt-3 text-sm text-slate-500 hover:text-white"
              >
                Cancel
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  const activeClientName = clients.find(c => c.id === activeClientId)?.name;

  const TopBar = () => (
    <div className="flex flex-col md:flex-row items-center justify-between mb-8 pb-6 border-b border-white/10 gap-4">
      <div className="flex items-center gap-4">
        <select 
          value={activeClientId || ""}
          onChange={(e) => router.push(`/dashboard?client=${e.target.value}`)}
          className="bg-[#13131A] border border-white/10 text-white font-bold text-xl px-4 py-2 rounded-lg cursor-pointer focus:outline-none focus:border-cyan-500 hover:bg-white/5 transition-all"
        >
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button 
          onClick={() => setShowNewClient(true)}
          className="bg-white/5 p-2 rounded-lg hover:bg-white/10 text-slate-300 transition-colors"
          title="Add New Client"
        >
          <Plus className="w-5 h-5" />
        </button>
        <select 
          value={displayCurrency}
          onChange={(e) => setDisplayCurrency(e.target.value)}
          className="bg-[#13131A] border border-white/10 text-white font-medium text-sm px-3 py-2 rounded-lg cursor-pointer focus:outline-none focus:border-cyan-500 hover:bg-white/5 transition-all ml-2"
        >
          <option value="USD">USD ($)</option>
          <option value="INR">INR (₹)</option>
          <option value="EUR">EUR (€)</option>
          <option value="GBP">GBP (£)</option>
          <option value="AUD">AUD (A$)</option>
          <option value="CAD">CAD (C$)</option>
          <option value="JPY">JPY (¥)</option>
        </select>
      </div>
      {records.length > 0 && (
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleQuickForceSync(records[records.length - 1].source)}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-sm text-white transition-colors"
          >
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Force Sync
          </button>
          <button 
            onClick={() => setShowIntegrations(true)}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-medium rounded-lg text-sm transition-colors"
          >
            Manage Data Source
          </button>
        </div>
      )}
    </div>
  );

  if (records.length === 0 || showIntegrations) {
    return (
      <div className="space-y-4 animate-in fade-in duration-500">
        <TopBar />
        <div className="flex flex-col items-center justify-center">
          <div className="w-full max-w-4xl bg-[#13131A] border border-white/10 rounded-2xl p-10 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-emerald-500"></div>
            <CloudRain className="w-16 h-16 text-cyan-400 mx-auto mb-6" />
            <h2 className="text-3xl font-bold text-white mb-2">Connect {activeClientName}'s Financials</h2>
            <p className="text-slate-400 mb-10 text-lg">
              Synchronize accounting software or securely drop a generic CSV to redefine the analytics.
            </p>

            {error && (
               <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-4 rounded-xl mb-6 flex items-center justify-center gap-2">
                 <AlertCircle className="w-5 h-5" />
                 {error}
               </div>
            )}

            {syncModalSource === 'Tally' && syncStep === 0 ? (
              <div className="bg-[#0A0A0C] border border-white/10 rounded-2xl p-8 max-w-md mx-auto animate-in zoom-in-95 duration-200">
                <h3 className="text-xl font-bold text-white mb-4">Select Tally Version</h3>
                <div className="space-y-3 mb-6">
                  <button onClick={() => openWizard("Tally ERP 9")} className="w-full block bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-400 hover:border-cyan-500/50 border border-white/10 p-4 rounded-xl text-left  transition-all text-white font-medium">Tally ERP 9</button>
                  <button onClick={() => openWizard("Tally Prime")} className="w-full block bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-400 hover:border-cyan-500/50 border border-white/10 p-4 rounded-xl text-left transition-all text-white font-medium">Tally Prime</button>
                  <button onClick={() => openWizard("Tally Cloud API")} className="w-full block bg-white/5 hover:bg-cyan-500/20 hover:text-cyan-400 hover:border-cyan-500/50 border border-white/10 p-4 rounded-xl text-left transition-all text-white font-medium">Tally Default API Route</button>
                </div>
                <button onClick={() => setSyncModalSource(null)} className="text-sm text-slate-500 hover:text-white">Cancel</button>
              </div>
            ) : syncStep === 1 ? (
              <div className="bg-[#0A0A0C] border border-white/10 rounded-2xl p-8 max-w-md mx-auto animate-in zoom-in-95 duration-200 text-left">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center"><CloudRain className="w-5 h-5 text-cyan-400" /></div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Authenticate {syncModalSource}</h3>
                    <p className="text-xs text-slate-500 uppercase tracking-widest">{activeClientName}</p>
                  </div>
                </div>
                <form onSubmit={submitCredentials}>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-slate-400 mb-1">Integration Username / API Email</label>
                    <input 
                      type="text" required 
                      value={syncCreds.username} onChange={(e) => setSyncCreds({...syncCreds, username: e.target.value})}
                      className="w-full bg-[#13131A] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-slate-400 mb-1">Secure Password / Token</label>
                    <input 
                      type="password" required 
                      value={syncCreds.password} onChange={(e) => setSyncCreds({...syncCreds, password: e.target.value})}
                      className="w-full bg-[#13131A] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none"
                    />
                  </div>
                  <button type="submit" className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 rounded-lg transition-colors">
                    Verify Access
                  </button>
                </form>
                <button onClick={() => { setSyncStep(0); setSyncModalSource(null); }} className="w-full mt-4 text-sm text-slate-500 hover:text-white">Cancel</button>
              </div>
            ) : syncStep === 2 ? (
              <div className="bg-[#0A0A0C] border border-white/10 rounded-2xl p-8 max-w-md mx-auto animate-in fade-in slide-in-from-right-4 duration-300 text-left">
                <div className="flex items-center justify-between mb-6 border-b border-white/10 pb-4">
                  <h3 className="text-xl font-bold text-white">Data Extraction Filter</h3>
                  <span className="text-emerald-400 text-xs px-2 py-1 bg-emerald-500/10 rounded-md font-bold text-right tracking-widest uppercase shadow">Auth OK</span>
                </div>
                <p className="text-sm text-slate-400 mb-6 font-medium">Select the historical period to construct metrics for.</p>
                <form onSubmit={handleMockSyncFinal}>
                  <div className="grid grid-cols-2 gap-6 mb-8">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">From</label>
                      <div className="flex gap-2">
                        <select 
                          value={syncRange.startMonth} onChange={(e) => setSyncRange({...syncRange, startMonth: e.target.value})}
                          className="flex-1 bg-[#13131A] border border-white/10 rounded-lg px-2 py-3 text-white text-sm focus:border-cyan-500 focus:outline-none"
                        >
                           {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                        </select>
                        <select 
                          value={syncRange.startYear} onChange={(e) => setSyncRange({...syncRange, startYear: e.target.value})}
                          className="flex-1 bg-[#13131A] border border-white/10 rounded-lg px-2 py-3 text-white text-sm focus:border-cyan-500 focus:outline-none"
                        >
                           {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-2 uppercase">To</label>
                      <div className="flex gap-2">
                        <select 
                          value={syncRange.endMonth} onChange={(e) => setSyncRange({...syncRange, endMonth: e.target.value})}
                          className="flex-1 bg-[#13131A] border border-white/10 rounded-lg px-2 py-3 text-white text-sm focus:border-cyan-500 focus:outline-none"
                        >
                           {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                        </select>
                        <select 
                          value={syncRange.endYear} onChange={(e) => setSyncRange({...syncRange, endYear: e.target.value})}
                          className="flex-1 bg-[#13131A] border border-white/10 rounded-lg px-2 py-3 text-white text-sm focus:border-cyan-500 focus:outline-none"
                        >
                           {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                    {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <TrendingDown className="w-5 h-5" />}
                    {loading ? "Constructing Models..." : "Initiate Synchronization"}
                  </button>
                </form>
                <button disabled={loading} onClick={() => setSyncStep(1)} className="w-full mt-4 text-sm text-slate-500 hover:text-white">Back to Credentials</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                <button onClick={() => setSyncModalSource("Tally")} disabled={loading} className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-cyan-500/50 transition-all text-white group disabled:opacity-50">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold text-xl">T</div>
                  <span className="font-semibold tracking-wide">Sync Tally</span>
                </button>
                <button onClick={() => openWizard("QuickBooks")} disabled={loading} className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-emerald-500/50 transition-all text-white group disabled:opacity-50">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xl">Q</div>
                  <span className="font-semibold tracking-wide">Sync QuickBooks</span>
                </button>
                <button onClick={() => openWizard("Xero")} disabled={loading} className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-blue-500/50 transition-all text-white group disabled:opacity-50">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xl">X</div>
                  <span className="font-semibold tracking-wide">Sync Xero</span>
                </button>
                <button onClick={() => openWizard("Odoo")} disabled={loading} className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-purple-500/50 transition-all text-white group disabled:opacity-50">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center font-bold text-xl">O</div>
                  <span className="font-semibold tracking-wide">Sync Odoo</span>
                </button>
                <button onClick={() => openWizard("Zoho Books")} disabled={loading} className="flex flex-col items-center justify-center gap-3 p-6 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-yellow-500/50 transition-all text-white group disabled:opacity-50 lg:col-span-2">
                  <div className="w-10 h-10 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center font-bold text-xl">Z</div>
                  <span className="font-semibold tracking-wide">Sync Zoho Books</span>
                </button>
              </div>
            )}

            {!syncModalSource && (
              <>
                <div className="relative py-4 mb-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                  <div className="relative flex justify-center"><span className="bg-[#13131A] px-4 text-sm text-slate-500 uppercase tracking-widest">or manually</span></div>
                </div>

                <div 
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  className="border-2 border-dashed border-white/10 hover:border-cyan-500/50 bg-[#0A0A0C] rounded-xl p-10 transition-colors flex flex-col items-center justify-center"
                >
                  <UploadCloud className="w-10 h-10 text-slate-500 mb-3" />
                  <p className="text-slate-300 font-medium mb-1">Drag and drop your spreadsheet here for {activeClientName}</p>
                  <p className="text-sm text-slate-500">Only generic .CSV supported</p>
                  <input 
                    type="file" accept=".csv" className="hidden" id="csv-upload"
                    onChange={(e) => { if (e.target.files?.[0]) processCsv(e.target.files[0]); }}
                  />
                  <label htmlFor="csv-upload" className="mt-6 px-6 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-full text-sm text-white cursor-pointer transition-colors font-medium">
                    Browse CSV
                  </label>
                </div>

                {records.length > 0 && (
                  <button 
                    onClick={() => setShowIntegrations(false)}
                    className="mt-6 text-sm text-slate-500 hover:text-white"
                  >
                    Close Without Changing
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Rendering if Records Exist
  const latestRecord = records[records.length - 1];

  const profitMargin = latestRecord.revenue ? ((latestRecord.netIncome / latestRecord.revenue) * 100).toFixed(1) : "0";
  const currentRatio = latestRecord.currentLiabilities ? (latestRecord.currentAssets / latestRecord.currentLiabilities).toFixed(2) : "0";
  const ebitdaMargin = latestRecord.revenue ? (((latestRecord.revenue - latestRecord.cogs - latestRecord.operatingExpenses) / latestRecord.revenue) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <TopBar />

      <section>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">Ratio Engine for {activeClientName}</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#13131A] border border-white/10 p-5 rounded-2xl hover:border-cyan-500/30 transition-colors">
            <p className="text-sm text-slate-400 font-medium mb-1">Profit Margin</p>
            <p className="text-3xl font-bold text-white">{profitMargin}%</p>
          </div>
          <div className="bg-[#13131A] border border-white/10 p-5 rounded-2xl hover:border-cyan-500/30 transition-colors">
            <p className="text-sm text-slate-400 font-medium mb-1">EBITDA Margin</p>
            <p className="text-3xl font-bold text-white">{ebitdaMargin}%</p>
          </div>
          <div className="bg-[#13131A] border border-white/10 p-5 rounded-2xl hover:border-cyan-500/30 transition-colors">
            <p className="text-sm text-slate-400 font-medium mb-1">Current Ratio</p>
            <p className="text-3xl font-bold text-white">{currentRatio}x</p>
          </div>
          <div className="bg-[#13131A] border border-white/10 p-5 rounded-2xl hover:border-cyan-500/30 transition-colors">
            <p className="text-sm text-slate-400 font-medium mb-1">Total Equities</p>
            <p className="text-3xl font-bold text-white">{formatMoney(latestRecord.totalEquity)}</p>
          </div>
        </div>
      </section>

      {/* Advanced Charting Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Engine 2: Trend Analyzer */}
        <section className="bg-[#13131A] border border-white/10 p-6 rounded-2xl flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <TrendingDown className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white">Trend Analyzer</h2>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart data={records} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="period" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatMoney(value, true)} />
                <RechartsTooltip contentStyle={{ backgroundColor: '#0A0A0C', border: '1px solid #ffffff10', borderRadius: '12px' }} itemStyle={{ color: '#fff' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '14px', paddingTop: '10px' }} />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#06b6d4" strokeWidth={3} dot={{ r: 4, fill: "#06b6d4" }} activeDot={{ r: 6 }} />
                <Line type="monotone" dataKey="operatingExpenses" name="Operating Expenses" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4, fill: "#f43f5e" }} />
              </RechartsLineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Engine 4: Cash Flow Analyzer */}
        <section className="bg-[#13131A] border border-white/10 p-6 rounded-2xl flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <WalletCards className="w-5 h-5 text-orange-400" />
            <h2 className="text-xl font-bold text-white">Cash Flow Tracker</h2>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={records.slice(-3)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                <XAxis dataKey="period" stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => formatMoney(value, true)} />
                <RechartsTooltip cursor={{fill: '#ffffff05'}} contentStyle={{ backgroundColor: '#0A0A0C', border: '1px solid #ffffff10', borderRadius: '12px' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '14px', paddingTop: '10px' }} />
                <Bar dataKey="cashBalance" name="Cash Reserves" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                <Bar dataKey="burnRate" name="Burn Rate" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

      </div>

      {/* Engine 3: Variance Analyzer */}
      <section className="bg-[#13131A] border border-white/10 p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Variance Analyzer <span className="text-slate-500 font-normal text-sm ml-2">Budget vs Actuals</span></h2>
          </div>
          <span className="bg-slate-800/50 text-slate-400 text-xs px-2 py-1 rounded">Source: {latestRecord.source}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="py-4 pr-6">Period</th>
                <th className="py-4 px-6 text-right">Actual Revenue</th>
                <th className="py-4 px-6 text-right">Budgeted</th>
                <th className="py-4 pl-6 text-right">Variance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {records.slice(-4).reverse().map((record, i) => {
                const varianceAmount = record.revenue - record.budgetedRevenue;
                const variancePercent = record.budgetedRevenue ? ((varianceAmount / record.budgetedRevenue) * 100).toFixed(1) : 0;
                const isPositive = varianceAmount >= 0;

                return (
                  <tr key={i} className="hover:bg-white/5 transition-colors">
                    <td className="py-4 pr-6 font-medium text-slate-300">{record.period}</td>
                    <td className="py-4 px-6 text-right text-white">{formatMoney(record.revenue)}</td>
                    <td className="py-4 px-6 text-right text-slate-400">{formatMoney(record.budgetedRevenue)}</td>
                    <td className="py-4 pl-6 text-right">
                      <span className={`inline-flex items-center gap-1 font-medium px-2.5 py-1 rounded-lg text-xs ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {isPositive ? '+' : '-'}{formatMoney(Math.abs(varianceAmount))} ({variancePercent}%)
                      </span>
                    </td>
                  </tr>
                )}
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
