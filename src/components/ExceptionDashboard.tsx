"use client";

import { useState, useEffect } from "react";
import { AlertCircle, AlertTriangle, FileWarning, Search, Filter, Download, ArrowRight, ShieldAlert, BadgeIndianRupee, XCircle, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

interface ExceptionItem {
  id: string;
  category: "UNUSUAL_EXPENSE" | "DUPLICATE_PAYMENT" | "GST_MISMATCH" | "TDS_ERROR" | "BANK_UNRECONCILED" | "NEGATIVE_INVENTORY" | "OVERDUE_RECEIVABLE";
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
  amount: number;
  date: string;
  status: "OPEN" | "REVIEWING" | "RESOLVED";
}

export default function ExceptionDashboard({ clientId, selectedYear, displayCurrency }: any) {
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("ALL");

  useEffect(() => {
    // Mock fetching exceptions based on CFO heuristics
    setTimeout(() => {
      setExceptions([
        { id: "EX-101", category: "DUPLICATE_PAYMENT", severity: "HIGH", description: "Possible duplicate payment to 'TechCorp Services' for Invoice #4092.", amount: 45000, date: "2026-05-12", status: "OPEN" },
        { id: "EX-102", category: "GST_MISMATCH", severity: "HIGH", description: "GSTR-2A mismatch: ITC claimed but vendor has not filed GSTR-1.", amount: 125000, date: "2026-05-15", status: "OPEN" },
        { id: "EX-103", category: "UNUSUAL_EXPENSE", severity: "MEDIUM", description: "Travel & Entertainment expense is 300% higher than 6-month moving average.", amount: 210000, date: "2026-05-18", status: "REVIEWING" },
        { id: "EX-104", category: "NEGATIVE_INVENTORY", severity: "MEDIUM", description: "Stock ledger showing negative balance for SKU 'WIRE-COPPER-2MM'.", amount: 0, date: "2026-05-20", status: "OPEN" },
        { id: "EX-105", category: "BANK_UNRECONCILED", severity: "LOW", description: "Unreconciled credit entry in HDFC Bank ending 4455.", amount: 35000, date: "2026-05-22", status: "OPEN" },
        { id: "EX-106", category: "OVERDUE_RECEIVABLE", severity: "HIGH", description: "Invoice #3320 to 'Apex Ltd' is overdue by 90+ days.", amount: 550000, date: "2026-02-10", status: "OPEN" },
        { id: "EX-107", category: "TDS_ERROR", severity: "HIGH", description: "Professional fees paid > ₹30,000 without deducting TDS u/s 194J.", amount: 40000, date: "2026-05-25", status: "OPEN" }
      ]);
      setLoading(false);
    }, 1500);
  }, [clientId, selectedYear]);

  const filteredExceptions = filterCategory === "ALL" ? exceptions : exceptions.filter(e => e.category === filterCategory);

  const getSeverityStyles = (severity: string) => {
    switch(severity) {
      case "HIGH": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      case "MEDIUM": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "LOW": return "text-blue-400 bg-blue-500/10 border-blue-500/20";
      default: return "text-slate-400 bg-slate-500/10 border-slate-500/20";
    }
  };

  const getCategoryLabel = (cat: string) => cat.replace(/_/g, ' ');

  if (loading) {
    return (
      <div className="bg-[#13131A] rounded-3xl border border-white/5 p-8 shadow-xl flex items-center justify-center h-64">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mb-4" />
          <p className="text-slate-500 font-bold tracking-widest text-[10px] uppercase">Scanning ledgers for exceptions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#13131A] rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden">
      {/* Header */}
      <div className="p-6 md:p-8 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#181821]">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500/20 to-purple-500/20 flex items-center justify-center border border-rose-500/20">
            <ShieldAlert className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Exception Management</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">AI-Powered Ledger Anomaly Detection</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="bg-[#1A1A24] border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-300 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="ALL">All Categories</option>
            <option value="DUPLICATE_PAYMENT">Duplicate Payments</option>
            <option value="GST_MISMATCH">GST Mismatches</option>
            <option value="TDS_ERROR">TDS Errors</option>
            <option value="UNUSUAL_EXPENSE">Unusual Expenses</option>
            <option value="BANK_UNRECONCILED">Bank Unreconciled</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-black text-slate-300 hover:bg-white/10 transition-all">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Exception Table */}
      <div className="p-6 md:p-8">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                <th className="pb-4 pr-4">Exception ID</th>
                <th className="pb-4 pr-4">Category</th>
                <th className="pb-4 pr-4">Severity</th>
                <th className="pb-4 pr-4">Description</th>
                <th className="pb-4 pr-4 text-right">Amount Impact</th>
                <th className="pb-4 pl-4 text-center">Status</th>
                <th className="pb-4 pl-4">Action</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {filteredExceptions.map((ex, i) => (
                <motion.tr 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  key={ex.id} 
                  className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
                >
                  <td className="py-4 pr-4 text-xs font-mono font-bold text-slate-400">{ex.id}</td>
                  <td className="py-4 pr-4">
                    <span className="text-[10px] font-black tracking-widest uppercase text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-md border border-cyan-500/20">
                      {getCategoryLabel(ex.category)}
                    </span>
                  </td>
                  <td className="py-4 pr-4">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border ${getSeverityStyles(ex.severity)}`}>
                      {ex.severity}
                    </span>
                  </td>
                  <td className="py-4 pr-4 max-w-sm">
                    <p className="text-slate-300 font-medium truncate" title={ex.description}>{ex.description}</p>
                    <p className="text-[10px] text-slate-500 font-bold mt-1">Detected: {ex.date}</p>
                  </td>
                  <td className="py-4 pr-4 text-right font-mono font-black text-white">
                    {ex.amount > 0 ? `₹${(ex.amount / 100000).toFixed(2)}L` : "-"}
                  </td>
                  <td className="py-4 pl-4 text-center">
                    {ex.status === "OPEN" && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-400"><XCircle className="w-3 h-3" /> Open</span>}
                    {ex.status === "REVIEWING" && <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-blue-400"><Search className="w-3 h-3" /> Reviewing</span>}
                  </td>
                  <td className="py-4 pl-4">
                    <button className="p-2 bg-white/5 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 rounded-lg transition-colors border border-transparent hover:border-cyan-500/30">
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          
          {filteredExceptions.length === 0 && (
            <div className="py-12 text-center flex flex-col items-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500/50 mb-4" />
              <h3 className="text-white font-bold text-lg mb-2">No Exceptions Found</h3>
              <p className="text-slate-500 text-sm">The AI scan returned clean ledgers for this category.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
