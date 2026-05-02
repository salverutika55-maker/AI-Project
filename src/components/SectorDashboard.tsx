"use client";

import { useState, useMemo, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { 
  Factory, Briefcase, ArrowRightLeft, Download, Settings2, Link2, UploadCloud
} from "lucide-react";
import PNLMappingModal from "./PNLMappingModal";
import BudgetUploadModal from "./BudgetUploadModal";

interface SectorDashboardProps {
  title: string;
  type: "manufacturing" | "trading" | "service";
  sections: {
    name: string;
    items: string[];
    isTotal?: boolean;
    isBold?: boolean;
    isSubtotal?: boolean;
    isCalculated?: boolean;
  }[];
  activeClientId?: string;
  clients: any[];
}

export default function SectorDashboard({ title, type, sections, activeClientId, clients }: SectorDashboardProps) {
  const router = useRouter();
  const [fyType, setFyType] = useState<"APR_MAR" | "JAN_DEC">("APR_MAR");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [isMappingOpen, setIsMappingOpen] = useState(false);
  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  
  const [gridData, setGridData] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    if (activeClientId) {
      fetchPNLValues();
    }
  }, [activeClientId, selectedYear]);

  const fetchPNLValues = async () => {
    try {
      const res = await fetch(`/api/clients/${activeClientId}/values?year=${selectedYear}`);
      const data = await res.json();
      
      // Convert flat array from DB to grid structure
      const grid: Record<string, Record<string, number>> = {};
      data.values?.forEach((v: any) => {
        if (!grid[v.month]) grid[v.month] = {};
        grid[v.month][v.headName] = v.amount;
      });
      setGridData(grid);
    } catch (err) {
      console.error(err);
    }
  };

  const allSectorHeads = useMemo(() => {
    const heads: string[] = [];
    sections.forEach(s => {
      s.items.forEach(item => {
        if (!s.isCalculated) heads.push(item);
      });
    });
    return heads;
  }, [sections]);

  const Icon = type === "manufacturing" ? Factory : type === "trading" ? ArrowRightLeft : Briefcase;

  const months = useMemo(() => {
    if (fyType === "APR_MAR") {
      return ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    }
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  }, [fyType]);

  // Internal Calculation Engine to avoid serialization issues
  const calculatedData = useMemo(() => {
    const newData: Record<string, Record<string, number>> = {};
    
    months.forEach(month => {
      const v = { ...(gridData[month] || {}) };
      
      if (type === "manufacturing") {
        // Step 1: Revenue
        v["Total Revenue"] = (v["Domestic"] || 0) + (v["Export"] || 0) - (v["Less : Commission"] || 0);
        
        // Step 2: COGS
        v["COGS"] = (v["Opening Stock"] || 0) + (v["Purchase"] || 0) + (v["Transport on Purchases"] || 0) - (v["Closing Stock"] || 0);
        
        // Step 3: Contribution
        v["Contribution"] = v["Total Revenue"] - v["COGS"];
        
        // Step 4: Gross Profit
        const directExpList = [
          "Coal Charges", "Power Bill", "Other Mfg. Expenses", 
          "Repairs & Maintenance - Factory", "Depreciation - Factory", 
          "Clearing & Forwarding Charges", "Consumables", "Factory Expenses", 
          "Security Charges", "Factory Staff", "Factory Workers", 
          "Hiring Charges", "Jobwork Charges", "Payment to Contractor", 
          "Transport on Sales"
        ];
        const directExp = directExpList.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Gross Profit"] = v["Contribution"] - directExp;
        
        // Step 5: Indirect
        const indirectIncome = (v["Interest on Fixed Deposit"] || 0) + (v["Gain/ Loss on (Export/Import)"] || 0) + (v["Duty Drawback"] || 0);
        const indirectExpList = [
          "Administrative Expenses", "Sales & Advertisement Expenses", 
          "Director Remuneration", "Office Staff Salary", 
          "Repairs & Maintenance - Office", "Travelling Expenses", 
          "Legal & Professional Fees", "Rent Expenses", "Other Exp"
        ];
        const totalIndirectExp = indirectExpList.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Total Indirect Expenses"] = totalIndirectExp;
        
        // Step 6: EBITDA
        v["Earnings Before Interest Taxes & Amortization"] = v["Gross Profit"] + indirectIncome - totalIndirectExp;
        
        // Step 7: Final
        v["Net Profit Before Tax"] = v["Earnings Before Interest Taxes & Amortization"] - (v["Interest Expense"] || 0) - (v["Depreciation"] || 0);
      } else if (type === "trading") {
        // Trading Logic
        v["Total Revenue"] = (v["Domestic"] || 0) + (v["Export"] || 0) - (v["Less : Commission"] || 0);
        v["COGS"] = (v["Opening Stock"] || 0) + (v["Purchase"] || 0) + (v["Transport on Purchases"] || 0) - (v["Closing Stock"] || 0);
        v["Contribution"] = v["Total Revenue"] - v["COGS"];
        
        const directExpList = ["Clearing & Forwarding Charges", "Transport on Sales", "Other Direct Expense"];
        const directExp = directExpList.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Gross Profit"] = v["Contribution"] - directExp;
        
        const indirectIncome = (v["Interest on Fixed Deposit"] || 0) + (v["Gain/ Loss on (Export/Import)"] || 0) + (v["Duty Drawback"] || 0);
        const indirectExpList = [
          "Administrative Expenses", "Sales & Advertisement Expenses", 
          "Director Remuneration", "Office Staff Salary", 
          "Repairs & Maintenance - Office", "Travelling Expenses", 
          "Legal & Professional Fees", "Rent Expenses", "Other Exp"
        ];
        const totalIndirectExp = indirectExpList.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Total Indirect Expenses"] = totalIndirectExp;
        
        v["Earnings Before Interest Taxes & Amortization"] = v["Gross Profit"] + indirectIncome - totalIndirectExp;
        v["Net Profit Before Tax"] = v["Earnings Before Interest Taxes & Amortization"] - (v["Interest Expense"] || 0) - (v["Depreciation"] || 0);
      } else if (type === "service") {
        // Service Logic
        const revItems = [
          "Service Revenue (Primary income)", "Consulting / Professional Fees", 
          "Maintenance / AMC Income", "Commission Income", "Other Operating Income"
        ];
        const totalRev = revItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Total Revenue"] = totalRev - (v["Less : Commission"] || 0);
        
        const directExpList = [
          "Salaries - Service Staff / Engineers / Consultants", "Freelance / Contract Charges", 
          "Project Expenses", "Travel & Conveyance (Service-related)", 
          "Consumables / Tools Used", "Site Expenses", "Subcontracting Charges", 
          "Other Direct Expense"
        ];
        const directExp = directExpList.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Gross Profit"] = v["Total Revenue"] - directExp;
        
        const indirectIncome = (v["Interest on Fixed Deposit"] || 0);
        const indirectExpList = [
          "Administrative Expenses", "Sales & Advertisement Expenses", 
          "Director Remuneration", "Office Staff Salary", 
          "Repairs & Maintenance - Office", "Travelling Expenses", 
          "Legal & Professional Fees", "Other Exp"
        ];
        const totalIndirectExp = indirectExpList.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Total Indirect Expenses"] = totalIndirectExp;
        
        v["Earnings Before Interest Taxes & Amortization"] = v["Gross Profit"] + indirectIncome - totalIndirectExp;
        v["Net Profit Before Tax"] = v["Earnings Before Interest Taxes & Amortization"] - (v["Interest Expense"] || 0) - (v["Depreciation"] || 0);
      }

      newData[month] = v;
    });

    return newData;
  }, [gridData, type, months]);

  const handleValueChange = (month: string, item: string, value: string) => {
    const numValue = parseFloat(value) || 0;
    setGridData(prev => ({
      ...prev,
      [month]: {
        ...(prev[month] || {}),
        [item]: numValue
      }
    }));
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const getRowTotal = (item: string) => {
    return months.reduce((sum, m) => sum + (calculatedData[m][item] || 0), 0);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-200 p-4 md:p-8">
      <div className="max-w-full mx-auto">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Icon className="w-6 h-6 text-slate-950" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-white">{title} Sector P&L</h1>
              <div className="flex items-center gap-2">
                <select 
                  value={activeClientId || ""} 
                  onChange={(e) => {
                    const id = e.target.value;
                    const path = window.location.pathname;
                    router.push(`${path}?client=${id}`);
                  }}
                  className="bg-transparent text-cyan-400 text-sm font-bold border-none focus:ring-0 p-0 cursor-pointer hover:text-cyan-300 transition-colors"
                >
                  <option value="" disabled className="bg-[#13131A]">Select Client</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id} className="bg-[#13131A] text-white">{c.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-[#13131A] border border-white/10 rounded-xl p-1 flex">
              <button onClick={() => setFyType("APR_MAR")} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${fyType === "APR_MAR" ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}>FY: APR - MAR</button>
              <button onClick={() => setFyType("JAN_DEC")} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${fyType === "JAN_DEC" ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}>FY: JAN - DEC</button>
            </div>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="bg-[#13131A] border border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-white focus:outline-none cursor-pointer"><option value={2026}>2026-27</option><option value={2025}>2025-26</option></select>
            <button 
              onClick={() => setIsBudgetOpen(true)}
              disabled={!activeClientId}
              className="flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-xl text-xs font-black text-purple-400 hover:bg-purple-500/20 hover:border-purple-500/50 transition-all disabled:opacity-50"
            >
              <UploadCloud className="w-4 h-4" />
              Upload Budget
            </button>
            <button 
              onClick={() => setIsMappingOpen(true)}
              disabled={!activeClientId}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-black text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-all disabled:opacity-50"
            >
              <Link2 className="w-4 h-4" />
              Smart Map Data
            </button>
            <button className="p-2 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"><Download className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Modal */}

        <div className="bg-[#13131A] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="sticky left-0 z-30 bg-[#13131A] p-6 text-left text-xs font-black text-slate-500 uppercase tracking-widest min-w-[300px]">Particulars</th>
                  {months.map(month => (<th key={month} className="p-4 text-center text-xs font-black text-slate-500 uppercase tracking-widest min-w-[120px] border-l border-white/5">{month}</th>))}
                  <th className="p-4 text-center text-xs font-black text-cyan-500 uppercase tracking-widest min-w-[150px] border-l border-white/10 bg-cyan-500/5">Total</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section, sIdx) => (
                  <Fragment key={sIdx}>
                    <tr className="bg-white/[0.02]">
                      <td className="sticky left-0 z-30 bg-[#181821] p-4 text-sm font-black text-cyan-400 uppercase tracking-wide border-b border-white/5" colSpan={months.length + 2}>{section.name}</td>
                    </tr>
                    {section.items.map((item, iIdx) => (
                      <tr key={iIdx} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${section.isBold ? 'font-bold text-white bg-white/[0.01]' : ''} ${section.isSubtotal ? 'bg-cyan-500/5' : ''}`}>
                        <td className={`sticky left-0 z-30 p-4 text-sm border-r border-white/5 ${section.isBold || section.isTotal ? 'bg-[#181821]' : 'bg-[#13131A] text-slate-400'}`}>{item}</td>
                        {months.map(m => (
                          <td key={m} className="p-2 text-center border-l border-white/5 min-w-[120px]">
                            {section.isCalculated ? (
                              <span className="text-sm font-mono font-bold text-white">{formatCurrency(calculatedData[m]?.[item] || 0)}</span>
                            ) : (
                              <input type="number" value={gridData[m]?.[item] || ""} onChange={(e) => handleValueChange(m, item, e.target.value)} className="w-full bg-transparent border-none text-center text-sm font-mono text-slate-300 focus:ring-1 focus:ring-cyan-500/50 rounded p-1" placeholder="0" />
                            )}
                          </td>
                        ))}
                        <td className="p-4 text-center text-sm font-mono font-bold text-white border-l border-white/10 bg-white/[0.02]">{formatCurrency(getRowTotal(item))}</td>
                      </tr>
                    ))}
                    <tr className="h-4"></tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 pb-20">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
            <h4 className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">Manufacturing GP Margin</h4>
            <p className="text-2xl font-black text-white">{getRowTotal("Total Revenue") > 0 ? ((getRowTotal("Gross Profit") / getRowTotal("Total Revenue")) * 100).toFixed(1) : "0.0"}%</p>
          </div>
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-6">
            <h4 className="text-cyan-400 text-xs font-bold uppercase tracking-wider mb-2">Net Profit Before Tax</h4>
            <p className="text-2xl font-black text-white">{formatCurrency(getRowTotal("Net Profit Before Tax"))}</p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6">
            <h4 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">Formula Mode</h4>
            <p className="text-sm text-slate-300 italic italic">Auto-calculating all Contribution, GP, and NP fields based on your provided P&L logic.</p>
          </div>
        </div>
      </div>

      <PNLMappingModal 
        isOpen={isMappingOpen} 
        onClose={() => setIsMappingOpen(false)} 
        clientId={activeClientId || ""} 
        sectorHeads={allSectorHeads} 
      />

      <BudgetUploadModal
        isOpen={isBudgetOpen}
        onClose={() => setIsBudgetOpen(false)}
        clientId={activeClientId || ""}
        sectorHeads={allSectorHeads}
      />
    </div>
  );
}
