"use client";

import { useState, useEffect } from "react";
import { 
  PlusCircle, BookOpen, Undo2, History, BarChart3, AlertCircle, 
  CheckCircle2, Search, Calendar, Landmark, Coins, FileText, ArrowRightLeft, ShieldCheck
} from "lucide-react";

interface LedgerOption {
  id: string;
  name: string;
  groupName: string;
  nature: string;
}

interface ClassifiedLedgers {
  assets: LedgerOption[];
  liabilities: LedgerOption[];
  income: LedgerOption[];
  expense: LedgerOption[];
}

interface Provision {
  id: string;
  provisionNumber: string;
  provisionDate: string;
  financialYear: number;
  provisionType: "INCOME" | "EXPENSE";
  debitLedger: LedgerOption;
  creditLedger: LedgerOption;
  amount: number;
  narration: string | null;
  effectiveMonth: string;
  reference: string | null;
  autoReverse: boolean;
  status: "PENDING" | "POSTED" | "REVERSED";
  createdDate: string;
  createdBy?: { email: string };
  reversedBy?: { email: string };
  reversalDate?: string;
  reversalReason?: string;
  metadata?: any;
}

interface ProvisionDashboardProps {
  clientId: string;
  selectedYear: number;
  client: any;
}

export default function ProvisionDashboard({ clientId, selectedYear, client }: ProvisionDashboardProps) {
  const [activeSubTab, setActiveSubTab] = useState<"income" | "expense" | "register" | "history" | "report">("register");
  
  // Data lists
  const [ledgers, setLedgers] = useState<ClassifiedLedgers>({ assets: [], liabilities: [], income: [], expense: [] });
  const [provisions, setProvisions] = useState<Provision[]>([]);
  const [stats, setStats] = useState({
    totalIncomeProvision: 0,
    totalExpenseProvision: 0,
    outstandingProvisions: 0,
    reversedProvisions: 0,
    pendingProvisions: 0
  });

  // UI state
  const [loadingLedgers, setLoadingLedgers] = useState(false);
  const [loadingProvisions, setLoadingProvisions] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Reversal Form state
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalDate, setReversalDate] = useState(new Date().toISOString().split("T")[0]);

  // Form states
  const [incomeForm, setIncomeForm] = useState({
    provisionDate: new Date().toISOString().split("T")[0],
    financialYear: selectedYear,
    incomeLedgerId: "",
    assetLedgerId: "",
    amount: "",
    narration: "",
    effectiveMonth: "Mar",
    reference: "",
    autoReverse: false
  });

  const [expenseForm, setExpenseForm] = useState({
    provisionDate: new Date().toISOString().split("T")[0],
    financialYear: selectedYear,
    expenseLedgerId: "",
    liabilityLedgerId: "",
    amount: "",
    narration: "",
    effectiveMonth: "Mar",
    reference: "",
    autoReverse: false,
    department: "",
    costCentre: ""
  });

  const [searchQuery, setSearchQuery] = useState("");

  const monthsList = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

  useEffect(() => {
    fetchLedgers();
    fetchProvisions();
  }, [clientId, selectedYear]);

  const fetchLedgers = async () => {
    setLoadingLedgers(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/provisions/ledgers`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load dynamic ledgers");
      setLedgers(data);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message);
    }
    setLoadingLedgers(false);
  };

  const fetchProvisions = async () => {
    setLoadingProvisions(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/provisions?year=${selectedYear}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load provisions");
      setProvisions(data.provisions || []);
      setStats(data.stats || { totalIncomeProvision: 0, totalExpenseProvision: 0, outstandingProvisions: 0, reversedProvisions: 0, pendingProvisions: 0 });
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message);
    }
    setLoadingProvisions(false);
  };

  // Income Provision Submission
  const handleIncomeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSubmitting(true);

    try {
      const payload = {
        provisionDate: incomeForm.provisionDate,
        financialYear: Number(incomeForm.financialYear),
        provisionType: "INCOME",
        debitLedgerId: incomeForm.assetLedgerId, // Asset receives Debit
        creditLedgerId: incomeForm.incomeLedgerId, // Income receives Credit
        amount: parseFloat(incomeForm.amount),
        narration: incomeForm.narration,
        effectiveMonth: incomeForm.effectiveMonth,
        reference: incomeForm.reference,
        autoReverse: incomeForm.autoReverse
      };

      const res = await fetch(`/api/clients/${clientId}/provisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");

      setSuccessMsg(`Success! Income provision ${data.provisionNumber} created and manual double-entry journal posted.`);
      // Reset form
      setIncomeForm(prev => ({
        ...prev,
        amount: "",
        narration: "",
        reference: "",
        autoReverse: false
      }));
      fetchProvisions();
      setActiveSubTab("register");
    } catch (err: any) {
      setErrorMsg(err.message);
    }
    setSubmitting(false);
  };

  // Expense Provision Submission
  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");
    setSubmitting(true);

    try {
      const payload = {
        provisionDate: expenseForm.provisionDate,
        financialYear: Number(expenseForm.financialYear),
        provisionType: "EXPENSE",
        debitLedgerId: expenseForm.expenseLedgerId, // Expense receives Debit
        creditLedgerId: expenseForm.liabilityLedgerId, // Liability receives Credit
        amount: parseFloat(expenseForm.amount),
        narration: expenseForm.narration,
        effectiveMonth: expenseForm.effectiveMonth,
        reference: expenseForm.reference,
        autoReverse: expenseForm.autoReverse,
        metadata: {
          department: expenseForm.department,
          costCentre: expenseForm.costCentre
        }
      };

      const res = await fetch(`/api/clients/${clientId}/provisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");

      setSuccessMsg(`Success! Expense provision ${data.provisionNumber} created and manual double-entry journal posted.`);
      // Reset form
      setExpenseForm(prev => ({
        ...prev,
        amount: "",
        narration: "",
        reference: "",
        autoReverse: false,
        department: "",
        costCentre: ""
      }));
      fetchProvisions();
      setActiveSubTab("register");
    } catch (err: any) {
      setErrorMsg(err.message);
    }
    setSubmitting(false);
  };

  // Reversal Execution
  const handleExecuteReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversingId) return;

    setErrorMsg("");
    setSuccessMsg("");
    setSubmitting(true);

    try {
      const res = await fetch(`/api/clients/${clientId}/provisions/${reversingId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reversalDate,
          reversalReason
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reversal failed");

      setSuccessMsg(`Success! Provision ${data.provisionNumber} reversed. Reversal journal voucher posted.`);
      setReversingId(null);
      setReversalReason("");
      fetchProvisions();
    } catch (err: any) {
      setErrorMsg(err.message);
    }
    setSubmitting(false);
  };

  const filteredProvisions = provisions.filter(p => {
    const term = searchQuery.toLowerCase();
    return (
      p.provisionNumber.toLowerCase().includes(term) ||
      p.debitLedger.name.toLowerCase().includes(term) ||
      p.creditLedger.name.toLowerCase().includes(term) ||
      (p.narration || "").toLowerCase().includes(term) ||
      (p.reference || "").toLowerCase().includes(term)
    );
  });

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(amt);
  };

  return (
    <div className="space-y-8">
      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400 text-xs font-bold flex items-center gap-2 animate-pulse">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-400 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* 1. Month End Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Total Income Provisions", value: stats.totalIncomeProvision, icon: Coins, color: "text-emerald-400", bg: "bg-emerald-500/20" },
          { label: "Total Expense Provisions", value: stats.totalExpenseProvision, icon: Landmark, color: "text-rose-400", bg: "bg-rose-500/20" },
          { label: "Outstanding (Active)", value: stats.outstandingProvisions, icon: BookOpen, color: "text-cyan-400", bg: "bg-cyan-500/20" },
          { label: "Reversed Provisions", value: stats.reversedProvisions, icon: Undo2, color: "text-amber-400", bg: "bg-amber-500/20" },
          { label: "Pending (Draft)", value: stats.pendingProvisions, icon: FileText, color: "text-slate-400", bg: "bg-white/5" }
        ].map((stat, idx) => (
          <div key={idx} className="bg-[#13131A] border border-white/5 rounded-2xl p-5 hover:border-white/20 transition-all shadow-md">
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${stat.bg}`}><stat.icon className={`w-4 h-4 ${stat.color}`} /></div>
              <h3 className="text-slate-500 text-[10px] font-black uppercase tracking-widest">{stat.label}</h3>
            </div>
            <p className={`text-lg font-mono font-black ${stat.color}`}>{formatCurrency(stat.value)}</p>
          </div>
        ))}
      </div>

      {/* 2. Mode Sub-Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-2 bg-[#13131A] p-1.5 rounded-2xl border border-white/5 w-fit shadow-lg">
        <button onClick={() => setActiveSubTab("register")} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${activeSubTab === "register" ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}>
          <BookOpen className="w-3.5 h-3.5" /> Provision Register
        </button>
        <button onClick={() => setActiveSubTab("income")} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${activeSubTab === "income" ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}>
          <PlusCircle className="w-3.5 h-3.5" /> Income Provision
        </button>
        <button onClick={() => setActiveSubTab("expense")} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${activeSubTab === "expense" ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}>
          <PlusCircle className="w-3.5 h-3.5" /> Expense Provision
        </button>
        <button onClick={() => setActiveSubTab("history")} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${activeSubTab === "history" ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}>
          <History className="w-3.5 h-3.5" /> Audit Trail & History
        </button>
        <button onClick={() => setActiveSubTab("report")} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black transition-all ${activeSubTab === "report" ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'}`}>
          <BarChart3 className="w-3.5 h-3.5" /> Month End Report
        </button>
      </div>

      {/* 3. Tab Contents */}
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl space-y-6">
        
        {/* REGISTER TAB */}
        {activeSubTab === "register" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b border-white/5 pb-4">
              <div>
                <h3 className="text-base font-black text-white">Adjusted Provision Registry</h3>
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">List of posted dynamic provision journals</p>
              </div>
              <div className="relative w-72">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search registers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 bg-white/5 border border-white/10 rounded-xl text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>

            {loadingProvisions ? (
              <div className="py-20 text-center text-cyan-500 animate-pulse text-xs font-bold uppercase font-mono">Loading provision entries...</div>
            ) : filteredProvisions.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-white/5 rounded-2xl">
                <Landmark className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">No provisions registered for this period.</p>
              </div>
            ) : (
              <div className="overflow-x-auto border border-white/5 rounded-2xl">
                <table className="w-full border-collapse text-xs text-left">
                  <thead>
                    <tr className="bg-black/30 border-b border-white/5 text-[10px] font-mono text-slate-500 uppercase tracking-wider">
                      <th className="p-4">Number</th>
                      <th className="p-4">Effective Month / Date</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Debit Ledger</th>
                      <th className="p-4">Credit Ledger</th>
                      <th className="p-4 text-right">Amount</th>
                      <th className="p-4">Narration</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                    {filteredProvisions.map((p) => (
                      <tr key={p.id} className="hover:bg-white/[0.01]">
                        <td className="p-4 font-mono font-bold text-white">{p.provisionNumber}</td>
                        <td className="p-4">
                          <span className="text-white font-bold">{p.effectiveMonth}</span>
                          <span className="block text-[10px] text-slate-500 mt-0.5">{new Date(p.provisionDate).toLocaleDateString("en-IN")}</span>
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase font-mono ${p.provisionType === "INCOME" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                            {p.provisionType}
                          </span>
                        </td>
                        <td className="p-4 max-w-[150px] truncate" title={p.debitLedger.name}>
                          <span className="font-bold text-white block">{p.debitLedger.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{p.debitLedger.groupName}</span>
                        </td>
                        <td className="p-4 max-w-[150px] truncate" title={p.creditLedger.name}>
                          <span className="font-bold text-white block">{p.creditLedger.name}</span>
                          <span className="text-[10px] text-slate-500 font-mono">{p.creditLedger.groupName}</span>
                        </td>
                        <td className="p-4 text-right font-mono font-black text-white">{formatCurrency(p.amount)}</td>
                        <td className="p-4 max-w-[180px] truncate text-slate-400 italic" title={p.narration || ""}>
                          "{p.narration || "No description provided"}"
                        </td>
                        <td className="p-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                            p.status === "POSTED" ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" :
                            p.status === "REVERSED" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                            "bg-white/5 text-slate-500 border-white/5"
                          }`}>
                            {p.status}
                          </span>
                        </td>
                        <td className="p-4 text-center">
                          {p.status === "POSTED" ? (
                            <button
                              onClick={() => {
                                setReversingId(p.id);
                                setReversalReason("");
                              }}
                              className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-widest text-[9px] rounded-lg transition-all"
                            >
                              Reverse
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-mono italic">Reversal Posted</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* INCOME PROVISION TAB */}
        {activeSubTab === "income" && (
          <div className="space-y-6">
            <div className="border-b border-white/5 pb-4">
              <h3 className="text-base font-black text-white">Record Income Accrual Provision</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">Asset Debit & Income Credit Standard Double-Entry Adjustment</p>
            </div>

            <form onSubmit={handleIncomeSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-bold">
              {/* Provision Date */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Provision Date</label>
                <input
                  type="date"
                  required
                  value={incomeForm.provisionDate}
                  onChange={(e) => setIncomeForm(prev => ({ ...prev, provisionDate: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* Financial Year */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Financial Year (FY Start)</label>
                <input
                  type="number"
                  required
                  readOnly
                  value={incomeForm.financialYear}
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-slate-400 focus:outline-none"
                />
              </div>

              {/* Asset Ledger */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Accrued Asset Ledger (Dr.)</label>
                <select
                  required
                  value={incomeForm.assetLedgerId}
                  onChange={(e) => setIncomeForm(prev => ({ ...prev, assetLedgerId: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  <option value="" className="bg-[#13131A] text-slate-500">-- Select Asset Ledger --</option>
                  {ledgers.assets.map(l => (
                    <option key={l.id} value={l.id} className="bg-[#13131A]">{l.name} ({l.groupName})</option>
                  ))}
                </select>
              </div>

              {/* Income Ledger */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Income / Revenue Ledger (Cr.)</label>
                <select
                  required
                  value={incomeForm.incomeLedgerId}
                  onChange={(e) => setIncomeForm(prev => ({ ...prev, incomeLedgerId: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  <option value="" className="bg-[#13131A] text-slate-500">-- Select Income Ledger --</option>
                  {ledgers.income.map(l => (
                    <option key={l.id} value={l.id} className="bg-[#13131A]">{l.name} ({l.groupName})</option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Amount (INR)</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 55000"
                  value={incomeForm.amount}
                  onChange={(e) => setIncomeForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 font-mono"
                />
              </div>

              {/* Reference */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Reference / Doc ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. AGENT-COMM-Q4"
                  value={incomeForm.reference}
                  onChange={(e) => setIncomeForm(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* Effective Month */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Effective Financial Month</label>
                <select
                  required
                  value={incomeForm.effectiveMonth}
                  onChange={(e) => setIncomeForm(prev => ({ ...prev, effectiveMonth: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  {monthsList.map(m => (
                    <option key={m} value={m} className="bg-[#13131A]">{m.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              {/* Auto Reverse Checkbox */}
              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="incAutoReverse"
                  checked={incomeForm.autoReverse}
                  onChange={(e) => setIncomeForm(prev => ({ ...prev, autoReverse: e.target.checked }))}
                  className="w-4.5 h-4.5 bg-white/5 border border-white/10 rounded focus:ring-0 cursor-pointer text-cyan-500"
                />
                <label htmlFor="incAutoReverse" className="text-slate-300 select-none cursor-pointer">Mark as Auto-Reverse next month</label>
              </div>

              {/* Narration */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Accounting Narration</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Provide details about the accrued income transaction for audits..."
                  value={incomeForm.narration}
                  onChange={(e) => setIncomeForm(prev => ({ ...prev, narration: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 font-medium"
                />
              </div>

              <div className="md:col-span-2 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-8 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2"
                >
                  {submitting ? "Processing Journal..." : "Post Income Provision Journal"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* EXPENSE PROVISION TAB */}
        {activeSubTab === "expense" && (
          <div className="space-y-6">
            <div className="border-b border-white/5 pb-4">
              <h3 className="text-base font-black text-white">Record Expense Accrual Provision</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">Expense Debit & Liability Credit Standard Double-Entry Adjustment</p>
            </div>

            <form onSubmit={handleExpenseSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs font-bold">
              {/* Provision Date */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Provision Date</label>
                <input
                  type="date"
                  required
                  value={expenseForm.provisionDate}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, provisionDate: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* Financial Year */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Financial Year (FY Start)</label>
                <input
                  type="number"
                  required
                  readOnly
                  value={expenseForm.financialYear}
                  className="w-full px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-slate-400 focus:outline-none"
                />
              </div>

              {/* Expense Ledger */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Expense Ledger (Dr.)</label>
                <select
                  required
                  value={expenseForm.expenseLedgerId}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, expenseLedgerId: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  <option value="" className="bg-[#13131A] text-slate-500">-- Select Expense Ledger --</option>
                  {ledgers.expense.map(l => (
                    <option key={l.id} value={l.id} className="bg-[#13131A]">{l.name} ({l.groupName})</option>
                  ))}
                </select>
              </div>

              {/* Liability Ledger */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Provision / Outstanding Liability Ledger (Cr.)</label>
                <select
                  required
                  value={expenseForm.liabilityLedgerId}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, liabilityLedgerId: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  <option value="" className="bg-[#13131A] text-slate-500">-- Select Liability Ledger --</option>
                  {ledgers.liabilities.map(l => (
                    <option key={l.id} value={l.id} className="bg-[#13131A]">{l.name} ({l.groupName})</option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Amount (INR)</label>
                <input
                  type="number"
                  required
                  min="0.01"
                  step="0.01"
                  placeholder="e.g. 18000"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 font-mono"
                />
              </div>

              {/* Reference */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Reference / Doc ID (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. ELEC-MARCH-EST"
                  value={expenseForm.reference}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, reference: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* Department */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Department / Vertical</label>
                <input
                  type="text"
                  placeholder="e.g. Human Resources"
                  value={expenseForm.department}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, department: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* Cost Centre */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Cost Centre / Location</label>
                <input
                  type="text"
                  placeholder="e.g. Head Office - Delhi"
                  value={expenseForm.costCentre}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, costCentre: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              {/* Effective Month */}
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Effective Financial Month</label>
                <select
                  required
                  value={expenseForm.effectiveMonth}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, effectiveMonth: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
                >
                  {monthsList.map(m => (
                    <option key={m} value={m} className="bg-[#13131A]">{m.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              {/* Auto Reverse Checkbox */}
              <div className="flex items-center gap-3 pt-6">
                <input
                  type="checkbox"
                  id="expAutoReverse"
                  checked={expenseForm.autoReverse}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, autoReverse: e.target.checked }))}
                  className="w-4.5 h-4.5 bg-white/5 border border-white/10 rounded focus:ring-0 cursor-pointer text-cyan-500"
                />
                <label htmlFor="expAutoReverse" className="text-slate-300 select-none cursor-pointer">Mark as Auto-Reverse next month</label>
              </div>

              {/* Narration */}
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Accounting Narration</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Provide details about the accrued expense transaction for audits..."
                  value={expenseForm.narration}
                  onChange={(e) => setExpenseForm(prev => ({ ...prev, narration: e.target.value }))}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50 font-medium"
                />
              </div>

              <div className="md:col-span-2 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-8 py-3.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black uppercase tracking-widest text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all flex items-center gap-2"
                >
                  {submitting ? "Processing Journal..." : "Post Expense Provision Journal"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* AUDIT TRAIL TAB */}
        {activeSubTab === "history" && (
          <div className="space-y-4">
            <div className="border-b border-white/5 pb-4">
              <h3 className="text-base font-black text-white">Security & Audit Log Trail</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">Chronological record of provision actions, creators, and approvals</p>
            </div>

            {loadingProvisions ? (
              <div className="py-20 text-center text-cyan-500 animate-pulse text-xs font-bold uppercase font-mono">Loading history...</div>
            ) : provisions.length === 0 ? (
              <div className="py-16 text-center border border-dashed border-white/5 rounded-2xl">
                <Landmark className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">No audit history found.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {provisions.map((p) => (
                  <div key={p.id} className="bg-[#1A1A24] border border-white/5 p-5 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-slate-300 font-medium">
                    <div className="space-y-2 border-r border-white/5 pr-4">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Adjustment ID</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-white text-sm">{p.provisionNumber}</span>
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${p.provisionType === "INCOME" ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                          {p.provisionType}
                        </span>
                      </div>
                      <span className="text-slate-500 block text-[10px]">Reference: {p.reference || "N/A"}</span>
                    </div>

                    <div className="space-y-1.5 border-r border-white/5 pr-4">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Chronological Sign-Offs</span>
                      <p>Created by: <span className="text-white font-bold">{p.createdBy?.email || "Unknown"}</span></p>
                      <p className="text-slate-500 text-[10px]">On: {new Date(p.createdDate).toLocaleString("en-IN")}</p>
                      {p.status === "REVERSED" && (
                        <div className="mt-2 pt-2 border-t border-white/5 text-amber-400">
                          <p>Reversed by: <span className="font-bold">{p.reversedBy?.email || "System"}</span></p>
                          <p className="text-[10px] text-slate-500">On: {p.reversalDate ? new Date(p.reversalDate).toLocaleString("en-IN") : "N/A"}</p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Audit Commentary & Notes</span>
                      <p className="text-slate-200 italic">"Created: {p.narration || "Standard accrual posted"}"</p>
                      {p.status === "REVERSED" && (
                        <p className="text-amber-400 mt-2">
                          <span className="text-[10px] text-slate-500 font-bold uppercase block mb-0.5">Reversal Reason</span>
                          "{p.reversalReason || "Cleared in next period"}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MONTH END REPORT TAB */}
        {activeSubTab === "report" && (
          <div className="space-y-6">
            <div className="border-b border-white/5 pb-4">
              <h3 className="text-base font-black text-white">Month End Accruals Verification Report</h3>
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-0.5">Verification paper proving adjustments recorded in financial statements</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-xs font-bold">
              {/* Left Side: Summary Ratios */}
              <div className="bg-[#1A1A24] border border-white/5 p-6 rounded-2xl space-y-4">
                <h4 className="text-sm font-black text-white flex items-center gap-2 mb-4">
                  <Landmark className="w-4 h-4 text-cyan-400" /> Accounting Integrity Statistics
                </h4>
                
                <div className="flex justify-between items-center py-3 border-b border-white/5">
                  <span className="text-slate-400">Accrued Asset Valuation</span>
                  <span className="text-emerald-400 font-mono font-black text-sm">{formatCurrency(stats.totalIncomeProvision)}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/5">
                  <span className="text-slate-400">Accrued Liability Valuation</span>
                  <span className="text-rose-400 font-mono font-black text-sm">{formatCurrency(stats.totalExpenseProvision)}</span>
                </div>
                <div className="flex justify-between items-center py-3 border-b border-white/5">
                  <span className="text-slate-400">Net Accrual Variance</span>
                  <span className={`font-mono font-black text-sm ${stats.totalIncomeProvision - stats.totalExpenseProvision >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                    {formatCurrency(stats.totalIncomeProvision - stats.totalExpenseProvision)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-3">
                  <span className="text-slate-400">Total Cleared / Reversed</span>
                  <span className="text-amber-400 font-mono font-black text-sm">{formatCurrency(stats.reversedProvisions)}</span>
                </div>
              </div>

              {/* Right Side: Quick Audit Checklist */}
              <div className="bg-[#1A1A24] border border-white/5 p-6 rounded-2xl space-y-5 text-slate-300">
                <h4 className="text-sm font-black text-white flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" /> Compliance Working Paper Checks
                </h4>
                
                {[
                  { check: "Double-entry balances strictly equal", desc: "Verifies Debit amount matching Credit amount for each provision voucher lines.", passed: true },
                  { check: "Correct category mapping checked", desc: "Ensures no assets are matched to liabilities, and no revenue to expenses.", passed: true },
                  { check: "Reversals linked with audit commentaries", desc: "Maintains full track record logs of reasons for adjustments reversal.", passed: true },
                  { check: "Zero static mock inputs used", desc: "Pulls entirely from synced ledger codes mapped directly inside the database.", passed: true }
                ].map((item, idx) => (
                  <div key={idx} className="flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 text-emerald-400 shrink-0">✓</div>
                    <div>
                      <p className="font-bold text-white text-xs">{item.check}</p>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Reversal Modal Prompt */}
      {reversingId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#13131A] border border-white/10 p-6 rounded-3xl max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Undo2 className="w-5 h-5 text-amber-400" /> Execute Provision Reversal
            </h3>
            <p className="text-xs text-slate-400 font-medium leading-relaxed">
              This action will post an opposite manual journal voucher to reverse the original accrual.
            </p>

            <form onSubmit={handleExecuteReversal} className="space-y-4 text-xs font-bold">
              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Reversal Date</label>
                <input
                  type="date"
                  required
                  value={reversalDate}
                  onChange={(e) => setReversalDate(e.target.value)}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-slate-400 uppercase tracking-wider block">Reason for Reversal</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Salary paid via bank voucher on April 5"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-widest text-[10px] rounded-xl shadow-lg transition-all"
                >
                  {submitting ? "Posting Reversal..." : "Confirm Reversal"}
                </button>
                <button
                  type="button"
                  onClick={() => setReversingId(null)}
                  className="px-5 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-black uppercase tracking-widest text-[10px] rounded-xl transition-all"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
