"use client";

import { useState, useRef } from "react";
import { X, UploadCloud, ChevronRight, Check, AlertCircle, Loader2 } from "lucide-react";
import Papa from "papaparse";

interface BudgetUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  sectorHeads: string[];
}

type Step = "UPLOAD" | "MAP_COLUMNS" | "MAP_LEDGERS";
type FYType = "Apr-Mar" | "Jan-Dec";

export default function BudgetUploadModal({ isOpen, onClose, clientId, sectorHeads }: BudgetUploadModalProps) {
  const [step, setStep] = useState<Step>("UPLOAD");
  const [fyType, setFyType] = useState<FYType>("Apr-Mar");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<any[]>([]);
  
  const [accountCol, setAccountCol] = useState<string>("");
  const [periodCols, setPeriodCols] = useState<{col: string, period: string}[]>([]);
  
  const [csvLedgers, setCsvLedgers] = useState<string[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({}); // { csvLedger: standardHead }
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (!results.meta.fields || results.meta.fields.length < 2) {
          setError("Invalid CSV format. Need at least 2 columns (Account & Amount).");
          return;
        }
        setRawHeaders(results.meta.fields);
        setRawRows(results.data);
        setError(null);
        setStep("MAP_COLUMNS");
      },
      error: (err) => {
        setError("Failed to parse CSV: " + err.message);
      }
    });
  };

  const processColumns = () => {
    if (!accountCol) {
      setError("Please select the Account Name column.");
      return;
    }
    if (periodCols.length === 0) {
      setError("Please map at least one period column (Q1, Jan, etc.).");
      return;
    }

    // Extract unique ledger names from the selected account column
    const uniqueLedgers = new Set<string>();
    rawRows.forEach(row => {
      const name = row[accountCol];
      if (name && String(name).trim() !== "") {
        uniqueLedgers.add(String(name).trim());
      }
    });

    setCsvLedgers(Array.from(uniqueLedgers));
    setError(null);
    setStep("MAP_LEDGERS");
  };

  const handleSave = async () => {
    setLoading(true);
    
    // Prepare values array
    const values: { headName: string, period: string, amount: number }[] = [];
    
    rawRows.forEach(row => {
      const ledgerName = row[accountCol]?.trim();
      if (!ledgerName) return;
      
      periodCols.forEach(pc => {
        const amountStr = String(row[pc.col] || "0").replace(/[^0-9.-]+/g, "");
        const amount = parseFloat(amountStr);
        if (!isNaN(amount) && amount !== 0) {
          values.push({ headName: ledgerName, period: pc.period, amount });
        }
      });
    });

    // Prepare Mappings
    const finalMappings = Object.entries(mappings).map(([csvLedger, sectorHead]) => ({
      csvLedgerName: csvLedger,
      sectorHead
    }));

    try {
      const res = await fetch(`/api/clients/${clientId}/budget`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fyType, year, mappings: finalMappings, values })
      });
      
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      alert("✅ Budget Uploaded and Synced Successfully!");
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
    }
    
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-4xl bg-[#13131A] border border-white/10 rounded-3xl overflow-hidden flex flex-col shadow-2xl max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#181821]">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-cyan-500" />
              Dynamic Budget Ingestion
            </h2>
            <p className="text-xs text-slate-400 mt-1 uppercase tracking-widest font-bold">Process unstructured Excel/CSV budgets securely</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-xl transition-colors"><X className="w-6 h-6 text-slate-400" /></button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400 font-medium">{error}</p>
            </div>
          )}

          {step === "UPLOAD" && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border border-white/10 rounded-xl bg-white/5">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Fiscal Year Format</label>
                  <select value={fyType} onChange={e => setFyType(e.target.value as FYType)} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-cyan-500 outline-none">
                    <option value="Apr-Mar">April - March (India)</option>
                    <option value="Jan-Dec">January - December</option>
                  </select>
                </div>
                <div className="p-4 border border-white/10 rounded-xl bg-white/5">
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Budget Year</label>
                  <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} className="w-full bg-black/50 border border-white/10 rounded-lg p-3 text-white focus:border-cyan-500 outline-none" />
                </div>
              </div>

              <div 
                className="border-2 border-dashed border-white/10 hover:border-cyan-500/50 rounded-2xl p-12 text-center cursor-pointer transition-all bg-white/[0.02]"
                onClick={() => fileInputRef.current?.click()}
              >
                <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                <div className="w-16 h-16 bg-cyan-500/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-cyan-500/20">
                  <UploadCloud className="w-8 h-8 text-cyan-400" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Upload Budget CSV</h3>
                <p className="text-sm text-slate-400">Select any unstructured CSV file. The engine will read it.</p>
              </div>
            </div>
          )}

          {step === "MAP_COLUMNS" && (
            <div className="space-y-6">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <h3 className="font-bold text-emerald-400 mb-1">Step 2: Map Your Columns</h3>
                <p className="text-sm text-emerald-400/80">Tell the engine what each column represents. We found {rawHeaders.length} columns in your file.</p>
              </div>

              <div className="space-y-4">
                <div className="p-4 border border-white/10 rounded-xl bg-[#181821]">
                  <label className="block text-xs font-bold text-cyan-400 uppercase tracking-widest mb-3">Which column holds the Ledger/Account Names?</label>
                  <select value={accountCol} onChange={e => setAccountCol(e.target.value)} className="w-full bg-black border border-white/10 rounded-lg p-3 text-white">
                    <option value="">-- Select Column --</option>
                    {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>

                <div className="p-4 border border-white/10 rounded-xl bg-[#181821]">
                  <div className="flex justify-between items-center mb-3">
                    <label className="block text-xs font-bold text-cyan-400 uppercase tracking-widest">Map Time Periods</label>
                    <button 
                      onClick={() => setPeriodCols([...periodCols, {col: "", period: "Q1"}])}
                      className="px-3 py-1 bg-white/5 border border-white/10 rounded-md text-xs font-bold text-white hover:bg-white/10"
                    >
                      + Add Period Map
                    </button>
                  </div>
                  
                  {periodCols.length === 0 && <p className="text-sm text-slate-500 italic mb-2">Click add to map a column to a specific Month or Quarter.</p>}
                  
                  <div className="space-y-2">
                    {periodCols.map((pc, i) => (
                      <div key={i} className="flex gap-4 items-center">
                        <select 
                          value={pc.col} 
                          onChange={e => {
                            const newCols = [...periodCols];
                            newCols[i].col = e.target.value;
                            setPeriodCols(newCols);
                          }} 
                          className="flex-1 bg-black border border-white/10 rounded-lg p-2 text-sm text-white"
                        >
                          <option value="">-- Select Column --</option>
                          {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <span className="text-slate-500">→</span>
                        <select 
                          value={pc.period} 
                          onChange={e => {
                            const newCols = [...periodCols];
                            newCols[i].period = e.target.value;
                            setPeriodCols(newCols);
                          }} 
                          className="w-32 bg-black border border-cyan-500/30 rounded-lg p-2 text-sm font-bold text-cyan-400"
                        >
                          <option value="Q1">Q1</option>
                          <option value="Q2">Q2</option>
                          <option value="Q3">Q3</option>
                          <option value="Q4">Q4</option>
                          {fyType === "Apr-Mar" ? (
                            <>
                              <option value="Apr">April</option><option value="May">May</option><option value="Jun">June</option>
                              <option value="Jul">July</option><option value="Aug">August</option><option value="Sep">September</option>
                              <option value="Oct">October</option><option value="Nov">November</option><option value="Dec">December</option>
                              <option value="Jan">January</option><option value="Feb">February</option><option value="Mar">March</option>
                            </>
                          ) : (
                            <>
                              <option value="Jan">January</option><option value="Feb">February</option><option value="Mar">March</option>
                              <option value="Apr">April</option><option value="May">May</option><option value="Jun">June</option>
                              <option value="Jul">July</option><option value="Aug">August</option><option value="Sep">September</option>
                              <option value="Oct">October</option><option value="Nov">November</option><option value="Dec">December</option>
                            </>
                          )}
                        </select>
                        <button onClick={() => setPeriodCols(periodCols.filter((_, idx) => idx !== i))} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"><X className="w-4 h-4"/></button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "MAP_LEDGERS" && (
            <div className="space-y-6">
              <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                <h3 className="font-bold text-purple-400 mb-1">Step 3: Smart Ledger Mapping</h3>
                <p className="text-sm text-purple-400/80">We extracted {csvLedgers.length} unique ledgers from your CSV. Map them to your standard P&L/BS Heads.</p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {csvLedgers.map(ledger => (
                  <div key={ledger} className="flex items-center justify-between p-3 bg-white/5 border border-white/5 rounded-xl hover:bg-white/10 transition-colors">
                    <span className="text-sm font-bold text-slate-200">{ledger}</span>
                    <select
                      value={mappings[ledger] || ""}
                      onChange={(e) => setMappings({...mappings, [ledger]: e.target.value})}
                      className={`bg-black border rounded-lg px-3 py-2 text-sm font-bold w-64 outline-none ${mappings[ledger] ? 'border-cyan-500/50 text-cyan-400' : 'border-white/10 text-slate-400'}`}
                    >
                      <option value="">-- Ignored (Skip) --</option>
                      {sectorHeads.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/5 bg-[#181821] flex justify-between items-center">
          <p className="text-xs text-slate-500">AES-256 Encrypted Ingestion</p>
          
          {step === "MAP_COLUMNS" && (
            <button onClick={processColumns} className="px-6 py-2 bg-cyan-500 text-slate-950 font-black rounded-xl hover:bg-cyan-400 transition-colors flex items-center gap-2">
              Next Step <ChevronRight className="w-4 h-4" />
            </button>
          )}
          
          {step === "MAP_LEDGERS" && (
            <button onClick={handleSave} disabled={loading} className="px-8 py-3 bg-emerald-500 text-slate-950 font-black rounded-xl hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Encrypted Budget
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
