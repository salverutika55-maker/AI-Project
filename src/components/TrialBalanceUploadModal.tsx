"use client";

import { useState, useRef } from "react";
import { X, UploadCloud, Loader2, Check, AlertCircle, FileSpreadsheet } from "lucide-react";

interface TrialBalanceUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
}

export default function TrialBalanceUploadModal({ isOpen, onClose, clientId }: TrialBalanceUploadModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [period, setPeriod] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("clientId", clientId);
      formData.append("period", period);

      const res = await fetch("/api/upload/trial-balance", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload file");

      setSuccess(true);
      // Wait a bit before closing and refreshing
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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-xl bg-[#13131A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#181821]">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-cyan-500" />
              Intelligent TB Ingestion
            </h2>
            <p className="text-[10px] text-slate-400 mt-1 uppercase tracking-[0.2em] font-black">AI-Powered Format Detection Engine</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
        </div>

        <div className="p-8 space-y-8">
          {error && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 animate-in fade-in zoom-in duration-300">
              <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-sm text-rose-400 font-bold">{error}</p>
            </div>
          )}

          {success ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-4 animate-in zoom-in duration-500">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30">
                <Check className="w-10 h-10 text-emerald-400" />
              </div>
              <h3 className="text-xl font-black text-white">Ingestion Successful</h3>
              <p className="text-slate-500 text-sm font-bold">New ledgers detected. Refreshing mapping workspace...</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-cyan-500/50 uppercase tracking-[0.2em]">Select Sync Period</label>
                <input 
                  type="month" 
                  value={period} 
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white font-bold focus:border-cyan-500 outline-none transition-all"
                />
              </div>

              <div 
                className={`group relative border-2 border-dashed ${loading ? 'border-cyan-500/50' : 'border-white/10 hover:border-cyan-500/50'} rounded-3xl p-12 text-center cursor-pointer transition-all bg-white/[0.02] overflow-hidden`}
                onClick={() => !loading && fileInputRef.current?.click()}
              >
                {loading && (
                  <div className="absolute inset-0 bg-[#13131A]/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-cyan-500 animate-spin mb-4" />
                    <p className="text-xs font-black text-cyan-400 uppercase tracking-widest animate-pulse">Analyzing Structure...</p>
                  </div>
                )}
                
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.csv" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileUpload}
                  disabled={loading}
                />
                
                <div className="w-20 h-20 bg-cyan-500/10 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-cyan-500/20 group-hover:scale-110 transition-transform">
                  <FileSpreadsheet className="w-10 h-10 text-cyan-400" />
                </div>
                
                <h3 className="text-lg font-black text-white mb-2">Drop Trial Balance Here</h3>
                <p className="text-xs text-slate-500 font-bold leading-relaxed">
                  Support for Tally, Zoho, SAP, or Custom Excel layouts.<br/>
                  AI will auto-map columns for you.
                </p>
              </div>
              
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 flex items-center gap-4">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Secure Parsing: Data is normalized but not stored permanently until approved.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
