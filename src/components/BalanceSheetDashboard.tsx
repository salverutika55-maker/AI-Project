"use client";

import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, AlertTriangle, TrendingUp, DollarSign, Activity } from "lucide-react";

interface BalanceSheetDashboardProps {
  clientId: string;
}

export default function BalanceSheetDashboard({ clientId }: BalanceSheetDashboardProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchBalanceSheet();
  }, [clientId]);

  const fetchBalanceSheet = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/balance-sheet`);
      const bsData = await res.json();
      setData(bsData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Activity className="w-12 h-12 text-cyan-500 animate-pulse" />
        <p className="text-cyan-400 font-bold tracking-widest uppercase">Compiling Balance Sheet...</p>
      </div>
    );
  }

  if (!data) return null;

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  const getSubHeadTotal = (main: string, group: string, subGroup: string, subHead: string) => {
    const nodes = data.dataNodes.filter((n: any) => n.mainGroup === main && n.groupName === group && n.subGroupName === subGroup && n.subHeadName === subHead);
    return nodes.reduce((sum: number, n: any) => sum + (n.nature === "CREDIT" && main === "Assets" ? -n.amount : n.amount), 0);
  };

  const getSubGroupTotal = (main: string, group: string, subGroup: string) => {
    const nodes = data.dataNodes.filter((n: any) => n.mainGroup === main && n.groupName === group && n.subGroupName === subGroup);
    return nodes.reduce((sum: number, n: any) => sum + n.amount, 0); 
  };

  const getGroupTotal = (main: string, group: string) => {
    const nodes = data.dataNodes.filter((n: any) => n.mainGroup === main && n.groupName === group);
    return nodes.reduce((sum: number, n: any) => sum + n.amount, 0);
  };

  const getMainTotal = (main: string) => {
    const nodes = data.dataNodes.filter((n: any) => n.mainGroup === main);
    return nodes.reduce((sum: number, n: any) => sum + n.amount, 0);
  };

  const totalAssets = getMainTotal("Assets");
  const totalLiabilities = getMainTotal("Liabilities");
  const isBalanced = totalAssets === totalLiabilities;
  const diff = Math.abs(totalAssets - totalLiabilities);

  const renderFlatTree = (main: string, structure: any) => {
    const rows: any[] = [];
    
    // Main Header (Liabilities / Assets)
    const mainTotal = getMainTotal(main);
    rows.push(
      <tr key={main} className="bg-white/[0.05] border-b border-white/10">
        <td className="sticky left-0 z-30 p-4 text-sm font-black text-cyan-400 uppercase tracking-widest">{main}</td>
        <td className="p-4 text-right text-sm font-mono font-black text-cyan-400 border-l border-white/10 bg-cyan-500/5">{formatCurrency(mainTotal)}</td>
      </tr>
    );

    Object.entries(structure).forEach(([group, subGroups]: any) => {
      const groupTotal = getGroupTotal(main, group);
      if (groupTotal === 0 && expandedNodes.size === 0) return; // Hide empty if not expanded
      const groupId = `${main}-${group}`;

      rows.push(
        <tr key={groupId} className="bg-white/[0.02] border-b border-white/5 cursor-pointer hover:bg-white/[0.04] transition-colors" onClick={() => toggleExpand(groupId)}>
          <td className="sticky left-0 z-30 p-4 pl-8 text-sm font-bold text-white tracking-wider flex items-center gap-2">
            {expandedNodes.has(groupId) ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            {group}
          </td>
          <td className="p-4 text-right text-sm font-mono font-bold text-white border-l border-white/10">{formatCurrency(groupTotal)}</td>
        </tr>
      );

      if (expandedNodes.has(groupId)) {
        Object.entries(subGroups).forEach(([subGroup, subHeads]: any) => {
          const subGroupTotal = getSubGroupTotal(main, group, subGroup);
          const subGroupId = `${groupId}-${subGroup}`;
          
          rows.push(
            <tr key={subGroupId} className="bg-[#13131A] border-b border-white/5 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={() => toggleExpand(subGroupId)}>
              <td className="sticky left-0 z-30 p-3 pl-14 text-xs font-bold text-slate-300 flex items-center gap-2">
                {expandedNodes.has(subGroupId) ? <ChevronDown className="w-3 h-3 text-cyan-500" /> : <ChevronRight className="w-3 h-3 text-cyan-500" />}
                {subGroup}
              </td>
              <td className="p-3 text-right text-xs font-mono font-bold text-slate-300 border-l border-white/10">{formatCurrency(subGroupTotal)}</td>
            </tr>
          );

          if (expandedNodes.has(subGroupId)) {
            const dynamicSubHeads = Array.from(new Set(data.dataNodes.filter((n: any) => n.mainGroup === main && n.groupName === group && n.subGroupName === subGroup).map((n: any) => n.subHeadName)));
            
            dynamicSubHeads.forEach((subHead: any) => {
              const subHeadTotal = getSubHeadTotal(main, group, subGroup, subHead);
              const subHeadId = `${subGroupId}-${subHead}`;
              const ledgers = data.dataNodes.filter((n: any) => n.subHeadName === subHead);

              rows.push(
                <tr key={subHeadId} className="bg-[#13131A] border-b border-white/5 cursor-pointer hover:bg-white/[0.02] group transition-colors" onClick={() => toggleExpand(subHeadId)}>
                  <td className="sticky left-0 z-30 p-2 pl-20 text-xs text-slate-400 group-hover:text-cyan-400 flex items-center gap-2">
                    {expandedNodes.has(subHeadId) ? <ChevronDown className="w-3 h-3 text-purple-500" /> : <ChevronRight className="w-3 h-3 text-purple-500" />}
                    {subHead}
                  </td>
                  <td className="p-2 text-right text-xs font-mono text-slate-400 group-hover:text-cyan-400 border-l border-white/10">{formatCurrency(subHeadTotal)}</td>
                </tr>
              );

              if (expandedNodes.has(subHeadId)) {
                ledgers.forEach((l: any) => {
                  rows.push(
                    <tr key={l.id} className="bg-[#0a0a0c] border-b border-white/5">
                      <td className="sticky left-0 z-30 p-2 pl-28 text-[10px] text-slate-500">{l.ledgerName}</td>
                      <td className="p-2 text-right text-[10px] font-mono text-slate-500 border-l border-white/10">{formatCurrency(l.amount)} {l.nature === "CREDIT" ? "Cr" : "Dr"}</td>
                    </tr>
                  );
                });
              }
            });
          }
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
            <p className="text-xs font-bold text-red-400/80 mt-1">Difference: {formatCurrency(diff)}. Check unmapped ledgers or P&L reconciliation.</p>
          </div>
        </div>
      )}

      {/* Main BS UI - Tabular format matching P&L */}
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
                <th className="p-6 text-right text-[10px] font-black text-cyan-500 uppercase tracking-widest min-w-[150px] border-l border-white/10 bg-cyan-500/5">Closing Balance</th>
              </tr>
            </thead>
            <tbody>
               {renderFlatTree("Liabilities", data.structure["Liabilities"])}
               
               {/* Total Liabilities Row */}
               <tr className="bg-cyan-500/5 border-b border-white/10">
                  <td className="sticky left-0 z-30 p-4 text-sm font-black text-white uppercase tracking-widest">Total Liabilities</td>
                  <td className="p-4 text-right text-sm font-mono font-black text-cyan-400 border-l border-white/10">{formatCurrency(totalLiabilities)}</td>
               </tr>

               {/* Spacer */}
               <tr><td colSpan={2} className="h-8 bg-[#0a0a0c]"></td></tr>

               {renderFlatTree("Assets", data.structure["Assets"])}

               {/* Total Assets Row */}
               <tr className="bg-cyan-500/5 border-b border-white/10">
                  <td className="sticky left-0 z-30 p-4 text-sm font-black text-white uppercase tracking-widest">Total Assets</td>
                  <td className="p-4 text-right text-sm font-mono font-black text-cyan-400 border-l border-white/10">{formatCurrency(totalAssets)}</td>
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
    </div>
  );
}
