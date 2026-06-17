import React, { useState, useEffect } from "react";
import { X, Search, FileText, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";

interface Ledger {
  id: string;
  name: string;
  nature: string;
  groupName: string;
  amounts: Record<string, { opening: number, debit: number, credit: number, closing: number }>;
  isMapped: boolean;
}

interface DrilldownDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  statementType: "PNL" | "BS";
  subHeadName: string;
  months: string[];
  year: number;
  totalAmounts: Record<string, number>; // Pre-calculated totals from the main statement per month
}

export default function LedgerDrilldownDrawer({
  isOpen,
  onClose,
  clientId,
  statementType,
  subHeadName,
  months,
  year,
  totalAmounts
}: DrilldownDrawerProps) {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>(months[months.length - 1] || "");

  useEffect(() => {
    if (months.length > 0 && !selectedMonth) {
      setSelectedMonth(months[months.length - 1]);
    }
  }, [months]);

  useEffect(() => {
    if (isOpen && subHeadName && months.length > 0) {
      fetchLedgers();
    }
  }, [isOpen, subHeadName, months.join(','), year]);

  const fetchLedgers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/drilldown?statementType=${statementType}&subHeadName=${encodeURIComponent(subHeadName)}&months=${months.join(',')}&year=${year}`);
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
      <div className={`fixed inset-y-0 right-0 w-full max-w-4xl bg-[#0F0F16] border-l border-white/10 z-[110] shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0`}>
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-[#13131A]">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase ${statementType === 'PNL' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-purple-500/10 text-purple-400'}`}>
                  {statementType === 'PNL' ? 'Profit & Loss' : 'Balance Sheet'}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase bg-white/5 text-slate-400">
                  {year}
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

          {/* Month Selector */}
          <div className="flex gap-2 mb-4">
            {months.map(m => (
              <button 
                key={m}
                onClick={() => setSelectedMonth(m)}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${selectedMonth === m ? 'bg-cyan-500 text-black' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Totals Summary */}
          <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden flex flex-col p-4">
             <div className="flex justify-between items-center">
                 <div className="text-sm text-slate-400 font-bold">Total (Statement): <span className="text-white font-black">{formatCurrency(totalAmounts[selectedMonth] || 0)}</span></div>
                 <div className="text-sm text-slate-400 font-bold">Ledgers Sum: 
                    <span className="text-emerald-400 font-black ml-2">
                       {formatCurrency(ledgers.reduce((sum, l) => sum + (l.amounts[selectedMonth]?.closing || 0), 0))}
                    </span>
                 </div>
             </div>
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
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="sticky top-0 bg-[#0F0F16] z-10">
                  <th className="p-3 text-xs text-slate-500 font-bold uppercase tracking-widest border-b border-white/5">Ledger</th>
                  <th className="p-3 text-xs text-slate-500 font-bold uppercase tracking-widest text-right border-b border-white/5">Opening</th>
                  <th className="p-3 text-xs text-slate-500 font-bold uppercase tracking-widest text-right border-b border-white/5">Debit</th>
                  <th className="p-3 text-xs text-slate-500 font-bold uppercase tracking-widest text-right border-b border-white/5">Credit</th>
                  <th className="p-3 text-xs text-slate-500 font-bold uppercase tracking-widest text-right border-b border-white/5">Closing</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedgers.map(ledger => {
                  const data = ledger.amounts[selectedMonth] || { opening: 0, debit: 0, credit: 0, closing: 0 };
                  return (
                    <tr key={ledger.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                      <td className="p-3">
                        <div className="flex flex-col">
                          <h4 className="text-sm font-bold text-white mb-1">{ledger.name}</h4>
                          <div className="flex items-center gap-2">
                             <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{ledger.groupName}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-sm font-mono text-slate-400">{formatCurrency(data.opening)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-sm font-mono text-slate-400">{formatCurrency(data.debit)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-sm font-mono text-slate-400">{formatCurrency(data.credit)}</span>
                      </td>
                      <td className="p-3 text-right">
                        <span className="text-sm font-mono font-black text-white">{formatCurrency(data.closing)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        
      </div>
    </>
  );
}
