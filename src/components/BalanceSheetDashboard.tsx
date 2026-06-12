import React, { useState, useEffect } from "react";
import { DollarSign, Activity, AlertTriangle, TrendingUp } from "lucide-react";
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
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/balance-sheet?t=${Date.now()}`);
      const bsData = await res.json();
      setData(bsData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Activity className="w-12 h-12 text-cyan-500 animate-pulse" />
        <p className="text-cyan-400 font-bold tracking-widest uppercase">Compiling Balance Sheet...</p>
      </div>
    );
  }

  if (!data || !data.dataNodes || !data.structure) return null;

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  // Totals calculated per month
  const getSubGroupTotal = (main: string, group: string, subGroup: string, month: string) => {
    const nodes = data.dataNodes.filter((n: any) => n.mainGroup === main && n.groupName === group && n.subGroupName === subGroup && n.period === month);
    return nodes.reduce((sum: number, n: any) => sum + n.amount, 0); 
  };

  const getGroupTotal = (main: string, group: string, month: string) => {
    const nodes = data.dataNodes.filter((n: any) => n.mainGroup === main && n.groupName === group && n.period === month);
    return nodes.reduce((sum: number, n: any) => sum + n.amount, 0);
  };

  const getMainTotal = (main: string, month: string) => {
    const nodes = data.dataNodes.filter((n: any) => n.mainGroup === main && n.period === month);
    return nodes.reduce((sum: number, n: any) => sum + n.amount, 0);
  };

  // Balance checking against the latest month (for the alert banner)
  const latestMonth = visibleMonths[visibleMonths.length - 1];
  const totalAssets = getMainTotal("Assets", latestMonth);
  const totalLiabilities = getMainTotal("Liabilities", latestMonth);
  const diff = Math.abs(totalAssets - totalLiabilities);
  const isBalanced = diff < 1;

  const getTotalsForDrilldown = (main: string, group: string, subGroup: string) => {
    const totals: Record<string, number> = {};
    visibleMonths.forEach(m => {
      totals[m] = getSubGroupTotal(main, group, subGroup, m);
    });
    return totals;
  };

  const renderFlatTree = (main: string, structure: any) => {
    const rows: any[] = [];
    
    if (!structure) return rows;

    // Main Header (Liabilities / Assets)
    rows.push(
      <tr key={main} className="bg-white/[0.05] border-b border-white/10">
        <td className="sticky left-0 z-30 p-4 text-sm font-black text-cyan-400 uppercase tracking-widest">{main}</td>
        {visibleMonths.map(month => (
          <td key={month} className="p-4 text-right text-sm font-mono font-black text-cyan-400 border-l border-white/10 bg-cyan-500/5">
            {formatCurrency(getMainTotal(main, month))}
          </td>
        ))}
      </tr>
    );

    Object.entries(structure).forEach(([group, subGroups]: any) => {
      // Group Header (Owner's Funds, Non-Current Liabilities, etc)
      rows.push(
        <tr key={`${main}-${group}`} className="bg-[#1a1a24] border-b border-white/5">
          <td className="sticky left-0 z-30 p-4 pl-8 text-xs font-black text-white tracking-widest">{group}</td>
          {visibleMonths.map(month => (
            <td key={month} className="p-4 text-right text-xs font-mono font-bold text-white border-l border-white/10">
              {formatCurrency(getGroupTotal(main, group, month))}
            </td>
          ))}
        </tr>
      );

      // SubGroups (Share Capital, etc)
      if (typeof subGroups === 'object') {
        Object.entries(subGroups).forEach(([subGroup, _]: any) => {
          rows.push(
            <tr key={`${main}-${group}-${subGroup}`} className="bg-[#13131A] border-b border-white/5 hover:bg-white/[0.02] transition-colors group/row">
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
      }
    });

    return rows;
  };

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

      {/* Main BS UI - Flat Tabular format matching P&L */}
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
                  <th key={month} className="p-4 text-right text-[10px] font-black text-cyan-500 uppercase tracking-widest min-w-[150px] border-l border-white/10 bg-cyan-500/5">
                    {month === "Opening" ? "Opening Balance" : `${month} ${selectedYear}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
               {renderFlatTree("Liabilities", data.structure["Liabilities"])}
               
               {/* Total Liabilities Row */}
               <tr className="bg-cyan-500/5 border-b border-white/10">
                  <td className="sticky left-0 z-30 p-4 text-sm font-black text-white uppercase tracking-widest">Total Liabilities</td>
                  {visibleMonths.map(month => (
                    <td key={month} className="p-4 text-right text-sm font-mono font-black text-cyan-400 border-l border-white/10">
                      {formatCurrency(getMainTotal("Liabilities", month))}
                    </td>
                  ))}
               </tr>

               {/* Spacer */}
               <tr>
                 <td colSpan={visibleMonths.length + 1} className="h-8 bg-[#0a0a0c]"></td>
               </tr>

               {renderFlatTree("Assets", data.structure["Assets"])}

               {/* Total Assets Row */}
               <tr className="bg-cyan-500/5 border-b border-white/10">
                  <td className="sticky left-0 z-30 p-4 text-sm font-black text-white uppercase tracking-widest">Total Assets</td>
                  {visibleMonths.map(month => (
                    <td key={month} className="p-4 text-right text-sm font-mono font-black text-cyan-400 border-l border-white/10">
                      {formatCurrency(getMainTotal("Assets", month))}
                    </td>
                  ))}
               </tr>
            </tbody>
          </table>
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
    </div>
  );
}
