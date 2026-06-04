"use client";

import { useState, useEffect } from "react";
import { ChevronRight, ChevronDown, Download, AlertTriangle, TrendingUp, DollarSign, Activity } from "lucide-react";

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

  // Render logic for the hierarchical tree
  const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  // Helper to aggregate totals
  const getSubHeadTotal = (main: string, group: string, subGroup: string, subHead: string) => {
    const nodes = data.dataNodes.filter((n: any) => n.mainGroup === main && n.groupName === group && n.subGroupName === subGroup && n.subHeadName === subHead);
    return nodes.reduce((sum: number, n: any) => sum + (n.nature === "CREDIT" && main === "ASSETS" ? -n.amount : n.amount), 0);
  };

  const getSubGroupTotal = (main: string, group: string, subGroup: string) => {
    const nodes = data.dataNodes.filter((n: any) => n.mainGroup === main && n.groupName === group && n.subGroupName === subGroup);
    return nodes.reduce((sum: number, n: any) => sum + n.amount, 0); // Simplified summation for UI mockup
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

  const renderTree = (main: string, structure: any) => {
    return Object.entries(structure).map(([group, subGroups]: any) => {
      const groupId = `${main}-${group}`;
      const groupTotal = getGroupTotal(main, group);
      if (groupTotal === 0 && expandedNodes.size === 0) return null; // Hide empty groups unless expanded (simplify)

      return (
        <div key={groupId} className="border-b border-white/5 last:border-0">
          <div 
            className="flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer transition-colors"
            onClick={() => toggleExpand(groupId)}
          >
            <div className="flex items-center gap-2">
              {expandedNodes.has(groupId) ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
              <span className="font-bold text-white text-sm tracking-wider uppercase">{group}</span>
            </div>
            <span className="font-black text-white">{formatCurrency(groupTotal)}</span>
          </div>

          {expandedNodes.has(groupId) && (
            <div className="bg-black/20 pl-8">
              {Object.entries(subGroups).map(([subGroup, subHeads]: any) => {
                const subGroupId = `${groupId}-${subGroup}`;
                const subGroupTotal = getSubGroupTotal(main, group, subGroup);
                
                // Get dynamic subheads that map to this subgroup from dataNodes
                const dynamicSubHeads = Array.from(new Set(data.dataNodes.filter((n: any) => n.mainGroup === main && n.groupName === group && n.subGroupName === subGroup).map((n: any) => n.subHeadName)));

                return (
                  <div key={subGroupId} className="border-l border-white/10 ml-2">
                    <div 
                      className="flex items-center justify-between p-3 hover:bg-white/5 cursor-pointer transition-colors"
                      onClick={() => toggleExpand(subGroupId)}
                    >
                      <div className="flex items-center gap-2">
                        {expandedNodes.has(subGroupId) ? <ChevronDown className="w-3 h-3 text-cyan-500" /> : <ChevronRight className="w-3 h-3 text-cyan-500" />}
                        <span className="font-bold text-slate-300 text-xs">{subGroup}</span>
                      </div>
                      <span className="font-bold text-slate-300 text-xs">{formatCurrency(subGroupTotal)}</span>
                    </div>

                    {expandedNodes.has(subGroupId) && (
                      <div className="pl-6 pb-2">
                        {dynamicSubHeads.map((subHead: any) => {
                          const subHeadId = `${subGroupId}-${subHead}`;
                          const subHeadTotal = getSubHeadTotal(main, group, subGroup, subHead);
                          const ledgers = data.dataNodes.filter((n: any) => n.subHeadName === subHead);

                          return (
                            <div key={subHeadId}>
                              <div 
                                className="flex items-center justify-between py-2 pr-4 hover:bg-white/5 cursor-pointer group"
                                onClick={() => toggleExpand(subHeadId)}
                              >
                                <div className="flex items-center gap-2">
                                   {expandedNodes.has(subHeadId) ? <ChevronDown className="w-3 h-3 text-purple-500 opacity-50" /> : <ChevronRight className="w-3 h-3 text-purple-500 opacity-50 group-hover:opacity-100" />}
                                  <span className="text-xs text-slate-400 group-hover:text-cyan-400 transition-colors">{subHead}</span>
                                </div>
                                <span className="text-xs font-mono text-slate-400 group-hover:text-cyan-400">{formatCurrency(subHeadTotal)}</span>
                              </div>
                              
                              {/* Ledger Level Drilldown */}
                              {expandedNodes.has(subHeadId) && (
                                <div className="pl-6 space-y-1 mb-2">
                                  {ledgers.map((l: any) => (
                                    <div key={l.id} className="flex justify-between items-center py-1 pr-4 bg-white/[0.02] rounded-md px-2 border border-white/5">
                                      <span className="text-[10px] text-slate-500">{l.ledgerName}</span>
                                      <span className="text-[10px] font-mono text-slate-500">{formatCurrency(l.amount)} {l.nature === "CREDIT" ? "Cr" : "Dr"}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="space-y-6">
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

      {/* Main BS UI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Liabilities */}
        <div className="bg-[#13131A] rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
          <div className="p-6 bg-[#181821] border-b border-white/5 flex justify-between items-center">
            <h3 className="text-lg font-black text-white uppercase tracking-widest">Liabilities</h3>
            <span className="text-xl font-black text-purple-400">{formatCurrency(totalLiabilities)}</span>
          </div>
          <div className="p-2">
             {renderTree("Liabilities", data.structure["Liabilities"])}
          </div>
        </div>

        {/* Assets */}
        <div className="bg-[#13131A] rounded-3xl border border-white/5 overflow-hidden shadow-2xl">
          <div className="p-6 bg-[#181821] border-b border-white/5 flex justify-between items-center">
            <h3 className="text-lg font-black text-white uppercase tracking-widest">Assets</h3>
            <span className="text-xl font-black text-cyan-400">{formatCurrency(totalAssets)}</span>
          </div>
          <div className="p-2">
             {renderTree("Assets", data.structure["Assets"])}
          </div>
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
