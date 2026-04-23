"use client";

import { useState, useEffect } from "react";
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
  Plus,
  Search,
  Settings,
  Zap,
  Link2,
  Building2
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
  const [showAgentSetup, setShowAgentSetup] = useState(false);
  const [handshakeCode, setHandshakeCode] = useState<string | null>(null);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [displayCurrency, setDisplayCurrency] = useState("USD");
  
  // Available periods from the records
  const availablePeriods = Array.from(new Set(records.map(r => r.period))).sort();
  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(
    availablePeriods.length > 0 ? availablePeriods[availablePeriods.length - 1] : null
  );
  
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const [exchangeRates, setExchangeRates] = useState<Record<string, number>>({ USD: 1 });

  useEffect(() => {
    fetch("https://api.exchangerate-api.com/v4/latest/USD")
      .then(res => res.json())
      .then(data => {
        if (data && data.rates) {
          setExchangeRates(data.rates);
        }
      })
      .catch(err => console.error("Failed to fetch exchange rates:", err));
  }, []);

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
    
    let finalAmount = amount;
    const activeClient = clients.find(c => c.id === activeClientId);
    if (activeClient && activeClient.baseCurrency && activeClient.baseCurrency !== displayCurrency) {
      const baseRate = exchangeRates[activeClient.baseCurrency] || 1;
      const targetRate = exchangeRates[displayCurrency] || 1;
      // Convert from base currency to target currency
      finalAmount = amount * (targetRate / baseRate);
    }

    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: displayCurrency,
      maximumFractionDigits: 0,
      notation: compact ? "compact" : "standard"
    }).format(finalAmount);
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

  const handleUpdateSettings = async (updates: { fiscalYearStartMonth?: number, baseCurrency?: string }) => {
    if (!activeClientId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/clients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: activeClientId, ...updates })
      });
      if (!res.ok) throw new Error("Failed to update settings");
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

  const generateHandshakeCode = async () => {
    if (!activeClientId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/handshake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: activeClientId })
      });
      if (!res.ok) throw new Error("Failed to generate connection code");
      const data = await res.json();
      setHandshakeCode(data.code);
    } catch (err: any) {
      setError(err.message);
    } finally {
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

  const activeClient = clients.find(c => c.id === activeClientId);
  const activeClientName = activeClient?.name;

  if (showSettingsModal && activeClient) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="w-full max-w-md bg-[#13131A] border border-white/10 p-8 rounded-2xl shadow-xl relative">
          <button 
            onClick={() => setShowSettingsModal(false)}
            className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
          >
            ✕
          </button>
          <TrendingDown className="w-12 h-12 text-cyan-400 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Client Settings</h2>
          <p className="text-sm text-slate-400 mb-6">Configure specific parameters for {activeClientName}.</p>
          
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-400 mb-2">Fiscal Year Starts In</label>
            <select 
              value={activeClient.fiscalYearStartMonth || 4}
              onChange={(e) => handleUpdateSettings({ fiscalYearStartMonth: parseInt(e.target.value) })}
              disabled={loading}
              className="w-full bg-[#0A0A0C] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none disabled:opacity-50"
            >
              <option value={1}>January</option>
              <option value={4}>April</option>
            </select>
            <p className="text-xs text-slate-500 mt-2">
              Changes how Year-To-Date (YTD) and annual periods are calculated in the analytics engine.
            </p>
          </div>

          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-400 mb-2">Native Base Currency</label>
            <select 
              value={activeClient.baseCurrency || "USD"}
              onChange={(e) => handleUpdateSettings({ baseCurrency: e.target.value })}
              disabled={loading}
              className="w-full bg-[#0A0A0C] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-cyan-500 focus:outline-none disabled:opacity-50"
            >
              {Object.keys(CURRENCY_LOCALES).map(currency => (
                <option key={currency} value={currency}>{currency}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-2">
              What currency is this client's raw data stored in? This enables live exchange rate conversion when viewing other currencies in the dashboard.
            </p>
          </div>

          <div className="flex gap-3">
             <button onClick={() => setShowSettingsModal(false)} className="flex-1 bg-white/5 hover:bg-white/10 text-white py-3 rounded-lg border border-white/10 transition-colors text-sm font-bold">
               Close
             </button>
          </div>
        </div>
      </div>
    );
  }

  if (!activeClientId && !showNewClient) {
    const filteredClients = clients.filter(c => c.name.toLowerCase().includes(clientSearchTerm.toLowerCase()));

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Client Hub</h1>
            <p className="text-slate-400">Select a client to view their financial analytics dashboard.</p>
          </div>
          <button 
            onClick={() => setShowNewClient(true)}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold py-2 px-6 rounded-lg transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Client
          </button>
        </div>

        <div className="relative">
          <Search className="w-5 h-5 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
          <input 
            type="text"
            placeholder="Search clients..."
            value={clientSearchTerm}
            onChange={(e) => setClientSearchTerm(e.target.value)}
            className="w-full bg-[#13131A] border border-white/10 rounded-xl pl-12 pr-4 py-4 text-white focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredClients.map(client => (
            <button
              key={client.id}
              onClick={() => router.push(`/dashboard?client=${client.id}`)}
              className="bg-[#13131A] border border-white/10 p-6 rounded-2xl hover:border-cyan-500/50 hover:bg-white/5 transition-all text-left flex flex-col group"
            >
              <div className="w-12 h-12 bg-cyan-500/10 text-cyan-400 rounded-xl flex items-center justify-center font-bold text-xl mb-4 group-hover:scale-110 transition-transform">
                {client.name.substring(0, 2).toUpperCase()}
              </div>
              <h3 className="text-xl font-bold text-white mb-1 truncate w-full">{client.name}</h3>
              <p className="text-sm text-slate-500 uppercase tracking-widest text-xs">Base: {client.baseCurrency}</p>
            </button>
          ))}
          {filteredClients.length === 0 && (
            <div className="col-span-full py-12 text-center border-2 border-dashed border-white/10 rounded-2xl">
              <p className="text-slate-500">No clients found matching "{clientSearchTerm}".</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const TopBar = () => (
    <div className="flex flex-col md:flex-row items-center justify-between mb-8 pb-6 border-b border-white/10 gap-4">
      <div className="flex items-center gap-4 flex-wrap">
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
        <button 
          onClick={() => setShowSettingsModal(true)}
          className="bg-white/5 p-2 rounded-lg hover:bg-white/10 text-slate-300 transition-colors ml-2"
          title="Client Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
        <button 
          onClick={() => setShowIntegrations(true)}
          className="bg-cyan-500/10 p-2 rounded-lg hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 transition-all ml-2 flex items-center gap-2"
          title="Manage Data Source / Connect Tally"
        >
          <Zap className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Connect Tally</span>
        </button>
        {records.length > 0 && (
          <select 
            value={selectedPeriod || ""}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="bg-[#13131A] border border-cyan-500/30 text-cyan-400 font-bold text-sm px-4 py-2 rounded-lg cursor-pointer focus:outline-none focus:border-cyan-500 hover:bg-cyan-500/10 transition-all ml-4"
          >
            {availablePeriods.map(p => <option key={p} value={p}>Period: {p}</option>)}
          </select>
        )}
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
          <div className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-400 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-cyan-500" />
            Live Sync Active via Node Bridge
          </div>
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

            {showAgentSetup ? (
              <div className="bg-[#0A0A0C] border border-cyan-500/50 rounded-2xl p-8 max-w-2xl mx-auto animate-in zoom-in-95 duration-200 text-left">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center font-bold text-cyan-400">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Desktop Sync Agent</h3>
                    <p className="text-xs text-cyan-500 uppercase tracking-widest">{activeClientName}</p>
                  </div>
                </div>
                
                <div className="space-y-6">
                  <div className="bg-[#13131A] border border-white/10 rounded-xl p-6">
                    <h4 className="text-white font-bold mb-2">Step 1: Download Agent</h4>
                    <p className="text-sm text-slate-400 mb-4">Download the secure Windows executable to the computer where your accounting software is installed.</p>
                    <a href="/downloads/FinAnalyzerSync.exe" download className="inline-block px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-sm text-white transition-colors">
                      Download FinAnalyzerSync.exe
                    </a>
                  </div>

                  <div className="bg-[#13131A] border border-white/10 rounded-xl p-6">
                    <h4 className="text-white font-bold mb-2">Step 2: Generate Connection Code</h4>
                    <p className="text-sm text-slate-400 mb-4">Run the downloaded agent. When prompted, enter a secure connection code to link your software.</p>
                    
                    {handshakeCode ? (
                      <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-6 text-center">
                        <p className="text-xs text-cyan-500 uppercase tracking-widest mb-2 font-bold">Your Connection Code</p>
                        <p className="text-4xl font-mono text-white tracking-[0.2em]">{handshakeCode}</p>
                        <p className="text-xs text-slate-500 mt-3">Expires in 15 minutes</p>
                      </div>
                    ) : (
                      <button 
                        onClick={generateHandshakeCode}
                        disabled={loading}
                        className="w-full px-4 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
                      >
                        {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Generate New Code
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex gap-4 mt-8">
                  <button onClick={() => { setShowAgentSetup(false); setShowIntegrations(false); setHandshakeCode(null); }} className="flex-1 bg-white/5 hover:bg-white/10 text-white font-medium py-3 rounded-lg transition-colors border border-white/10">Close</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10 max-w-2xl mx-auto">
                <button onClick={() => setShowAgentSetup(true)} className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-cyan-500/50 transition-all text-white group">
                  <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xl">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <span className="font-semibold tracking-wide text-lg">Desktop Sync Agent</span>
                  <span className="text-sm text-slate-500 text-center px-4">Tally, QuickBooks, Xero via secure local connection.</span>
                </button>
                <div className="flex flex-col items-center justify-center gap-3 p-8 rounded-xl border border-dashed border-white/10 bg-[#13131A] text-slate-500">
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                    <GitMerge className="w-6 h-6" />
                  </div>
                  <span className="font-semibold tracking-wide text-lg">Cloud APIs</span>
                  <span className="text-sm text-center px-4">Direct cloud-to-cloud connections coming soon.</span>
                </div>
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
  const activeRecord = records.find(r => r.period === selectedPeriod) || records[records.length - 1];

  // Calculate Fiscal Year Bounds
  const fiscalStartMonth = activeClient?.fiscalYearStartMonth || 4;
  const [selYearStr, selMonthStr] = (selectedPeriod || activeRecord.period).split('-');
  const selYear = parseInt(selYearStr);
  const selMonth = parseInt(selMonthStr);
  
  let fyStartYear = selYear;
  if (selMonth < fiscalStartMonth) {
    fyStartYear = selYear - 1;
  }
  
  const fyPeriods: string[] = [];
  let currYear = fyStartYear;
  let currMonth = fiscalStartMonth;
  for(let i=0; i<12; i++) {
    fyPeriods.push(`${currYear}-${String(currMonth).padStart(2, '0')}`);
    currMonth++;
    if (currMonth > 12) {
      currMonth = 1;
      currYear++;
    }
  }

  const fiscalFilteredRecords = records.filter(r => fyPeriods.includes(r.period));

  const profitMargin = activeRecord.revenue ? ((activeRecord.netIncome / activeRecord.revenue) * 100).toFixed(1) : "0";
  const currentRatio = activeRecord.currentLiabilities ? (activeRecord.currentAssets / activeRecord.currentLiabilities).toFixed(2) : "0";
  const ebitdaMargin = activeRecord.revenue ? (((activeRecord.revenue - activeRecord.cogs - activeRecord.operatingExpenses) / activeRecord.revenue) * 100).toFixed(1) : "0";

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
            <p className="text-3xl font-bold text-white">{formatMoney(activeRecord.totalEquity)}</p>
          </div>
        </div>
      </section>

      {/* Advanced Charting Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Engine 2: Trend Analyzer */}
        <section className="bg-[#13131A] border border-white/10 p-6 rounded-2xl flex flex-col">
          <div className="flex items-center gap-2 mb-6">
            <TrendingDown className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white">Trend Analyzer <span className="text-slate-500 font-normal text-sm ml-2">FY {fyPeriods[0]} to {fyPeriods[11]}</span></h2>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsLineChart data={fiscalFilteredRecords} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
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
              <BarChart data={fiscalFilteredRecords.slice(-3)} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
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
          <span className="bg-slate-800/50 text-slate-400 text-xs px-2 py-1 rounded">Source: {activeRecord.source}</span>
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
              {fiscalFilteredRecords.slice(-4).reverse().map((record, i) => {
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
