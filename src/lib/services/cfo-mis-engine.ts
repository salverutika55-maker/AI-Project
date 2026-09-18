import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { 
  resolveCanonicalFinancialPeriod, 
  getFinancialYearMonths,
  CanonicalFinancialPeriod,
  formatDateIso 
} from "@/lib/financial-periods";

export interface CfoInsightCard {
  id: string;
  category: "PROFITABILITY" | "REVENUE" | "WORKING_CAPITAL" | "LIQUIDITY" | "EXPENSE" | "CUSTOMER" | "VENDOR" | "CONTROL" | "CORRELATION";
  priority: "IMMEDIATE" | "MANAGEMENT_ATTENTION" | "MONITOR";
  title: string;
  observation: string;
  driver: string;
  impact: string;
  risk: string;
  action: string;
  cfoQuestion: string;
  metricValue?: string;
  metricTrend?: "UP" | "DOWN" | "STABLE";
  drilldown: {
    ruleName: string;
    formula: string;
    calculatedValue: string;
    periodAnalyzed: string;
    comparisonPeriod?: string;
    supportingLedgers: Array<{ name: string; group: string; amount: number }>;
    dataSufficiency: "FULL" | "PARTIAL" | "MINIMAL";
  };
}

export interface MaterialMovement {
  metric: string;
  currentValue: number;
  previousValue: number;
  absoluteChange: number;
  percentageChange: number;
  direction: "IMPROVING" | "DETERIORATING" | "NEUTRAL";
  materiality: "HIGH" | "MEDIUM" | "LOW";
  explanation?: string;
}

export interface CfoManagementQuestion {
  id: string;
  area: "SALES" | "OPERATIONS" | "FINANCE" | "PROCUREMENT" | "CREDIT_CONTROL" | "EXECUTIVE_MANAGEMENT";
  question: string;
  context: string;
  dataTrace: string;
}

export interface ManagementActionItem {
  id: string;
  priority: "Immediate (0-30 Days)" | "Medium-Term (30-90 Days)" | "Strategic (90+ Days)";
  issue: string;
  evidence: string;
  financialImpact: string;
  responsibleArea: "Finance & Accounts" | "Sales & Collections" | "Procurement & Supply" | "Operations & Delivery" | "Executive Management";
  recommendedAction: string;
  timeHorizon: string;
}

export interface CfoMisReportResult {
  clientId: string;
  clientName: string;
  sector: "TRADING" | "SERVICE" | "MANUFACTURING";
  financialYear: number;
  financialYearLabel?: string;
  selectedMonth: string;
  calendarYear?: number;
  periodKey?: string;
  analysisMode: "MONTHLY" | "CUMULATIVE";
  periodLabel: string;
  periodTitle: string;
  canonicalPeriod?: CanonicalFinancialPeriod;
  calculationPeriod: {
    start: string;
    end: string;
  };
  comparisonPeriod: {
    start: string;
    end: string;
    label: string;
  };
  executiveTakeaway: {
    title: string;
    overallPosition: string;
    keyPositiveMovement: string;
    keyConcern: string;
    cashLiquidityObservation: string;
    workingCapitalObservation: string;
    profitabilityObservation: string;
    immediateManagementAttention: string;
    headlineMetrics: {
      revenue: number;
      revenueGrowthPct: number;
      grossProfit: number;
      grossMarginPct: number;
      netProfit: number;
      netMarginPct: number;
      cashBalance: number;
      cashRunwayDays: number;
      netWorkingCapital: number;
      totalReceivables: number;
      totalPayables: number;
    };
  };
  materialMovements: MaterialMovement[];
  structuredInsights: CfoInsightCard[];
  crossMetricCorrelations: Array<{
    title: string;
    pattern: string;
    implication: string;
    managementAction: string;
  }>;
  sectorSpecificInsights: {
    sector: string;
    keyMetrics: Array<{ label: string; value: string; assessment: string }>;
    analysis: string;
  };
  cfoQuestions: CfoManagementQuestion[];
  managementActionPlan: ManagementActionItem[];
  accountingControlFindings: {
    totalScrutinyExceptions: number;
    gstReconciliationStatus: string;
    summary: string;
    keyExceptions: string[];
  };
  sourceMetadata: {
    totalVouchersInPeriod: number;
    totalLedgersAnalyzed: number;
    periodDays: number;
    comparisonDays: number;
    monthsCount: number;
  };
}

function decryptValue(amountStr: string): number {
  try {
    const val = parseFloat(decrypt(amountStr));
    return isNaN(val) ? 0 : val;
  } catch {
    const val = parseFloat(amountStr);
    return isNaN(val) ? 0 : val;
  }
}

function formatLakhs(num: number): string {
  const abs = Math.abs(num);
  if (abs >= 10000000) {
    return `₹${(num / 10000000).toFixed(2)} Cr`;
  }
  if (abs >= 100000) {
    return `₹${(num / 100000).toFixed(2)} L`;
  }
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export async function generateCfoMisReport(
  clientId: string,
  targetYear: number,
  selectedMonthParam: string = "Apr",
  fyTypeParam: string = "APR_MAR",
  modeParam: "monthly" | "cumulative" = "monthly"
): Promise<CfoMisReportResult> {
  // 1. Fetch Client Profile
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      name: true,
      sector: true,
      software: true,
      fiscalYearStartMonth: true,
      organizationId: true
    }
  });

  if (!client) {
    throw new Error("Client not found");
  }

  const isCumulative = modeParam.toLowerCase() === "cumulative";
  const analysisMode: "MONTHLY" | "CUMULATIVE" = isCumulative ? "CUMULATIVE" : "MONTHLY";

  const fyStartMonth = fyTypeParam === "JAN_DEC" ? 1 : (client.fiscalYearStartMonth || 4);

  // 1. Resolve Canonical Financial Period
  let canonicalPeriod = resolveCanonicalFinancialPeriod(
    targetYear,
    selectedMonthParam,
    fyTypeParam,
    fyStartMonth
  );

  // Check if target client data aligns directly or with targetYear - 1
  const countAtTarget = await prisma.normalizedVoucher.count({
    where: {
      clientId,
      date: { 
        gte: canonicalPeriod.cumulativePeriod.periodStartUtc, 
        lt: new Date(Date.UTC(canonicalPeriod.fyStartYear + 1, fyStartMonth - 1, 1, 0, 0, 0, 0)) 
      }
    }
  });

  if (countAtTarget === 0 && !canonicalPeriod.isJanDec) {
    const prevYearStart = new Date(Date.UTC(canonicalPeriod.fyStartYear - 1, fyStartMonth - 1, 1, 0, 0, 0, 0));
    const prevYearEnd = new Date(Date.UTC(canonicalPeriod.fyStartYear, fyStartMonth - 1, 1, 0, 0, 0, 0));
    const countAtPrev = await prisma.normalizedVoucher.count({
      where: {
        clientId,
        date: { gte: prevYearStart, lt: prevYearEnd }
      }
    });
    if (countAtPrev > 0) {
      canonicalPeriod = resolveCanonicalFinancialPeriod(
        canonicalPeriod.fyStartYear - 1,
        selectedMonthParam,
        fyTypeParam,
        fyStartMonth
      );
    }
  }

  const selectedMonthName = canonicalPeriod.monthName;
  const calYear = canonicalPeriod.calendarYear;
  const calMonth = canonicalPeriod.monthNumber;
  const isFullYear = canonicalPeriod.cumulativePeriod.isFullYear;
  const monthsInCumulative = canonicalPeriod.cumulativePeriod.monthsCount;

  // Active Period boundaries based on mode
  const activePeriodStartUtc = isCumulative 
    ? canonicalPeriod.cumulativePeriod.periodStartUtc 
    : canonicalPeriod.periodStartUtc;
  const activePeriodEndUtc = canonicalPeriod.periodEndUtc;

  // Comparison Period boundaries based on mode
  const comparisonStartUtc = isCumulative 
    ? canonicalPeriod.comparablePriorCumulativePeriod.periodStartUtc 
    : canonicalPeriod.previousMonth.periodStartUtc;
  const comparisonEndUtc = isCumulative 
    ? canonicalPeriod.comparablePriorCumulativePeriod.periodEndUtc 
    : canonicalPeriod.previousMonth.periodEndUtc;

  const fyStartUtc = canonicalPeriod.cumulativePeriod.periodStartUtc;

  const periodDays = Math.round((activePeriodEndUtc.getTime() - activePeriodStartUtc.getTime()) / (1000 * 60 * 60 * 24));
  const comparisonDays = Math.round((comparisonEndUtc.getTime() - comparisonStartUtc.getTime()) / (1000 * 60 * 60 * 24));

  const periodLabel = isCumulative
    ? canonicalPeriod.cumulativePeriod.label
    : canonicalPeriod.label;

  const periodTitle = isCumulative
    ? `Executive CFO Takeaway — ${canonicalPeriod.cumulativePeriod.label}`
    : `Executive CFO Takeaway — ${canonicalPeriod.label}`;

  const comparisonPeriodLabel = isCumulative
    ? canonicalPeriod.comparablePriorCumulativePeriod.label
    : `Previous Month (${canonicalPeriod.previousMonth.label})`;

  const calculationPeriod = {
    start: isCumulative ? canonicalPeriod.cumulativePeriod.periodStart : canonicalPeriod.periodStart,
    end: canonicalPeriod.periodEnd
  };
  const comparisonPeriod = {
    start: isCumulative ? canonicalPeriod.comparablePriorCumulativePeriod.periodStart : canonicalPeriod.previousMonth.periodStart,
    end: isCumulative ? canonicalPeriod.comparablePriorCumulativePeriod.periodEnd : canonicalPeriod.previousMonth.periodEnd,
    label: comparisonPeriodLabel
  };

  // 2. Fetch Ledgers
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { clientId, isActive: true },
    select: {
      id: true,
      name: true,
      groupName: true,
      openingBalance: true,
      closingBalance: true,
      nature: true
    }
  });

  const cashAndBankLedgers: typeof ledgers = [];
  const receivableLedgers: typeof ledgers = [];
  const payableLedgers: typeof ledgers = [];
  const dutiesAndTaxesLedgers: typeof ledgers = [];
  const inventoryLedgers: typeof ledgers = [];
  const salesLedgers: typeof ledgers = [];
  const directExpenseLedgers: typeof ledgers = [];
  const indirectExpenseLedgers: typeof ledgers = [];

  for (const l of ledgers) {
    const g = (l.groupName || "").toLowerCase();
    const n = (l.name || "").toLowerCase();

    if (g.includes("bank") || g.includes("cash") || n.includes("bank") || n.includes("petty cash")) {
      cashAndBankLedgers.push(l);
    }
    if (g.includes("debtor") || g.includes("receivable") || n.includes("debtor") || n.includes("receivable")) {
      receivableLedgers.push(l);
    }
    if (g.includes("creditor") || g.includes("payable") || n.includes("creditor") || n.includes("payable")) {
      payableLedgers.push(l);
    }
    if (g.includes("duty") || g.includes("tax") || g.includes("gst") || n.includes("gst") || n.includes("tax")) {
      dutiesAndTaxesLedgers.push(l);
    }
    if (g.includes("stock") || g.includes("inventory") || n.includes("stock") || n.includes("inventory")) {
      inventoryLedgers.push(l);
    }
    if (g.includes("sales") || g.includes("income") || g.includes("revenue") || n.includes("sales") || n.includes("revenue")) {
      salesLedgers.push(l);
    }
    if (g.includes("direct expense") || g.includes("cogs") || g.includes("purchase") || g.includes("trading cost")) {
      directExpenseLedgers.push(l);
    }
    if (g.includes("indirect") || g.includes("administrative") || g.includes("operating expense") || g.includes("salary") || g.includes("rent")) {
      indirectExpenseLedgers.push(l);
    }
  }

  // 3. Fetch Vouchers for Active Period, Comparison Period, and Full Year
  const [vouchersInActivePeriod, vouchersInComparisonPeriod, vouchersInFY] = await Promise.all([
    // Active calculation period (Month or Cumulative YTD)
    prisma.normalizedVoucher.findMany({
      where: { clientId, date: { gte: activePeriodStartUtc, lt: activePeriodEndUtc } },
      include: {
        lines: {
          include: {
            ledger: { select: { id: true, name: true, groupName: true, openingBalance: true } }
          }
        }
      },
      orderBy: { date: "asc" }
    }),
    // Comparison period (Prior Month or Prior FY YTD)
    prisma.normalizedVoucher.findMany({
      where: { clientId, date: { gte: comparisonStartUtc, lt: comparisonEndUtc } },
      include: {
        lines: {
          include: {
            ledger: { select: { id: true, name: true, groupName: true } }
          }
        }
      }
    }),
    // Full FY up to selected month end
    prisma.normalizedVoucher.findMany({
      where: { clientId, date: { gte: fyStartUtc, lt: activePeriodEndUtc } },
      include: {
        lines: {
          select: { ledgerId: true, amount: true, entryType: true }
        }
      }
    })
  ]);

  // Compute exact running balances as of selectedMonthEnd and prior period end
  // (POINT-IN-TIME BALANCES ARE NEVER SUMMED!)
  const ledgerMovementsUpToPeriodEnd: Record<string, { debit: number; credit: number }> = {};
  const ledgerMovementsUpToComparisonEnd: Record<string, { debit: number; credit: number }> = {};

  vouchersInFY.forEach(v => {
    const isBeforeComparisonEnd = v.date < comparisonEndUtc;
    v.lines.forEach(l => {
      if (!l.ledgerId) return;
      const amt = Math.abs(l.amount || 0);
      const isDebit = (l.entryType || "").toUpperCase() === "DEBIT";

      if (!ledgerMovementsUpToPeriodEnd[l.ledgerId]) {
        ledgerMovementsUpToPeriodEnd[l.ledgerId] = { debit: 0, credit: 0 };
      }
      if (isDebit) ledgerMovementsUpToPeriodEnd[l.ledgerId].debit += amt;
      else ledgerMovementsUpToPeriodEnd[l.ledgerId].credit += amt;

      if (isBeforeComparisonEnd) {
        if (!ledgerMovementsUpToComparisonEnd[l.ledgerId]) {
          ledgerMovementsUpToComparisonEnd[l.ledgerId] = { debit: 0, credit: 0 };
        }
        if (isDebit) ledgerMovementsUpToComparisonEnd[l.ledgerId].debit += amt;
        else ledgerMovementsUpToComparisonEnd[l.ledgerId].credit += amt;
      }
    });
  });

  const getLedgerBalanceAsOf = (ledger: typeof ledgers[0], isComparisonPeriod: boolean = false): number => {
    const mov = isComparisonPeriod 
      ? ledgerMovementsUpToComparisonEnd[ledger.id] 
      : ledgerMovementsUpToPeriodEnd[ledger.id];
    const initial = ledger.openingBalance || 0;
    if (!mov) {
      return isComparisonPeriod ? initial : (ledger.closingBalance || initial);
    }
    const g = (ledger.groupName || "").toLowerCase();
    const isAsset = g.includes("bank") || g.includes("cash") || g.includes("debtor") || g.includes("receivable") || g.includes("stock") || g.includes("asset");
    if (isAsset) {
      return initial + (mov.debit - mov.credit);
    } else {
      return initial + (mov.credit - mov.debit);
    }
  };

  // 4. Fetch PNL Values
  const pnlValues = await prisma.pNLValue.findMany({
    where: { clientId, year: { in: [canonicalPeriod.fyStartYear, targetYear] } }
  });

  // Calculate FLOW METRICS for Active Period (sum of transactions)
  let activePeriodSales = 0;
  let activePeriodPurchases = 0;
  let activePeriodPayments = 0;
  let activePeriodReceipts = 0;

  vouchersInActivePeriod.forEach(v => {
    const t = v.type.toLowerCase();
    if (t === "sales") activePeriodSales += v.totalAmount || 0;
    else if (t === "purchase") activePeriodPurchases += v.totalAmount || 0;
    else if (t === "payment") activePeriodPayments += v.totalAmount || 0;
    else if (t === "receipt") activePeriodReceipts += v.totalAmount || 0;
  });

  // Flow metrics for Comparison Period
  let comparisonPeriodSales = 0;
  let comparisonPeriodPurchases = 0;
  let comparisonPeriodPayments = 0;

  vouchersInComparisonPeriod.forEach(v => {
    const t = v.type.toLowerCase();
    if (t === "sales") comparisonPeriodSales += v.totalAmount || 0;
    else if (t === "purchase") comparisonPeriodPurchases += v.totalAmount || 0;
    else if (t === "payment") comparisonPeriodPayments += v.totalAmount || 0;
  });

  // Fallback to PNL Values if voucher sales are zero
  if (activePeriodSales === 0) {
    const allMonthsList = getFinancialYearMonths(canonicalPeriod.fyStartYear, fyTypeParam, fyStartMonth);
    const targetMonthsSlice = isCumulative 
      ? allMonthsList.slice(0, canonicalPeriod.monthIndexInFy + 1).map(m => m.monthName) 
      : [selectedMonthName];
    pnlValues.forEach((pv: any) => {
      if (targetMonthsSlice.some((m: string) => m.toLowerCase() === pv.month?.toLowerCase())) {
        const h = pv.headName.toLowerCase();
        const amt = decryptValue(pv.amount);
        if (h.includes("revenue") || h.includes("sales") || h.includes("income")) {
          activePeriodSales += amt;
        } else if (h.includes("cogs") || h.includes("purchase") || h.includes("direct expense")) {
          activePeriodPurchases += amt;
        }
      }
    });
  }

  // POINT-IN-TIME CLOSING BALANCES as of Period End (NOT SUMMED)
  const totalCashAndBank = cashAndBankLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l)), 0);
  const comparisonCashAndBank = cashAndBankLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l, true)), 0);

  const totalReceivables = receivableLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l)), 0);
  const comparisonReceivables = receivableLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l, true)), 0);

  const totalPayables = payableLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l)), 0);
  const comparisonPayables = payableLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l, true)), 0);

  const totalInventory = client.sector === "SERVICE" 
    ? 0 
    : inventoryLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l)), 0);
  const comparisonInventory = client.sector === "SERVICE"
    ? 0
    : inventoryLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l, true)), 0);

  const netWorkingCapital = totalReceivables + totalInventory - totalPayables;
  const comparisonNetWorkingCapital = comparisonReceivables + comparisonInventory - comparisonPayables;

  // Profitability
  const grossProfit = activePeriodSales - activePeriodPurchases;
  const grossMarginPct = activePeriodSales > 0 ? (grossProfit / activePeriodSales) * 100 : 0;
  const comparisonGrossProfit = comparisonPeriodSales - comparisonPeriodPurchases;
  const comparisonGrossMarginPct = comparisonPeriodSales > 0 ? (comparisonGrossProfit / comparisonPeriodSales) * 100 : 0;

  // Expense grouping for active period
  const expenseByLedger: Record<string, { name: string; group: string; amount: number }> = {};
  vouchersInActivePeriod.forEach(v => {
    if (v.type.toLowerCase() === "payment" || v.type.toLowerCase() === "journal") {
      v.lines.forEach(l => {
        if (l.ledger) {
          const g = (l.ledger.groupName || "").toLowerCase();
          if (g.includes("expense") || g.includes("indirect") || g.includes("admin") || g.includes("salary") || g.includes("rent") || g.includes("fees")) {
            const amt = Math.abs(l.amount || 0);
            if (!expenseByLedger[l.ledger.id]) {
              expenseByLedger[l.ledger.id] = { name: l.ledger.name, group: l.ledger.groupName, amount: 0 };
            }
            expenseByLedger[l.ledger.id].amount += amt;
          }
        }
      });
    }
  });

  const totalPeriodOpex = Object.values(expenseByLedger).reduce((s, e) => s + e.amount, 0);
  const netProfit = grossProfit - totalPeriodOpex;
  const netMarginPct = activePeriodSales > 0 ? (netProfit / activePeriodSales) * 100 : 0;

  // Customer Concentration for Active Period (Monthly or Cumulative YTD)
  const customerBillingInPeriod: Record<string, { name: string; amount: number }> = {};
  let totalDebtorBillingInPeriod = 0;

  vouchersInActivePeriod.forEach(v => {
    if (v.type.toLowerCase() === "sales" || v.type.toLowerCase() === "receipt") {
      for (const line of v.lines) {
        if (line.ledger && (line.ledger.groupName || "").toLowerCase().includes("debtor")) {
          const amount = Math.abs(line.amount || 0);
          if (!customerBillingInPeriod[line.ledger.id]) {
            customerBillingInPeriod[line.ledger.id] = { name: line.ledger.name, amount: 0 };
          }
          customerBillingInPeriod[line.ledger.id].amount += amount;
          totalDebtorBillingInPeriod += amount;
        }
      }
    }
  });

  const sortedCustomersInPeriod = Object.values(customerBillingInPeriod).sort((a, b) => b.amount - a.amount);
  const topCustomerInPeriod = sortedCustomersInPeriod[0];
  const topCustomerSharePct = topCustomerInPeriod && totalDebtorBillingInPeriod > 0
    ? Math.round((topCustomerInPeriod.amount / totalDebtorBillingInPeriod) * 100)
    : 0;

  // Vendor Concentration for Active Period (Trading / Mfg)
  const vendorPurchasesInPeriod: Record<string, { name: string; amount: number }> = {};
  let totalCreditorPurchasesInPeriod = 0;

  vouchersInActivePeriod.forEach(v => {
    if (v.type.toLowerCase() === "purchase" || v.type.toLowerCase() === "payment") {
      for (const line of v.lines) {
        if (line.ledger && (line.ledger.groupName || "").toLowerCase().includes("creditor")) {
          const amount = Math.abs(line.amount || 0);
          if (!vendorPurchasesInPeriod[line.ledger.id]) {
            vendorPurchasesInPeriod[line.ledger.id] = { name: line.ledger.name, amount: 0 };
          }
          vendorPurchasesInPeriod[line.ledger.id].amount += amount;
          totalCreditorPurchasesInPeriod += amount;
        }
      }
    }
  });

  const sortedVendorsInPeriod = Object.values(vendorPurchasesInPeriod).sort((a, b) => b.amount - a.amount);
  const topVendorInPeriod = sortedVendorsInPeriod[0];
  const topVendorSharePct = topVendorInPeriod && totalCreditorPurchasesInPeriod > 0
    ? Math.round((topVendorInPeriod.amount / totalCreditorPurchasesInPeriod) * 100)
    : 0;

  // Monthly Operational Burn Rate & Cash Runway
  const monthlyBurn = isCumulative
    ? (activePeriodPayments > 0 ? (activePeriodPayments / monthsInCumulative) : (totalPeriodOpex + activePeriodPurchases) / monthsInCumulative)
    : (activePeriodPayments > 0 ? activePeriodPayments : (totalPeriodOpex + activePeriodPurchases));

  const dailyBurnRate = monthlyBurn > 0 ? (monthlyBurn / 30) : 0;
  const cashRunwayDays = dailyBurnRate > 0 ? Math.round(totalCashAndBank / dailyBurnRate) : (totalCashAndBank > 0 ? 365 : 0);

  // DSO Calculation
  const annualizedSales = isCumulative
    ? (activePeriodSales > 0 ? (activePeriodSales / monthsInCumulative) * 12 : 0)
    : (activePeriodSales > 0 ? activePeriodSales * 12 : 0);

  const dsoDays = annualizedSales > 0
    ? Math.round((totalReceivables / annualizedSales) * 365)
    : (activePeriodSales > 0 ? Math.round((totalReceivables / activePeriodSales) * periodDays) : 0);

  const priorAnnualizedSales = comparisonPeriodSales > 0 ? (comparisonPeriodSales / (isCumulative ? monthsInCumulative : 1)) * 12 : 0;
  const comparisonDsoDays = priorAnnualizedSales > 0
    ? Math.round((comparisonReceivables / priorAnnualizedSales) * 365)
    : (comparisonPeriodSales > 0 ? Math.round((comparisonReceivables / comparisonPeriodSales) * comparisonDays) : 0);

  // 5. Scrutiny & Compliance Alerts
  const scrutinyAlerts = await prisma.scrutinyAlert.findMany({ where: { clientId } });
  const complianceAlerts = await prisma.complianceAlert.findMany({ where: { clientId } });
  const reconStates = await prisma.reconciliationState.findMany({ where: { clientId } });

  // 6. Generate Material Movements ("What Changed?")
  const materialMovements: MaterialMovement[] = [];

  const addMovement = (
    metric: string,
    current: number,
    previous: number,
    favorableWhenHigher: boolean = true,
    customExplanation?: string
  ) => {
    const absChange = current - previous;
    const pctChange = previous !== 0 ? ((current - previous) / Math.abs(previous)) * 100 : (current !== 0 ? 100 : 0);
    const isImproving = favorableWhenHigher ? absChange > 0 : absChange < 0;
    const isNeutral = Math.abs(pctChange) < 1 && Math.abs(absChange) < 1000;
    const direction: "IMPROVING" | "DETERIORATING" | "NEUTRAL" = isNeutral ? "NEUTRAL" : (isImproving ? "IMPROVING" : "DETERIORATING");
    const materiality: "HIGH" | "MEDIUM" | "LOW" = Math.abs(pctChange) >= 20 || Math.abs(absChange) >= 100000 ? "HIGH" : (Math.abs(pctChange) >= 10 ? "MEDIUM" : "LOW");

    materialMovements.push({
      metric,
      currentValue: current,
      previousValue: previous,
      absoluteChange: absChange,
      percentageChange: Math.round(pctChange * 10) / 10,
      direction,
      materiality,
      explanation: customExplanation
    });
  };

  addMovement("Revenue / Billing", activePeriodSales, comparisonPeriodSales, true,
    isCumulative
      ? `Cumulative YTD revenue stands at ${formatLakhs(activePeriodSales)}${comparisonPeriodSales > 0 ? ` vs ${formatLakhs(comparisonPeriodSales)} in prior comparable period` : ""}.`
      : `Monthly revenue reached ${formatLakhs(activePeriodSales)} in ${periodLabel}.`);

  addMovement("Trade Receivables (AR)", totalReceivables, comparisonReceivables, false,
    `Closing receivables stand at ${formatLakhs(totalReceivables)} as of ${selectedMonthName} closing.`);

  addMovement("Liquid Cash & Bank", totalCashAndBank, comparisonCashAndBank, true,
    `Available liquid reserves stand at ${formatLakhs(totalCashAndBank)} at period end.`);

  addMovement("Trade Payables (AP)", totalPayables, comparisonPayables, true,
    `Outstanding supplier payables stand at ${formatLakhs(totalPayables)}.`);

  addMovement("Net Working Capital", netWorkingCapital, comparisonNetWorkingCapital, true,
    netWorkingCapital >= 0
      ? `Net working capital stands positive at ${formatLakhs(netWorkingCapital)}.`
      : `Net working capital is in a deficit of ${formatLakhs(Math.abs(netWorkingCapital))}.`);

  // 7. Structured CFO Insight Cards (Observation -> Driver -> Impact -> Risk -> Action -> Question)
  const structuredInsights: CfoInsightCard[] = [];

  const revGrowthPct = comparisonPeriodSales > 0 ? ((activePeriodSales - comparisonPeriodSales) / comparisonPeriodSales) * 100 : 0;
  const arGrowthPct = comparisonReceivables > 0 ? ((totalReceivables - comparisonReceivables) / comparisonReceivables) * 100 : 0;

  // Insight 1: Receivables vs Revenue Drag
  if (totalReceivables > 0 && (arGrowthPct > revGrowthPct + 10 || dsoDays > 60)) {
    const topDebtors = receivableLedgers.slice(0, 3).map(l => ({ name: l.name, group: l.groupName, amount: getLedgerBalanceAsOf(l) }));
    structuredInsights.push({
      id: "cfo-insight-receivables-drag",
      category: "WORKING_CAPITAL",
      priority: dsoDays > 90 || totalReceivables > totalCashAndBank * 5 ? "IMMEDIATE" : "MANAGEMENT_ATTENTION",
      title: isCumulative 
        ? "Cumulative Working Capital Trap: Sustained Receivables Accumulation" 
        : "Working Capital Drag: Receivables Growing Faster than Revenue",
      observation: isCumulative
        ? `Over ${periodLabel}, trade receivables have expanded to ${formatLakhs(totalReceivables)}, representing a collection cycle of ${dsoDays} Days against cumulative sales of ${formatLakhs(activePeriodSales)}.`
        : `Trade receivables increased by ${arGrowthPct > 0 ? `+${arGrowthPct.toFixed(1)}%` : `${formatLakhs(totalReceivables)}`} in ${periodLabel}, outpacing revenue movement. Collection velocity stands at ${dsoDays} Days.`,
      driver: topCustomerInPeriod 
        ? `Receivable accumulation is concentrated in key accounts including '${topCustomerInPeriod.name}' which accounts for ${topCustomerSharePct}% of billings in ${periodLabel}.`
        : "Likely driver cannot be determined from available accounting data.",
      impact: `An estimated ${formatLakhs(totalReceivables)} of operating liquidity remains locked in unpaid client invoices, requiring active working capital funding.`,
      risk: "Delayed collections increase bad debt exposure and force reliance on temporary supplier financing or credit lines.",
      action: isCumulative
        ? "Conduct a formal quarterly aging audit across all debtor balances >60 days and re-evaluate credit limits on slow-paying accounts."
        : "Review the top 3 overdue debtor ledgers, institute weekly milestone follow-ups, and require milestone advances on future engagements.",
      cfoQuestion: isCumulative
        ? `Why has our collection cycle averaged ${dsoDays} days across ${periodLabel}, and which aged balances require executive escalation?`
        : `What explains the collection cycle stretching to ${dsoDays} days in ${periodLabel}, and which customer invoices are past 30 days?`,
      metricValue: `${dsoDays} Days DSO`,
      metricTrend: dsoDays > comparisonDsoDays ? "UP" : "STABLE",
      drilldown: {
        ruleName: isCumulative ? "Cumulative DSO & Working Capital Analysis" : "Monthly Receivables-to-Revenue Elasticity",
        formula: isCumulative 
          ? `DSO = (Closing Receivables as of ${selectedMonthName} / Annualized YTD Sales) × 365 Days`
          : `DSO = (Receivables / Monthly Sales) × ${periodDays} Days`,
        calculatedValue: `DSO: ${dsoDays} Days (Receivables: ${formatLakhs(totalReceivables)} vs Sales: ${formatLakhs(activePeriodSales)})`,
        periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
        comparisonPeriod: `${comparisonPeriod.start} → ${comparisonPeriod.end}`,
        supportingLedgers: topDebtors,
        dataSufficiency: "FULL"
      }
    });
  }

  // Insight 2: Cash Runway & Operating Liquidity
  if (cashRunwayDays < 45 || totalCashAndBank < totalPayables) {
    const topCashAndBank = cashAndBankLedgers.map(l => ({ name: l.name, group: l.groupName, amount: getLedgerBalanceAsOf(l) }));
    structuredInsights.push({
      id: "cfo-insight-liquidity-runway",
      category: "LIQUIDITY",
      priority: cashRunwayDays <= 15 ? "IMMEDIATE" : "MANAGEMENT_ATTENTION",
      title: cashRunwayDays <= 15 ? "Critical Liquidity Alert: Constrained Cash Runway" : "Liquidity & Cash Flow Management Notice",
      observation: `Available liquid cash & bank funds stand at ${formatLakhs(totalCashAndBank)} as of ${selectedMonthName} closing, representing an estimated ${cashRunwayDays > 365 ? "> 1 Year" : `${cashRunwayDays} Days`} of operating runway at the monthly burn of ${formatLakhs(monthlyBurn)}.`,
      driver: totalPayables > 0 
        ? `Current trade payables obligations of ${formatLakhs(totalPayables)} exceed immediate liquid cash reserves by ${formatLakhs(Math.max(0, totalPayables - totalCashAndBank))}.`
        : "Operational cash disbursements over the period have exceeded operating collections.",
      impact: "The company is operating on tight liquidity buffers, leaving little room for delayed customer receipts or unexpected liabilities.",
      risk: "Inability to service vendor dues or statutory tax remittances on time without relying on immediate incoming customer collections.",
      action: `Expedite collection on ${formatLakhs(totalReceivables)} in trade receivables and structure vendor payment tranches to preserve a minimum 30-day liquidity buffer.`,
      cfoQuestion: `Given the ${cashRunwayDays}-day cash runway, which specific customer collections are forecasted to close within the next 10 business days?`,
      metricValue: `${cashRunwayDays} Days Runway`,
      metricTrend: cashRunwayDays < 30 ? "DOWN" : "STABLE",
      drilldown: {
        ruleName: "Cash Liquidity & Operating Burn Analysis",
        formula: "Cash Runway = Closing Liquid Cash & Bank / (Monthly Operational Outflow / 30)",
        calculatedValue: `Runway: ${cashRunwayDays} Days | Cash: ${formatLakhs(totalCashAndBank)} | Monthly Burn: ${formatLakhs(monthlyBurn)}`,
        periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
        supportingLedgers: topCashAndBank,
        dataSufficiency: "FULL"
      }
    });
  }

  // Insight 3: Profitability & Margins
  if (activePeriodSales > 0) {
    const topDirectCosts = directExpenseLedgers.slice(0, 3).map(l => ({ name: l.name, group: l.groupName, amount: getLedgerBalanceAsOf(l) }));
    if (grossMarginPct < 30 || (comparisonGrossMarginPct > 0 && grossMarginPct < comparisonGrossMarginPct - 5)) {
      structuredInsights.push({
        id: "cfo-insight-margin-compression",
        category: "PROFITABILITY",
        priority: "MANAGEMENT_ATTENTION",
        title: isCumulative ? "YTD Structural Margin Compression" : "Gross Margin Compression Detected",
        observation: `Gross Margin is ${grossMarginPct.toFixed(1)}% across ${periodLabel}${comparisonGrossMarginPct > 0 ? `, compressing from ${comparisonGrossMarginPct.toFixed(1)}% in comparison period` : ""}.`,
        driver: activePeriodPurchases > 0
          ? `Direct costs of ${formatLakhs(activePeriodPurchases)} absorbed ${((activePeriodPurchases / activePeriodSales) * 100).toFixed(1)}% of total revenue.`
          : "Direct operational costs increased relative to revenue realization.",
        impact: "Unit contribution margin has weakened, reducing operating cash generated per unit of revenue.",
        risk: "Persistent margin compression will erode operating EBITDA if procurement cost increases cannot be passed on.",
        action: "Conduct a line-item audit of direct delivery costs and review client engagement pricing.",
        cfoQuestion: `What specific cost elements drove direct delivery expenses to ${formatLakhs(activePeriodPurchases)}, and can pricing on active contracts be adjusted?`,
        metricValue: `${grossMarginPct.toFixed(1)}% Margin`,
        metricTrend: grossMarginPct < comparisonGrossMarginPct ? "DOWN" : "STABLE",
        drilldown: {
          ruleName: "Gross Profit Margin & Direct Cost Ratio",
          formula: "Gross Margin % = ((Revenue - Direct Cost) / Revenue) × 100",
          calculatedValue: `Gross Margin: ${grossMarginPct.toFixed(1)}% (Revenue: ${formatLakhs(activePeriodSales)}, Direct Costs: ${formatLakhs(activePeriodPurchases)})`,
          periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
          supportingLedgers: topDirectCosts,
          dataSufficiency: "FULL"
        }
      });
    }
  }

  // Insight 4: Concentration Risk
  if (client.sector === "SERVICE" && topCustomerSharePct >= 35 && topCustomerInPeriod) {
    const debtorLedgersSample = sortedCustomersInPeriod.slice(0, 5).map(c => ({ name: c.name, group: "Sundry Debtors", amount: c.amount }));
    structuredInsights.push({
      id: "cfo-insight-customer-concentration",
      category: "CUSTOMER",
      priority: topCustomerSharePct > 55 ? "IMMEDIATE" : "MANAGEMENT_ATTENTION",
      title: isCumulative ? "YTD High Client Revenue Concentration" : "Elevated Client Revenue Concentration Risk",
      observation: `Across ${periodLabel}, a single client '${topCustomerInPeriod.name}' generated ${topCustomerSharePct}% (${formatLakhs(topCustomerInPeriod.amount)}) of total billings (${formatLakhs(totalDebtorBillingInPeriod)}).`,
      driver: `Revenue generation is heavily concentrated in a single client account across ${periodLabel}.`,
      impact: `Business revenue and cash inflow are disproportionately reliant on '${topCustomerInPeriod.name}'.`,
      risk: "Contract scope reductions or dispute with this key client would immediately destabilize monthly revenue.",
      action: "Accelerate outreach to secondary client pipelines to distribute revenue across wider accounts.",
      cfoQuestion: `What is the contract renewal status for '${topCustomerInPeriod.name}', and what secondary client proposals are in the active pipeline?`,
      metricValue: `${topCustomerSharePct}% Share`,
      metricTrend: "UP",
      drilldown: {
        ruleName: "Client Billing Concentration Analysis",
        formula: "(Top Client Billing / Total Billing) × 100",
        calculatedValue: `Top Client '${topCustomerInPeriod.name}' = ${formatLakhs(topCustomerInPeriod.amount)} (${topCustomerSharePct}%)`,
        periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
        supportingLedgers: debtorLedgersSample,
        dataSufficiency: "FULL"
      }
    });
  } else if (client.sector !== "SERVICE" && topVendorSharePct >= 40 && topVendorInPeriod) {
    const creditorLedgersSample = sortedVendorsInPeriod.slice(0, 5).map(v => ({ name: v.name, group: "Sundry Creditors", amount: v.amount }));
    structuredInsights.push({
      id: "cfo-insight-vendor-concentration",
      category: "VENDOR",
      priority: topVendorSharePct > 60 ? "IMMEDIATE" : "MANAGEMENT_ATTENTION",
      title: isCumulative ? "YTD Supplier Concentration & Procurement Dependency" : "Supplier Concentration Risk",
      observation: `Procurement from top vendor '${topVendorInPeriod.name}' accounted for ${topVendorSharePct}% (${formatLakhs(topVendorInPeriod.amount)}) of total purchases (${formatLakhs(totalCreditorPurchasesInPeriod)}) in ${periodLabel}.`,
      driver: `Procurement is centralized with '${topVendorInPeriod.name}' across ${periodLabel}.`,
      impact: "High operational dependency on a single vendor for supplies/materials.",
      risk: "Supplier price hikes or fulfillment bottlenecks directly impact order fulfillment.",
      action: "Engage secondary backup suppliers and negotiate volume agreements.",
      cfoQuestion: `What backup supply agreements exist for materials supplied by '${topVendorInPeriod.name}'?`,
      metricValue: `${topVendorSharePct}% Share`,
      metricTrend: "UP",
      drilldown: {
        ruleName: "Single Supplier Concentration Analysis",
        formula: "(Top Vendor Purchases / Total Supplier Purchases) × 100",
        calculatedValue: `Top Supplier '${topVendorInPeriod.name}' = ${formatLakhs(topVendorInPeriod.amount)} (${topVendorSharePct}%)`,
        periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
        supportingLedgers: creditorLedgersSample,
        dataSufficiency: "FULL"
      }
    });
  }

  // Insight 5: Accounting & Scrutiny
  const highScrutinyAlerts = scrutinyAlerts.filter(a => a.severity === "HIGH");
  if (highScrutinyAlerts.length > 0) {
    const dutiesAndTaxesSample = dutiesAndTaxesLedgers.slice(0, 5).map(l => ({ name: l.name, group: l.groupName, amount: getLedgerBalanceAsOf(l) }));
    structuredInsights.push({
      id: "cfo-insight-accounting-controls",
      category: "CONTROL",
      priority: "MANAGEMENT_ATTENTION",
      title: "Accounting Scrutiny & Ledger Control Exceptions",
      observation: `${highScrutinyAlerts.length} high-severity accounting scrutiny exceptions were detected across ledger postings.`,
      driver: highScrutinyAlerts.map(a => a.title).slice(0, 2).join("; "),
      impact: "Unresolved transactional anomalies create statutory compliance risk and potential ledger misclassification.",
      risk: "Risk of departmental scrutiny, tax notice exposure, or misstated financial ratios.",
      action: "Direct the accounts team to review and resolve the flagged voucher entries.",
      cfoQuestion: "What is the timeline for the accounts team to reconcile the flagged scrutiny exceptions?",
      metricValue: `${highScrutinyAlerts.length} Alerts`,
      metricTrend: "STABLE",
      drilldown: {
        ruleName: "Forensic Ledger Scrutiny & Classification Verification",
        formula: "Audit rules checking abnormal debit/credit balances, round-sum postings, and tax variances",
        calculatedValue: `${highScrutinyAlerts.length} High-Severity exceptions detected`,
        periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
        supportingLedgers: dutiesAndTaxesSample,
        dataSufficiency: "FULL"
      }
    });
  }

  // 8. Cross-Metric Correlation Matrix
  const crossMetricCorrelations: Array<{ title: string; pattern: string; implication: string; managementAction: string }> = [];

  if (activePeriodSales > comparisonPeriodSales && totalReceivables > comparisonReceivables && totalCashAndBank < comparisonCashAndBank) {
    crossMetricCorrelations.push({
      title: isCumulative 
        ? "YTD Top-Line Growth is Trapping Cash in Receivables" 
        : "Revenue Growth is Trapping Cash in Uncollected Receivables",
      pattern: "Revenue ↑ | Receivables ↑↑ | Cash Balance ↓",
      implication: "Although revenue expanded, it has not translated into operating liquidity because receivables increased faster than collections, leading to an operating cash drain.",
      managementAction: "Enforce milestone billing and tighten collection windows to convert reported revenue into realized cash."
    });
  }

  if (grossMarginPct < comparisonGrossMarginPct && activePeriodPurchases > comparisonPeriodPurchases) {
    crossMetricCorrelations.push({
      title: "Top-Line Expansion Accompanied by Direct Cost Escalation",
      pattern: "Revenue Movement | Direct Costs ↑ | Gross Margin % ↓",
      implication: "Procurement / delivery costs increased faster than top-line realization, compressing unit contribution margins.",
      managementAction: "Review vendor pricing agreements and billable resource utilization to protect gross margins."
    });
  }

  if (crossMetricCorrelations.length === 0) {
    crossMetricCorrelations.push({
      title: "Operating Metrics Correlation Pattern",
      pattern: `Revenue: ${formatLakhs(activePeriodSales)} | Receivables: ${formatLakhs(totalReceivables)} | Cash: ${formatLakhs(totalCashAndBank)}`,
      implication: totalCashAndBank >= totalPayables 
        ? "Cash reserves and working capital indicators reflect stable operating alignment."
        : "Liquidity reserves require active management against outstanding payables obligations.",
      managementAction: "Maintain structured credit monitoring and monitor weekly cash collections."
    });
  }

  // 9. Sector-Specific Insights
  let sectorAnalysisText = "";
  const sectorKeyMetrics: Array<{ label: string; value: string; assessment: string }> = [];

  if (client.sector === "SERVICE") {
    sectorKeyMetrics.push(
      { label: "Revenue Realization", value: formatLakhs(activePeriodSales), assessment: activePeriodSales > 0 ? "Active" : "Low Volume" },
      { label: "Collection Velocity (DSO)", value: `${dsoDays} Days`, assessment: dsoDays <= 45 ? "Healthy" : "Elevated" },
      { label: "Client Concentration", value: `${topCustomerSharePct}%`, assessment: topCustomerSharePct <= 35 ? "Diversified" : "Concentrated" }
    );
    sectorAnalysisText = `As a Service sector business, cash generation is governed by billable realization and debtor collection velocity. In ${periodLabel}, collection cycle stands at ${dsoDays} Days. Retaining client concentration below 35% is key to ensuring sustainable cash flow.`;
  } else if (client.sector === "MANUFACTURING") {
    const dsiDays = activePeriodPurchases > 0 ? Math.round((totalInventory / activePeriodPurchases) * periodDays) : 0;
    sectorKeyMetrics.push(
      { label: "Gross Margin", value: `${grossMarginPct.toFixed(1)}%`, assessment: grossMarginPct >= 35 ? "Strong" : "Compressed" },
      { label: "Inventory Holding (DSI)", value: `${dsiDays} Days`, assessment: dsiDays <= 60 ? "Optimal" : "Extended" },
      { label: "Supplier Concentration", value: `${topVendorSharePct}%`, assessment: topVendorSharePct <= 40 ? "Diversified" : "High" }
    );
    sectorAnalysisText = `In Manufacturing, operating profitability hinges on raw material cost control and inventory holding velocity. Total closing stock stands at ${formatLakhs(totalInventory)}. Ensuring inventory turnover matches production schedules avoids tying up working capital.`;
  } else {
    // Trading
    const dsiDays = activePeriodPurchases > 0 ? Math.round((totalInventory / activePeriodPurchases) * periodDays) : 0;
    sectorKeyMetrics.push(
      { label: "Gross Margin", value: `${grossMarginPct.toFixed(1)}%`, assessment: grossMarginPct >= 20 ? "Standard" : "Low" },
      { label: "Inventory Holding (DSI)", value: `${dsiDays} Days`, assessment: dsiDays <= 45 ? "Optimal" : "Stretched" },
      { label: "Vendor Concentration", value: `${topVendorSharePct}%`, assessment: topVendorSharePct <= 40 ? "Diversified" : "High" }
    );
    sectorAnalysisText = `Trading operations rely on rapid stock turns and supplier financing terms. Working capital cycle is currently at ${dsoDays + dsiDays} Days (DSO + DSI). Optimizing purchase batch sizes preserves liquidity.`;
  }

  // 10. CFO Questions for Management
  const cfoQuestions: CfoManagementQuestion[] = [];

  if (dsoDays > 45) {
    cfoQuestions.push({
      id: "q-dso",
      area: "CREDIT_CONTROL",
      question: isCumulative
        ? `Why has our collection cycle averaged ${dsoDays} Days across ${periodLabel}, and what structural credit policy adjustments are required?`
        : `Why has our collection cycle reached ${dsoDays} Days in ${periodLabel}, and what specific recovery dates are committed for receivables past 30 days?`,
      context: `Receivables stand at ${formatLakhs(totalReceivables)} as of ${selectedMonthName} closing.`,
      dataTrace: `Receivables: ${formatLakhs(totalReceivables)} | Sales: ${formatLakhs(activePeriodSales)}`
    });
  }

  if (topCustomerInPeriod && topCustomerSharePct >= 35) {
    cfoQuestions.push({
      id: "q-cust-conc",
      area: "SALES",
      question: `What steps are being taken to expand billing across other accounts so that '${topCustomerInPeriod.name}' does not represent ${topCustomerSharePct}% of our revenue?`,
      context: `Top client generated ${formatLakhs(topCustomerInPeriod.amount)} of ${formatLakhs(totalDebtorBillingInPeriod)} in ${periodLabel}.`,
      dataTrace: `Top Customer Share: ${topCustomerSharePct}%`
    });
  }

  if (cashRunwayDays < 45) {
    cfoQuestions.push({
      id: "q-liquidity",
      area: "FINANCE",
      question: `With liquid cash reserves of ${formatLakhs(totalCashAndBank)} giving a ${cashRunwayDays}-day runway, what cash collections are forecasted over the next 14 days?`,
      context: `Monthly operational burn rate is estimated at ${formatLakhs(monthlyBurn)}.`,
      dataTrace: `Cash & Bank: ${formatLakhs(totalCashAndBank)} | Monthly Burn: ${formatLakhs(monthlyBurn)}`
    });
  }

  if (grossMarginPct < comparisonGrossMarginPct - 3 && activePeriodSales > 0) {
    cfoQuestions.push({
      id: "q-margin",
      area: "OPERATIONS",
      question: `What caused gross profit margin to decline from ${comparisonGrossMarginPct.toFixed(1)}% to ${grossMarginPct.toFixed(1)}%?`,
      context: `Direct costs were ${formatLakhs(activePeriodPurchases)} on ${formatLakhs(activePeriodSales)} revenue.`,
      dataTrace: `Direct Cost Ratio: ${((activePeriodPurchases / activePeriodSales) * 100).toFixed(1)}%`
    });
  }

  if (highScrutinyAlerts.length > 0) {
    cfoQuestions.push({
      id: "q-scrutiny",
      area: "FINANCE",
      question: `What is the root cause of the ${highScrutinyAlerts.length} scrutiny exceptions flagged in ledger verification, and when will adjustment entries be completed?`,
      context: `Scrutiny items include: ${highScrutinyAlerts.map(a => a.title).slice(0, 2).join(", ")}.`,
      dataTrace: `Scrutiny Alert Count: ${highScrutinyAlerts.length}`
    });
  }

  if (cfoQuestions.length === 0) {
    cfoQuestions.push({
      id: "q-general",
      area: "EXECUTIVE_MANAGEMENT",
      question: `How do our actual revenue and margin figures for ${periodLabel} align with the strategic annual plan?`,
      context: `Revenue for ${periodLabel} reached ${formatLakhs(activePeriodSales)} with Net Working Capital at ${formatLakhs(netWorkingCapital)}.`,
      dataTrace: `Revenue: ${formatLakhs(activePeriodSales)} | NWC: ${formatLakhs(netWorkingCapital)}`
    });
  }

  // 11. Management Action Plan
  const managementActionPlan: ManagementActionItem[] = [];

  if (totalReceivables > 0 && dsoDays > 45) {
    managementActionPlan.push({
      id: "act-1",
      priority: isCumulative ? "Medium-Term (30-90 Days)" : "Immediate (0-30 Days)",
      issue: isCumulative
        ? `Receivables have remained elevated across ${periodLabel} with DSO averaging ${dsoDays} Days.`
        : `Receivables stand at ${formatLakhs(totalReceivables)} with DSO at ${dsoDays} Days.`,
      evidence: topCustomerInPeriod ? `Concentrated in '${topCustomerInPeriod.name}' (${formatLakhs(topCustomerInPeriod.amount)}).` : `Total trade debtors balance of ${formatLakhs(totalReceivables)}.`,
      financialImpact: `Accelerating collections will inject up to ${formatLakhs(totalReceivables * 0.3)} directly into liquid cash reserves.`,
      responsibleArea: "Sales & Collections",
      recommendedAction: isCumulative
        ? "Review customer credit policies, establish binding payment milestones on active contracts, and audit accounts past 60 days."
        : "Execute structured payment reminders, follow up on all invoices >30 days, and establish agreed payment schedules.",
      timeHorizon: isCumulative ? "30-90 Days" : "0-30 Days"
    });
  }

  if (cashRunwayDays < 45) {
    managementActionPlan.push({
      id: "act-2",
      priority: "Immediate (0-30 Days)",
      issue: `Liquid cash runway is constrained at ${cashRunwayDays} Days (${formatLakhs(totalCashAndBank)} reserves).`,
      evidence: `Payables obligations stand at ${formatLakhs(totalPayables)} vs ${formatLakhs(totalCashAndBank)} cash.`,
      financialImpact: "Prevents operational liquidity bottlenecks and ensures timely settlement of payroll and statutory dues.",
      responsibleArea: "Finance & Accounts",
      recommendedAction: "Calibrate weekly payable disbursements against actual customer collections and preserve a 30-day liquidity buffer.",
      timeHorizon: "0-30 Days"
    });
  }

  if (grossMarginPct < 35 && activePeriodSales > 0) {
    managementActionPlan.push({
      id: "act-3",
      priority: "Medium-Term (30-90 Days)",
      issue: `Gross profit margin is ${grossMarginPct.toFixed(1)}% across ${periodLabel}.`,
      evidence: `Direct costs absorbed ${formatLakhs(activePeriodPurchases)} out of ${formatLakhs(activePeriodSales)} revenue.`,
      financialImpact: "A 3-5 percentage point improvement in gross margin expands operating profit significantly.",
      responsibleArea: "Operations & Delivery",
      recommendedAction: "Review pricing models, renegotiate vendor contracts, and improve delivery resource utilization.",
      timeHorizon: "30-90 Days"
    });
  }

  if (managementActionPlan.length === 0) {
    managementActionPlan.push({
      id: "act-default",
      priority: "Medium-Term (30-90 Days)",
      issue: "Maintain healthy working capital and cash collection cycle.",
      evidence: `Working capital stands at ${formatLakhs(netWorkingCapital)} with liquid cash of ${formatLakhs(totalCashAndBank)}.`,
      financialImpact: "Protects ongoing operational liquidity and supports scalable growth.",
      responsibleArea: "Finance & Accounts",
      recommendedAction: "Continue regular monthly reconciliation and monitor rolling 13-week cash flow forecasts.",
      timeHorizon: "30-90 Days"
    });
  }

  // 12. Executive CFO Takeaway Summary
  const overallPosition = totalCashAndBank >= totalPayables && netProfit >= 0
    ? `The company maintains a stable operating posture for ${periodLabel}, with positive net profitability of ${formatLakhs(netProfit)} (${netMarginPct.toFixed(1)}%) and adequate liquidity reserves.`
    : totalCashAndBank < totalPayables
      ? `The business is navigating short-term liquidity constraints for ${periodLabel}, as trade payables of ${formatLakhs(totalPayables)} exceed liquid cash reserves of ${formatLakhs(totalCashAndBank)}.`
      : `Operating performance for ${periodLabel} is stable, with working capital requiring ongoing monitoring as customer collection cycles fluctuate.`;

  const keyPositiveMovement = activePeriodSales > comparisonPeriodSales
    ? `Revenue reached ${formatLakhs(activePeriodSales)} (+${revGrowthPct.toFixed(1)}% vs comparison period).`
    : totalCashAndBank >= comparisonCashAndBank
      ? `Liquid cash balances strengthened to ${formatLakhs(totalCashAndBank)}.`
      : `Net working capital remained positive at ${formatLakhs(netWorkingCapital)}.`;

  const keyConcern = cashRunwayDays < 30
    ? `Cash runway is constrained at ${cashRunwayDays} Days at current operational burn rates.`
    : dsoDays > 60
      ? `DSO is elevated at ${dsoDays} Days, tying up ${formatLakhs(totalReceivables)} in receivables.`
      : topCustomerSharePct >= 50
        ? `High client concentration with ${topCustomerSharePct}% of billings dependent on a single customer.`
        : `Monitoring operational overhead to ensure overhead costs scale in line with revenue.`;

  const immediateManagementAttention = structuredInsights.find(i => i.priority === "IMMEDIATE")?.title 
    || structuredInsights[0]?.title 
    || "Maintain current collection velocity and monitor rolling cash flow.";

  return {
    clientId: client.id,
    clientName: client.name,
    sector: client.sector,
    financialYear: canonicalPeriod.fyStartYear,
    financialYearLabel: canonicalPeriod.financialYear,
    selectedMonth: selectedMonthName,
    calendarYear: calYear,
    periodKey: canonicalPeriod.periodKey,
    analysisMode,
    periodLabel,
    periodTitle,
    canonicalPeriod,
    calculationPeriod,
    comparisonPeriod,
    executiveTakeaway: {
      title: periodTitle,
      overallPosition,
      keyPositiveMovement,
      keyConcern,
      cashLiquidityObservation: `Liquid cash & bank funds stand at ${formatLakhs(totalCashAndBank)} providing ${cashRunwayDays > 365 ? "> 1 Year" : `${cashRunwayDays} Days`} runway.`,
      workingCapitalObservation: `Net working capital is ${formatLakhs(netWorkingCapital)} (AR: ${formatLakhs(totalReceivables)}, AP: ${formatLakhs(totalPayables)}, Inventory: ${formatLakhs(totalInventory)}).`,
      profitabilityObservation: `Gross Profit Margin is ${grossMarginPct.toFixed(1)}% on recorded revenue of ${formatLakhs(activePeriodSales)}.`,
      immediateManagementAttention,
      headlineMetrics: {
        revenue: activePeriodSales,
        revenueGrowthPct: revGrowthPct,
        grossProfit,
        grossMarginPct,
        netProfit,
        netMarginPct,
        cashBalance: totalCashAndBank,
        cashRunwayDays,
        netWorkingCapital,
        totalReceivables,
        totalPayables
      }
    },
    materialMovements,
    structuredInsights,
    crossMetricCorrelations,
    sectorSpecificInsights: {
      sector: client.sector,
      keyMetrics: sectorKeyMetrics,
      analysis: sectorAnalysisText
    },
    cfoQuestions,
    managementActionPlan,
    accountingControlFindings: {
      totalScrutinyExceptions: scrutinyAlerts.length,
      gstReconciliationStatus: reconStates.some(r => r.type.includes("GST") && r.mismatchAmount !== 0) ? "Tax Mismatch Detected" : "Reconciled",
      summary: scrutinyAlerts.length > 0 
        ? `${scrutinyAlerts.length} ledger scrutiny alerts identified across transactional classifications.`
        : "Standard ledger reconciliation checks reflect zero material forensic anomalies.",
      keyExceptions: scrutinyAlerts.slice(0, 5).map(a => a.title)
    },
    sourceMetadata: {
      totalVouchersInPeriod: vouchersInActivePeriod.length,
      totalLedgersAnalyzed: ledgers.length,
      periodDays,
      comparisonDays,
      monthsCount: isCumulative ? monthsInCumulative : 1
    }
  };
}
