"use client";

import { useState, useEffect, Fragment } from "react";
import { X, Search, Check, Loader2, Sparkles, AlertCircle } from "lucide-react";

interface MasterLedgerMappingProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  sections?: any[];
  customSubHeads?: any[];
}

export default function MasterLedgerMapping({ isOpen, onClose, clientId, sections = [], customSubHeads = [] }: MasterLedgerMappingProps) {
  const [coa, setCoa] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestingFor, setSuggestingFor] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, { confidence: number, confidenceCategory: string, reasons: string[] }>>({});

  const deletedSections = customSubHeads.filter(c => c.headName === "__DELETED_SECTION__").map(c => c.name);
  const activeSections = sections.filter(s => !s.isCalculated && !deletedSections.includes(s.name));

  // Group definitions for the dropdowns
  const statementTypes = ["PNL", "BS"];
  const groups = {
    "PNL": activeSections.length > 0 ? activeSections.map(s => s.name) : ["Revenue", "Direct Expenses", "Employee Costs", "Operating Expenses", "Finance Costs", "Depreciation", "Other Income", "Taxes"],
    "BS": ["Owner's Funds", "Non-Current Liabilities", "Current Liabilities", "Non-Current Assets", "Current Assets", "Branch Account"]
  };
  
  // Structured from image
  const subGroups: any = {
    "Owner's Funds": ["Share Capital", "Reserves & Surplus", "Profit & Loss Account"],
    "Non-Current Liabilities": ["Unsecured Loans"],
    "Current Liabilities": ["Short Term Borrowing", "Duties & Taxes", "Suspense A/c", "Trade Payable", "Provisions", "Other Current Liabilities"],
    "Non-Current Assets": ["Fixed Assets", "Investments"],
    "Current Assets": ["Closing Stock", "Trade Receivable", "Cash-In-Hand", "Bank Accounts", "Deposits (Assets)", "Short Term Loan & Advance", "Other Current Assets"],
    "Branch Account": []
  };

  useEffect(() => {
    if (isOpen) {
      fetchData();
    }
  }, [isOpen, clientId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/unified-mapping`);
      const data = await res.json();
      setCoa(data.chartOfAccounts || []);
      setMappings(data.mappings || []);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const handleSuggest = async (ledgerName: string, parentGroup?: string) => {
    setSuggestingFor(ledgerName);
    try {
      const res = await fetch(`/api/clients/${clientId}/unified-mapping/suggest`, {
        method: "POST",
        body: JSON.stringify({ ledgerName, parentGroup })
      });
      const data = await res.json();
      if (data.suggestion) {
        updateMapping(ledgerName, "statementType", data.suggestion.statementType);
        updateMapping(ledgerName, "groupName", data.suggestion.groupName);
        if (data.suggestion.subGroupName) updateMapping(ledgerName, "subGroupName", data.suggestion.subGroupName);
        updateMapping(ledgerName, "subHeadName", data.suggestion.subHeadName);
        
        if (data.confidence !== undefined && data.reasons) {
          setAiResults(prev => ({ ...prev, [ledgerName]: { confidence: data.confidence, confidenceCategory: data.confidenceCategory, reasons: data.reasons } }));
        }
      }
    } catch (e) {
      console.error(e);
    }
    setSuggestingFor(null);
  };

  const getMapping = (ledgerName: string) => {
    return mappings.find(m => m.softwareLedgerName === ledgerName) || {};
  };

  const updateMapping = (ledgerName: string, field: string, value: string) => {
    setMappings(prev => {
      const existingIdx = prev.findIndex(m => m.softwareLedgerName === ledgerName);
      if (existingIdx >= 0) {
        const updated = [...prev];
        updated[existingIdx] = { ...updated[existingIdx], [field]: value };
        // Reset cascading fields
        if (field === "statementType") {
          updated[existingIdx].groupName = "";
          updated[existingIdx].subGroupName = "";
          updated[existingIdx].subHeadName = "";
        }
        if (field === "groupName") {
          updated[existingIdx].subGroupName = "";
          updated[existingIdx].subHeadName = "";
        }
        return updated;
      } else {
        return [...prev, { softwareLedgerName: ledgerName, [field]: value }];
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    // Filter out incomplete mappings (subHeadName is now optional, defaults to groupName in backend)
    const validMappings = mappings.filter(m => m.statementType && m.groupName);
    try {
      const res = await fetch(`/api/clients/${clientId}/unified-mapping`, {
        method: "POST",
        body: JSON.stringify({ mappings: validMappings })
      });
      if (res.ok) {
        onClose();
      }
    } catch (err) {
      console.error(err);
    }
    setSaving(false);
  };

  if (!isOpen) return null;

  const filteredCoa = coa.filter(a => a.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-7xl bg-[#13131A] border border-white/10 rounded-3xl flex flex-col max-h-[90vh] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#181821]">
          <div>
            <h2 className="text-xl font-black text-white">Unified Chart of Accounts Mapping</h2>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">Single source of truth for P&L and Balance Sheet</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-20">
            <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-4 bg-white/[0.02] border-b border-white/5 flex items-center gap-3">
              <Search className="w-4 h-4 text-slate-500" />
              <input 
                type="text" 
                placeholder="Search Ledgers..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="bg-transparent border-none focus:ring-0 text-sm font-bold text-white w-full"
              />
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase">Ledger Name</th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase">Statement Type</th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase">Group</th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase">Sub Group</th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase">Sub Head</th>
                    <th className="p-3 text-[10px] font-black text-slate-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredCoa.map((account) => {
                    const m = getMapping(account.name);
                    const isFullyMapped = m.statementType && m.groupName;
                    
                    return (
                      <Fragment key={account.id}>
                      <tr className="hover:bg-white/5 group transition-colors">
                        <td className="p-3">
                          <p className="text-sm font-bold text-white">{account.name}</p>
                          <p className="text-[9px] text-slate-500 uppercase">
                            {(!account.groupName || account.groupName.toLowerCase() === "uncategorized" || account.groupName.toLowerCase() === "unknown") 
                              ? "Tally Ledger" 
                              : account.groupName}
                          </p>
                        </td>
                        <td className="p-3">
                          <select 
                            value={m.statementType || ""} 
                            onChange={e => updateMapping(account.name, "statementType", e.target.value)}
                            className="bg-[#1a1a24] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white"
                          >
                            <option value="">Select...</option>
                            <option value="PNL">Profit & Loss</option>
                            <option value="BS">Balance Sheet</option>
                          </select>
                        </td>
                        <td className="p-3">
                          <select 
                            value={m.groupName || ""} 
                            onChange={e => updateMapping(account.name, "groupName", e.target.value)}
                            disabled={!m.statementType}
                            className="bg-[#1a1a24] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white disabled:opacity-50"
                          >
                            <option value="">Select...</option>
                            {(groups[m.statementType as keyof typeof groups] || []).map((g: string) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3">
                          <select 
                            value={m.subGroupName || ""} 
                            onChange={e => updateMapping(account.name, "subGroupName", e.target.value)}
                            disabled={!m.groupName || m.statementType === "PNL"}
                            className="bg-[#1a1a24] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white disabled:opacity-50"
                          >
                            <option value="">{m.statementType === "PNL" ? "N/A" : "Select..."}</option>
                            {m.statementType !== "PNL" && (subGroups[m.groupName] || []).map((sg: string) => (
                              <option key={sg} value={sg}>{sg}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3">
                          {m.statementType === "PNL" ? (
                            <select
                              value={m.subHeadName || ""}
                              onChange={e => updateMapping(account.name, "subHeadName", e.target.value)}
                              disabled={!m.groupName}
                              className="bg-[#1a1a24] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white disabled:opacity-50 w-full"
                            >
                              <option value="">Select Line Item...</option>
                              {[
                                ...customSubHeads.filter(c => c.headName === m.groupName).map(c => c.name)
                              ].map(opt => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input 
                              type="text"
                              value={m.subHeadName || ""}
                              onChange={e => updateMapping(account.name, "subHeadName", e.target.value)}
                              disabled={!m.groupName}
                              placeholder="Type line item name..."
                              className="bg-[#1a1a24] border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white disabled:opacity-50 w-full"
                            />
                          )}
                        </td>
                        <td className="p-3">
                          {!isFullyMapped ? (
                            <button 
                              onClick={() => handleSuggest(account.name, account.groupName)}
                              disabled={suggestingFor === account.name}
                              className="flex items-center gap-1 px-3 py-1 bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg text-[10px] font-bold hover:bg-purple-500/20 transition-all"
                            >
                              {suggestingFor === account.name ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              AI Auto-Map
                            </button>
                          ) : (
                            <div className="flex items-center gap-1 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-bold">
                              <Check className="w-3 h-3" /> Mapped
                            </div>
                          )}
                        </td>
                      </tr>
                      {aiResults[account.name] && (
                        <tr key={`${account.id}-ai`}>
                          <td colSpan={6} className="p-0 border-b border-white/5 bg-[#13131A]">
                            <div className={`p-4 mx-3 mb-3 rounded-xl border flex items-start gap-4 ${
                              aiResults[account.name].confidenceCategory === "VERY_HIGH" ? 'bg-emerald-500/10 border-emerald-500/20' :
                              aiResults[account.name].confidenceCategory === "HIGH" ? 'bg-teal-500/10 border-teal-500/20' :
                              aiResults[account.name].confidenceCategory === "MODERATE" ? 'bg-amber-500/10 border-amber-500/20' :
                              'bg-rose-500/10 border-rose-500/20'
                            }`}>
                              <Sparkles className={`w-5 h-5 mt-0.5 ${
                                aiResults[account.name].confidenceCategory === "VERY_HIGH" ? 'text-emerald-400' :
                                aiResults[account.name].confidenceCategory === "HIGH" ? 'text-teal-400' :
                                aiResults[account.name].confidenceCategory === "MODERATE" ? 'text-amber-400' :
                                'text-rose-400'
                              }`} />
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <p className="text-[10px] font-black uppercase tracking-widest text-white">
                                    AI Suggested Mapping 
                                  </p>
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                                    aiResults[account.name].confidenceCategory === "VERY_HIGH" ? 'bg-emerald-500/20 text-emerald-400' :
                                    aiResults[account.name].confidenceCategory === "HIGH" ? 'bg-teal-500/20 text-teal-400' :
                                    aiResults[account.name].confidenceCategory === "MODERATE" ? 'bg-amber-500/20 text-amber-400' :
                                    'bg-rose-500/20 text-rose-400'
                                  }`}>
                                    {aiResults[account.name].confidence}% Confidence
                                  </span>
                                </div>
                                <div className="space-y-1.5">
                                  {aiResults[account.name].reasons.map((r, idx) => (
                                    <p key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                                      <Check className="w-3.5 h-3.5 text-cyan-500 mt-0.5 shrink-0" />
                                      {r}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="p-6 border-t border-white/5 bg-[#181821] flex justify-between items-center">
          <div className="flex items-center gap-2 text-amber-500">
             <AlertCircle className="w-4 h-4" />
             <p className="text-xs font-bold">These mappings power both the Balance Sheet and P&L dynamically.</p>
          </div>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl transition-all shadow-lg flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Mappings
          </button>
        </div>
      </div>
    </div>
  );
}
