"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { X, Search, FileText, AlertCircle, RefreshCw, Download, FileSpreadsheet, Terminal, Filter } from "lucide-react";
import * as XLSX from "xlsx";
import Papa from "papaparse";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface SkippedLedger {
  name: string;
  groupName: string;
  isActive: boolean;
  closingBalance: number;
}

interface TraceModeData {
  subHeadId: string;
  mappedLedgersCount: number;
  mappedLedgerNames: string[];
  sqlQueries: string[];
  skippedLedgers: SkippedLedger[];
}

interface Ledger {
  id: string;
  name: string;
  nature: string;
  groupName: string;
  mainGroup?: string; // Add mainGroup field
  isActive: boolean;
  amounts: Record<string, { opening: number, debit: number, credit: number, closing: number }>;
  isMapped: boolean;
  dbOpeningBalance?: number;
  dbClosingBalance?: number;
  openingSource?: string;
}

interface DrilldownDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  statementType: "PNL" | "BS";
  subHeadName: string;
  months: string[];
  year: number;
  totalAmounts: Record<string, number>; // Pre-calculated totals from the main statement per month
}

export default function LedgerDrilldownDrawer({
  isOpen,
  onClose,
  clientId,
  statementType,
  subHeadName,
  months,
  year,
  totalAmounts
}: DrilldownDrawerProps) {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "zero" | "nonzero">("all");
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [showTraceMode, setShowTraceMode] = useState(false);
  const [traceData, setTraceData] = useState<TraceModeData | null>(null);

  useEffect(() => {
    if (isOpen && subHeadName && months.length > 0) {
      fetchLedgers();
    }
  }, [isOpen, subHeadName, months.join(','), year]);

  const fetchLedgers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/drilldown?statementType=${statementType}&subHeadName=${encodeURIComponent(subHeadName)}&months=${months.join(',')}&year=${year}`);
      const data = await res.json();
      if (res.ok) {
        setLedgers(data.ledgers || []);
        setTraceData(data.traceMode || null);
      }
    } catch (err) {
      console.error("Failed to fetch drilldown data", err);
    }
    setLoading(false);
  };

  // Format currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { 
      style: 'currency', 
      currency: 'INR', 
      maximumFractionDigits: 0 
    }).format(val);
  };

  // Excel Export
  const exportToExcel = () => {
    const data = filteredLedgers.map(l => {
      const row: any = {
        "Ledger Name": l.name,
        "Software Group": l.groupName,
        "Classification": statementType === "BS" ? (l.mainGroup === "Assets" ? "Asset" : "Liability / Equity") : (l.nature === "CREDIT" ? "Revenue" : "Expense"),
        "Opening Balance": statementType === 'PNL' ? 0 : (l.amounts[months[0]]?.opening || 0),
      };
      
      months.forEach(m => {
        row[m] = l.amounts[m]?.closing || 0;
      });
      
      row["Closing Balance"] = months.reduce((sum, m) => sum + (l.amounts[m]?.closing || 0), 0);
      return row;
    });

    // Add a summary total row at the end
    const totalRow: any = {
      "Ledger Name": "Total / Subhead Total",
      "Software Group": "",
      "Classification": "",
      "Opening Balance": statementType === 'PNL' ? 0 : filteredLedgers.reduce((sum, l) => sum + (l.amounts[months[0]]?.opening || 0), 0),
    };
    months.forEach(m => {
      totalRow[m] = filteredLedgers.reduce((sum, l) => sum + (l.amounts[m]?.closing || 0), 0);
    });
    totalRow["Closing Balance"] = filteredLedgers.reduce((sum, l) => {
      return sum + months.reduce((mSum, m) => mSum + (l.amounts[m]?.closing || 0), 0);
    }, 0);
    
    data.push(totalRow);

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Ledger Breakdown");
    XLSX.writeFile(workbook, `${subHeadName}_Drilldown_${year}.xlsx`);
  };

  // CSV Export
  const exportToCSV = () => {
    const data = filteredLedgers.map(l => {
      const row: any = {
        "Ledger Name": l.name,
        "Software Group": l.groupName,
        "Classification": statementType === "BS" ? (l.mainGroup === "Assets" ? "Asset" : "Liability / Equity") : (l.nature === "CREDIT" ? "Revenue" : "Expense"),
        "Opening Balance": statementType === 'PNL' ? 0 : (l.amounts[months[0]]?.opening || 0),
      };
      months.forEach(m => {
        row[m] = l.amounts[m]?.closing || 0;
      });
      row["Closing Balance"] = months.reduce((sum, m) => sum + (l.amounts[m]?.closing || 0), 0);
      return row;
    });

    // Add a summary total row at the end
    const totalRow: any = {
      "Ledger Name": "Total / Subhead Total",
      "Software Group": "",
      "Classification": "",
      "Opening Balance": statementType === 'PNL' ? 0 : filteredLedgers.reduce((sum, l) => sum + (l.amounts[months[0]]?.opening || 0), 0),
    };
    months.forEach(m => {
      totalRow[m] = filteredLedgers.reduce((sum, l) => sum + (l.amounts[m]?.closing || 0), 0);
    });
    totalRow["Closing Balance"] = filteredLedgers.reduce((sum, l) => {
      return sum + months.reduce((mSum, m) => mSum + (l.amounts[m]?.closing || 0), 0);
    }, 0);
    
    data.push(totalRow);

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${subHeadName}_Drilldown_${year}.csv`;
    a.click();
  };

  // PDF Export
  const exportToPDF = async () => {
    const element = document.getElementById("drilldown-drawer-print-area");
    if (!element) return;
    try {
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#0F0F16'
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${subHeadName}_Drilldown_${year}.pdf`);
    } catch (err) {
      console.error("Failed to export PDF", err);
    }
  };

  if (!isOpen) return null;

  // Filtered Ledgers
  const filteredLedgers = ledgers
    .filter(l => l.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .filter(l => {
      if (statusFilter === "active") {
        return l.isActive;
      }
      
      const ledgerTotalVal = months.reduce((sum, m) => sum + (l.amounts[m]?.closing || 0), 0);
      if (statusFilter === "zero") {
        return Math.abs(ledgerTotalVal) < 0.01;
      }
      if (statusFilter === "nonzero") {
        return Math.abs(ledgerTotalVal) >= 0.01;
      }
      return true;
    });

  // Calculate high-level summary balances
  const statementTotal = months.reduce((sum, m) => sum + (totalAmounts[m] || 0), 0);
  const ledgersTotal = ledgers.reduce((sum, l) => {
    return sum + months.reduce((mSum, m) => mSum + (l.amounts[m]?.closing || 0), 0);
  }, 0);
  const varianceValue = Math.abs(statementTotal - ledgersTotal);

  // Column definitions based on statement type
  const tableColumns = statementType === "PNL"
    ? ["Opening", ...months, "Closing"]
    : months;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-5xl bg-[#0F0F16] border-l border-white/10 z-[110] shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out translate-x-0">
        
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-[#13131A] flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase ${statementType === 'PNL' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-purple-500/10 text-purple-400'}`}>
                {statementType === 'PNL' ? 'Profit & Loss' : 'Balance Sheet'}
              </span>
              <span className="px-2 py-0.5 rounded-md text-[9px] font-black tracking-widest uppercase bg-white/5 text-slate-400">
                FY {year}
              </span>
            </div>
            <h2 className="text-xl font-black text-white">{subHeadName}</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search, Filters, and Action Bar */}
        <div className="p-6 border-b border-white/5 bg-[#13131A] space-y-4">
          <div className="flex flex-col md:flex-row items-center gap-4 justify-between">
            {/* Search Input */}
            <div className="relative w-full md:max-w-md">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder="Search mapped ledgers by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1A1A24] border border-white/10 rounded-xl py-2 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
              />
            </div>
            
            {/* Filters */}
            <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto py-1">
              <button 
                onClick={() => setStatusFilter("all")} 
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${statusFilter === "all" ? 'bg-cyan-500 text-slate-950 shadow-md' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
              >
                All Mapped
              </button>
              <button 
                onClick={() => setStatusFilter("active")} 
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${statusFilter === "active" ? 'bg-cyan-500 text-slate-950 shadow-md' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
              >
                Active Only
              </button>
              <button 
                onClick={() => setStatusFilter("nonzero")} 
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${statusFilter === "nonzero" ? 'bg-cyan-500 text-slate-950 shadow-md' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
              >
                Non-Zero Bal.
              </button>
              <button 
                onClick={() => setStatusFilter("zero")} 
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${statusFilter === "zero" ? 'bg-cyan-500 text-slate-950 shadow-md' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
              >
                Zero Bal.
              </button>
            </div>

            {/* Export Menu */}
            <div className="relative shrink-0">
              <button 
                onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs font-black text-emerald-400 hover:bg-emerald-500/20 transition-all"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </button>
              {exportDropdownOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-[#1A1A24] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                  <button 
                    onClick={() => { exportToExcel(); setExportDropdownOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" /> Excel (.xlsx)
                  </button>
                  <button 
                    onClick={() => { exportToCSV(); setExportDropdownOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5 text-cyan-400" /> CSV (.csv)
                  </button>
                  <button 
                    onClick={() => { exportToPDF(); setExportDropdownOpen(false); }}
                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-300 hover:bg-white/5 hover:text-white flex items-center gap-2"
                  >
                    <FileText className="w-3.5 h-3.5 text-red-400" /> PDF Report
                  </button>
                </div>
              )}
            </div>
          </div>
          
          {/* Formula Indicator & Trace Mode Button */}
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
               <AlertCircle className="w-3.5 h-3.5 text-cyan-500" />
               <span className="text-[10px] font-mono font-bold text-cyan-500 uppercase tracking-widest">
                 Formula: {statementType === "PNL" ? "Revenue (Credit - Debit) | Expense (Debit - Credit)" : "Assets (Opening + Debit - Credit) | Liabilities & Equity (Opening + Credit - Debit)"}
               </span>
            </div>
            <button 
              onClick={() => setShowTraceMode(!showTraceMode)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${showTraceMode ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
            >
              <Terminal className="w-3 h-3" /> Developer Trace
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" id="drilldown-drawer-print-area">
          
          {/* Executive Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-[#13131A] border border-white/5 rounded-xl p-4">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Subhead</span>
              <p className="text-base font-black text-white truncate">{subHeadName}</p>
            </div>
            <div className="bg-[#13131A] border border-white/5 rounded-xl p-4">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Statement Total</span>
              <p className="text-base font-black text-white">{formatCurrency(statementTotal)}</p>
            </div>
            <div className="bg-[#13131A] border border-white/5 rounded-xl p-4">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Mapped Ledgers Total</span>
              <p className="text-base font-black text-cyan-400">{formatCurrency(ledgersTotal)}</p>
            </div>
            <div className={`bg-[#13131A] border rounded-xl p-4 transition-all ${varianceValue > 1 ? 'border-rose-500/30 bg-rose-500/5' : 'border-white/5'}`}>
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Variance</span>
              <p className={`text-base font-black ${varianceValue > 1 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {formatCurrency(varianceValue)}
              </p>
            </div>
          </div>

          {/* Variance Warning Indicator */}
          {varianceValue > 1 && (
            <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex gap-3 items-start">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-rose-300">Auditor Notice: Reconciliation Variance Detected</p>
                <p className="text-[11px] text-rose-400/80 leading-relaxed mt-1 font-medium">
                  The sum of the mapped ledgers ({formatCurrency(ledgersTotal)}) differs from the P&L statement value ({formatCurrency(statementTotal)}). 
                  Please review the <b>Master Ledger Mapping</b> to check if all ledgers under this subhead are correctly classified, or toggle <b>Trace Mode</b> below to inspect skipped ledgers in the same software group.
                </p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-500 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-500" />
              <span className="text-sm font-bold">Calculating balances...</span>
            </div>
          ) : ledgers.length === 0 ? (
            /* Empty Mapping Handling */
            <div className="flex flex-col items-center justify-center p-8 bg-rose-500/5 border border-rose-500/10 rounded-xl text-slate-400 gap-2">
              <AlertCircle className="w-8 h-8 text-rose-400" />
              <span className="text-sm font-bold text-rose-300">No ledgers are currently mapped to this subhead.</span>
              <span className="text-xs text-slate-500">Go to Master Mapping to link software ledgers to this subhead.</span>
            </div>
          ) : (
            <>
              {/* Totals Summary Monthly Breakdown Table */}
              <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden p-4 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr>
                      <th className="w-40 p-2 text-xs text-slate-500 font-bold uppercase tracking-widest">Summary</th>
                      {tableColumns.map(m => (
                        <th key={m} className="p-2 text-right text-xs text-slate-500 font-bold uppercase tracking-widest">
                          {m === "Opening" ? "Opening" : m === "Closing" ? "Closing" : m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {/* Total Statement Row */}
                    <tr className="border-b border-white/5">
                      <td className="p-2 text-xs text-slate-400 font-bold uppercase tracking-widest">Total Statement:</td>
                      {tableColumns.map(m => {
                        let val = 0;
                        if (m === "Opening") {
                          val = statementType === "PNL" ? 0 : (totalAmounts["Opening"] || 0);
                        } else if (m === "Closing") {
                          val = statementTotal;
                        } else {
                          val = totalAmounts[m] || 0;
                        }
                        return (
                          <td key={m} className="p-2 text-right text-sm text-white font-black font-mono">
                            {formatCurrency(val)}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Ledgers Sum Row */}
                    <tr className="border-b border-white/5">
                      <td className="p-2 text-xs text-slate-400 font-bold uppercase tracking-widest">Ledgers Sum:</td>
                      {tableColumns.map(m => {
                        let val = 0;
                        if (m === "Opening") {
                          val = statementType === "PNL" ? 0 : ledgers.reduce((sum, l) => sum + (l.amounts["Opening"]?.closing || 0), 0);
                        } else if (m === "Closing") {
                          val = ledgersTotal;
                        } else {
                          val = ledgers.reduce((sum, l) => sum + (l.amounts[m]?.closing || 0), 0);
                        }
                        return (
                          <td key={m} className="p-2 text-right text-sm text-cyan-400 font-black font-mono">
                            {formatCurrency(val)}
                          </td>
                        );
                      })}
                    </tr>
                    {/* Variance Row */}
                    <tr>
                      <td className="p-2 text-xs text-slate-400 font-bold uppercase tracking-widest">Variance:</td>
                      {tableColumns.map(m => {
                        let variance = 0;
                        if (m === "Opening") {
                          const stmtVal = statementType === "PNL" ? 0 : (totalAmounts["Opening"] || 0);
                          const ledSumVal = statementType === "PNL" ? 0 : ledgers.reduce((sum, l) => sum + (l.amounts["Opening"]?.closing || 0), 0);
                          variance = Math.abs(stmtVal - ledSumVal);
                        } else if (m === "Closing") {
                          variance = Math.abs(statementTotal - ledgersTotal);
                        } else {
                          const stmtVal = totalAmounts[m] || 0;
                          const ledSumVal = ledgers.reduce((sum, l) => sum + (l.amounts[m]?.closing || 0), 0);
                          variance = Math.abs(stmtVal - ledSumVal);
                        }
                        return (
                          <td key={m} className={`p-2 text-right text-sm font-black font-mono ${variance > 1 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {formatCurrency(variance)}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Mapped Ledger List Table */}
              <div className="overflow-x-auto border border-white/5 rounded-xl bg-[#0F0F16]">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white/5">
                      <th className="p-3 text-xs text-slate-500 font-bold uppercase tracking-widest border-b border-white/5">Ledger</th>
                      {tableColumns.map(m => (
                        <th key={m} className="p-3 text-xs text-slate-500 font-bold uppercase tracking-widest text-right border-b border-white/5">
                          {m === "Opening" ? "Opening" : m === "Closing" ? "Closing" : m}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedgers.length === 0 ? (
                      <tr>
                        <td colSpan={tableColumns.length + 1} className="p-8 text-center text-xs text-slate-500 font-medium">
                          No matching ledgers found in current search query or filter selection.
                        </td>
                      </tr>
                    ) : (
                      filteredLedgers.map(ledger => {
                        const ledTotalVal = months.reduce((sum, m) => sum + (ledger.amounts[m]?.closing || 0), 0);
                        return (
                          <tr key={ledger.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                            <td className="p-3">
                              <div className="flex flex-col">
                                <h4 className="text-sm font-bold text-white mb-1">{ledger.name}</h4>
                                <div className="flex items-center gap-2">
                                   <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{ledger.groupName}</span>
                                   {!ledger.isActive && (
                                     <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-400">Inactive</span>
                                   )}
                                </div>
                                
                                {/* Trace Mode Audit details per ledger */}
                                {showTraceMode && (() => {
                                  const dbOp = ledger.dbOpeningBalance || 0;
                                  const dbOpNature = ledger.nature || "DEBIT";
                                  
                                  // Compute month movements sum
                                  const totDebits = months.reduce((sum, m) => sum + (ledger.amounts[m]?.debit || 0), 0);
                                  const totCredits = months.reduce((sum, m) => sum + (ledger.amounts[m]?.credit || 0), 0);
                                  
                                  // Calculated closing
                                  const calcClosing = ledger.amounts[months[months.length - 1]]?.closing ?? ledTotalVal;
                                  let calcClosingNature = "Nil";
                                  if (calcClosing !== 0) {
                                    if (ledger.mainGroup === "Assets") {
                                      calcClosingNature = calcClosing > 0 ? "Dr" : "Cr";
                                    } else {
                                      calcClosingNature = calcClosing > 0 ? "Cr" : "Dr";
                                    }
                                  }

                                  // Sign Tally closing
                                  const dbClosing = ledger.dbClosingBalance || 0;
                                  const signedTallyClosing = ledger.mainGroup === "Assets"
                                    ? (ledger.nature === "CREDIT" ? -dbClosing : dbClosing)
                                    : (ledger.nature === "DEBIT" ? -dbClosing : dbClosing);

                                  const variance = calcClosing - signedTallyClosing;
                                  const signedOpening = ledger.amounts[months[0]]?.opening ?? 0;

                                  return (
                                    <div className="mt-3 p-3 bg-[#13131c] border border-white/10 rounded-lg text-[11px] font-mono text-slate-300 space-y-2 max-w-xl">
                                      <div className="grid grid-cols-2 gap-2 text-slate-400 border-b border-white/5 pb-2 font-sans">
                                        <div>
                                          <span className="text-slate-500">Classification:</span>{" "}
                                          <span className="text-slate-300 font-bold">
                                            {statementType === "BS" ? (ledger.mainGroup === "Assets" ? "Asset" : "Liability / Equity") : (ledger.nature === "CREDIT" ? "Revenue" : "Expense")}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-slate-500">Formula:</span>{" "}
                                          <span className="text-cyan-400 font-bold">
                                            {statementType === "BS"
                                              ? ledger.mainGroup === "Assets"
                                                ? "Opening + Debit - Credit"
                                                : "Opening + Credit - Debit"
                                              : ledger.nature === "CREDIT"
                                              ? "Credit - Debit"
                                              : "Debit - Credit"}
                                          </span>
                                        </div>
                                      </div>
                                      
                                      <div className="grid grid-cols-3 gap-2 bg-white/[0.02] p-2 rounded border border-white/5">
                                        <div>
                                          <span className="text-slate-500 block text-[9px] uppercase font-sans">Opening Balance</span>
                                          <span className="text-slate-300 font-semibold">{formatCurrency(dbOp)} {dbOpNature === "CREDIT" ? "Cr" : "Dr"}</span>
                                        </div>
                                        <div>
                                          <span className="text-slate-500 block text-[9px] uppercase font-sans">Signed Opening</span>
                                          <span className="text-slate-300 font-semibold">{formatCurrency(signedOpening)}</span>
                                        </div>
                                        <div>
                                          <span className="text-slate-500 block text-[9px] uppercase font-sans">Source</span>
                                          <span className="text-cyan-500 font-semibold text-[10px]">{ledger.openingSource || "ledger_opening"}</span>
                                        </div>
                                      </div>

                                      <div className="grid grid-cols-4 gap-2 border-b border-white/5 pb-2">
                                        <div>
                                          <span className="text-slate-500 block text-[9px] uppercase font-sans">Debit (+)</span>
                                          <span className="text-slate-300">{formatCurrency(totDebits)}</span>
                                        </div>
                                        <div>
                                          <span className="text-slate-500 block text-[9px] uppercase font-sans">Credit (-)</span>
                                          <span className="text-slate-300">{formatCurrency(totCredits)}</span>
                                        </div>
                                        <div>
                                          <span className="text-slate-500 block text-[9px] uppercase font-sans">Calc Closing</span>
                                          <span className={`font-semibold ${calcClosing < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                                            {formatCurrency(calcClosing)} {calcClosingNature}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-slate-500 block text-[9px] uppercase font-sans">Tally Closing</span>
                                          <span className="text-slate-300 font-semibold font-mono">
                                            {formatCurrency(dbClosing)} {dbOpNature === "CREDIT" ? "Cr" : "Dr"}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="flex justify-between items-center bg-cyan-950/20 p-1.5 px-2 rounded border border-cyan-500/10 font-sans">
                                        <span className="text-cyan-400 font-medium">Variance (Calculated vs Tally)</span>
                                        <span className={`font-bold font-mono ${Math.abs(variance) > 0.01 ? "text-amber-400" : "text-cyan-400"}`}>
                                          {formatCurrency(variance)}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            </td>
                            {tableColumns.map(m => {
                              let displayVal = 0;
                              if (m === "Opening") {
                                displayVal = statementType === "PNL" ? 0 : (ledger.amounts["Opening"]?.closing || 0);
                              } else if (m === "Closing") {
                                displayVal = ledTotalVal;
                              } else {
                                displayVal = ledger.amounts[m]?.closing || 0;
                              }
                              const presentationVal = ledger.mainGroup
                                ? (ledger.mainGroup === "Assets" ? displayVal : -displayVal)
                                : displayVal;
                              return (
                                <td key={m} className="p-3 text-right font-mono font-bold">
                                  <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
                                    {formatCurrency(presentationVal)}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Developer Trace Mode logs */}
          {showTraceMode && traceData && (
            <div className="bg-amber-500/[0.03] border border-amber-500/10 rounded-2xl p-6 space-y-4 font-sans">
              <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                <Terminal className="w-4 h-4 text-amber-500" />
                <h4 className="text-sm font-black text-amber-500 uppercase tracking-wider">Developer Trace Mode (Auditor Logs)</h4>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs font-mono">
                <div>
                  <span className="text-slate-500">Selected Subhead:</span>
                  <p className="text-slate-300 font-bold">{subHeadName}</p>
                </div>
                <div>
                  <span className="text-slate-500">Subhead ID:</span>
                  <p className="text-slate-300 font-bold">{traceData.subHeadId}</p>
                </div>
                <div>
                  <span className="text-slate-500">Mapped Ledgers:</span>
                  <p className="text-slate-300 font-bold">{traceData.mappedLedgersCount} accounts</p>
                </div>
                <div>
                  <span className="text-slate-500">Statement Total:</span>
                  <p className="text-slate-300 font-bold">{formatCurrency(statementTotal)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Ledger Sum Total:</span>
                  <p className="text-slate-300 font-bold">{formatCurrency(ledgersTotal)}</p>
                </div>
                <div>
                  <span className="text-slate-500">Variance Balance:</span>
                  <p className={`font-bold ${varianceValue > 1 ? 'text-rose-400' : 'text-emerald-400'}`}>{formatCurrency(varianceValue)}</p>
                </div>
              </div>

              {/* Mapped Ledger Names */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-400">Mapped Ledger Names ({traceData.mappedLedgerNames.length})</span>
                <div className="p-3 bg-black/40 border border-white/5 rounded-xl font-mono text-[10px] text-slate-300 flex flex-wrap gap-2">
                  {traceData.mappedLedgerNames.map(name => (
                    <span key={name} className="px-2 py-0.5 bg-white/5 rounded text-slate-300 border border-white/5">{name}</span>
                  ))}
                  {traceData.mappedLedgerNames.length === 0 && <span className="text-slate-500">No mappings resolved</span>}
                </div>
              </div>

              {/* Skipped Ledgers List */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                  Unmapped Ledgers under same Software Groups ({traceData.skippedLedgers?.length || 0})
                </span>
                <div className="overflow-x-auto max-h-40 border border-white/5 rounded-xl">
                  <table className="w-full text-left border-collapse text-[10px] font-mono">
                    <thead>
                      <tr className="bg-white/5 text-slate-500 border-b border-white/5">
                        <th className="p-2">Ledger Name</th>
                        <th className="p-2">Group Name</th>
                        <th className="p-2 text-right">Ledger Closing Bal.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traceData.skippedLedgers?.map((l, i) => (
                        <tr key={i} className="border-b border-white/5 hover:bg-white/[0.01]">
                          <td className="p-2 text-slate-300">{l.name}</td>
                          <td className="p-2 text-slate-500">{l.groupName}</td>
                          <td className="p-2 text-right text-slate-400">{formatCurrency(l.closingBalance)}</td>
                        </tr>
                      ))}
                      {(!traceData.skippedLedgers || traceData.skippedLedgers.length === 0) && (
                        <tr>
                          <td colSpan={3} className="p-4 text-center text-slate-500">No unmapped accounts detected in the matching software groups.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SQL & API queries log */}
              <div className="space-y-1.5">
                <span className="text-xs font-bold text-slate-400">SQL Queries Executed</span>
                <div className="p-3 bg-black/40 border border-white/5 rounded-xl font-mono text-[10px] text-slate-400 space-y-2 overflow-x-auto">
                  {traceData.sqlQueries?.map((q, idx) => (
                    <div key={idx} className="border-b border-white/5 last:border-b-0 pb-1.5 last:pb-0">
                      <span className="text-cyan-500 font-bold">// Query {idx + 1}</span>
                      <pre className="text-slate-300 mt-1 whitespace-pre-wrap">{q}</pre>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
