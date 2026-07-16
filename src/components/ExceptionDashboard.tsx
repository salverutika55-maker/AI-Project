"use client";

import { useState, useEffect } from "react";
import { 
  Search, Download, ArrowRight, ShieldAlert, XCircle, 
  CheckCircle2, X, FileCheck, MessageSquare, User 
} from "lucide-react";
import { motion } from "framer-motion";

interface ExceptionItem {
  id: string;
  realId: string;
  category: "UNUSUAL_EXPENSE" | "DUPLICATE_PAYMENT" | "GST_MISMATCH" | "TDS_ERROR" | "BANK_UNRECONCILED" | "NEGATIVE_INVENTORY" | "OVERDUE_RECEIVABLE";
  severity: "HIGH" | "MEDIUM" | "LOW";
  description: string;
  details: string;
  amount: number;
  date: string;
  status: "OPEN" | "RESOLVED";
  ledger: string;
  voucher: string;
  party: string;
  ruleCode: string;
  commentary?: string;
  resolvedBy?: any;
}

const SEVERITY_COLORS = {
  HIGH: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  MEDIUM: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  LOW: "text-blue-400 bg-blue-500/10 border-blue-500/20"
};

export default function ExceptionDashboard({ clientId, selectedYear, displayCurrency }: any) {
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState<string>("ALL");
  const [activeException, setActiveException] = useState<ExceptionItem | null>(null);
  const [commentaryText, setCommentaryText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  const fetchExceptions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/scrutiny/alerts?year=${selectedYear}`);
      const data = await res.json();
      if (data.success) {
        const mapped = data.data.map((alert: any, index: number) => {
          let category: any = "UNUSUAL_EXPENSE";
          if (alert.ruleCode === "GST_ITC_BLOCKED" || alert.ruleCode === "GST_RCM_UNRECORDED") {
            category = "GST_MISMATCH";
          } else if (alert.ruleCode.includes("TDS")) {
            category = "TDS_ERROR";
          } else if (alert.ruleCode === "SUSPENSE_NON_ZERO") {
            category = "BANK_UNRECONCILED";
          } else if (alert.ruleCode === "MANUFACTURING_SCRAP_YIELD") {
            category = "NEGATIVE_INVENTORY";
          } else if (alert.ruleCode === "SERVICE_UNEARNED_REVENUE") {
            category = "OVERDUE_RECEIVABLE";
          }

          const rawDate = alert.voucher?.date || alert.createdAt;
          const formattedDate = new Date(rawDate).toLocaleDateString("en-IN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
          });

          return {
            id: `EX-${index + 101}`,
            realId: alert.id,
            category,
            severity: alert.severity,
            description: alert.title,
            details: alert.description,
            amount: alert.impactAmount || 0,
            date: formattedDate,
            status: alert.status === "PENDING" ? "OPEN" : "RESOLVED",
            ledger: alert.ledger?.name || "N/A",
            voucher: alert.voucher?.voucherNumber || "N/A",
            party: alert.ledger?.name || "N/A",
            ruleCode: alert.ruleCode,
            commentary: alert.commentary,
            resolvedBy: alert.resolvedBy
          };
        });
        setExceptions(mapped);
      }
    } catch (err) {
      console.error("Failed to fetch exceptions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExceptions();
  }, [clientId, selectedYear]);

  const filteredExceptions = filterCategory === "ALL" ? exceptions : exceptions.filter(e => e.category === filterCategory);

  const getCategoryLabel = (cat: string) => cat.replace(/_/g, ' ');

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: displayCurrency || "INR",
      maximumFractionDigits: 0
    }).format(val);
  };

  const handleActionException = async (status: "RESOLVED" | "MUTED") => {
    if (!activeException) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/scrutiny/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertId: activeException.realId,
          status,
          commentary: commentaryText
        })
      });
      const data = await res.json();
      if (data.success) {
        setExceptions(prev => prev.map(e => e.realId === activeException.realId ? { 
          ...e, 
          status: data.data.status === "PENDING" ? "OPEN" : "RESOLVED",
          commentary: data.data.commentary,
          resolvedBy: data.data.resolvedBy
        } : e));
        setActiveException(null);
        setCommentaryText("");
      }
    } catch (err) {
      console.error("Failed to resolve exception:", err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleOpenDrawer = (ex: ExceptionItem) => {
    setActiveException(ex);
    setCommentaryText(ex.commentary || "");
  };

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
    <div className="bg-[#13131A] rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden text-slate-100">
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
            className="bg-[#1A1A24] border border-white/10 rounded-xl px-4 py-2.5 text-xs font-bold text-slate-300 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="DUPLICATE_PAYMENT">Duplicate Payments</option>
            <option value="GST_MISMATCH">GST Mismatches</option>
            <option value="TDS_ERROR">TDS Errors</option>
            <option value="UNUSUAL_EXPENSE">Unusual Expenses</option>
            <option value="BANK_UNRECONCILED">Bank Unreconciled</option>
            <option value="NEGATIVE_INVENTORY">Negative Inventory</option>
            <option value="OVERDUE_RECEIVABLE">Overdue Receivables</option>
          </select>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-xs font-black text-slate-300 hover:bg-white/10 transition-all">
            <Download className="w-3.5 h-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Exception Table */}
      <div className="p-6 md:p-8">
        <div className="overflow-x-auto">
          {filteredExceptions.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500/50 mb-4" />
              <h3 className="text-white font-bold text-lg mb-2">No exceptions detected.</h3>
              <p className="text-slate-500 text-sm">The AI scan returned clean ledgers for this category.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                  <th className="pb-4 pr-4">Exception ID</th>
                  <th className="pb-4 pr-4">Rule Triggered</th>
                  <th className="pb-4 pr-4">Ledger / Party</th>
                  <th className="pb-4 pr-4">Voucher No</th>
                  <th className="pb-4 pr-4">Date</th>
                  <th className="pb-4 pr-4">Severity</th>
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
                    key={ex.realId} 
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group"
                  >
                    <td className="py-4 pr-4 text-xs font-mono font-bold text-slate-400">{ex.id}</td>
                    <td className="py-4 pr-4">
                      <span className="text-[9px] font-black tracking-widest uppercase text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-md border border-cyan-500/20">
                        {ex.ruleCode}
                      </span>
                    </td>
                    <td className="py-4 pr-4 font-bold text-white max-w-[150px] truncate" title={ex.ledger}>
                      {ex.ledger}
                    </td>
                    <td className="py-4 pr-4 text-xs font-mono text-slate-400 truncate max-w-[100px]" title={ex.voucher}>
                      {ex.voucher}
                    </td>
                    <td className="py-4 pr-4 text-slate-400 text-xs font-bold">{ex.date}</td>
                    <td className="py-4 pr-4">
                      <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border ${SEVERITY_COLORS[ex.severity as keyof typeof SEVERITY_COLORS]}`}>
                        {ex.severity}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-right font-mono font-black text-white">
                      {ex.amount > 0 ? formatCurrency(ex.amount) : "-"}
                    </td>
                    <td className="py-4 pl-4 text-center">
                      {ex.status === "OPEN" ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-400">
                          <XCircle className="w-3 h-3" /> Open
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Resolved
                        </span>
                      )}
                    </td>
                    <td className="py-4 pl-4">
                      <button 
                        onClick={() => handleOpenDrawer(ex)}
                        className="p-2 bg-white/5 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-400 rounded-lg transition-colors border border-transparent hover:border-cyan-500/30"
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Exception Detail Drawer */}
      {activeException && (
        <div className="fixed inset-0 z-[100] flex justify-end animate-in fade-in duration-300">
          <div onClick={() => setActiveException(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          
          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#101017] border-l border-white/10 shadow-2xl p-8 overflow-y-auto space-y-8 flex flex-col justify-between">
            <div className="space-y-8">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-white/5 pb-6">
                <div>
                  <span className={`px-2.5 py-0.5 rounded text-[9px] font-black border uppercase ${SEVERITY_COLORS[activeException.severity as keyof typeof SEVERITY_COLORS]}`}>
                    {activeException.severity} Risk Level
                  </span>
                  <h2 className="text-xl font-black text-white mt-2 leading-snug">{activeException.description}</h2>
                </div>
                <button 
                  onClick={() => setActiveException(null)}
                  className="p-2 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Grid properties */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">Exception ID</span>
                  <span className="text-xs font-mono font-bold text-white">{activeException.id}</span>
                </div>
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">Rule Triggered</span>
                  <span className="text-xs font-mono font-bold text-cyan-400">{activeException.ruleCode}</span>
                </div>
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">Ledger / Party</span>
                  <span className="text-xs font-bold text-white break-all">{activeException.ledger}</span>
                </div>
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">Voucher Number</span>
                  <span className="text-xs font-mono font-bold text-white break-all">{activeException.voucher}</span>
                </div>
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">Date Detected</span>
                  <span className="text-xs font-bold text-white">{activeException.date}</span>
                </div>
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">Amount Impact</span>
                  <span className="text-xs font-black text-rose-400">
                    {activeException.amount > 0 ? formatCurrency(activeException.amount) : "N/A"}
                  </span>
                </div>
              </div>

              {/* Supporting Evidence */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                  <FileCheck className="w-3.5 h-3.5 text-cyan-400" /> Supporting Evidence & Reason
                </h3>
                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl text-xs font-medium leading-relaxed text-slate-300 whitespace-pre-wrap">
                  {activeException.details}
                </div>
              </div>

              {/* Commentary logs */}
              {activeException.status !== "OPEN" && activeException.resolvedBy && (
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" /> Signed off by: {activeException.resolvedBy.email}
                    </span>
                    <span>Status: RESOLVED</span>
                  </div>
                  <p className="text-xs text-slate-300 italic font-medium leading-relaxed">
                    "{activeException.commentary}"
                  </p>
                </div>
              )}

              {/* Auditor Sign-off Input Workspace */}
              {activeException.status === "OPEN" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Log Review & Auditor Sign-off
                  </h3>
                  <textarea
                    rows={4}
                    value={commentaryText}
                    onChange={(e) => setCommentaryText(e.target.value)}
                    placeholder="Provide auditing commentary, transfer-pricing approvals, or correction details..."
                    className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 focus:ring-0 leading-relaxed"
                  />
                </div>
              )}
            </div>

            {/* Actions Footer */}
            {activeException.status === "OPEN" ? (
              <div className="flex gap-4 border-t border-white/5 pt-6 mt-6">
                <button 
                  onClick={() => handleActionException("RESOLVED")}
                  disabled={submittingComment || !commentaryText.trim()}
                  className="flex-1 py-3 bg-cyan-500 text-slate-950 rounded-xl text-xs font-black hover:opacity-90 active:scale-98 transition-all disabled:opacity-30"
                >
                  {submittingComment ? "Submitting Sign-off..." : "Approve & Resolve Exception"}
                </button>
                <button 
                  onClick={() => handleActionException("MUTED")}
                  disabled={submittingComment || !commentaryText.trim()}
                  className="px-6 py-3 bg-white/5 border border-white/10 text-slate-300 rounded-xl text-xs font-black hover:bg-white/10 active:scale-98 transition-all disabled:opacity-30"
                >
                  Mute Warning
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setActiveException(null)}
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
