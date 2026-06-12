"use client";

import { useState, useEffect, Fragment } from "react";
import { AlertTriangle, TrendingUp, DollarSign, Activity } from "lucide-react";
import LedgerDrilldownDrawer from "./LedgerDrilldownDrawer";

interface BalanceSheetDashboardProps {
  clientId: string;
  visibleMonths?: string[];
  selectedYear?: number;
}

export default function BalanceSheetDashboard({ clientId, visibleMonths = ["Apr", "May"], selectedYear = 2024 }: BalanceSheetDashboardProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [drilldownState, setDrilldownState] = useState<{ isOpen: boolean, statementType: "PNL" | "BS", subHeadName: string, months: string[], year: number, totalAmounts: Record<string, number> } | null>(null);

  useEffect(() => {
    fetchBalanceSheet();
  }, [clientId]);

  const fetchBalanceSheet = async () => {
    try {
      const res = await fetch(`/api/clients/${clientId}/balance-sheet`);
      const result = await res.json();
      if (res.ok) {
        setData(result);
      }
    } catch (error) {
      console.error("Failed to fetch balance sheet", error);
    }
    setLoading(false);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Helper functions for reading BS data structure
  const getSubGroupTotal = (mainGroup: string, group: string, subGroup: string, month: string) => {
    const records = data?.data?.[mainGroup]?.[group]?.[subGroup] || [];
    const record = records.find((r: any) => r.month === month);
    return record ? record.amount : 0;
  };

  const getTotalsForDrilldown = (mainGroup: string, group: string, subGroup: string) => {
    const totals: Record<string, number> = {};
    visibleMonths.forEach(m => {
      totals[m] = getSubGroupTotal(mainGroup, group, subGroup, m);
    });
    return totals;
  };

  const getGroupTotal = (mainGroup: string, group: string, month: string) => {
    const subGroups = data?.data?.[mainGroup]?.[group] || {};
    return Object.keys(subGroups).reduce((sum, subGroup) => sum + getSubGroupTotal(mainGroup, group, subGroup, month), 0);
  };

  const getMainGroupTotal = (mainGroup: string, month: string) => {
    const groups = data?.data?.[mainGroup] || {};
    return Object.keys(groups).reduce((sum, group) => sum + getGroupTotal(mainGroup, group, month), 0);
  };

  const renderSection = (main: "Assets" | "Liabilities") => {
    if (!data?.data?.[main]) return null;
    
    const groups = data.data[main];
    const rows: React.ReactNode[] = [];

    // Main Group Header
    rows.push(
      <tr key={main} className="bg-[#181821] border-b border-white/5">
        <td className="sticky left-0 z-30 p-4 text-sm font-black text-white tracking-widest uppercase">{main}</td>
        {visibleMonths.map(month => (
          <td key={month} className="p-4 text-right text-sm font-mono font-black text-white border-l border-white/10">
            {formatCurrency(getMainGroupTotal(main, month))}
          </td>
        ))}
      </tr>
    );

    // Groups (Current Assets, Non-Current Assets, etc)
    Object.entries(groups).forEach(([group, subGroups]: any) => {
      rows.push(
        <tr key={`${main}-${group}`} className="bg-[#1A1A24] border-b border-white/5">
          <td className="sticky left-0 z-30 p-4 pl-8 text-sm font-bold text-cyan-400">{group}</td>
          {visibleMonths.map(month => (
            <td key={month} className="p-4 text-right text-xs font-mono font-bold text-white border-l border-white/10">
              {formatCurrency(getGroupTotal(main, group, month))}
            </td>
          ))}
        </tr>
      );

      // SubGroups (Share Capital, etc)
      Object.entries(subGroups).forEach(([subGroup, _]: any) => {
        rows.push(
          <tr key={`${main}-${group}-${subGroup}`} className="bg-[#13131A] border-b border-white/5 hover:bg-white/[0.02] transition-colors">
            <td className="sticky left-0 z-30 p-4 pl-12 text-sm font-medium text-slate-400">
              <button 
                onClick={() => setDrilldownState({ 
                  isOpen: true, 
                  statementType: "BS", 
                  subHeadName: subGroup, 
                  months: visibleMonths, 
                  year: selectedYear, 
                  totalAmounts: getTotalsForDrilldown(main, group, subGroup)
                })}
                className="hover:text-cyan-400 hover:underline transition-all text-left"
              >
                {subGroup}
              </button>
            </td>
            {visibleMonths.map(month => {
              const actualVal = getSubGroupTotal(main, group, subGroup, month);
              return (
                <td key={month} className="p-4 text-right text-sm font-mono font-bold text-slate-300 border-l border-white/5">
                  <button 
                    onClick={() => setDrilldownState({ 
                      isOpen: true, 
                      statementType: "BS", 
                      subHeadName: subGroup, 
                      months: visibleMonths, 
                      year: selectedYear, 
                      totalAmounts: getTotalsForDrilldown(main, group, subGroup)
                    })}
                    className="hover:text-cyan-400 hover:underline transition-all w-full h-full text-right"
                  >
                    {formatCurrency(actualVal)}
                  </button>
                </td>
              );
            })}
          </tr>
        );
      });
    });

    return rows;
  };

  if (loading || !data) {
     return <div className="p-8 text-center text-slate-400 font-mono animate-pulse">Loading Balance Sheet...</div>;
  }

  // Verification math
  const latestMonth = visibleMonths[visibleMonths.length - 1];
  const totalAssets = getMainGroupTotal("Assets", latestMonth);
  const totalLiabilities = getMainGroupTotal("Liabilities", latestMonth);
  const diff = Math.abs(totalAssets - totalLiabilities);
  const isBalanced = diff < 1;

  return (
    <div className="space-y-8">
      {/* Validation Banner */}
      {!isBalanced && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-4 animate-in slide-in-from-top-4">
          <div className="w-10 h-10 bg-red-500/20 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-black text-red-500 uppercase tracking-widest">Balance Sheet Out of Balance</h3>
            <p className="text-xs font-bold text-red-400/80 mt-1">Difference: {formatCurrency(diff)} (as of {latestMonth}). Check unmapped ledgers or P&L reconciliation.</p>
          </div>
        </div>
      )}

      {/* Main BS UI */}
      <div className="bg-[#13131A] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#181821]">
          <div className="flex items-center gap-3">
            <DollarSign className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-black text-white">Balance Sheet Statement</h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-white/10">
                <th className="sticky left-0 z-30 bg-[#181821] p-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[300px]">Particulars</th>
                {visibleMonths.map(month => (
                  <th key={month} className="p-6 text-right text-[10px] font-black text-slate-500 uppercase tracking-widest border-l border-white/5 min-w-[150px]">
                    {month} {selectedYear}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {renderSection("Assets")}
              
              {/* Spacer Row */}
              <tr className="bg-[#0F0F16]">
                <td colSpan={visibleMonths.length + 1} className="h-4 border-y border-white/5"></td>
              </tr>
              
              {renderSection("Liabilities")}

              {/* Final Totals Row */}
              <tr className="bg-[#181821] border-t border-white/10">
                 <td className="sticky left-0 z-30 p-6 text-sm font-black text-cyan-400 uppercase tracking-widest">Total Assets</td>
                 {visibleMonths.map(month => (
                   <td key={month} className="p-6 text-right text-sm font-mono font-black text-cyan-400 border-l border-white/10">
                     {formatCurrency(getMainGroupTotal("Assets", month))}
                   </td>
                 ))}
              </tr>
              <tr className="bg-[#181821] border-t border-white/5">
                 <td className="sticky left-0 z-30 p-6 text-sm font-black text-purple-400 uppercase tracking-widest">Total Liabilities</td>
                 {visibleMonths.map(month => (
                   <td key={month} className="p-6 text-right text-sm font-mono font-black text-purple-400 border-l border-white/10">
                     {formatCurrency(getMainGroupTotal("Liabilities", month))}
                   </td>
                 ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Analysis Mockup */}
      <div className="bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20 rounded-3xl p-6">
        <h3 className="text-sm font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4" /> AI Balance Sheet Analysis
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-black/20 rounded-xl p-4 border border-white/5">
             <p className="text-xs text-slate-400 mb-2">Liquidity Position</p>
             <p className="text-sm font-bold text-white">Current Ratio is 1.5. Healthy short-term liquidity. Trade receivables form 45% of current assets.</p>
          </div>
          <div className="bg-black/20 rounded-xl p-4 border border-white/5">
             <p className="text-xs text-slate-400 mb-2">Capital Structure</p>
             <p className="text-sm font-bold text-white">Debt-to-Equity is 0.8. The company is moderately leveraged with good solvency.</p>
          </div>
          <div className="bg-black/20 rounded-xl p-4 border border-white/5">
             <p className="text-xs text-slate-400 mb-2">Working Capital</p>
             <p className="text-sm font-bold text-white">Working capital increased by ₹12L from previous period, indicating business expansion.</p>
          </div>
        </div>
      </div>

      {/* Ledger Drill-Down Drawer */}
      {drilldownState && (
        <LedgerDrilldownDrawer 
          isOpen={drilldownState.isOpen}
          onClose={() => setDrilldownState(null)}
          clientId={clientId}
          statementType={drilldownState.statementType}
          subHeadName={drilldownState.subHeadName}
          months={drilldownState.months}
          year={drilldownState.year}
          totalAmounts={drilldownState.totalAmounts}
        />
      )}
    </div>
  );
}
