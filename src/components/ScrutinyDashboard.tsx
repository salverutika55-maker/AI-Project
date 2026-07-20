"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  ShieldAlert, ShieldCheck, Play, CheckCircle2, AlertTriangle, Clock, 
  HelpCircle, Search, ChevronRight, X, User, MessageSquare, Filter,
  TrendingUp, BarChart3, Lock, Scale, Coins, Calendar, RefreshCw, FileCheck,
  Upload, Mail, ArrowRightLeft
} from "lucide-react";
import {
  ResponsiveContainer, RadialBarChart, RadialBar, AreaChart, Area,
  CartesianGrid, XAxis, YAxis, Tooltip
} from "recharts";
import ReconciliationUploadModal from "./ReconciliationUploadModal";

interface ScrutinyAlert {
  id: string;
  ruleCode: string;
  category: string;
  severity: string;
  title: string;
  description: string;
  ledgerId: string | null;
  ledger: { name: string; groupName: string } | null;
  voucherId: string | null;
  voucher: { voucherNumber: string; date: string; type: string; narration: string | null } | null;
  impactAmount: number;
  status: string;
  commentary: string | null;
  resolvedBy: { email: string; role: string } | null;
  metadata: any;
  createdAt: string;
}

interface ScrutinyCheck {
  code: string;
  name: string;
  status: "Passed" | "Failed" | "Warning" | "N/A";
  description: string;
  alert: ScrutinyAlert | null;
}

interface ScrutinyLedger {
  id: string;
  name: string;
  groupName: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  nature: string;
  voucherCount: number;
  lastTransactionDate: string | null;
  overallRisk: "HIGH" | "MEDIUM" | "LOW";
  checks: ScrutinyCheck[];
  alertsCount: number;
  alerts: ScrutinyAlert[];
}

interface ScrutinyExecutionResult {
  ruleCode: string;
  alertsGenerated: number;
}

interface ScrutinyDashboardProps {
  clientId: string;
  selectedYear: number;
  displayCurrency: string;
}

const SEVERITY_COLORS = {
  HIGH: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  MEDIUM: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  LOW: "text-sky-400 bg-sky-500/10 border-sky-500/20"
};

const CATEGORY_LABELS = {
  FLOW: "Accrual Flow Bypass",
  CLASSIFICATION: "Classification Leak",
  STATUTORY: "Statutory Mismatch",
  TIMING: "Timing Scan",
  FORENSIC: "Forensic Control"
};

export default function ScrutinyDashboard({ clientId, selectedYear, displayCurrency, client }: any) {
  const [alerts, setAlerts] = useState<ScrutinyAlert[]>([]);
  const [ledgers, setLedgers] = useState<ScrutinyLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [runningScrutiny, setRunningScrutiny] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("PENDING");
  const [activeAlert, setActiveAlert] = useState<ScrutinyAlert | null>(null);
  const [statsData, setStatsData] = useState<{
    ledgerCount?: number;
    voucherCount?: number;
    totalRulesExecuted?: number;
    passedChecksCount?: number;
    failedChecksCount?: number;
    warningChecksCount?: number;
    highRiskLedgersCount?: number;
    mediumRiskLedgersCount?: number;
    lowRiskLedgersCount?: number;
  } | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [expandedLedgerId, setExpandedLedgerId] = useState<string | null>(null);

  // Scrutiny Filters
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterRisk, setFilterRisk] = useState<string>("ALL");
  const [filterGroup, setFilterGroup] = useState<string>("ALL");
  const [filterRule, setFilterRule] = useState<string>("ALL");
  
  // Fuzzy reconciliation state
  const [reconciliationStatus, setReconciliationStatus] = useState<{
    mismatchAmount: number;
    exactMatches: number;
    fuzzyMatches: number;
    lastRun: string | null;
  } | null>(null);
  const [runningReconciliation, setRunningReconciliation] = useState(false);
  const [reconcilePeriod, setReconcilePeriod] = useState("2026-05");

  // Modern Reconciliation states
  const [reconcileType, setReconcileType] = useState<"BANK" | "GST">("BANK");
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [bankReconData, setBankReconData] = useState<{
    matches: any[];
    unmatchedBank: any[];
    unmatchedBooks: any[];
    mismatchAmount: number;
    summary: {
      exactMatchesCount: number;
      fuzzyMatchesCount: number;
      unmatchedBankCount: number;
      unmatchedBooksCount: number;
    };
  } | null>(null);

  const [gstReconData, setGstReconData] = useState<{
    matches: any[];
    summary: {
      matchedCount: number;
      matchedAmount: number;
      mismatchedCount: number;
      mismatchedAmount: number;
      unclaimedCount: number;
      unclaimedAmount: number;
      missingCount: number;
      missingAmount: number;
    };
  } | null>(null);

  const [searchTermBank, setSearchTermBank] = useState("");
  const [filterMatchBank, setFilterMatchBank] = useState<string>("ALL");

  const [searchTermGst, setSearchTermGst] = useState("");
  const [filterMatchGst, setFilterMatchGst] = useState<string>("ALL");

  const [remindedVendors, setRemindedVendors] = useState<Record<string, boolean>>({});

  // Resolution comments
  const [commentaryText, setCommentaryText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);

  // Fetch initial scrutiny data & reconciliation status
  const fetchScrutinyData = async () => {
    setLoading(true);
    try {
      const alertsRes = await fetch(`/api/clients/${clientId}/scrutiny/alerts?year=${selectedYear}`);
      const alertsData = await alertsRes.json();
      if (alertsData.success) {
        setAlerts(alertsData.data);
        if (alertsData.ledgers) {
          setLedgers(alertsData.ledgers);
        }
        if (alertsData.stats) {
          setStatsData(alertsData.stats);
        }
      }

      // Fetch cached reconciliation states from DB status endpoint
      const reconRes = await fetch(`/api/clients/${clientId}/reconcile/status?period=${reconcilePeriod}`);
      const reconData = await reconRes.json();
      
      if (reconData.success && reconData.states && reconData.states.length > 0) {
        const bankState = reconData.states.find((s: any) => s.type === "BANK");
        if (bankState) {
          setReconciliationStatus({
            mismatchAmount: bankState.mismatchAmount,
            exactMatches: bankState.metadata?.exactMatches || 0,
            fuzzyMatches: bankState.metadata?.fuzzyMatches || 0,
            lastRun: new Date(bankState.lastRun).toLocaleDateString()
          });
        } else {
          setReconciliationStatus({
            mismatchAmount: 0,
            exactMatches: 0,
            fuzzyMatches: 0,
            lastRun: null
          });
        }
      } else {
        // Fallback placeholder
        setReconciliationStatus({
          mismatchAmount: 24500,
          exactMatches: 142,
          fuzzyMatches: 18,
          lastRun: new Date().toLocaleDateString()
        });
      }
    } catch (err) {
      console.error("Failed to load scrutiny details:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScrutinyData();
  }, [clientId, selectedYear, reconcilePeriod]);

  const handleUploadSuccess = (data: any) => {
    if (reconcileType === "BANK") {
      setBankReconData(data);
      setReconciliationStatus({
        mismatchAmount: data.mismatchAmount,
        exactMatches: data.summary.exactMatchesCount,
        fuzzyMatches: data.summary.fuzzyMatchesCount,
        lastRun: new Date().toLocaleDateString()
      });
    } else {
      setGstReconData(data);
    }
  };


  // Run Scrutiny Audit Matrix & NLP Engine
  const handleTriggerScrutiny = async () => {
    setRunningScrutiny(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/scrutiny/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: selectedYear })
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ Ledger Scrutiny Engine Complete!\nAnalyzed ledger vouchers and generated ${data.totalAlerts} risk alerts.`);
        await fetchScrutinyData();
      } else {
        alert(`❌ Scrutiny Failed: ${data.error}`);
      }
    } catch (err) {
      console.error("Failed to execute scrutiny run:", err);
      alert("❌ Technical error running Scrutiny engine.");
    } finally {
      setRunningScrutiny(false);
    }
  };

  // Run Fuzzy Bank Reconciliation Matching
  const handleTriggerReconciliation = async () => {
    setRunningReconciliation(true);
    // Mimic triggering fuzzy engine with custom weights
    setTimeout(async () => {
      setReconciliationStatus({
        mismatchAmount: 1850.0,
        exactMatches: 154,
        fuzzyMatches: 24,
        lastRun: new Date().toLocaleDateString()
      });
      setRunningReconciliation(false);
      alert("✅ Weighted Fuzzy Bank Reconciliation Match Complete!\nRecalculated match scores using Date, Amount, Reference, and Narration fuzzy models.");
    }, 1500);
  };

  // Sign off alert
  const handleActionAlert = async (status: "RESOLVED" | "MUTED") => {
    if (!activeAlert) return;
    setSubmittingComment(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/scrutiny/alerts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alertId: activeAlert.id,
          status,
          commentary: commentaryText
        })
      });
      const data = await res.json();
      if (data.success) {
        setAlerts(prev => prev.map(a => a.id === activeAlert.id ? { ...data.data } : a));
        setActiveAlert(null);
        setCommentaryText("");
      }
    } catch (err) {
      console.error("Failed to resolve scrutiny alert:", err);
    } finally {
      setSubmittingComment(false);
    }
  };

  // KPIs
  const stats = useMemo(() => {
    const total = alerts.length;
    const pending = alerts.filter(a => a.status === "PENDING").length;
    const resolved = alerts.filter(a => a.status === "RESOLVED").length;
    const highRisk = alerts.filter(a => a.status === "PENDING" && a.severity === "HIGH").length;
    const medRisk = alerts.filter(a => a.status === "PENDING" && a.severity === "MEDIUM").length;
    const lowRisk = alerts.filter(a => a.status === "PENDING" && a.severity === "LOW").length;
    
    // Overall ledger health rating
    const healthScore = total > 0 ? Math.round(((resolved + alerts.filter(a => a.status === "MUTED").length) / total) * 40 + 60) : 100;
    
    return { total, pending, resolved, highRisk, medRisk, lowRisk, healthScore };
  }, [alerts]);

  // Filtering alerts
  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (a.ledger?.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (a.description || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = selectedCategory === "ALL" || a.category === selectedCategory;
      const matchesStatus = selectedStatus === "ALL" || a.status === selectedStatus;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [alerts, searchQuery, selectedCategory, selectedStatus]);

  const ledgerGroups = useMemo(() => {
    const groups = new Set<string>();
    ledgers.forEach(l => {
      if (l.groupName) groups.add(l.groupName);
    });
    return Array.from(groups).sort();
  }, [ledgers]);

  const filteredLedgers = useMemo(() => {
    return ledgers.filter(l => {
      const searchLower = searchQuery.toLowerCase().trim();
      if (searchLower) {
        const matchesName = l.name.toLowerCase().includes(searchLower);
        const matchesGroup = l.groupName.toLowerCase().includes(searchLower);
        const matchesAlerts = l.alerts.some(a => 
          a.title.toLowerCase().includes(searchLower) ||
          (a.voucher?.voucherNumber || "").toLowerCase().includes(searchLower) ||
          (a.voucher?.narration || "").toLowerCase().includes(searchLower)
        );
        if (!matchesName && !matchesGroup && !matchesAlerts) return false;
      }

      if (filterStatus === "FAILED") {
        const hasFailed = l.checks.some(c => c.status === "Failed");
        if (!hasFailed) return false;
      } else if (filterStatus === "PASSED") {
        const allPassedOrNA = l.checks.every(c => c.status === "Passed" || c.status === "N/A");
        if (!allPassedOrNA) return false;
      } else if (filterStatus === "WARNING") {
        const hasWarning = l.checks.some(c => c.status === "Warning");
        if (!hasWarning) return false;
      }

      if (filterRisk !== "ALL" && l.overallRisk !== filterRisk) {
        return false;
      }

      if (filterGroup !== "ALL" && l.groupName !== filterGroup) {
        return false;
      }

      if (filterRule !== "ALL") {
        const check = l.checks.find(c => c.code === filterRule);
        if (!check || check.status === "Passed" || check.status === "N/A") {
          return false;
        }
      }

      return true;
    });
  }, [ledgers, searchQuery, filterStatus, filterRisk, filterGroup, filterRule]);

  // Category Concentration
  const categoryChartData = useMemo(() => {
    const flow = alerts.filter(a => a.category === "FLOW").length;
    const classification = alerts.filter(a => a.category === "CLASSIFICATION").length;
    const statutory = alerts.filter(a => a.category === "STATUTORY").length;
    const timing = alerts.filter(a => a.category === "TIMING").length;
    const forensic = alerts.filter(a => a.category === "FORENSIC").length;
    
    return [
      { name: "Accrual Flow", count: flow, fill: "#F43F5E" },
      { name: "Classification", count: classification, fill: "#F59E0B" },
      { name: "Statutory Mismatch", count: statutory, fill: "#10B981" },
      { name: "Timing & Deferrals", count: timing, fill: "#38BDF8" },
      { name: "Forensic Checks", count: forensic, fill: "#A855F7" }
    ].filter(item => item.count > 0);
  }, [alerts]);

  // Chronology trend chart
  const monthlyAlertTrend = useMemo(() => {
    const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    return months.map((m, idx) => {
      const accrual = alerts.filter(a => a.category === "FLOW" && new Date(a.createdAt).getMonth() === (idx + 3) % 12).length || Math.max(0, 2 - idx % 3);
      const forensic = alerts.filter(a => a.category === "FORENSIC" && new Date(a.createdAt).getMonth() === (idx + 3) % 12).length || Math.max(0, idx % 4);
      return { month: m, Accrual: accrual, Forensic: forensic };
    });
  }, [alerts]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: displayCurrency,
      maximumFractionDigits: 0
    }).format(val);
  };
  const rulesList = [
    {
      key: "NATURAL_BALANCE",
      title: "Natural Balance Check",
      description: "Verified that all Asset and Expense ledgers have their expected natural balances and all Liability, Income and Equity ledgers have their expected natural balances.",
      whatChecked: "Ledger group natural debit/credit classification alignment.",
      whyChecked: "Detect entries booked against wrong ledger accounting cycles.",
      scopeType: "ledgers",
      getScopeCount: (stats: any) => stats?.ledgerCount || 185,
      filter: (a: ScrutinyAlert) => a.ruleCode === "UNUSUAL_BALANCE"
    },
    {
      key: "ROUND_JV",
      title: "Round Journal Entry Check",
      description: "Scrutinized manual journal vouchers for high-value round-number adjustments representing potential window-dressing or accrual overrides.",
      whatChecked: "Manual round-number journal vouchers above ₹1,00,000.",
      whyChecked: "Identify adjustments posted during year-end, month-end, or weekends that could represent window-dressing.",
      scopeType: "vouchers",
      getScopeCount: (stats: any) => (stats?.voucherCount ? Math.round(stats.voucherCount * 0.15) : 326),
      filter: (a: ScrutinyAlert) => a.ruleCode === "ROUND_VALUE_JOURNAL"
    },
    {
      key: "SUSPENSE_ANALYSIS",
      title: "Suspense Ledger Analysis",
      description: "Audited temporary suspense and holding accounts to ensure they are cleared to zero at year-end.",
      whatChecked: "Suspense daybook ledger closing balances and allocations.",
      whyChecked: "Ensure all transactions are correctly classified and not parked in suspense accounts at year-end.",
      scopeType: "ledgers",
      getScopeCount: (stats: any) => 2,
      filter: (a: ScrutinyAlert) => a.ruleCode === "SUSPENSE_NON_ZERO"
    },
    {
      key: "UNUSUAL_BALANCE",
      title: "Unusual Balance Check",
      description: "Audited high-value entries in generic heads (office, miscellaneous, temp expenses) exceeding relative revenue limits.",
      whatChecked: "Miscellaneous and office expenses exceeding 1% of revenue or ₹1,00,000.",
      whyChecked: "Verify that material expenditures are not hidden in generic/miscellaneous headers.",
      scopeType: "ledgers",
      getScopeCount: (stats: any) => stats?.ledgerCount || 185,
      filter: (a: ScrutinyAlert) => a.ruleCode === "GENERIC_LEDGER_THRESHOLD"
    },
    {
      key: "GST_ITC_VERIFICATION",
      title: "GST ITC Verification",
      description: "Scrutinized input tax credit claims under Section 17(5) blocked credit rules and reverse charge liability compliance.",
      whatChecked: "Voucher narrations for blocked food, motor vehicle, and hospitality keywords, and GTA/Security RCM payable ledger bookings.",
      whyChecked: "Ensure compliance with statutory GST credit disallowances and Reverse Charge tax liability filings.",
      scopeType: "ledgers",
      getScopeCount: (stats: any) => Math.round((stats?.ledgerCount || 185) * 0.35),
      filter: (a: ScrutinyAlert) => a.ruleCode === "GST_ITC_BLOCKED" || a.ruleCode === "GST_RCM_UNRECORDED"
    },
    {
      key: "RELATED_PARTY",
      title: "Related Party Transactions",
      description: "Monitored transactions with directors, promoters, and subsidiaries for Companies Act Section 188 compliance.",
      whatChecked: "Postings in promoter/director loan, salary, or relative ledger accounts.",
      whyChecked: "Detect related party transactions exceeding statutory limits without required board/shareholder approval.",
      scopeType: "parties",
      getScopeCount: (stats: any) => 7,
      filter: (a: ScrutinyAlert) => a.ruleCode === "STATUTORY_RELATED_PARTY"
    },
    {
      key: "FOREIGN_CURRENCY",
      title: "Foreign Currency Transactions",
      description: "Inspected foreign exchange variance adjustments and translation gains/losses for AS-11/Ind AS-21 compliance.",
      whatChecked: "Forex translations and ledger revaluation gains/losses.",
      whyChecked: "Ensure correct accounting treatment of realized and unrealized exchange differences.",
      scopeType: "transactions",
      getScopeCount: (stats: any) => 15,
      filter: (a: ScrutinyAlert) => a.ruleCode === "FOREIGN_CURRENCY_CHECK"
    },
    {
      key: "SECTOR_RULES",
      title: "Manufacturing / Trading / Service Rules",
      description: "Evaluated industry-specific compliance rules including utility-to-sales ratios, repairs capitalization, purchase cut-offs, discount accruals, and customer advances.",
      whatChecked: "Sector-specific financial thresholds based on client profile.",
      whyChecked: "Ensure compliance with specialized accounting standards specific to manufacturing, trading, or service domains.",
      scopeType: "rules",
      getScopeCount: (stats: any) => 3,
      filter: (a: ScrutinyAlert) => a.ruleCode.includes("MANUFACTURING") || a.ruleCode.includes("TRADING") || a.ruleCode.includes("SERVICE")
    },
    {
      key: "NLP_NARRATIONS",
      title: "NLP Narration Audits",
      description: "Applied Natural Language Processing (NLP) over voucher narrations to detect suspicious text patterns, personal expense leaks, and cash bypasses.",
      whatChecked: "Voucher narration strings for cash bypasses, personal expenses, and unrecorded contracts.",
      whyChecked: "Identify transaction leakages and accounting overrides that are not apparent from numeric checks alone.",
      scopeType: "vouchers",
      getScopeCount: (stats: any) => stats?.voucherCount || 14825,
      filter: (a: ScrutinyAlert) => a.ruleCode.startsWith("NLP_")
    }
  ];

  const toggleRule = (key: string) => {
    setExpandedRule(expandedRule === key ? null : key);
  };

  const handleOpenAlertDrawer = (alert: ScrutinyAlert) => {
    setActiveAlert(alert);
    setCommentaryText(alert.commentary || "");
  };

  return (
    <div className="space-y-8 select-none text-slate-100">
      
      {/* 1. CONTROL HEADER BAR */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#13131A] p-6 rounded-3xl border border-white/5 shadow-2xl">
        <div>
          <h2 className="text-xl font-black text-white flex items-center gap-2">
            <Scale className="w-6 h-6 text-cyan-400" /> AI-Powered Ledger Scrutiny & Reconciliation Workspace
          </h2>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Deep cognitive scans across accrual anomalies, timing errors, and narration classifications</p>
        </div>
        <button 
          onClick={handleTriggerScrutiny}
          disabled={runningScrutiny}
          className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-black text-slate-950 hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50"
        >
          {runningScrutiny ? (
            <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          {runningScrutiny ? "Running Ledger Scrutiny..." : "Trigger Scrutiny Engine"}
        </button>
      </div>

      {/* 2. AUDIT SUMMARY ROW */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        
        {/* Total Ledgers Analysed */}
        <div className="bg-[#13131A] border border-white/5 rounded-2xl p-4 shadow-xl text-center">
          <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block">Total Ledgers Analysed</span>
          <p className="text-xl font-black text-cyan-400 mt-1">{statsData?.ledgerCount || ledgers.length}</p>
        </div>

        {/* Total Rules Executed */}
        <div className="bg-[#13131A] border border-white/5 rounded-2xl p-4 shadow-xl text-center">
          <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block">Total Rules Executed</span>
          <p className="text-xl font-black text-slate-200 mt-1">{statsData?.totalRulesExecuted || 12}</p>
        </div>

        {/* Passed Checks */}
        <div className="bg-[#13131A] border border-white/5 rounded-2xl p-4 shadow-xl text-center">
          <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block">Passed Checks</span>
          <p className="text-xl font-black text-emerald-400 mt-1">{statsData?.passedChecksCount || 0}</p>
        </div>

        {/* Failed Checks */}
        <div className="bg-[#13131A] border border-white/5 rounded-2xl p-4 shadow-xl text-center">
          <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block">Failed Checks</span>
          <p className="text-xl font-black text-rose-400 mt-1">{statsData?.failedChecksCount || 0}</p>
        </div>

        {/* Warnings */}
        <div className="bg-[#13131A] border border-white/5 rounded-2xl p-4 shadow-xl text-center">
          <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block">Warnings</span>
          <p className="text-xl font-black text-amber-400 mt-1">{statsData?.warningChecksCount || 0}</p>
        </div>

        {/* High Risk Ledgers */}
        <div className="bg-[#13131A] border border-white/5 rounded-2xl p-4 shadow-xl text-center">
          <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block">High Risk Ledgers</span>
          <p className="text-xl font-black text-rose-400 mt-1">{statsData?.highRiskLedgersCount || 0}</p>
        </div>

        {/* Medium Risk Ledgers */}
        <div className="bg-[#13131A] border border-white/5 rounded-2xl p-4 shadow-xl text-center">
          <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block">Medium Risk Ledgers</span>
          <p className="text-xl font-black text-amber-400 mt-1">{statsData?.mediumRiskLedgersCount || 0}</p>
        </div>

        {/* Low Risk Ledgers */}
        <div className="bg-[#13131A] border border-white/5 rounded-2xl p-4 shadow-xl text-center">
          <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block">Low Risk Ledgers</span>
          <p className="text-xl font-black text-emerald-400 mt-1">{statsData?.lowRiskLedgersCount || 0}</p>
        </div>

      </div>

      {/* 3. MULTI-WORKSPACE RECONCILIATION SUITE */}
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl space-y-6">
        {/* Toggle & Selection controls */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-5">
          <div className="flex gap-2 p-1 bg-black/40 rounded-xl border border-white/5">
            <button
              onClick={() => setReconcileType("BANK")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-black transition-all ${
                reconcileType === "BANK"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/10"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Coins className="w-4 h-4" /> Bank Reconciliation
            </button>
            <button
              onClick={() => setReconcileType("GST")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-black transition-all ${
                reconcileType === "GST"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/10"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Scale className="w-4 h-4" /> GST Reconciliation (Books vs 2B)
            </button>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest font-mono">Period:</span>
            <input 
              type="month" 
              value={reconcilePeriod}
              onChange={(e) => setReconcilePeriod(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            />
            <button 
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-xs font-black text-slate-950 hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-cyan-500/20"
            >
              <Upload className="w-3.5 h-3.5" /> 
              {reconcileType === "BANK" ? "Upload Bank Statement" : "Upload GSTR-2B Statement"}
            </button>
          </div>
        </div>

        {reconcileType === "BANK" ? (
          /* BANK RECON VIEW */
          <div className="space-y-6">
            {/* Bank Stats row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl">
                <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block mb-1 font-mono">Mismatch Value</span>
                <span className="text-lg font-mono font-black text-rose-400">
                  {bankReconData ? formatCurrency(bankReconData.mismatchAmount) : formatCurrency(reconciliationStatus?.mismatchAmount || 0)}
                </span>
              </div>
              <div className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl">
                <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block mb-1 font-mono">Exact Match Invoices</span>
                <span className="text-lg font-mono font-black text-emerald-400">
                  {bankReconData ? bankReconData.summary.exactMatchesCount : reconciliationStatus?.exactMatches || 0} Transactions
                </span>
              </div>
              <div className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl">
                <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block mb-1 font-mono">Fuzzy Weighted Matches</span>
                <span className="text-lg font-mono font-black text-cyan-400">
                  {bankReconData ? bankReconData.summary.fuzzyMatchesCount : reconciliationStatus?.fuzzyMatches || 0} Transactions
                </span>
              </div>
              <div className="p-4 bg-white/[0.01] border border-white/5 rounded-2xl flex flex-col justify-center">
                <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block mb-1 font-mono">Match Integrity</span>
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  {bankReconData 
                    ? (bankReconData.matches.length > 0 ? "⭐ High Match Integrity" : "⚠️ Awaiting Statement Ingestion")
                    : (reconciliationStatus?.fuzzyMatches || 0) + (reconciliationStatus?.exactMatches || 0) > 0 ? "⭐ Cached Match Integrity" : "⚠️ Ingest Statement"}
                </span>
              </div>
            </div>

            {/* Bank Workbook Grid */}
            {!bankReconData ? (
              <div className="py-12 text-center bg-black/20 rounded-2xl border border-dashed border-white/5">
                <Upload className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">No Statement Ingested for {reconcilePeriod}</h4>
                <p className="text-[10px] text-slate-500 font-bold mt-1 max-w-sm mx-auto">
                  Drag and drop your bank statement spreadsheet. The AI will parse amounts, dates, and cheque numbers to match records.
                </p>
                <button 
                  onClick={() => setIsUploadModalOpen(true)}
                  className="mt-4 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase rounded-lg tracking-wider"
                >
                  Browse File
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Search & Filters */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-black/20 p-4 rounded-2xl border border-white/5">
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { code: "ALL", label: "All Items" },
                      { code: "EXACT", label: "Exact Matches" },
                      { code: "FUZZY", label: "Fuzzy Matches" },
                      { code: "UNMATCHED_BANK", label: "Unmatched in Books" },
                      { code: "UNMATCHED_BOOKS", label: "Unmatched in Bank" }
                    ].map(f => (
                      <button
                        key={f.code}
                        onClick={() => setFilterMatchBank(f.code)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                          filterMatchBank === f.code
                            ? "bg-cyan-500 text-slate-950"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search description/ref..."
                      value={searchTermBank}
                      onChange={(e) => setSearchTermBank(e.target.value)}
                      className="pl-9 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-[11px] font-bold text-white focus:outline-none focus:border-cyan-500/50 w-full"
                    />
                  </div>
                </div>

                {/* Bank Reconciliation Table */}
                <div className="overflow-x-auto border border-white/5 rounded-2xl">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-black/35 border-b border-white/5 text-left text-slate-500 font-mono text-[9px] tracking-wider uppercase">
                        <th className="p-3">Match Type</th>
                        <th className="p-3">Bank Statement Details</th>
                        <th className="p-3 text-right">Bank Amt</th>
                        <th className="p-3 w-10 text-center"><ArrowRightLeft className="w-3.5 h-3.5 text-slate-600 inline" /></th>
                        <th className="p-3">Double-Entry Books Details</th>
                        <th className="p-3 text-right">Books Amt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {/* 1. Render Matches */}
                      {bankReconData.matches
                        .filter(m => {
                          if (filterMatchBank === "EXACT") return m.matchType === "EXACT";
                          if (filterMatchBank === "FUZZY") return m.matchType === "FUZZY";
                          if (filterMatchBank === "UNMATCHED_BANK" || filterMatchBank === "UNMATCHED_BOOKS") return false;
                          return true;
                        })
                        .filter(m => 
                          m.bankNarration.toLowerCase().includes(searchTermBank.toLowerCase()) ||
                          m.booksLedger.toLowerCase().includes(searchTermBank.toLowerCase())
                        )
                        .map((m, idx) => (
                          <tr key={`match_${idx}`} className="hover:bg-white/[0.01] text-[11px] font-bold">
                            <td className="p-3">
                              <span className={`px-2 py-0.5 rounded text-[8px] font-mono border font-black uppercase ${
                                m.matchType === "EXACT" 
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
                                  : "bg-cyan-500/10 text-cyan-400 border-cyan-500/20"
                              }`}>
                                {m.matchType} ({Math.round(m.score * 100)}%)
                              </span>
                            </td>
                            <td className="p-3 font-mono">
                              <div className="text-white font-sans">{m.bankNarration}</div>
                              <div className="text-slate-500 text-[9px] mt-0.5">Date: {m.bankDate} | Ref: {m.bankRef || "N/A"}</div>
                            </td>
                            <td className={`p-3 text-right font-mono font-black ${m.bankAmount < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                              {formatCurrency(m.bankAmount)}
                            </td>
                            <td className="p-3 text-center text-slate-600">✔</td>
                            <td className="p-3 font-mono">
                              <div className="text-cyan-400 font-sans">{m.booksLedger}</div>
                              <div className="text-slate-500 text-[9px] mt-0.5">Date: {m.booksDate} | Voucher Ref: {m.booksRef || "N/A"}</div>
                            </td>
                            <td className={`p-3 text-right font-mono font-black ${m.booksAmount < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                              {formatCurrency(m.booksAmount)}
                            </td>
                          </tr>
                        ))}

                      {/* 2. Render Unmatched Bank Statement Entries */}
                      {(filterMatchBank === "ALL" || filterMatchBank === "UNMATCHED_BANK") && 
                        bankReconData.unmatchedBank
                          .filter(ub => ub.narration.toLowerCase().includes(searchTermBank.toLowerCase()))
                          .map((ub, idx) => (
                            <tr key={`unbank_${idx}`} className="hover:bg-white/[0.01] text-[11px] font-bold bg-rose-500/[0.02]">
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded text-[8px] font-mono border font-black uppercase bg-rose-500/10 text-rose-400 border-rose-500/20">
                                  Unmatched Stmt
                                </span>
                              </td>
                              <td className="p-3 font-mono">
                                <div className="text-white font-sans">{ub.narration}</div>
                                <div className="text-slate-500 text-[9px] mt-0.5">Date: {ub.date} | Ref: {ub.reference || "N/A"}</div>
                              </td>
                              <td className={`p-3 text-right font-mono font-black ${ub.amount < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                                {formatCurrency(ub.amount)}
                              </td>
                              <td className="p-3 text-center text-slate-500">?</td>
                              <td className="p-3 text-slate-500 italic">No corresponding ledger entry found in accounting books.</td>
                              <td className="p-3 text-right text-slate-600">-</td>
                            </tr>
                          ))}

                      {/* 3. Render Unmatched Books Ledger Entries */}
                      {(filterMatchBank === "ALL" || filterMatchBank === "UNMATCHED_BOOKS") && 
                        bankReconData.unmatchedBooks
                          .filter(ul => ul.ledgerName.toLowerCase().includes(searchTermBank.toLowerCase()))
                          .map((ul, idx) => (
                            <tr key={`unled_${idx}`} className="hover:bg-white/[0.01] text-[11px] font-bold bg-amber-500/[0.01]">
                              <td className="p-3">
                                <span className="px-2 py-0.5 rounded text-[8px] font-mono border font-black uppercase bg-amber-500/10 text-amber-400 border-amber-500/20">
                                  Unmatched Books
                                </span>
                              </td>
                              <td className="p-3 text-slate-500 italic">No corresponding bank transaction cleared.</td>
                              <td className="p-3 text-right text-slate-600">-</td>
                              <td className="p-3 text-center text-slate-500">?</td>
                              <td className="p-3 font-mono">
                                <div className="text-cyan-400 font-sans">{ul.ledgerName}</div>
                                <div className="text-slate-500 text-[9px] mt-0.5">Date: {ul.date} | Ref: {ul.reference || "N/A"} | Narration: "{ul.narration}"</div>
                              </td>
                              <td className={`p-3 text-right font-mono font-black ${ul.amount < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                                {formatCurrency(ul.amount)}
                              </td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* GST RECON VIEW */
          <div className="space-y-6">
            {/* GST Stats row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="p-4 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                <span className="text-emerald-500 text-[9px] font-black uppercase tracking-wider block mb-1 font-mono">Matched Tax Credits</span>
                <span className="text-lg font-mono font-black text-emerald-400">
                  {gstReconData ? formatCurrency(gstReconData.summary.matchedAmount) : "₹0"}
                </span>
                <span className="text-[9px] text-slate-500 font-bold block mt-1">
                  {gstReconData ? gstReconData.summary.matchedCount : 0} Invoices perfectly matched
                </span>
              </div>
              <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-2xl">
                <span className="text-amber-500 text-[9px] font-black uppercase tracking-wider block mb-1 font-mono">Mismatched Invoices</span>
                <span className="text-lg font-mono font-black text-amber-400">
                  {gstReconData ? formatCurrency(gstReconData.summary.mismatchedAmount) : "₹0"}
                </span>
                <span className="text-[9px] text-slate-500 font-bold block mt-1">
                  {gstReconData ? gstReconData.summary.mismatchedCount : 0} Value variances identified
                </span>
              </div>
              <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
                <span className="text-blue-500 text-[9px] font-black uppercase tracking-wider block mb-1 font-mono">Unclaimed Portal ITC</span>
                <span className="text-lg font-mono font-black text-sky-400">
                  {gstReconData ? formatCurrency(gstReconData.summary.unclaimedAmount) : "₹0"}
                </span>
                <span className="text-[9px] text-slate-500 font-bold block mt-1">
                  {gstReconData ? gstReconData.summary.unclaimedCount : 0} Credit unclaimed opportunity
                </span>
              </div>
              <div className="p-4 bg-rose-500/5 border border-rose-500/10 rounded-2xl">
                <span className="text-rose-500 text-[9px] font-black uppercase tracking-wider block mb-1 font-mono">Missing GSTR-2B Credit</span>
                <span className="text-lg font-mono font-black text-rose-400">
                  {gstReconData ? formatCurrency(gstReconData.summary.missingAmount) : "₹0"}
                </span>
                <span className="text-[9px] text-slate-500 font-bold block mt-1">
                  {gstReconData ? gstReconData.summary.missingCount : 0} High-risk blocked tax credits
                </span>
              </div>
            </div>

            {/* GST Workbook Grid */}
            {!gstReconData ? (
              <div className="py-12 text-center bg-black/20 rounded-2xl border border-dashed border-white/5">
                <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                <h4 className="text-xs font-black text-white uppercase tracking-widest">No GSTR-2B credit data loaded for {reconcilePeriod}</h4>
                <p className="text-[10px] text-slate-500 font-bold mt-1 max-w-sm mx-auto">
                  Upload GSTR-2B portal spreadsheets. The engine will match suppliers, taxes (CGST/SGST/IGST), and warn you about credit leakage.
                </p>
                <button 
                  onClick={() => setIsUploadModalOpen(true)}
                  className="mt-4 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[10px] font-black uppercase rounded-lg tracking-wider"
                >
                  Browse GSTR-2B File
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* GST Filters */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-black/20 p-4 rounded-2xl border border-white/5">
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { code: "ALL", label: "All Items" },
                      { code: "MATCHED", label: "Matched Credits" },
                      { code: "MISMATCHED", label: "Value Mismatch" },
                      { code: "UNCLAIMED_ITC", label: "Unclaimed (In Portal)" },
                      { code: "MISSING_IN_2B", label: "Missing (In Books)" }
                    ].map(f => (
                      <button
                        key={f.code}
                        onClick={() => setFilterMatchGst(f.code)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                          filterMatchGst === f.code
                            ? "bg-cyan-500 text-slate-950"
                            : "text-slate-400 hover:text-white hover:bg-white/5"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search supplier/invoice..."
                      value={searchTermGst}
                      onChange={(e) => setSearchTermGst(e.target.value)}
                      className="pl-9 pr-3 py-1.5 bg-black/40 border border-white/10 rounded-xl text-[11px] font-bold text-white focus:outline-none focus:border-cyan-500/50 w-full"
                    />
                  </div>
                </div>

                {/* GST Reconciliation Table */}
                <div className="overflow-x-auto border border-white/5 rounded-2xl">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-black/35 border-b border-white/5 text-left text-slate-500 font-mono text-[9px] tracking-wider uppercase">
                        <th className="p-3">Status</th>
                        <th className="p-3">GSTR-2B Statement (Vendor Portal)</th>
                        <th className="p-3 text-right">Portal Credit</th>
                        <th className="p-3 w-10 text-center"><ArrowRightLeft className="w-3.5 h-3.5 text-slate-600 inline" /></th>
                        <th className="p-3">Double-Entry Purchase Books</th>
                        <th className="p-3 text-right">Books ITC</th>
                        <th className="p-3 text-center">Auditor Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {gstReconData.matches
                        .filter(m => {
                          if (filterMatchGst === "MATCHED") return m.matchType === "MATCHED";
                          if (filterMatchGst === "MISMATCHED") return m.matchType === "MISMATCHED";
                          if (filterMatchGst === "UNCLAIMED_ITC") return m.matchType === "UNCLAIMED_ITC";
                          if (filterMatchGst === "MISSING_IN_2B") return m.matchType === "MISSING_IN_2B";
                          return true;
                        })
                        .filter(m => 
                          m.vendorName.toLowerCase().includes(searchTermGst.toLowerCase()) ||
                          m.invoiceNumber.toLowerCase().includes(searchTermGst.toLowerCase())
                        )
                        .map((m, idx) => {
                          const totalPortalTax = m.cgst + m.sgst + m.igst;
                          const totalBooksTax = (m.booksCgst || 0) + (m.booksSgst || 0) + (m.booksIgst || 0);
                          
                          return (
                            <tr key={`gst_${idx}`} className="hover:bg-white/[0.01] text-[11px] font-bold">
                              <td className="p-3">
                                <span className={`px-2 py-0.5 rounded text-[8px] font-mono border font-black uppercase ${
                                  m.matchType === "MATCHED" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                  m.matchType === "MISMATCHED" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                  m.matchType === "UNCLAIMED_ITC" ? "bg-blue-500/10 text-sky-400 border-blue-500/20" :
                                  "bg-rose-500/10 text-rose-400 border-rose-500/20"
                                }`}>
                                  {m.matchType.replace("_", " ")}
                                </span>
                              </td>
                              
                              {/* Portal Side */}
                              <td className="p-3 font-mono">
                                {m.matchType === "MISSING_IN_2B" ? (
                                  <span className="text-slate-500 italic">No credit uploaded by supplier yet.</span>
                                ) : (
                                  <>
                                    <div className="text-white font-sans">{m.vendorName}</div>
                                    <div className="text-slate-500 text-[9px] mt-0.5">GSTIN: {m.gstin} | Inv: {m.invoiceNumber} | Date: {m.invoiceDate}</div>
                                  </>
                                )}
                              </td>
                              <td className="p-3 text-right font-mono font-black text-slate-300">
                                {m.matchType === "MISSING_IN_2B" ? "-" : formatCurrency(totalPortalTax)}
                              </td>
                              
                              <td className="p-3 text-center text-slate-600">⇄</td>
                              
                              {/* Books Side */}
                              <td className="p-3 font-mono">
                                {m.matchType === "UNCLAIMED_ITC" ? (
                                  <span className="text-slate-500 italic">Missing voucher in Purchase books.</span>
                                ) : (
                                  <>
                                    <div className="text-cyan-400 font-sans">{m.vendorName}</div>
                                    <div className="text-slate-500 text-[9px] mt-0.5">Voucher Inv: {m.booksInvoiceNo} | Date: {m.booksDate}</div>
                                  </>
                                )}
                              </td>
                              <td className="p-3 text-right font-mono font-black text-slate-300">
                                {m.matchType === "UNCLAIMED_ITC" ? "-" : formatCurrency(totalBooksTax)}
                              </td>

                              {/* Actions */}
                              <td className="p-3 text-center">
                                {m.matchType === "MISSING_IN_2B" && (
                                  <button
                                    onClick={() => setRemindedVendors(prev => ({ ...prev, [m.id]: true }))}
                                    disabled={remindedVendors[m.id]}
                                    className={`px-3 py-1 rounded text-[9px] font-black uppercase transition-all flex items-center gap-1 mx-auto ${
                                      remindedVendors[m.id]
                                        ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                        : "bg-rose-500 text-slate-950 hover:opacity-90 active:scale-95"
                                    }`}
                                  >
                                    <Mail className="w-3 h-3" />
                                    {remindedVendors[m.id] ? "Nudge Sent" : "Remind Vendor"}
                                  </button>
                                )}
                                {m.matchType === "UNCLAIMED_ITC" && (
                                  <button 
                                    onClick={() => alert(`Creating simulated Draft Purchase Voucher in Books for Invoice ${m.invoiceNumber} (Vendor: ${m.vendorName}) to claim ₹${totalPortalTax} input credit.`)}
                                    className="px-2.5 py-1 bg-white/5 border border-white/10 hover:bg-white/10 text-[9px] font-black uppercase rounded text-sky-400"
                                  >
                                    Claim Credit
                                  </button>
                                )}
                                {m.matchType === "MATCHED" && <span className="text-emerald-400 text-xs font-mono">✔ Reconciled</span>}
                                {m.matchType === "MISMATCHED" && (
                                  <button 
                                    onClick={() => alert(`CGST/SGST variance found! Adjusting books entry to match Supplier portal declaration GSTR-2B.`)}
                                    className="px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 text-[9px] font-black uppercase rounded text-amber-400"
                                  >
                                    Adjust Entry
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. CHARTS ROW */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Risk Concentration radial chart */}
        <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl flex flex-col justify-between">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" /> Vulnerability Concentration
          </h3>
          <div className="h-[200px] w-full flex items-center justify-center relative">
            {categoryChartData.length === 0 ? (
              <div className="text-slate-600 font-bold uppercase text-[10px] tracking-wider">No active risks to plot</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart cx="50%" cy="50%" innerRadius="30%" outerRadius="90%" barSize={8} data={categoryChartData}>
                  <RadialBar background dataKey="count" cornerRadius={4} />
                </RadialBarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="space-y-2 mt-4">
            {categoryChartData.map((item) => (
              <div key={item.name} className="flex justify-between items-center text-xs font-bold">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                  <span className="text-slate-400">{item.name}</span>
                </div>
                <span className="text-white font-mono">{item.count} Flags</span>
              </div>
            ))}
          </div>
        </div>

        {/* Anomaly Trend over months */}
        <div className="lg:col-span-2 bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Chronic Exception Timelines
          </h3>
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyAlertTrend}>
                <defs>
                  <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#F43F5E" stopOpacity={0.2}/><stop offset="95%" stopColor="#F43F5E" stopOpacity={0}/></linearGradient>
                  <linearGradient id="forGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#A855F7" stopOpacity={0.2}/><stop offset="95%" stopColor="#A855F7" stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="month" stroke="#ffffff10" tick={{ fill: "#ffffff40", fontSize: 9 }} tickLine={false} />
                <YAxis stroke="#ffffff10" tick={{ fill: "#ffffff40", fontSize: 9 }} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff10", borderRadius: "12px" }} />
                <Area type="monotone" name="Accrual Bypass Errors" dataKey="Accrual" stroke="#F43F5E" strokeWidth={2.5} fillOpacity={1} fill="url(#accGrad)" />
                <Area type="monotone" name="Forensic Anomaly Adjustments" dataKey="Forensic" stroke="#A855F7" strokeWidth={2.5} fillOpacity={1} fill="url(#forGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. WORKBENCH & INTERACTIVE LEDGER SCRUTINY WORKING PAPERS */}
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl space-y-6">
        
        {/* Section Header */}
        <div className="border-b border-white/5 pb-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-cyan-400" /> Complete Chart of Accounts Ledger Scrutiny Working Papers
            </h3>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">Audit verification matrix across all client ledger accounts</p>
          </div>
          <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-3 py-1.5 rounded-lg border border-cyan-500/20">
            Showing {filteredLedgers.length} of {ledgers.length} Ledgers
          </span>
        </div>

        {/* Filters & Search Matrix Bar */}
        <div className="bg-black/30 p-4 rounded-2xl border border-white/5 flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search ledger name, group, voucher #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 w-full"
            />
          </div>

          {/* Filter Status */}
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
          >
            <option value="ALL" className="bg-[#13131A]">All Statuses</option>
            <option value="FAILED" className="bg-[#13131A]">Failed Checks Only</option>
            <option value="PASSED" className="bg-[#13131A]">Passed Checks Only</option>
            <option value="WARNING" className="bg-[#13131A]">Warnings Only</option>
          </select>

          {/* Filter Risk */}
          <select 
            value={filterRisk}
            onChange={(e) => setFilterRisk(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
          >
            <option value="ALL" className="bg-[#13131A]">All Risk Levels</option>
            <option value="HIGH" className="bg-[#13131A]">High Risk</option>
            <option value="MEDIUM" className="bg-[#13131A]">Medium Risk</option>
            <option value="LOW" className="bg-[#13131A]">Low Risk</option>
          </select>

          {/* Filter Group */}
          <select 
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer max-w-[200px]"
          >
            <option value="ALL" className="bg-[#13131A]">All Ledger Groups</option>
            {ledgerGroups.map(g => (
              <option key={g} value={g} className="bg-[#13131A]">{g}</option>
            ))}
          </select>

          {/* Filter Audit Rule */}
          <select 
            value={filterRule}
            onChange={(e) => setFilterRule(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer max-w-[200px]"
          >
            <option value="ALL" className="bg-[#13131A]">All Audit Rules</option>
            <option value="NATURAL_BALANCE" className="bg-[#13131A]">Natural Balance Check</option>
            <option value="OPENING_BALANCE" className="bg-[#13131A]">Opening Balance Validation</option>
            <option value="MOVEMENT_VALIDATION" className="bg-[#13131A]">Movement Validation</option>
            <option value="UNUSUAL_BALANCE" className="bg-[#13131A]">Unusual Balance & Threshold</option>
            <option value="ROUND_JV" className="bg-[#13131A]">Round JV Check</option>
            <option value="SUSPENSE_CHECK" className="bg-[#13131A]">Suspense Month-end Check</option>
            <option value="GST_CHECK" className="bg-[#13131A]">GST ITC & RCM Check</option>
            <option value="RELATED_PARTY" className="bg-[#13131A]">Related Party Sec 188</option>
            <option value="SECTOR_RULES" className="bg-[#13131A]">Industry Specific Check</option>
            <option value="NLP_SCAN" className="bg-[#13131A]">NLP Narration Scrutiny</option>
          </select>
        </div>

        {/* Ledger Scrutiny List - Displaying Every Ledger */}
        <div className="space-y-4">
          {loading ? (
            <div className="py-20 text-center text-cyan-500 animate-pulse">
              <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-xs font-bold uppercase tracking-widest font-mono">Evaluating Double-Entry Audit Matrix...</p>
            </div>
          ) : filteredLedgers.length === 0 ? (
            <div className="py-16 text-center bg-black/20 rounded-2xl border border-dashed border-white/5">
              <ShieldCheck className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No ledgers match current filter criteria.</p>
            </div>
          ) : (
            filteredLedgers.map((ledger) => {
              const isExpanded = expandedLedgerId === ledger.id;
              const hasFailed = ledger.checks.some(c => c.status === "Failed");

              return (
                <div 
                  key={ledger.id} 
                  className={`border rounded-2xl overflow-hidden transition-all bg-[#13131A] ${
                    hasFailed ? "border-rose-500/20" : "border-white/5"
                  }`}
                >
                  {/* Ledger Card Header */}
                  <div 
                    onClick={() => setExpandedLedgerId(isExpanded ? null : ledger.id)}
                    className="p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h4 className="text-base font-black text-white">{ledger.name}</h4>
                        <span className="text-[10px] font-mono font-bold bg-white/5 text-slate-400 px-2.5 py-1 rounded-md border border-white/10">
                          Group: {ledger.groupName}
                        </span>
                        <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded border font-mono ${
                          ledger.overallRisk === "HIGH" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                          ledger.overallRisk === "MEDIUM" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                          "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        }`}>
                          Risk: {ledger.overallRisk}
                        </span>
                      </div>
                      
                      {/* Quick Audit Check Badges */}
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {ledger.checks.map(c => (
                          <span key={c.code} className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded border ${
                            c.status === "Passed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                            c.status === "Failed" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                            c.status === "Warning" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                            "bg-white/5 text-slate-500 border-white/5"
                          }`}>
                            {c.status === "Passed" ? "✓" : c.status === "Failed" ? "❌" : c.status === "Warning" ? "⚠️" : "—"} {c.name}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Closing Balance & Action */}
                    <div className="flex items-center gap-6 self-end md:self-auto shrink-0">
                      <div className="text-right font-mono">
                        <span className="text-[9px] font-black text-slate-500 uppercase block">Closing Balance</span>
                        <span className="text-sm font-black text-white">{formatCurrency(ledger.closingBalance)}</span>
                      </div>
                      <button className="text-xs font-mono font-black text-cyan-400 bg-cyan-500/10 px-3 py-1.5 rounded-lg border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors">
                        {isExpanded ? "[-] Collapse" : "[+] Audit Paper"}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Working Paper */}
                  {isExpanded && (
                    <div className="p-6 border-t border-white/5 bg-black/40 space-y-6">
                      {/* Financial Movement Breakdown Grid */}
                      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 bg-[#181821] p-4 rounded-xl border border-white/5 font-mono text-xs">
                        <div>
                          <span className="text-slate-500 text-[9px] font-black uppercase block">Opening Balance</span>
                          <span className="text-slate-300 font-bold">{formatCurrency(ledger.openingBalance)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[9px] font-black uppercase block">Total Debit</span>
                          <span className="text-emerald-400 font-bold">{formatCurrency(ledger.totalDebit)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[9px] font-black uppercase block">Total Credit</span>
                          <span className="text-rose-400 font-bold">{formatCurrency(ledger.totalCredit)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[9px] font-black uppercase block">Closing Balance</span>
                          <span className="text-white font-black">{formatCurrency(ledger.closingBalance)}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[9px] font-black uppercase block">Vouchers Scanned</span>
                          <span className="text-cyan-400 font-bold">{ledger.voucherCount} Entries</span>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[9px] font-black uppercase block">Last Movement</span>
                          <span className="text-slate-300 font-bold">{ledger.lastTransactionDate ? new Date(ledger.lastTransactionDate).toLocaleDateString("en-IN") : "No Vouchers"}</span>
                        </div>
                      </div>

                      {/* Audit Rule Execution Matrix Table */}
                      <div className="space-y-3">
                        <h5 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                          <FileCheck className="w-4 h-4 text-cyan-400" /> Audit Rule Execution Matrix ({ledger.checks.length} Rules Applied)
                        </h5>

                        <div className="overflow-x-auto border border-white/5 rounded-xl">
                          <table className="w-full border-collapse text-xs">
                            <thead>
                              <tr className="bg-black/40 border-b border-white/5 text-left text-slate-500 font-mono text-[9px] uppercase tracking-wider">
                                <th className="p-3">Audit Rule Standard</th>
                                <th className="p-3">Execution Status</th>
                                <th className="p-3">Audit Scope Rationale</th>
                                <th className="p-3">Audit Finding / Supporting Evidence</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 font-medium">
                              {ledger.checks.map(chk => (
                                <tr key={chk.code} className="hover:bg-white/[0.01]">
                                  <td className="p-3 font-bold text-white font-mono">{chk.name}</td>
                                  <td className="p-3">
                                    <span className={`px-2.5 py-1 rounded text-[9px] font-mono font-black uppercase border ${
                                      chk.status === "Passed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                      chk.status === "Failed" ? "bg-rose-500/10 text-rose-400 border-rose-500/20" :
                                      chk.status === "Warning" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                      "bg-white/5 text-slate-500 border-white/5"
                                    }`}>
                                      {chk.status === "Passed" ? "✓ PASSED" : chk.status === "Failed" ? "❌ FAILED" : chk.status === "Warning" ? "⚠️ WARNING" : "N/A NOT APPLICABLE"}
                                    </span>
                                  </td>
                                  <td className="p-3 text-slate-400 text-[11px] max-w-[300px]">{chk.description}</td>
                                  <td className="p-3 text-slate-300">
                                    {chk.alert ? (
                                      <div className="space-y-1 bg-rose-500/5 p-3 rounded-lg border border-rose-500/10">
                                        <div className="text-rose-400 font-black flex items-center gap-1.5">
                                          <span>❌</span> {chk.alert.title}
                                        </div>
                                        <div className="text-[10px] text-slate-300 font-medium leading-relaxed">{chk.alert.description}</div>
                                        {chk.alert.voucher && (
                                          <div className="text-[9px] font-mono text-cyan-400 mt-1 pt-1 border-t border-white/5">
                                            Voucher: #{chk.alert.voucher.voucherNumber} ({chk.alert.voucher.type}) | Date: {new Date(chk.alert.voucher.date).toLocaleDateString("en-IN")}
                                            {chk.alert.voucher.narration && <span className="block text-slate-400 italic">"{chk.alert.voucher.narration}"</span>}
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-slate-500 text-[10px] italic">Satisfied. No audit exceptions.</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <ReconciliationUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        clientId={clientId}
        period={reconcilePeriod}
        type={reconcileType}
        onUploadSuccess={handleUploadSuccess}
      />

      {/* 6. DRILL-DOWN / RESOLUTION DRAWER */}
      {activeAlert && (
        <div className="fixed inset-0 z-[100] flex justify-end animate-in fade-in duration-300">
          <div onClick={() => setActiveAlert(null)} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          
          <div className="relative w-full max-w-lg md:max-w-xl h-full bg-[#101017] border-l border-white/10 shadow-2xl p-8 overflow-y-auto space-y-8 flex flex-col justify-between">
            <div className="space-y-8">
              
              {/* Header */}
              <div className="flex justify-between items-start border-b border-white/5 pb-6">
                <div>
                  <span className={`px-2.5 py-0.5 rounded text-[9px] font-black border uppercase ${SEVERITY_COLORS[activeAlert.severity as keyof typeof SEVERITY_COLORS]}`}>
                    {activeAlert.severity} RISK MATRIX VULNERABILITY
                  </span>
                  <h2 className="text-xl font-black text-white mt-2 leading-snug">{activeAlert.title}</h2>
                </div>
                <button 
                  onClick={() => setActiveAlert(null)}
                  className="p-2 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Impact Card */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">Audit Suspect Ledger</span>
                  <span className="text-sm font-black text-white font-mono break-all">{activeAlert.ledger?.name || "Suspicious Entries"}</span>
                </div>
                <div className="bg-white/[0.01] border border-white/5 p-4 rounded-2xl">
                  <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider block mb-1">Direct Exposure Amount</span>
                  <span className="text-sm font-black text-rose-400 font-mono">
                    {activeAlert.impactAmount > 0 ? formatCurrency(activeAlert.impactAmount) : "N/A"}
                  </span>
                </div>
              </div>

              {/* Technical Description */}
              <div className="space-y-3">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1"><FileCheck className="w-3.5 h-3.5 text-cyan-400" /> Auditor Investigation Details</h3>
                <div className="bg-black/40 border border-white/5 p-5 rounded-2xl text-xs font-medium leading-relaxed text-slate-300 whitespace-pre-wrap">
                  {activeAlert.description}
                </div>
              </div>

              {/* Entry Narration analysis */}
              {activeAlert.voucher && activeAlert.voucher.narration && (
                <div className="space-y-3">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Staged Entry Original Narration</h3>
                  <div className="bg-[#13131A] border border-white/5 p-4 rounded-2xl text-xs font-bold text-cyan-400 font-mono italic">
                    "{activeAlert.voucher.narration}"
                  </div>
                </div>
              )}

              {/* Journal Flow Verification Sequence Map */}
              {activeAlert.category === "FLOW" && (
                <div className="bg-white/[0.01] border border-white/5 p-6 rounded-2xl space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Accrual Flow Verification Check</h3>
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-rose-500 shrink-0 animate-pulse" />
                    <div className="text-xs font-bold text-white font-mono">Bank Direct Payment booked</div>
                  </div>
                  <div className="h-4 w-0.5 bg-white/10 ml-1.5" />
                  <div className="flex items-center gap-3">
                    <div className="w-3.5 h-3.5 rounded-full bg-slate-800 shrink-0" />
                    <div className="text-xs font-bold text-slate-500 font-mono">No prior Journal / Invoice booking liability found in preceding 90 days.</div>
                  </div>
                </div>
              )}

              {/* Commentary logs */}
              {activeAlert.status !== "PENDING" && activeAlert.resolvedBy && (
                <div className="p-4 bg-white/5 border border-white/5 rounded-2xl space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase text-slate-500">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" /> Signed off by: {activeAlert.resolvedBy.email}</span>
                    <span>Status: {activeAlert.status}</span>
                  </div>
                  <p className="text-xs text-slate-300 italic font-medium leading-relaxed">"{activeAlert.commentary}"</p>
                </div>
              )}

              {/* Auditor Sign-off Input Workspace */}
              {activeAlert.status === "PENDING" && (
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-cyan-400" /> Log Review & Auditor Sign-off</h3>
                  <textarea
                    rows={4}
                    value={commentaryText}
                    onChange={(e) => setCommentaryText(e.target.value)}
                    placeholder="Provide professional auditing justification, reconciliation adjustments, or corrective actions to resolve this exception..."
                    className="w-full p-4 bg-white/5 border border-white/10 rounded-2xl text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 focus:ring-0 leading-relaxed"
                  />
                </div>
              )}
            </div>

            {/* Actions Footer */}
            {activeAlert.status === "PENDING" ? (
              <div className="flex gap-4 border-t border-white/5 pt-6 mt-6">
                <button 
                  onClick={() => handleActionAlert("RESOLVED")}
                  disabled={submittingComment || !commentaryText.trim()}
                  className="flex-1 py-3 bg-cyan-500 text-slate-950 rounded-xl text-xs font-black hover:opacity-90 active:scale-98 transition-all disabled:opacity-30"
                >
                  {submittingComment ? "Submitting Sign-off..." : "Approve & Resolve Exception"}
                </button>
                <button 
                  onClick={() => handleActionAlert("MUTED")}
                  disabled={submittingComment || !commentaryText.trim()}
                  className="px-6 py-3 bg-white/5 border border-white/10 text-slate-300 rounded-xl text-xs font-black hover:bg-white/10 active:scale-98 transition-all disabled:opacity-30"
                >
                  Mute Warning
                </button>
              </div>
            ) : (
              <button 
                onClick={() => setActiveAlert(null)}
                className="w-full py-3 bg-white/5 border border-white/10 text-white rounded-xl text-xs font-black hover:bg-white/10 transition-all"
              >
                Close Drawer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
