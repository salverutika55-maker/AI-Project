"use client";

import { useState, useMemo, useEffect, Fragment, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  Factory, Briefcase, ArrowRightLeft, Download, FolderDown, Link2, UploadCloud, RefreshCw,
  TrendingDown, BarChart3, WalletCards, GitMerge, BrainCircuit, Activity,
  FileText, FileSpreadsheet, Zap, LayoutDashboard, Table as TableIcon, Search, AlertCircle, Settings2, Users, ShieldAlert, Scale
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  LineChart as RechartsLineChart, Line
} from "recharts";
import AnalyticsDashboard from "./AnalyticsDashboard";
import ComplianceDashboard from "./ComplianceDashboard";
import ScrutinyDashboard from "./ScrutinyDashboard";
import PNLMappingModal from "./PNLMappingModal";
import BudgetUploadModal from "./BudgetUploadModal";
import PNLStructureModal from "./PNLStructureModal";
import TrialBalanceUploadModal from "./TrialBalanceUploadModal";
import { SOFTWARE_CONFIGS, AccountingSoftware } from "@/lib/software-configs";
import { SECTOR_CONFIGS } from "@/lib/sector-configs";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import Papa from "papaparse";
import ErrorBoundary from "./ErrorBoundary";
import AICFOReport from "./AICFOReport";
import PerformanceRatios from "./PerformanceRatios";
import EarlyWarningSystem from "./EarlyWarningSystem";
import ExceptionDashboard from "./ExceptionDashboard";

interface UnifiedDashboardProps {
  client: any;
  allClients: any[];
  sections: any[];
  userRole?: string;
}

export default function UnifiedClientDashboard({ client, allClients, sections, userRole = 'READ_ONLY' }: UnifiedDashboardProps) {
  const isAdmin = ['SUPER_ADMIN', 'ORG_ADMIN', 'FINANCE_MANAGER'].includes(userRole);

  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"executive" | "performance" | "analytics" | "compliance" | "risk" | "advisory" | "diagnostics">("executive");
  const [fyType, setFyType] = useState<"APR_MAR" | "JAN_DEC">("APR_MAR");
  const [selectedYear, setSelectedYear] = useState(2026);
  const [selectedMonth, setSelectedMonth] = useState("May");
  const [displayCurrency, setDisplayCurrency] = useState("INR");
  const [isMappingOpen, setIsMappingOpen] = useState(false);
  const [isBudgetOpen, setIsBudgetOpen] = useState(false);
  const [isTBUploadOpen, setIsTBUploadOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"STANDARD" | "MONTHLY_BUDGET">("STANDARD");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Data States
  const [gridData, setGridData] = useState<Record<string, Record<string, number>>>({});
  const [budgetData, setBudgetData] = useState<Record<string, Record<string, number>>>({});
  const [financialRecords, setFinancialRecords] = useState<any[]>([]);
  const [syncDiagnostic, setSyncDiagnostic] = useState<any>(null);
  const [topBalancesSample, setTopBalancesSample] = useState<any[]>([]);
  const [misReport, setMisReport] = useState<any>(null);
  const [misLoading, setMisLoading] = useState(false);
  const [customSubHeads, setCustomSubHeads] = useState<any[]>([]);
  const [isManagingStructure, setIsManagingStructure] = useState(false);
  const [isMISModalOpen, setIsMISModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Derived state for mapping modals
  const allSectorHeads = useMemo(() => {
    if (!isMounted) return [];
    return Array.from(new Set((customSubHeads || []).map(s => s.name)));
  }, [customSubHeads, isMounted]);

  const dashboardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (client?.id) {
      fetchAllData();
      
      // Check for active sync task on mount
      const savedTaskId = localStorage.getItem(`sync_task_${client.id}`);
      if (savedTaskId) {
        console.log("Resuming sync polling for task:", savedTaskId);
        setIsSyncing(true);
        pollTaskStatus(savedTaskId);
      }
    }
  }, [client?.id, selectedYear, fyType]);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      // 1. Fetch P&L Values
      const pnlRes = await fetch(`/api/clients/${client.id}/values?year=${selectedYear}&fyType=${fyType}`);
      const pnlData = await pnlRes.json();
      
      const grid: Record<string, Record<string, number>> = {};
      pnlData.values?.forEach((v: any) => {
        if (!grid[v.month]) grid[v.month] = {};
        grid[v.month][v.headName] = v.amount;
      });
      setGridData(grid);

      const bGrid: Record<string, Record<string, number>> = {};
      pnlData.budgetValues?.forEach((v: any) => {
        if (!bGrid[v.month]) bGrid[v.month] = {};
        bGrid[v.month][v.headName] = v.amount;
      });
      setBudgetData(bGrid);

      // 2. Fetch Dynamic Subheads
      const subRes = await fetch(`/api/clients/${client.id}/subheads`);
      let subData = await subRes.json();

      // Auto-Seed if empty
      if (subData.length === 0) {
        console.log("Seeding default subheads for client...");
        const defaultSections = sections;
        for (const section of defaultSections) {
          for (const item of section.items) {
            if (!section.isCalculated) {
              await fetch(`/api/clients/${client.id}/subheads`, {
                method: "POST",
                body: JSON.stringify({ name: item, headName: section.name })
              });
            }
          }
        }
        const refreshRes = await fetch(`/api/clients/${client.id}/subheads`);
        subData = await refreshRes.json();
      }
      setCustomSubHeads(subData);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const softwareConfig = SOFTWARE_CONFIGS[(client?.software || 'TALLY') as AccountingSoftware] || SOFTWARE_CONFIGS.TALLY;

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const queryParams = new URLSearchParams({
        year: selectedYear.toString(),
        fyType: fyType,
        ...( softwareConfig.softwareType ? { type: softwareConfig.softwareType } : {} )
      });

      const response = await fetch(`/api/clients/${client.id}${softwareConfig.syncEndpoint}?${queryParams.toString()}`, { 
        method: "POST" 
      });

      // Check if response is HTML (Error page) instead of JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON Response:", text);
        throw new Error(`${softwareConfig.label} integration is currently being configured or the server returned an error page.`);
      }

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.message || data.error || `Server returned ${response.status}`);
      }
      
      if (data.taskId) {
        // Tally Background Sync initiated
        localStorage.setItem(`sync_task_${client.id}`, data.taskId);
        setSyncProgress("Sync requested...");
        pollTaskStatus(data.taskId);
        // We DO NOT set isSyncing to false here; the poller will do it.
      } else {
        // Direct Sync (Zoho, etc.) - these are fast/synchronous
        setTopBalancesSample(data.topBalances || []);
        setSyncDiagnostic({ 
          orgName: data.orgName, 
          apiBaseUsed: data.apiBaseUsed, 
          allNames: data.allNames, 
          rawSnippet: data.rawSnippet 
        });
        await fetchAllData();
        setIsSyncing(false); // Done for synchronous syncs
        alert(`✅ ${softwareConfig.label} Sync Complete! Updated ${data.count} months.`);
      }
    } catch (err: any) {
      console.error("Sync Error Details:", err);
      alert(`Sync Error: ${err.message}`);
      setIsSyncing(false); // Re-enable button on error
    }
    // Removed finally block that was prematurely resetting isSyncing
  };

  const pollTaskStatus = async (taskId: string) => {
    let attempts = 0;
    const maxAttempts = 450; // 15 minutes max (450 * 2s)

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/sync/tasks/${taskId}`);
        const data = await res.json();

        if (data.status === "COMPLETED") {
          clearInterval(interval);
          setSyncProgress("Aggregating Tally P&L data...");
          try {
            await fetch(`/api/clients/${client.id}/sync/data?year=${selectedYear}&fyType=${fyType}`, {
              method: "POST"
            });
          } catch (err) {
            console.error("P&L Aggregation Error:", err);
          }
          localStorage.removeItem(`sync_task_${client.id}`);
          setSyncProgress("Data received! Finalizing view...");
          await fetchAllData();
          setIsSyncing(false);
          setSyncProgress("");
          alert("✅ Sync completed successfully! The financial data has been updated.");
        } else if (data.status === "FAILED") {
          clearInterval(interval);
          localStorage.removeItem(`sync_task_${client.id}`);
          alert(`❌ Sync Failed: ${data.message || "The Tally connector reported an error while generating data."}`);
          setIsSyncing(false);
          setSyncProgress("");
        } else {
          // Still pending or in progress
          if (attempts > 300) {
            setSyncProgress("Processing extreme data volume in background... please do not close this window.");
          } else if (attempts > 150) {
            setSyncProgress("Worker is streaming data chunks... almost there.");
          } else if (attempts > 60) {
            setSyncProgress("Processing data chunks in the cloud...");
          } else if (attempts > 10) {
            setSyncProgress("Establishing secure streaming bridge to local Tally machine...");
          } else {
            setSyncProgress("Waking up Tally connector and initializing queue...");
          }
        }
        
        attempts++;
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          localStorage.removeItem(`sync_task_${client.id}`);
          alert("⏱️ Sync timed out after 15 minutes. This usually means the Tally company is exceptionally large or the local machine is busy. The data might still appear in a few minutes, but please ensure your Tally Prime is open and the company is active.");
          setIsSyncing(false);
          setSyncProgress("");
        }
      } catch (error: any) {
        console.error("Polling Error:", error);
      }
    }, 2000);
  };

  const handleResetSync = async () => {
    if (!confirm("Are you sure you want to reset the sync? This will cancel any active tasks and allow you to restart the sync process.")) return;
    
    setLoading(true);
    try {
      const res = await fetch("/api/sync/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id })
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.removeItem(`sync_task_${client.id}`);
        setIsSyncing(false);
        setSyncProgress("");
        alert("✅ Sync status reset! You can now trigger a fresh sync.");
        router.refresh(); // Reload to get fresh client status
      } else {
        throw new Error(data.message);
      }
    } catch (err: any) {
      alert("Reset Failed: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number, compact = false) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: displayCurrency,
      maximumFractionDigits: 0,
      notation: compact ? "compact" : "standard"
    }).format(val);
  };

  const months = useMemo(() => {
    if (fyType === "APR_MAR") {
      return ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    }
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  }, [fyType]);
  const visibleMonths = useMemo(() => {
    const idx = months.indexOf(selectedMonth);
    if (idx === -1) return [selectedMonth];
    return months.slice(0, idx + 1); // All months from start of FY up to selected month
  }, [selectedMonth, months]);

  // CALCULATION ENGINE (Copied from SectorDashboard)
  const calculateMetrics = (sourceGrid: Record<string, Record<string, number>>) => {
    const newData: Record<string, Record<string, number>> = {};
    const type = (client?.sector || "TRADING").toLowerCase();
    
    months.forEach(month => {
      const v = { ...(sourceGrid[month] || {}) };
      
      if (type === "manufacturing") {
        const revItems = customSubHeads.filter(sh => sh.headName === "Revenue from Operation").map(sh => sh.name);
        const revTotal = revItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        const commissionItems = customSubHeads.filter(sh => sh.headName === "Revenue Deductions").map(sh => sh.name);
        const commTotal = commissionItems.reduce((sum, item) => sum + (v[item] || 0), 0) || (v["Less : Commission"] || 0);
        v["Total Revenue"] = revTotal - commTotal;
        
        const cogsItems = customSubHeads.filter(sh => sh.headName === "Cost of Goods Sold").map(sh => sh.name);
        v["COGS"] = cogsItems.reduce((sum, item) => sum + (v[item] || 0), 0) || ((v["Opening Stock"] || 0) + (v["Purchase"] || 0) + (v["Transport on Purchases"] || 0) - (v["Closing Stock"] || 0));
        v["Contribution"] = v["Total Revenue"] - v["COGS"];
        
        const directExpItems = customSubHeads.filter(sh => sh.headName === "Direct Expenses").map(sh => sh.name);
        const directExp = directExpItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Gross Profit"] = v["Contribution"] - directExp;
        
        const indirectIncItems = customSubHeads.filter(sh => sh.headName === "Indirect Income").map(sh => sh.name);
        const indirectIncome = indirectIncItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        
        const indirectExpItems = customSubHeads.filter(sh => sh.headName === "Indirect Expenses").map(sh => sh.name);
        const totalIndirectExp = indirectExpItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Total Indirect Expenses"] = totalIndirectExp;
        
        v["Earnings Before Interest Taxes & Amortization"] = v["Gross Profit"] + indirectIncome - totalIndirectExp;
        
        const finItems = customSubHeads.filter(sh => sh.headName === "Financials").map(sh => sh.name);
        const finTotal = finItems.reduce((sum, item) => sum + (v[item] || 0), 0) || ((v["Interest Expense"] || 0) + (v["Depreciation"] || 0));
        v["Net Profit Before Tax"] = v["Earnings Before Interest Taxes & Amortization"] - finTotal;
        
      } else if (type === "trading") {
        const revItems = customSubHeads.filter(sh => sh.headName === "Sales Income").map(sh => sh.name);
        const revTotal = revItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        const commissionItems = customSubHeads.filter(sh => sh.headName === "Revenue Deductions").map(sh => sh.name);
        const commTotal = commissionItems.reduce((sum, item) => sum + (v[item] || 0), 0) || (v["Less : Commission"] || 0);
        v["Total Revenue"] = revTotal - commTotal;
        
        const cogsItems = customSubHeads.filter(sh => sh.headName === "Trading Cost").map(sh => sh.name);
        v["COGS"] = cogsItems.reduce((sum, item) => sum + (v[item] || 0), 0) || ((v["Opening Stock"] || 0) + (v["Purchase"] || 0) + (v["Transport on Purchases"] || 0) - (v["Closing Stock"] || 0));
        v["Contribution"] = v["Total Revenue"] - v["COGS"];
        
        const directExpItems = customSubHeads.filter(sh => sh.headName === "Direct Expenses").map(sh => sh.name);
        const directExp = directExpItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Gross Profit"] = v["Contribution"] - directExp;
        
        const indirectIncItems = customSubHeads.filter(sh => sh.headName === "Indirect Income").map(sh => sh.name);
        const indirectIncome = indirectIncItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        
        const indirectExpItems = customSubHeads.filter(sh => sh.headName === "Indirect Expenses").map(sh => sh.name);
        const totalIndirectExp = indirectExpItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Total Indirect Expenses"] = totalIndirectExp;
        
        v["Earnings Before Interest Taxes & Amortization"] = v["Gross Profit"] + indirectIncome - totalIndirectExp;
        
        const finItems = customSubHeads.filter(sh => sh.headName === "Financials").map(sh => sh.name);
        const finTotal = finItems.reduce((sum, item) => sum + (v[item] || 0), 0) || ((v["Interest Expense"] || 0) + (v["Depreciation"] || 0));
        v["Net Profit Before Tax"] = v["Earnings Before Interest Taxes & Amortization"] - finTotal;

      } else if (type === "service") {
        const revItems = customSubHeads.filter(sh => sh.headName === "Operating Revenue").map(sh => sh.name);
        const totalRev = revItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        const commissionItems = customSubHeads.filter(sh => sh.headName === "Revenue Deductions").map(sh => sh.name);
        const commTotal = commissionItems.reduce((sum, item) => sum + (v[item] || 0), 0) || (v["Less : Commission"] || 0);
        v["Total Revenue"] = totalRev - commTotal;
        
        const directExpItems = customSubHeads.filter(sh => sh.headName === "Service Delivery Costs (Direct)").map(sh => sh.name);
        const directExp = directExpItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Gross Profit"] = v["Total Revenue"] - directExp;
        
        const indirectIncItems = customSubHeads.filter(sh => sh.headName === "Indirect Income").map(sh => sh.name);
        const indirectIncome = indirectIncItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        
        const indirectExpItems = customSubHeads.filter(sh => sh.headName === "Administrative & General Expenses").map(sh => sh.name);
        const totalIndirectExp = indirectExpItems.reduce((sum, item) => sum + (v[item] || 0), 0);
        v["Total Indirect Expenses"] = totalIndirectExp;
        
        v["Earnings Before Interest Taxes & Amortization"] = v["Gross Profit"] + indirectIncome - totalIndirectExp;
        
        const finItems = customSubHeads.filter(sh => sh.headName === "Financials").map(sh => sh.name);
        const finTotal = finItems.reduce((sum, item) => sum + (v[item] || 0), 0) || ((v["Interest Expense"] || 0) + (v["Depreciation"] || 0));
        v["Net Profit Before Tax"] = v["Earnings Before Interest Taxes & Amortization"] - finTotal;
      }
      newData[month] = v;
    });
    return newData;
  };

  const calculatedData = useMemo(() => calculateMetrics(gridData), [gridData, client?.sector, months, customSubHeads]);
  const calculatedBudgetData = useMemo(() => calculateMetrics(budgetData), [budgetData, client?.sector, months, customSubHeads]);

  const getRowTotal = (item: string) => {
    return visibleMonths.reduce((sum, m) => sum + (calculatedData[m]?.[item] || gridData[m]?.[item] || 0), 0);
  };

  const getBudgetRowTotal = (item: string) => {
    return visibleMonths.reduce((sum, m) => sum + (calculatedBudgetData[m]?.[item] || budgetData[m]?.[item] || 0), 0);
  };

  // EXPORT TOOLS (Salvaged from DashboardClient)
  const exportPDF = async () => {
    if (!dashboardRef.current) return;
    setLoading(true);
    try {
      const canvas = await html2canvas(dashboardRef.current, { scale: 2, useCORS: true, backgroundColor: '#0A0A0C' });
      const imgData = canvas.toDataURL('image/jpeg', 0.8);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${client.name}_Report.pdf`);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const exportExcel = () => {
    // Basic CSV export for now
    const flatData = months.map(m => ({ month: m, ...calculatedData[m] }));
    const csv = Papa.unparse(flatData);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${client.name}_Financials.csv`;
    a.click();
  };

  // AI MIS GENERATOR (Salvaged from DashboardClient)
  const generateMIS = () => {
    setMisLoading(true);
    setActiveTab("insights");
    setTimeout(() => {
      const totalRev = getRowTotal("Total Revenue");
      const totalNP = getRowTotal("Net Profit Before Tax");
      const totalExp = getRowTotal("Total Indirect Expenses");
      
      setMisReport({
        commentary: `The financial performance for ${client.name} shows a healthy revenue of ${formatCurrency(totalRev)}. Total Net Profit stands at ${formatCurrency(totalNP)}. Administrative and Indirect expenses were managed at ${formatCurrency(totalExp)}.`,
        highlights: [
          `Gross Margin is currently at ${totalRev > 0 ? ((getRowTotal("Gross Profit") / totalRev) * 100).toFixed(1) : 0}%.`,
          `Operating efficiency is stable across the observed months.`,
          `Cash flow metrics indicate a positive trend.`
        ],
        anomalies: totalNP < 0 ? ["⚠️ Profitability Alert: The business is currently operating at a net loss."] : []
      });
      setMisLoading(false);
    }, 1500);
  };

  // CHART DATA PREP
  const chartData = months.map(month => ({
    name: month,
    revenue: calculatedData[month]?.["Total Revenue"] || 0,
    profit: calculatedData[month]?.["Net Profit Before Tax"] || 0,
    cogs: calculatedData[month]?.["COGS"] || 0
  }));


  const Icon = client?.sector === "MANUFACTURING" ? Factory : client?.sector === "TRADING" ? ArrowRightLeft : Briefcase;

  if (!isMounted) return (
    <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center">
      <RefreshCw className="w-8 h-8 text-cyan-500 animate-spin" />
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-200" ref={dashboardRef}>
      {/* 1. STICKY TOP CONTROL BAR */}
      <header className="sticky top-0 z-[60] bg-[#13131A]/80 backdrop-blur-md border-b border-white/5 p-4 md:px-8 shadow-xl">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Icon className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <select 
                value={client.id} 
                onChange={(e) => router.push(`/dashboard/client/${e.target.value}`)}
                className="bg-transparent text-white font-black text-lg border-none focus:ring-0 p-0 cursor-pointer hover:text-cyan-400 transition-colors"
              >
                {allClients.map(c => <option key={c.id} value={c.id} className="bg-[#13131A]">{c.name}</option>)}
              </select>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{client.sector} SECTOR</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <select value={displayCurrency} onChange={(e) => setDisplayCurrency(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none hover:bg-white/10 transition-all cursor-pointer">
              <option value="INR" className="bg-[#13131A]">INR (₹)</option>
              <option value="USD" className="bg-[#13131A]">USD ($)</option>
              <option value="EUR" className="bg-[#13131A]">EUR (€)</option>
            </select>
            <div className="h-4 w-[1px] bg-white/10 hidden md:block" />
            <select value={fyType} onChange={(e) => setFyType(e.target.value as any)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none hover:bg-white/10 transition-all cursor-pointer">
              <option value="APR_MAR" className="bg-[#13131A]">FY: APR - MAR</option>
              <option value="JAN_DEC" className="bg-[#13131A]">FY: JAN - DEC</option>
            </select>
            <select value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))} className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold text-white focus:outline-none hover:bg-white/10 transition-all cursor-pointer">
              {Array.from({ length: 11 }, (_, i) => 2020 + i).map((y) => (
                <option key={y} value={y} className="bg-[#13131A]">
                  {fyType === "APR_MAR" ? `${y}-${(y + 1).toString().slice(2)}` : y}
                </option>
              ))}
            </select>
            <div className="h-4 w-[1px] bg-white/10 hidden md:block" />
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg px-3 py-1.5 text-xs font-black text-cyan-400 focus:outline-none hover:bg-cyan-500/20 transition-all cursor-pointer">
              {months.map(m => <option key={m} value={m} className="bg-[#13131A]">{m.toUpperCase()}</option>)}
            </select>
            <div className="h-4 w-[1px] bg-white/10 hidden md:block" />
            <button onClick={exportPDF} className="p-2 bg-white/5 border border-white/10 rounded-lg text-slate-400 hover:text-white transition-colors" title="Export PDF"><FileText className="w-4 h-4" /></button>
            <button onClick={exportExcel} className="p-2 bg-white/5 border border-white/10 rounded-lg text-slate-400 hover:text-white transition-colors" title="Export CSV"><FileSpreadsheet className="w-4 h-4" /></button>
            
            {client.software === 'TALLY' && (
              <div className="relative group">
                <button 
                  className="px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20 transition-all flex items-center gap-2" 
                  title="Download Tally Connector"
                >
                  <Download className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-widest hidden lg:block">Tally Connector</span>
                </button>
                
                <div className="absolute right-0 mt-2 w-72 bg-[#13131A] border border-white/10 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                  <div className="p-3 bg-amber-500/10 border-b border-white/5">
                    <p className="text-[10px] text-amber-500 font-black tracking-widest uppercase mb-1">Beta Security Notice</p>
                    <p className="text-[10px] text-amber-500/80 leading-relaxed font-medium">Extract ZIP with password: <b>tally</b>.<br/>Then double-click <b>Start_FinAnalyzer.bat</b>.</p>
                  </div>
                  <button 
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = '/downloads/FinAnalyzerSync_Portable.zip';
                      link.download = 'FinAnalyzerSync_Portable.zip';
                      link.click();
                    }}
                    className="w-full text-left px-4 py-3 text-xs font-bold text-white hover:bg-white/5 flex items-center gap-3 transition-colors"
                  >
                    <FolderDown className="w-4 h-4 text-emerald-400" />
                    Download Desktop Agent (.zip)
                  </button>
                </div>
              </div>
            )}
            
            {client.software === 'TALLY' && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg group relative">
                <div className={`w-2 h-2 rounded-full ${
                  client.connectorStatus === 'SYNCING' ? 'bg-amber-500 animate-pulse' :
                  client.connectorStatus === 'ONLINE' ? 'bg-emerald-500 animate-pulse' : 
                  'bg-rose-500'
                }`} />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {client.connectorStatus === 'SYNCING' ? 'Sync in Progress' :
                   client.connectorStatus === 'ONLINE' ? 'Connector Active' : 
                   'Connector Offline'}
                </span>
                
                {/* Tooltip */}
                <div className="absolute top-full right-0 mt-2 w-48 bg-[#1a1a24] border border-white/10 p-3 rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                  <p className="text-[10px] text-slate-400 leading-relaxed font-medium">
                    {client.connectorStatus === 'SYNCING' ? 'Data is currently being uploaded from your local Tally Prime machine.' :
                     client.connectorStatus === 'ONLINE' ? 'The desktop sync bridge is connected and ready to sync.' : 
                     'The desktop sync bridge is not detected. Please ensure the .exe connector is running.'}
                  </p>
                </div>
              </div>
            )}
            
            <div className="flex flex-col items-end gap-1">
              <button 
                onClick={() => {
                  if (client.software === 'TALLY' && client.connectorStatus === 'OFFLINE') {
                    const link = document.createElement('a');
                    link.href = '/downloads/FinAnalyzer_Connector_Setup.exe';
link.download = 'FinAnalyzer_Connector_Setup.exe';
                    link.click();
                  } else {
                    handleSync();
                  }
                }} 
                disabled={isSyncing || client.connectorStatus === 'SYNCING'} 
                className={`flex items-center gap-2 px-4 py-1.5 ${softwareConfig.bg} border ${softwareConfig.border} rounded-lg text-xs font-black ${softwareConfig.color} hover:opacity-80 transition-all disabled:opacity-50`}
              >
                {isSyncing || client.connectorStatus === 'SYNCING' ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : client.software === 'TALLY' && client.connectorStatus === 'OFFLINE' ? (
                  <Download className="w-3 h-3" />
                ) : (
                  <softwareConfig.icon className="w-3 h-3" />
                )}
                
                {client.software === 'TALLY' && client.connectorStatus === 'OFFLINE' 
                  ? 'Download Connector' 
                  : client.connectorStatus === 'SYNCING' || isSyncing
                    ? 'Syncing...' 
                    : `Sync ${softwareConfig.label}`}
              </button>
              {syncProgress && (
                <span className="text-[9px] font-black text-cyan-400 uppercase tracking-tighter animate-pulse">
                  {syncProgress}
                </span>
              )}
              {client.software === 'TALLY' && client.connectorStatus === 'OFFLINE' && (
                <button 
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/handshake", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ clientId: client.id })
                      });
                      const data = await res.json();
                      if (!res.ok) throw new Error(data.message || "Failed to generate code");
                      alert(`🔑 Sync Connection Code:\n\n      ${data.code}\n\nUnzip the downloaded folder and double-click Start_Connector.bat to link your Tally company.`);
                    } catch (err: any) {
                      alert("Code Generation Failed: " + err.message);
                    }
                  }}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-bold uppercase tracking-widest mt-1.5 underline cursor-pointer"
                >
                  Generate Sync Code
                </button>
              )}
              {client.software !== 'TALLY' && (
                <button 
                  onClick={() => { window.location.href = `/api/oauth/${client.software.toLowerCase()}?clientId=${client.id}`; }}
                  className="text-[9px] text-slate-500 hover:text-white underline font-bold uppercase tracking-widest mt-1"
                >
                  Reconnect Account
                </button>
              )}
            </div>

            {isAdmin && (
              <button 
                onClick={() => setIsTBUploadOpen(true)}
                className="flex items-center gap-2 px-4 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-xs font-black text-cyan-400 hover:bg-cyan-500/20 transition-all"
              >
                <UploadCloud className="w-3 h-3" />
                Upload Excel
              </button>
            )}

          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        
        {/* Background Sync Banner */}
        {isSyncing && (
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-4 flex items-center justify-between animate-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-cyan-500/20 rounded-lg flex items-center justify-center">
                <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
              </div>
              <div>
                <p className="text-xs font-black text-cyan-400 uppercase tracking-widest">Background Sync Active</p>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">
                  {syncProgress || "Establishing connection..."}
                </p>
              </div>
            </div>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
              You can continue working while we fetch the latest data.
            </div>
          </div>
        )}

        {/* 2. TAB NAVIGATION */}
        <div className="flex flex-wrap items-center gap-1 bg-[#13131A] p-1.5 rounded-2xl border border-white/5 w-fit shadow-lg">
          <button onClick={() => setActiveTab("executive")} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "executive" ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <LayoutDashboard className="w-4 h-4" /> Executive Dashboard
          </button>
          <button onClick={() => setActiveTab("performance")} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "performance" ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <TableIcon className="w-4 h-4" /> Financial Performance
          </button>
          <button onClick={() => setActiveTab("analytics")} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "analytics" ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <Users className="w-4 h-4" /> Business Analytics
          </button>
          <button onClick={() => setActiveTab("compliance")} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "compliance" ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <ShieldAlert className="w-4 h-4" /> Audit & Compliance
          </button>
          <button onClick={() => setActiveTab("risk")} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "risk" ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <AlertCircle className="w-4 h-4" /> Risk Intelligence
          </button>
          <button onClick={() => setActiveTab("advisory")} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "advisory" ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <Briefcase className="w-4 h-4" /> Strategic Advisory
          </button>
          <button onClick={() => setActiveTab("diagnostics")} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${activeTab === "diagnostics" ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
            <Activity className="w-4 h-4" /> Sync Diagnostics
          </button>
        </div>

        {/* 3. TAB CONTENT */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {activeTab === "executive" && (
            <ErrorBoundary title="Insights Module Error">
              <div className="space-y-8">
              {/* KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {[
                  { label: "Revenue", value: getRowTotal("Total Revenue"), icon: TrendingDown, color: "text-emerald-400", bg: "bg-emerald-500/20" },
                  { label: "Gross Profit", value: getRowTotal("Gross Profit"), icon: BarChart3, color: "text-cyan-400", bg: "bg-cyan-500/20" },
                  { label: "Net Profit", value: getRowTotal("Net Profit Before Tax"), icon: Zap, color: getRowTotal("Net Profit Before Tax") < 0 ? "text-rose-400" : "text-emerald-400", bg: "bg-white/5" },
                  { label: "Indirect Exp", value: getRowTotal("Total Indirect Expenses"), icon: WalletCards, color: "text-indigo-400", bg: "bg-indigo-500/20" },
                  { label: "GP Margin", value: (getRowTotal("Total Revenue") > 0 ? ((getRowTotal("Gross Profit") / getRowTotal("Total Revenue")) * 100).toFixed(1) : 0) + "%", icon: GitMerge, color: "text-amber-400", bg: "bg-amber-500/20" }
                ].map((kpi, idx) => (
                  <div key={idx} className="bg-[#13131A] border border-white/5 rounded-2xl p-5 hover:border-white/20 transition-all shadow-md">
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.bg}`}><kpi.icon className={`w-4 h-4 ${kpi.color}`} /></div>
                      <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{kpi.label}</h3>
                    </div>
                    <p className={`text-xl font-black ${kpi.color}`}>
                      {typeof kpi.value === 'number' ? formatCurrency(kpi.value, true) : kpi.value}
                    </p>
                  </div>
                ))}
              </div>

              {/* AI Predictive Alerts */}
              <EarlyWarningSystem clientId={client.id} selectedYear={selectedYear} />

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Charts Area */}
                <div className="lg:col-span-2 space-y-8">
                  <div className="bg-[#13131A] border border-white/5 rounded-3xl p-8 shadow-xl">
                    <div className="flex justify-between items-center mb-8">
                      <h3 className="text-xl font-black text-white">Revenue & Profit Trends</h3>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded-full" /><span className="text-xs text-slate-400 font-bold">Revenue</span></div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 bg-cyan-400 rounded-full" /><span className="text-xs text-slate-400 font-bold">Net Profit</span></div>
                      </div>
                    </div>
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%" debounce={100}>
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10B981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10B981" stopOpacity={0}/></linearGradient>
                            <linearGradient id="colorProf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#22D3EE" stopOpacity={0.3}/><stop offset="95%" stopColor="#22D3EE" stopOpacity={0}/></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                          <XAxis dataKey="name" stroke="#ffffff20" tick={{fill: '#ffffff50', fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                          <YAxis stroke="#ffffff20" tick={{fill: '#ffffff50', fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrency(v, true)} />
                          <RechartsTooltip contentStyle={{backgroundColor: '#13131A', borderColor: '#ffffff10', borderRadius: '12px'}} formatter={(v: any) => formatCurrency(Number(v))} />
                          <Area type="monotone" name="Revenue" dataKey="revenue" stroke="#10B981" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                          <Area type="monotone" name="Net Profit" dataKey="profit" stroke="#22D3EE" strokeWidth={3} fillOpacity={1} fill="url(#colorProf)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-[#13131A] border border-white/5 rounded-3xl p-8 shadow-xl">
                    <h3 className="text-xl font-black text-white mb-8">COGS Optimization Analysis</h3>
                    <div className="h-[250px] w-full">
                      <ResponsiveContainer width="100%" height="100%" debounce={100}>
                        <RechartsLineChart data={chartData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                          <XAxis dataKey="name" stroke="#ffffff20" tick={{fill: '#ffffff50', fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} />
                          <YAxis stroke="#ffffff20" tick={{fill: '#ffffff50', fontSize: 10, fontWeight: 'bold'}} axisLine={false} tickLine={false} tickFormatter={(v) => formatCurrency(v, true)} />
                          <RechartsTooltip contentStyle={{backgroundColor: '#13131A', borderColor: '#ffffff10', borderRadius: '12px'}} />
                          <Line type="stepAfter" name="COGS" dataKey="cogs" stroke="#F59E0B" strokeWidth={4} dot={{r: 4, fill: '#F59E0B', strokeWidth: 2, stroke: '#13131A'}} />
                        </RechartsLineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* AI MIS Assistant Launcher */}
                <div className="space-y-8">
                  <div className="bg-indigo-600/10 border border-indigo-500/20 rounded-3xl p-8 shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity"><BrainCircuit className="w-20 h-20 text-indigo-400" /></div>
                    <h3 className="text-xl font-black text-white flex items-center gap-3 mb-4"><BrainCircuit className="w-5 h-5 text-indigo-400" /> AI MIS Assistant</h3>
                    <p className="text-sm text-slate-400 font-medium mb-8 relative z-10">Generate a comprehensive, full-screen AI analysis of your financial performance, including key strategic focus areas and risk anomalies.</p>
                    <button 
                      onClick={() => setIsMISModalOpen(true)} 
                      className="relative z-10 w-full py-4 bg-indigo-500 hover:bg-indigo-400 text-white font-black text-sm rounded-xl shadow-lg shadow-indigo-500/20 transition-all flex justify-center items-center gap-2"
                    >
                      <Zap className="w-4 h-4" /> Generate Full Report
                    </button>
                  </div>
                </div>
              </div>

              {/* Executive Health Scorecards */}
              <PerformanceRatios clientId={client.id} selectedYear={selectedYear} mode="scores" />
            </div>
          </ErrorBoundary>
        )}

          {activeTab === "performance" && (
            <ErrorBoundary title="P&L Report Error">
              <div className="space-y-8">
              <div className="bg-[#13131A] border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
              <div className="p-6 border-b border-white/5 flex flex-wrap justify-between items-center gap-4 bg-[#181821]">
                <div className="flex items-center gap-3">
                  <TableIcon className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-lg font-black text-white">Profit & Loss Statement</h3>
                </div>
                <div className="flex items-center gap-3">
                  <div className="bg-black/40 border border-white/10 rounded-xl p-1 flex">
                    <button onClick={() => setViewMode("STANDARD")} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === "STANDARD" ? 'bg-cyan-500 text-slate-950' : 'text-slate-500 hover:text-white'}`}>Standard</button>
                    <button onClick={() => setViewMode("MONTHLY_BUDGET")} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === "MONTHLY_BUDGET" ? 'bg-purple-500 text-white' : 'text-slate-500 hover:text-white'}`}>Vs Budget</button>
                  </div>
                  {isAdmin && (
                    <>
                      <button onClick={() => setIsMappingOpen(true)} className="flex items-center gap-2 px-4 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-cyan-400 hover:bg-cyan-500/10 transition-all"><Link2 className="w-3 h-3" /> Map Ledgers</button>
                      <button onClick={() => setIsManagingStructure(true)} className="flex items-center gap-2 px-4 py-1.5 bg-white/5 border border-white/10 rounded-xl text-[10px] font-black text-emerald-400 hover:bg-emerald-500/10 transition-all"><Settings2 className="w-3 h-3" /> Manage Structure</button>
                      <button onClick={() => setIsBudgetOpen(true)} className="flex items-center gap-2 px-4 py-1.5 bg-purple-500/10 border border-purple-500/20 rounded-xl text-[10px] font-black text-purple-400 hover:bg-purple-500/20 transition-all"><UploadCloud className="w-3 h-3" /> Budget</button>
                    </>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="sticky left-0 z-30 bg-[#181821] p-6 text-left text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[300px]">Particulars</th>
                      {visibleMonths.map(month => (
                        viewMode === "STANDARD" ? (
                          <th key={month} className="p-4 text-center text-[10px] font-black text-slate-500 uppercase tracking-widest min-w-[120px] border-l border-white/5">{month}</th>
                        ) : (
                          <Fragment key={month}>
                            <th className="p-4 text-center text-[10px] font-black text-cyan-400 uppercase tracking-widest min-w-[120px] border-l border-white/5 bg-cyan-500/5">{month} (Act)</th>
                            <th className="p-4 text-center text-[10px] font-black text-purple-400 uppercase tracking-widest min-w-[120px] border-l border-white/5 bg-purple-500/5">{month} (Bgt)</th>
                          </Fragment>
                        )
                      ))}
                      {viewMode === "STANDARD" ? (
                        <th className="p-4 text-center text-[10px] font-black text-cyan-500 uppercase tracking-widest min-w-[150px] border-l border-white/10 bg-cyan-500/5">Cumulative Total</th>
                      ) : (
                        <Fragment>
                          <th className="p-4 text-center text-[10px] font-black text-cyan-400 uppercase tracking-widest min-w-[150px] border-l border-white/10 bg-cyan-500/5">Act. Total</th>
                          <th className="p-4 text-center text-[10px] font-black text-purple-400 uppercase tracking-widest min-w-[150px] border-l border-white/10 bg-purple-500/5">Bgt. Total</th>
                          <th className="p-4 text-center text-[10px] font-black text-emerald-400 uppercase tracking-widest min-w-[120px] border-l border-white/10 bg-emerald-500/5">Var. Total</th>
                        </Fragment>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {(sections || []).map((section, sIdx) => (
                      <Fragment key={sIdx}>
                        <tr className="bg-white/[0.02]">
                          <td className="sticky left-0 z-30 bg-[#1a1a24] p-4 text-[11px] font-black text-cyan-400 uppercase tracking-widest border-b border-white/5" colSpan={(viewMode === "MONTHLY_BUDGET" ? visibleMonths.length * 2 : visibleMonths.length) + (viewMode === "MONTHLY_BUDGET" ? 4 : 2)}>{section.name}</td>
                        </tr>
                        {/* Dynamic Subheads from DB */}
                        {customSubHeads.filter(s => s.headName === section.name).map((subhead, iIdx) => {
                          const item = subhead.name;
                          const totalAct = getRowTotal(item);
                          const totalBgt = getBudgetRowTotal(item);
                          return (
                            <tr key={subhead.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                              <td className="sticky left-0 z-30 p-4 text-sm border-r border-white/5 bg-[#13131A] text-slate-400 font-medium">{item}</td>
                              {visibleMonths.map(m => {
                                const actualVal = gridData[m]?.[item] || 0;
                                const budgetVal = budgetData[m]?.[item] || 0;
                                return viewMode === "STANDARD" ? (
                                  <td key={m} className="p-2 text-center border-l border-white/5 min-w-[120px] font-mono text-xs font-bold text-slate-300">{formatCurrency(actualVal)}</td>
                                ) : (
                                  <Fragment key={m}>
                                    <td className="p-2 text-center border-l border-white/5 min-w-[120px] bg-cyan-500/5 font-mono text-xs font-bold text-cyan-400">{formatCurrency(actualVal)}</td>
                                    <td className="p-2 text-center border-l border-white/5 min-w-[120px] bg-purple-500/5 font-mono text-xs font-bold text-purple-400">{budgetVal > 0 ? formatCurrency(budgetVal) : "-"}</td>
                                  </Fragment>
                                );
                              })}
                              {viewMode === "STANDARD" ? (
                                <td className="p-4 text-center text-sm font-mono font-black text-cyan-400 border-l border-white/10 bg-cyan-500/5">{formatCurrency(totalAct)}</td>
                              ) : (
                                <Fragment>
                                  <td className="p-4 text-center text-sm font-mono font-black text-cyan-400 border-l border-white/10 bg-cyan-500/5">{formatCurrency(totalAct)}</td>
                                  <td className="p-4 text-center text-sm font-mono font-black text-purple-400 border-l border-white/10 bg-purple-500/5">{totalBgt > 0 ? formatCurrency(totalBgt) : "-"}</td>
                                  <td className={`p-4 text-center text-sm font-mono font-black border-l border-white/10 bg-white/[0.02] ${totalBgt > 0 && totalAct > totalBgt ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {totalBgt > 0 ? `${(((totalAct - totalBgt)/totalBgt)*100).toFixed(1)}%` : "-"}
                                  </td>
                                </Fragment>
                              )}
                            </tr>
                          );
                        })}
                        {/* Fixed Calculated Heads */}
                        {section.isCalculated && section.items.map((item: string, iIdx: number) => {
                          const totalAct = getRowTotal(item);
                          const totalBgt = getBudgetRowTotal(item);
                          return (
                            <tr key={iIdx} className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors ${section.isBold ? 'font-bold text-white bg-white/[0.01]' : ''} ${section.isSubtotal ? 'bg-cyan-500/5' : ''}`}>
                              <td className={`sticky left-0 z-30 p-4 text-sm border-r border-white/5 ${section.isBold || section.isTotal ? 'bg-[#181821]' : 'bg-[#13131A] text-slate-400 font-medium'}`}>{item}</td>
                              {visibleMonths.map(m => {
                                const actualVal = calculatedData[m]?.[item] || 0;
                                const budgetVal = calculatedBudgetData[m]?.[item] || 0;
                                return viewMode === "STANDARD" ? (
                                  <td key={m} className="p-2 text-center border-l border-white/5 min-w-[120px] font-mono text-xs font-bold text-slate-300">{formatCurrency(actualVal)}</td>
                                ) : (
                                  <Fragment key={m}>
                                    <td className="p-2 text-center border-l border-white/5 min-w-[120px] bg-cyan-500/5 font-mono text-xs font-bold text-cyan-400">{formatCurrency(actualVal)}</td>
                                    <td className="p-2 text-center border-l border-white/5 min-w-[120px] bg-purple-500/5 font-mono text-xs font-bold text-purple-400">{budgetVal > 0 ? formatCurrency(budgetVal) : "-"}</td>
                                  </Fragment>
                                );
                              })}
                              {viewMode === "STANDARD" ? (
                                <td className="p-4 text-center text-sm font-mono font-black text-cyan-400 border-l border-white/10 bg-cyan-500/5">{formatCurrency(totalAct)}</td>
                              ) : (
                                <Fragment>
                                  <td className="p-4 text-center text-sm font-mono font-black text-cyan-400 border-l border-white/10 bg-cyan-500/5">{formatCurrency(totalAct)}</td>
                                  <td className="p-4 text-center text-sm font-mono font-black text-purple-400 border-l border-white/10 bg-purple-500/5">{totalBgt > 0 ? formatCurrency(totalBgt) : "-"}</td>
                                  <td className={`p-4 text-center text-sm font-mono font-black border-l border-white/10 bg-white/[0.02] ${totalBgt > 0 && totalAct > totalBgt ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {totalBgt > 0 ? `${(((totalAct - totalBgt)/totalBgt)*100).toFixed(1)}%` : "-"}
                                  </td>
                                </Fragment>
                              )}
                            </tr>
                          );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            {/* Extended Financial Performance Components */}
            <PerformanceRatios clientId={client.id} selectedYear={selectedYear} mode="ratios" />
            
            {/* Placeholders for Working Capital, Cash Flow, Expense Intelligence */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl h-48 flex items-center justify-center">
                 <p className="text-slate-500 font-bold uppercase text-xs tracking-widest text-center">Working Capital<br/><span className="text-[10px]">(Under Construction)</span></p>
              </div>
              <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl h-48 flex items-center justify-center">
                 <p className="text-slate-500 font-bold uppercase text-xs tracking-widest text-center">Cash Flow Analysis<br/><span className="text-[10px]">(Under Construction)</span></p>
              </div>
              <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl h-48 flex items-center justify-center">
                 <p className="text-slate-500 font-bold uppercase text-xs tracking-widest text-center">Expense Intelligence<br/><span className="text-[10px]">(Under Construction)</span></p>
              </div>
            </div>
            </div>
          </ErrorBoundary>
        )}

          {activeTab === "analytics" && (
            <ErrorBoundary title="Business Analytics Error">
              <AnalyticsDashboard 
                clientId={client.id} 
                selectedYear={selectedYear} 
                displayCurrency={displayCurrency} 
              />
            </ErrorBoundary>
          )}

          {activeTab === "compliance" && (
            <ErrorBoundary title="Compliance Module Error">
              <div className="space-y-8">
                <ExceptionDashboard 
                  clientId={client.id} 
                  selectedYear={selectedYear} 
                  displayCurrency={displayCurrency} 
                />
                <ComplianceDashboard 
                  clientId={client.id} 
                  selectedYear={selectedYear} 
                  displayCurrency={displayCurrency} 
                />
                <ScrutinyDashboard 
                  clientId={client.id} 
                  selectedYear={selectedYear} 
                  displayCurrency={displayCurrency} 
                />
              </div>
            </ErrorBoundary>
          )}

          {activeTab === "risk" && (
            <ErrorBoundary title="Risk Module Error">
              <div className="flex items-center justify-center h-64 bg-[#13131A] rounded-3xl border border-white/5 shadow-xl">
                <div className="text-center">
                  <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Risk Intelligence Module (Under Construction)</p>
                </div>
              </div>
            </ErrorBoundary>
          )}

          {activeTab === "advisory" && (
            <ErrorBoundary title="Advisory Module Error">
              <div className="flex items-center justify-center h-64 bg-[#13131A] rounded-3xl border border-white/5 shadow-xl">
                <div className="text-center">
                  <Briefcase className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                  <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Strategic Advisory Module (Under Construction)</p>
                </div>
              </div>
            </ErrorBoundary>
          )}

          {activeTab === "diagnostics" && (
            <ErrorBoundary title="Diagnostics Module Error">
              <div className="space-y-8">
              <div className="bg-[#13131A] border border-white/5 rounded-3xl p-8 shadow-xl">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center"><RefreshCw className="w-6 h-6 text-emerald-400" /></div>
                    <div>
                      <h3 className="text-xl font-black text-white">Sync Diagnostics</h3>
                      <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Live data tracing from {softwareConfig.label}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 items-center">
                    <button 
                      onClick={handleResetSync}
                      className="px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] font-black text-rose-400 hover:bg-rose-500/20 transition-all flex items-center gap-2"
                    >
                      <AlertCircle className="w-3 h-3" /> Force Reset Sync
                    </button>
                    <div className="flex gap-4 text-right">
                    {isMounted && client.devices?.[0] && (
                      <div className="px-6 py-2 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl">
                        <p className="text-[10px] text-cyan-500 font-black uppercase tracking-widest mb-1">Active Device</p>
                        <p className="text-sm text-white font-black">{client.devices[0].name}</p>
                        <p className="text-[9px] text-slate-500 font-bold mt-0.5">Last Seen: {new Date(client.devices[0].lastSeen).toLocaleString()}</p>
                      </div>
                    )}
                    <div className="px-6 py-2 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl">
                      <p className="text-[10px] text-emerald-500 font-black uppercase tracking-widest mb-1">Organization</p>
                      <p className="text-sm text-white font-black">{syncDiagnostic?.orgName || "Not Synced"}</p>
                    </div>
                    </div>
                  </div>
                </div>

                {topBalancesSample.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {topBalancesSample.map((m: any) => (
                      <div key={m.month} className="bg-black/20 p-6 rounded-3xl border border-white/5 group hover:border-emerald-500/30 transition-all">
                        <div className="text-emerald-400 text-[10px] font-black uppercase tracking-[0.2em] mb-4 pb-2 border-b border-white/5">{m.month}</div>
                        <div className="space-y-3">
                          {m.heads.map(([head, bal]: any) => (
                            <div key={head} className="flex justify-between items-center text-[10px]">
                              <span className="text-slate-500 font-bold truncate max-w-[140px]">{head}</span>
                              <span className="text-white font-mono font-black">{formatCurrency(bal)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center bg-black/20 rounded-3xl border border-dashed border-white/10">
                    <RefreshCw className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Run a Zoho Sync to generate diagnostics</p>
                  </div>
                )}

                {syncDiagnostic?.allNames && (
                  <div className="mt-8 p-6 bg-black/20 rounded-3xl border border-white/5">
                    <h4 className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-4">Software Ledger Names Discovered</h4>
                    <div className="flex flex-wrap gap-2">
                      {syncDiagnostic.allNames.map((name: string) => (
                        <span key={name} className="px-2 py-1 bg-white/5 rounded text-[9px] text-slate-400 font-mono border border-white/5">{name}</span>
                      ))}
                    </div>
                  </div>
                  )}
                </div>
              </div>
            </ErrorBoundary>
          )}
        </div>

      </main>

      {/* MODALS */}
      {isMappingOpen && <PNLMappingModal clientId={client.id} sections={sections} onClose={() => { setIsMappingOpen(false); fetchAllData(); }} />}
      {isBudgetOpen && <BudgetUploadModal clientId={client.id} currentYear={selectedYear} fyType={fyType} sections={sections} onClose={() => { setIsBudgetOpen(false); fetchAllData(); }} />}
      {isTBUploadOpen && <TrialBalanceUploadModal clientId={client.id} onClose={() => { setIsTBUploadOpen(false); fetchAllData(); }} />}
      {isManagingStructure && <PNLStructureModal clientId={client.id} sections={sections} onClose={() => { setIsManagingStructure(false); fetchAllData(); }} />}
      <AICFOReport 
        isOpen={isMISModalOpen} 
        onClose={() => setIsMISModalOpen(false)} 
        clientId={client.id}
        clientName={client.name} 
        selectedYear={selectedYear}
      />


      {loading && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <RefreshCw className="w-12 h-12 text-cyan-500 animate-spin" />
            <p className="text-cyan-400 font-black text-xs uppercase tracking-[0.2em] animate-pulse">Loading Intelligence...</p>
          </div>
        </div>
      )}
    </div>
  );
}
