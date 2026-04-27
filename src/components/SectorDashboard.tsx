"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  Factory, Briefcase, ArrowRightLeft, Download, LayoutDashboard 
} from "lucide-react";

interface SectorDashboardProps {
  title: string;
  type: "manufacturing" | "trading" | "service";
  sections: {
    name: string;
    items: string[];
    isTotal?: boolean;
    isBold?: boolean;
    isSubtotal?: boolean;
  }[];
  activeClientId?: string;
  clients: any[];
}

export default function SectorDashboard({ title, type, sections, activeClientId, clients }: SectorDashboardProps) {
  const router = useRouter();
  const [fyType, setFyType] = useState<"APR_MAR" | "JAN_DEC">("APR_MAR");
  const [selectedYear, setSelectedYear] = useState(2026);

  const activeClient = clients.find(c => c.id === activeClientId);
  const Icon = type === "manufacturing" ? Factory : type === "trading" ? ArrowRightLeft : Briefcase;

  const getMonths = () => {
    if (fyType === "APR_MAR") {
      return ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    }
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  };

  const months = getMonths();

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-200 p-4 md:p-8">
      <div className="max-w-full mx-auto">
        
        {/* Header */}
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
              <button 
                onClick={() => setFyType("APR_MAR")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${fyType === "APR_MAR" ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
              >
                FY: APR - MAR
              </button>
              <button 
                onClick={() => setFyType("JAN_DEC")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${fyType === "JAN_DEC" ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'}`}
              >
                FY: JAN - DEC
              </button>
            </div>
            
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-[#13131A] border border-white/10 rounded-xl px-4 py-2 text-sm font-bold text-white focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value={2026}>2026-27</option>
              <option value={2025}>2025-26</option>
            </select>

            <button className="p-2 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors">
              <Download className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Multi-Column P&L Table */}
        <div className="bg-[#13131A] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="sticky left-0 z-20 bg-[#13131A] p-6 text-left text-xs font-black text-slate-500 uppercase tracking-widest min-w-[300px]">Particulars</th>
                  {months.map(month => (
                    <th key={month} className="p-4 text-center text-xs font-black text-slate-500 uppercase tracking-widest min-w-[100px] border-l border-white/5">{month}</th>
                  ))}
                  <th className="p-4 text-center text-xs font-black text-cyan-500 uppercase tracking-widest min-w-[120px] border-l border-white/10 bg-cyan-500/5">Total</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section, sIdx) => (
                  <div key={sIdx} className="contents">
                    {/* Section Header */}
                    <tr className="bg-white/[0.02]">
                      <td className="sticky left-0 z-20 bg-[#181821] p-4 text-sm font-black text-cyan-400 uppercase tracking-wide border-b border-white/5" colSpan={months.length + 2}>
                        {section.name}
                      </td>
                    </tr>
                    
                    {/* Items */}
                    {section.items.map((item, iIdx) => (
                      <tr key={iIdx} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${section.isBold ? 'font-bold text-white bg-white/[0.01]' : ''} ${section.isSubtotal ? 'bg-cyan-500/5' : ''}`}>
                        <td className={`sticky left-0 z-20 p-4 text-sm border-r border-white/5 ${section.isBold || section.isTotal ? 'bg-[#181821]' : 'bg-[#13131A] text-slate-400'}`}>
                          {item}
                        </td>
                        {months.map(m => (
                          <td key={m} className="p-4 text-center text-sm font-mono text-slate-300 border-l border-white/5">
                            ₹0.00
                          </td>
                        ))}
                        <td className="p-4 text-center text-sm font-mono font-bold text-white border-l border-white/10 bg-white/[0.02]">
                          ₹0.00
                        </td>
                      </tr>
                    ))}
                    
                    {/* Spacer */}
                    <tr className="h-4"></tr>
                  </div>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Insights Footer */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
            <h4 className="text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">Profitability Check</h4>
            <p className="text-sm text-slate-300">Net Profit margin is currently tracking at 0% based on imported Zoho data.</p>
          </div>
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-6">
            <h4 className="text-cyan-400 text-xs font-bold uppercase tracking-wider mb-2">Sync Status</h4>
            <p className="text-sm text-slate-300">Live data mapping for {title} sector is ready for account head matching.</p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6">
            <h4 className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">Action Required</h4>
            <p className="text-sm text-slate-300">Please provide GP/NP logic to enable automatic calculations across sectors.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
