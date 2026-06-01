"use client";

import { useState, useEffect } from "react";
import { X, Search, Link as LinkIcon, Check, Loader2 } from "lucide-react";

interface PNLMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  sectorHeads: string[];
}

export default function PNLMappingModal({ isOpen, onClose, clientId, sectorHeads }: PNLMappingModalProps) {
  const [coa, setCoa] = useState<any[]>([]);
  const [mappings, setMappings] = useState<Record<string, string[]>>({});
  const [software, setSoftware] = useState<string>("ZOHO");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchMappings();
    }
  }, [isOpen, clientId]);

  const fetchMappings = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/clients/${clientId}/mapping`);
      const data = await res.json();
      
      if (data.error) {
        setError(data.error);
      }
      
      setSoftware(data.software || "ZOHO");
      setCoa(data.chartOfAccounts || []);
      
      // Convert flat array to grouped Record
      const grouped: Record<string, string[]> = {};
      data.mappings?.forEach((m: any) => {
        if (!grouped[m.sectorHead]) grouped[m.sectorHead] = [];
        grouped[m.sectorHead].push(m.softwareLedgerName);
      });
      setMappings(grouped);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const toggleMapping = (head: string, ledger: string) => {
    setMappings(prev => {
      const current = prev[head] || [];
      if (current.includes(ledger)) {
        return { ...prev, [head]: current.filter(l => l !== ledger) };
      } else {
        return { ...prev, [head]: [...current, ledger] };
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    const flatMappings = Object.entries(mappings).flatMap(([head, ledgers]) => 
      ledgers.map(l => ({ sectorHead: head, softwareLedgerName: l }))
    );

    try {
      const res = await fetch(`/api/clients/${clientId}/mapping`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: flatMappings })
      });
      
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to save mapping");
      
      alert("✅ Mapping Saved Successfully!");
      onClose();
    } catch (err: any) {
      alert("Error Saving Mapping: " + err.message);
      console.error(err);
    }
    setSaving(false);
  };

  if (!isOpen) return null;

  // 1. Gather all mapped ledger names in a Set for fast lookup
  const mappedLedgers = new Set(Object.values(mappings).flat());

  // 2. Filter COA to show all ledgers matching the search term
  const filteredCoa = coa.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-5xl bg-[#13131A] border border-white/10 rounded-3xl overflow-hidden flex flex-col max-h-[90vh] shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#181821]">
          <div>
            <h2 className="text-xl font-black text-white">Smart P&L Mapping</h2>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">Map {software} Ledgers to Standard P&L Heads</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
        </div>

        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-20">
            <Loader2 className="w-12 h-12 text-cyan-500 animate-spin mb-4" />
            <p className="text-slate-400 font-bold animate-pulse">Fetching Chart of Accounts...</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
            <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
              <X className="w-8 h-8 text-red-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Connection Issue</h3>
            <p className="text-slate-400 max-w-sm mb-8 font-medium">{error}</p>
            <button onClick={fetchMappings} className="px-6 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl transition-all">Try Again</button>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Column: Standard P&L Heads */}
            <div className="w-1/2 border-r border-white/5 flex flex-col">
              <div className="p-4 bg-white/[0.02] border-b border-white/5">
                <span className="text-[10px] font-black text-cyan-500 uppercase tracking-[0.2em]">Select Standard P&L Head</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {sectorHeads.map(head => (
                  <div key={head} className="p-3 bg-white/5 border border-white/5 rounded-xl">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-white">{head}</span>
                      <span className="text-[10px] font-black text-slate-500 uppercase">{(mappings[head] || []).length} Mapped</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(mappings[head] || []).map(l => (
                        <div key={l} className="px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-md flex items-center gap-2">
                          <span className="text-[10px] font-bold text-cyan-400">{l}</span>
                          <button onClick={() => toggleMapping(head, l)} className="hover:text-red-400"><X className="w-3 h-3" /></button>
                        </div>
                      ))}
                      {(!mappings[head] || mappings[head].length === 0) && (
                        <p className="text-[10px] text-slate-600 italic italic">No ledgers mapped yet</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Column: Software Ledgers */}
            <div className="w-1/2 flex flex-col">
              <div className="p-4 bg-white/[0.02] border-b border-white/5 flex items-center gap-3">
                <Search className="w-4 h-4 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Search Software Ledgers..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent border-none focus:ring-0 text-sm font-bold text-white w-full"
                />
              </div>
              <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                <div className="space-y-1">
                  {filteredCoa.map(account => {
                    const mappedHead = Object.entries(mappings).find(([_, ledgers]) => ledgers.includes(account.name))?.[0];
                    return (
                      <div key={account.id} className={`group p-3 hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-white/10 flex items-center justify-between ${mappedHead ? 'opacity-50' : ''}`}>
                        <div>
                          <p className="text-sm font-bold text-slate-200">{account.name}</p>
                          <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{account.type}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {mappedHead ? (
                            <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                              Mapped to {mappedHead}
                            </span>
                          ) : (
                            <select 
                              onChange={(e) => {
                                if (e.target.value) toggleMapping(e.target.value, account.name);
                                e.target.value = "";
                              }}
                              className="bg-[#1a1a24] border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold text-white hover:border-emerald-500/50 transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500/50"
                            >
                              <option value="" className="bg-[#13131A] text-slate-400 font-medium">Map to Head...</option>
                              {sectorHeads.map(h => (
                                <option key={h} value={h} className="bg-[#13131A] text-white font-medium py-1">{h}</option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-[#181821] flex justify-between items-center">
          <p className="text-xs text-slate-400">All data from {software} will be aggregated based on these mappings during the next sync.</p>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="px-8 py-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Mapping
          </button>
        </div>
      </div>
    </div>
  );
}
