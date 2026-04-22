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
  WalletCards
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

export default function DashboardClient({ initialRecords }: { initialRecords: any[] }) {
  const [records, setRecords] = useState(initialRecords);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
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
            body: JSON.stringify({ records: results.data }),
          });
          if (!res.ok) throw new Error("Failed to upload CSV");
          router.refresh();
          // Ideally fetch fresh to update state, for now reload works
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

  const handleMockSync = async (source: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      if (!res.ok) throw new Error("Sync failed");
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <div className="w-full max-w-2xl bg-[#13131A] border border-white/10 rounded-2xl p-10 text-center shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-cyan-500 via-purple-500 to-emerald-500"></div>
          <CloudRain className="w-16 h-16 text-cyan-400 mx-auto mb-6" />
          <h2 className="text-3xl font-bold text-white mb-4">Connect Your Financials</h2>
          <p className="text-slate-400 mb-10 text-lg">
            Synchronize your accounting software or securely drop a generic CSV to ignite the analytical engines.
          </p>

          {error && (
             <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl mb-6 flex items-center justify-center gap-2">
               <AlertCircle className="w-5 h-5" />
               {error}
             </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <button 
              onClick={() => handleMockSync("QuickBooks")}
              disabled={loading}
              className="flex items-center justify-center gap-3 p-5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-cyan-500/50 transition-all font-medium text-white disabled:opacity-50 cursor-pointer group"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" /> : <div className="w-5 h-5 rounded-full bg-green-500" />}
              Sync QuickBooks
            </button>
            <button 
              onClick={() => handleMockSync("Xero")}
              disabled={loading}
              className="flex items-center justify-center gap-3 p-5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-cyan-500/50 transition-all font-medium text-white disabled:opacity-50 cursor-pointer group"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" /> : <div className="w-5 h-5 rounded-full bg-blue-500" />}
              Sync Xero
            </button>
          </div>

          <div className="relative py-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#13131A] px-4 text-sm text-slate-500 uppercase tracking-widest">or manually</span>
            </div>
          </div>

          <div 
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            className="mt-6 border-2 border-dashed border-white/10 hover:border-cyan-500/50 bg-[#0A0A0C] rounded-xl p-10 transition-colors flex flex-col items-center justify-center"
          >
            <UploadCloud className="w-10 h-10 text-slate-500 mb-3" />
            <p className="text-slate-300 font-medium mb-1">Drag and drop your spreadsheet here</p>
            <p className="text-sm text-slate-500">Only generic .CSV supported</p>
            <input 
              type="file" 
              accept=".csv"
              className="hidden" 
              id="csv-upload"
              onChange={(e) => {
                if (e.target.files?.[0]) processCsv(e.target.files[0]);
              }}
            />
            <label htmlFor="csv-upload" className="mt-6 px-6 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-full text-sm text-white cursor-pointer transition-colors font-medium">
              Browse Files
            </label>
          </div>

        </div>
      </div>
    );
  }

  // Dashboard Rendering if Records Exist
  const latestRecord = records[records.length - 1];
  const prevRecord = records.length > 1 ? records[records.length - 2] : null;

  // Calculators for Engine 1
  const profitMargin = latestRecord.revenue ? ((latestRecord.netIncome / latestRecord.revenue) * 100).toFixed(1) : "0";
  const currentRatio = latestRecord.currentLiabilities ? (latestRecord.currentAssets / latestRecord.currentLiabilities).toFixed(2) : "0";
  const ebitdaMargin = latestRecord.revenue ? (((latestRecord.revenue - latestRecord.cogs - latestRecord.operatingExpenses) / latestRecord.revenue) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="flex flex-col md:flex-row items-baseline justify-between mb-8 pb-6 border-b border-white/10 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Financial Command Center</h1>
          <p className="text-slate-400">Data synchronized successfully from <span className="text-cyan-400 font-medium">{latestRecord.source}</span>.</p>
        </div>
        <button 
          onClick={() => handleMockSync(latestRecord.source)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-sm text-white cursor-pointer transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Force Sync
        </button>
      </header>

      {/* Engine 1: Financial Ratio Engine */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
          <h2 className="text-xl font-bold text-white">Ratio Engine</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-[#13131A] border border-white/10 p-5 rounded-2xl">
            <p className="text-sm text-slate-400 font-medium mb-1">Profit Margin</p>
            <p className="text-3xl font-bold text-white">{profitMargin}%</p>
          </div>
          <div className="bg-[#13131A] border border-white/10 p-5 rounded-2xl">
            <p className="text-sm text-slate-400 font-medium mb-1">EBITDA Margin</p>
            <p className="text-3xl font-bold text-white">{ebitdaMargin}%</p>
          </div>
          <div className="bg-[#13131A] border border-white/10 p-5 rounded-2xl">
            <p className="text-sm text-slate-400 font-medium mb-1">Current Ratio</p>
            <p className="text-3xl font-bold text-white">{currentRatio}x</p>
          </div>
          <div className="bg-[#13131A] border border-white/10 p-5 rounded-2xl">
            <p className="text-sm text-slate-400 font-medium mb-1">Total Equities</p>
            <p className="text-3xl font-bold text-white">${latestRecord.totalEquity.toLocaleString()}</p>
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
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value/1000}k`} />
                <RechartsTooltip 
                  contentStyle={{ backgroundColor: '#0A0A0C', border: '1px solid #ffffff10', borderRadius: '12px' }}
                  itemStyle={{ color: '#fff' }}
                />
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
                <YAxis stroke="#ffffff50" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value/1000}k`} />
                <RechartsTooltip 
                  cursor={{fill: '#ffffff05'}}
                  contentStyle={{ backgroundColor: '#0A0A0C', border: '1px solid #ffffff10', borderRadius: '12px' }}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '14px', paddingTop: '10px' }} />
                <Bar dataKey="cashBalance" name="Cash Resreves" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                <Bar dataKey="burnRate" name="Burn Rate" fill="#f97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

      </div>

      {/* Engine 3: Variance Analyzer */}
      <section className="bg-[#13131A] border border-white/10 p-6 rounded-2xl">
        <div className="flex items-center gap-2 mb-6">
          <GitMerge className="w-5 h-5 text-emerald-400" />
          <h2 className="text-xl font-bold text-white">Variance Analyzer <span className="text-slate-500 font-normal text-sm ml-2">Budget vs Actuals</span></h2>
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
                    <td className="py-4 px-6 text-right text-white">${record.revenue.toLocaleString()}</td>
                    <td className="py-4 px-6 text-right text-slate-400">${record.budgetedRevenue.toLocaleString()}</td>
                    <td className="py-4 pl-6 text-right">
                      <span className={`inline-flex items-center gap-1 font-medium px-2.5 py-1 rounded-lg text-xs ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                        {isPositive ? '+' : '-'}${Math.abs(varianceAmount).toLocaleString()} ({variancePercent}%)
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
