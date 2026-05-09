"use client";

import { useState, useRef, useMemo } from "react";
import { X, UploadCloud, Loader2, Check, AlertCircle, FileSpreadsheet, ChevronRight, Search, Link2 } from "lucide-react";

interface TrialBalanceUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  sectorHeads: string[];
}

type Step = "UPLOAD" | "MAP_LEDGERS" | "SUCCESS";

export default function TrialBalanceUploadModal({ isOpen, onClose, clientId, sectorHeads }: TrialBalanceUploadModalProps) {
  const [step, setStep] = useState<Step>("UPLOAD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Period Selection
  const [selectedYear, setSelectedYear] = useState<number>(0);
  const [selectedMonth, setSelectedMonth] = useState<number>(0);

  // Data States
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [rawRecords, setRawRecords] = useState<any[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({}); // { rawId: sectorHead }
  const [searchTerm, setSearchTerm] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Hydration fix for dates
  useState(() => {
    if (typeof window !== 'undefined') {
      const d = new Date();
      setSelectedYear(d.getFullYear());
      setSelectedMonth(d.getMonth() + 1);
    }
  });

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientId", clientId);
      const periodStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      formData.append("period", periodStr);

      const res = await fetch("/api/upload/trial-balance", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload file");

      setUploadId(data.uploadId);
      
      // Fetch the records that were just created to start mapping
      const recRes = await fetch(`/api/upload/trial-balance/finalize?uploadId=${data.uploadId}`);
      const recData = await recRes.json();
      setRawRecords(recData.records);
      
      setStep("MAP_LEDGERS");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFinalize = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/upload/trial-balance/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uploadId, mappings })
      });
      
      if (!res.ok) throw new Error("Failed to finalize mapping");
      
      setStep("SUCCESS");
      setTimeout(() => {
        onClose();
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredRecords = useMemo(() => {
    return rawRecords.filter(r => r.ledgerName.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [rawRecords, searchTerm]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className={`relative w-full ${step === 'MAP_LEDGERS' ? 'max-w-5xl' : 'max-w-xl'} bg-[#13131A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl transition-all duration-500`}>
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#181821]">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-cyan-500" />
              {step === 'UPLOAD' ? 'Trial Balance Ingestion' : 'Smart Ledger Mapping'}
            </h2>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-[0.2em] font-black">
              {step === 'UPLOAD' ? 'AI-Powered Format Detection' : `Reviewing ${rawRecords.length} Detected Ledgers`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-400 font-bold">{error}</p>
            </div>
          )}

          {step === "UPLOAD" && (
            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-cyan-500/50 uppercase tracking-[0.2em]">Select Year</label>
                  <select 
                    value={selectedYear} 
                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white font-bold focus:border-cyan-500 outline-none"
                  >
                    {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-cyan-500/50 uppercase tracking-[0.2em]">Select Month</label>
                  <select 
                    value={selectedMonth} 
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white font-bold focus:border-cyan-500 outline-none"
                  >
                    {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, idx) => (
                      <option key={m} value={idx + 1}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div 
                className={`group relative border-2 border-dashed ${loading ? 'border-cyan-500/50' : 'border-white/10 hover:border-cyan-500/50'} rounded-3xl p-12 text-center cursor-pointer transition-all bg-white/[0.02] overflow-hidden`}
                onClick={() => !loading && fileInputRef.current?.click()}
              >
                {loading && (
                  <div className="absolute inset-0 bg-[#13131A]/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-cyan-500 animate-spin mb-4" />
                    <p className="text-xs font-black text-cyan-400 uppercase tracking-widest animate-pulse">Processing File...</p>
                  </div>
                )}
                
                <input type="file" accept=".xlsx,.xls,.csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                <div className="w-20 h-20 bg-cyan-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-cyan-500/20 group-hover:scale-110 transition-transform"><FileSpreadsheet className="w-10 h-10 text-cyan-400" /></div>
                <h3 className="text-lg font-black text-white mb-2">Drop Trial Balance Here</h3>
                <p className="text-xs text-slate-500 font-bold leading-relaxed">Support for Tally, Zoho, SAP, or Custom Excel layouts.</p>
              </div>
            </div>
          )}

          {step === "MAP_LEDGERS" && (
            <div className="space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 w-full max-w-md">
                  <Search className="w-4 h-4 text-slate-500" />
                  <input 
                    type="text" 
                    placeholder="Search ledgers in file..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 text-sm font-bold text-white w-full"
                  />
                </div>
                <div className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl">
                  <span className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">
                    {Object.keys(mappings).length} of {rawRecords.length} Mapped
                  </span>
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                {filteredRecords.map(record => (
                  <div key={record.id} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-white/20 transition-all group">
                    <div className="flex-1">
                      <p className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors">{record.ledgerName}</p>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Balance: ₹{record.balance.toLocaleString()}</span>
                        {record.groupName && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white/5 px-2 py-0.5 rounded-full">{record.groupName}</span>}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <Link2 className={`w-4 h-4 ${mappings[record.id] ? 'text-emerald-500' : 'text-slate-600'}`} />
                      <select 
                        value={mappings[record.id] || ""} 
                        onChange={(e) => setMappings(prev => ({...prev, [record.id]: e.target.value}))}
                        className={`bg-black/60 border ${mappings[record.id] ? 'border-emerald-500/50 text-emerald-400' : 'border-white/10 text-slate-400'} rounded-xl px-4 py-2 text-xs font-bold focus:border-cyan-500 outline-none w-64`}
                      >
                        <option value="">-- Skip / Unmapped --</option>
                        {sectorHeads.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-6 border-t border-white/5 flex justify-end">
                <button 
                  onClick={handleFinalize} 
                  disabled={loading || Object.keys(mappings).length === 0}
                  className="px-8 py-3 bg-cyan-500 text-slate-950 font-black rounded-2xl hover:bg-cyan-400 transition-all flex items-center gap-3 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                  Finalize Ingestion
                </button>
              </div>
            </div>
          )}

          {step === "SUCCESS" && (
            <div className="py-20 flex flex-col items-center justify-center space-y-6 animate-in zoom-in duration-500">
              <div className="w-24 h-24 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30">
                <Check className="w-12 h-12 text-emerald-400" />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-black text-white mb-2">Ingestion Complete</h3>
                <p className="text-slate-500 font-bold">Your financial data has been merged into the reports.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
