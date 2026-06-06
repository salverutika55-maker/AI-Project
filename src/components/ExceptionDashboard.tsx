"use client";

import { useState, useEffect } from "react";
import { AlertCircle, AlertTriangle, Check, Loader2, RefreshCw } from "lucide-react";

interface ExceptionDashboardProps {
  clientId: string;
}

export default function ExceptionDashboard({ clientId }: ExceptionDashboardProps) {
  const [exceptions, setExceptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    fetchExceptions();
  }, [clientId]);

  const fetchExceptions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/exceptions`);
      const data = await res.json();
      if (data.exceptions) {
        setExceptions(data.exceptions);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleApplyFix = async (exc: any) => {
    setApplying(exc.ledgerName);
    try {
      // Find the proper mappings based on recommendation
      let statementType = "BS";
      let groupName = "";
      let subGroupName = "";
      let subHeadName = "";
      
      if (exc.recommendedMapping === "Trade Payables") {
        groupName = "Current Liabilities";
        subGroupName = "Trade Payable";
        subHeadName = "Trade Payables";
      } else if (exc.recommendedMapping === "Trade Receivables") {
        groupName = "Current Assets";
        subGroupName = "Trade Receivable";
        subHeadName = "Trade Debtors";
      } else {
        // Fallback or skip if we can't map cleanly
        setApplying(null);
        return;
      }

      const res = await fetch(`/api/clients/${clientId}/unified-mapping`, {
        method: "POST",
        body: JSON.stringify({ 
          mappings: [{ 
            softwareLedgerName: exc.ledgerName, 
            statementType, 
            groupName, 
            subGroupName, 
            subHeadName 
          }] 
        })
      });

      if (res.ok) {
        setExceptions(prev => prev.filter(e => e.ledgerName !== exc.ledgerName));
      }
    } catch (err) {
      console.error(err);
    }
    setApplying(null);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-12 h-12 text-rose-500 animate-spin" />
        <p className="text-rose-400 font-bold tracking-widest uppercase">Scanning for Mapping Anomalies...</p>
      </div>
    );
  }

  if (exceptions.length === 0) {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-3xl p-12 text-center flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mb-6">
          <Check className="w-8 h-8 text-emerald-500" />
        </div>
        <h3 className="text-2xl font-black text-white mb-2">No Exceptions Found</h3>
        <p className="text-emerald-400 font-medium">Your Chart of Accounts mapping aligns perfectly with voucher behavior.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-3">
            <AlertCircle className="w-6 h-6 text-rose-500" />
            AI Mapping Exceptions
          </h2>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Detected anomalies between ERP groups and transaction behavior</p>
        </div>
        <button onClick={fetchExceptions} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all">
          <RefreshCw className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {exceptions.map((exc, idx) => (
          <div key={idx} className="bg-[#13131A] border border-rose-500/20 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-rose-500" />
            
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-lg font-black text-white">{exc.ledgerName}</h3>
                <span className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  ERP: {exc.erpGroup || "Uncategorized"}
                </span>
                {exc.severity === "HIGH" && (
                  <span className="px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/30 text-[10px] font-bold text-rose-400 uppercase tracking-widest flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> High Severity
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-4 text-xs font-bold mt-3 mb-4 p-3 bg-white/[0.02] rounded-xl border border-white/5">
                <div className="text-rose-400 line-through opacity-70">
                  <span className="text-slate-500 block text-[9px] uppercase tracking-widest mb-0.5">Current Mapping</span>
                  {exc.currentMapping}
                </div>
                <div className="w-8 h-[1px] bg-white/10 relative">
                   <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-t border-r border-white/10 rotate-45" />
                </div>
                <div className="text-emerald-400">
                  <span className="text-emerald-500/50 block text-[9px] uppercase tracking-widest mb-0.5">AI Recommendation</span>
                  {exc.recommendedMapping}
                </div>
              </div>

              <p className="text-xs text-slate-400 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">💡</span> {exc.reason}
              </p>
            </div>

            <div className="flex flex-col items-center justify-center min-w-[140px] p-4 bg-[#181821] rounded-xl border border-white/5">
              <div className="text-2xl font-black text-emerald-400 mb-1">{exc.confidence}%</div>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-4">AI Confidence</p>
              
              {exc.recommendedMapping !== "Review Classification" && (
                <button 
                  onClick={() => handleApplyFix(exc)}
                  disabled={applying === exc.ledgerName}
                  className="w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                >
                  {applying === exc.ledgerName ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Apply Fix
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
