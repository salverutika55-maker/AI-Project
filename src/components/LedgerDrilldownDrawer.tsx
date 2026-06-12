import React, { useState, useEffect } from "react";
import { X, Search, FileText, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";

interface Ledger {
  id: string;
  name: string;
  nature: string;
  groupName: string;
  amount: number;
  isMapped: boolean;
}

interface DrilldownDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  statementType: "PNL" | "BS";
  subHeadName: string;
  month: string;
  year: number;
  totalAmount: number; // Pre-calculated total from the main statement
}

export default function LedgerDrilldownDrawer({
  isOpen,
  onClose,
  clientId,
  statementType,
  subHeadName,
  month,
  year,
  totalAmount
}: DrilldownDrawerProps) {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isOpen && subHeadName) {
      fetchLedgers();
    }
  }, [isOpen, subHeadName, month, year]);

  const fetchLedgers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/drilldown?statementType=${statementType}&subHeadName=${encodeURIComponent(subHeadName)}&month=${month}&year=${year}`);
      const data = await res.json();
      if (res.ok) {
        setLedgers(data.ledgers || []);
      }
    } catch (err) {
      console.error("Failed to fetch drilldown data", err);
    }
    setLoading(false);
  };

  if (!isOpen) return null;

  const filteredLedgers = ledgers.filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const calculatedTotal = ledgers.reduce((sum, l) => sum + (l.amount || 0), 0);
  
  // Format currency
  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className={`fixed inset-y-0 right-0 w-full max-w-md bg-[#0F0F16] border-l border-white/10 z-[110] shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0`}>
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-[#13131A]">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase ${statementType === 'PNL' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-purple-500/10 text-purple-400'}`}>
                  {statementType === 'PNL' ? 'Profit & Loss' : 'Balance Sheet'}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase bg-white/5 text-slate-400">
                  {month} {year}
                </span>
              </div>
              <h2 className="text-xl font-black text-white">{subHeadName}</h2>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Totals Summary */}
          <div className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400 font-bold">Statement Total</span>
              <span className="text-base font-black text-white">{formatCurrency(totalAmount)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400 font-bold">Ledgers Sum</span>
              <span className="text-base font-black text-emerald-400">{formatCurrency(calculatedTotal)}</span>
            </div>
            {Math.abs(totalAmount - calculatedTotal) > 1 && (
               <div className="mt-2 pt-2 border-t border-white/10 flex items-start gap-2 text-rose-400">
                 <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                 <p className="text-[10px] leading-relaxed font-semibold">
                   Variance detected. Ensure all related ledgers have data synchronized for this period.
                 </p>
               </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-white/5 bg-[#0F0F16]">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="Search mapped ledgers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1A1A24] border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
        </div>

        {/* Ledger List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-500" />
              <span className="text-sm font-bold">Calculating balances...</span>
            </div>
          ) : filteredLedgers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-3">
              <FileText className="w-8 h-8 opacity-20" />
              <span className="text-sm font-bold">No ledgers found</span>
            </div>
          ) : (
            filteredLedgers.map(ledger => (
              <div key={ledger.id} className="bg-[#1A1A24] border border-white/5 rounded-xl p-4 hover:border-white/10 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex-1 pr-4">
                    <h4 className="text-sm font-bold text-white mb-1">{ledger.name}</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{ledger.groupName}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-black text-white">{formatCurrency(ledger.amount)}</span>
                    <p className="text-[10px] text-slate-500 font-bold mt-1 uppercase">{ledger.nature}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-white/5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Mapped</span>
                </div>
              </div>
            ))
          )}
        </div>
        
      </div>
    </>
  );
}
