"use client";

import { useState, useRef } from "react";
import { X, UploadCloud, Loader2, Check, AlertCircle, FileSpreadsheet } from "lucide-react";

interface ReconciliationUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  period: string; // e.g. "2026-05"
  type: "BANK" | "GST";
  onUploadSuccess: (data: any) => void;
}

export default function ReconciliationUploadModal({
  isOpen,
  onClose,
  clientId,
  period,
  type,
  onUploadSuccess
}: ReconciliationUploadModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("period", period);

      const endpoint = type === "BANK" 
        ? `/api/clients/${clientId}/reconcile/bank-upload` 
        : `/api/clients/${clientId}/reconcile/gst-upload`;

      const res = await fetch(endpoint, {
        method: "POST",
        body: formData
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to upload and reconcile statement");
      }

      setSuccess(true);
      setTimeout(() => {
        onUploadSuccess(data);
        onClose();
        setSuccess(false);
      }, 1500);

    } catch (err: any) {
      setError(err.message || "An unexpected error occurred during processing.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-[#13131A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl transition-all duration-300">
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#181821]">
          <div>
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-cyan-400" />
              {type === "BANK" ? "Import Bank Statement" : "Import GSTR-2B Statement"}
            </h2>
            <p className="text-[9px] text-slate-500 mt-1 uppercase tracking-widest font-black font-mono">
              Reconciliation Period: {period}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-white/5 border border-transparent hover:border-white/10 rounded-xl transition-all text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3 animate-in fade-in duration-200">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-300 font-bold leading-relaxed">{error}</p>
            </div>
          )}

          {success ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-6 animate-in zoom-in duration-300">
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center border border-emerald-500/30">
                <Check className="w-10 h-10 text-emerald-400" />
              </div>
              <div className="text-center">
                <h3 className="text-xl font-black text-white">Ingestion Complete</h3>
                <p className="text-slate-500 text-xs font-bold mt-1 font-mono uppercase tracking-wider">
                  Reconciled against books successfully!
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => !loading && fileInputRef.current?.click()}
                className={`group relative border-2 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all bg-white/[0.01] overflow-hidden ${
                  dragActive 
                    ? "border-cyan-400 bg-cyan-500/5" 
                    : "border-white/10 hover:border-cyan-500/40 hover:bg-white/[0.02]"
                }`}
              >
                {loading && (
                  <div className="absolute inset-0 bg-[#13131A]/85 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                    <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mb-4" />
                    <p className="text-xs font-black text-cyan-400 uppercase tracking-widest animate-pulse font-mono">
                      {type === "BANK" ? "Crawling & Fuzzy Matching..." : "Ingesting Duties & Credits..."}
                    </p>
                  </div>
                )}
                
                <input 
                  type="file" 
                  accept=".xlsx,.xls,.csv" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={handleFileChange} 
                />
                
                <div className="w-16 h-16 bg-cyan-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-cyan-500/25 group-hover:scale-105 transition-transform">
                  <FileSpreadsheet className="w-8 h-8 text-cyan-400" />
                </div>
                
                <h3 className="text-sm font-black text-white mb-1.5">
                  Drag & Drop Excel/CSV Here
                </h3>
                <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                  {type === "BANK" 
                    ? "Supports Standard HDFC, ICICI, SBI, HSBC or Custom Bank logs" 
                    : "Supports Government GSTR-2B Auto-Drafted Credit Excel templates"}
                </p>
                <div className="mt-4 inline-flex items-center gap-1 px-3 py-1 bg-white/5 border border-white/5 rounded-lg text-[9px] font-black text-slate-400 uppercase tracking-wider group-hover:text-cyan-400 transition-colors">
                  Browse Files
                </div>
              </div>

              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 font-mono">
                  Formatting Recommendations:
                </h4>
                <ul className="list-disc list-inside text-[10px] text-slate-400 space-y-1 font-bold">
                  {type === "BANK" ? (
                    <>
                      <li>Ensure dates (e.g. DD-MM-YYYY) are in the first column.</li>
                      <li>Include particulars / transaction details clearly.</li>
                      <li>Include a distinct Debit & Credit or Amount column.</li>
                    </>
                  ) : (
                    <>
                      <li>Ensure Supplier GSTIN / Trade Name is clearly marked.</li>
                      <li>Invoice Number and Invoice Date columns must be populated.</li>
                      <li>Ensure Taxable Value, CGST, SGST, IGST columns exist.</li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
