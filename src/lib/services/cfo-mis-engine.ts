import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { parseFinancialPeriod } from "./early-warning-engine";

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
  selectedMonth: string;
  periodLabel: string;
  calculationPeriod: {
    start: string;
    end: string;
  };
  comparisonPeriod: {
    start: string;
    end: string;
  };
  executiveTakeaway: {
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

function formatDateIso(d: Date): string {
  return d.toISOString().split("T")[0];
}

export async function generateCfoMisReport(
  clientId: string,
  targetYear: number,
  selectedMonthParam: string = "Apr",
  fyTypeParam: string = "APR_MAR"
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

  const fyStartMonth = fyTypeParam === "JAN_DEC" ? 1 : (client.fiscalYearStartMonth || 4);
  const { targetMonthIndex, selectedMonthName, isJanDec } = parseFinancialPeriod(
    targetYear,
    selectedMonthParam,
    fyStartMonth
  );

  // Determine FY Calendar boundaries
  let fyStartCalYear = isJanDec ? targetYear : targetYear;
  const startMonthZeroIndexed = fyStartMonth - 1;

  let fyStartUtc = new Date(Date.UTC(fyStartCalYear, startMonthZeroIndexed, 1, 0, 0, 0, 0));
  let fyEndUtc = new Date(Date.UTC(fyStartCalYear + 1, startMonthZeroIndexed, 1, 0, 0, 0, 0));

  const countAtTarget = await prisma.normalizedVoucher.count({
    where: {
      clientId,
      date: { gte: fyStartUtc, lt: fyEndUtc }
    }
  });

  if (countAtTarget === 0 && !isJanDec) {
    const prevYearStart = new Date(Date.UTC(targetYear - 1, startMonthZeroIndexed, 1, 0, 0, 0, 0));
    const prevYearEnd = new Date(Date.UTC(targetYear, startMonthZeroIndexed, 1, 0, 0, 0, 0));
    const countAtPrev = await prisma.normalizedVoucher.count({
      where: {
        clientId,
        date: { gte: prevYearStart, lt: prevYearEnd }
      }
    });
    if (countAtPrev > 0) {
      fyStartCalYear = targetYear - 1;
      fyStartUtc = prevYearStart;
      fyEndUtc = prevYearEnd;
    }
  }

  // Calculate calendar month & year
  let calMonth: number;
  let calYear: number;

  if (isJanDec) {
    calMonth = targetMonthIndex + 1;
    calYear = fyStartCalYear;
  } else {
    if (targetMonthIndex < 9) {
      calMonth = targetMonthIndex + 4; // 4..12
      calYear = fyStartCalYear;
    } else {
      calMonth = targetMonthIndex - 8; // 1..3
      calYear = fyStartCalYear + 1;
    }
  }

  const monthStartUtc = new Date(Date.UTC(calYear, calMonth - 1, 1, 0, 0, 0, 0));
  const nextMonthNum = calMonth === 12 ? 1 : calMonth + 1;
  const nextYearNum = calMonth === 12 ? calYear + 1 : calYear;
  const monthEndUtc = new Date(Date.UTC(nextYearNum, nextMonthNum - 1, 1, 0, 0, 0, 0));

  // Prior month boundaries
  const prevMonthNum = calMonth === 1 ? 12 : calMonth - 1;
  const prevYearNum = calMonth === 1 ? calYear - 1 : calYear;
  const priorMonthStartUtc = new Date(Date.UTC(prevYearNum, prevMonthNum - 1, 1, 0, 0, 0, 0));
  const priorMonthEndUtc = monthStartUtc;

  // Trailing lookback window (up to 3 months ending at monthEndUtc)
  const lookbackMonthsCount = Math.min(3, targetMonthIndex + 1);
  let lookbackStartMonth = calMonth - lookbackMonthsCount + 1;
  let lookbackStartYear = calYear;
  if (lookbackStartMonth <= 0) {
    lookbackStartMonth += 12;
    lookbackStartYear -= 1;
  }
  const lookbackStartUtc = new Date(Date.UTC(lookbackStartYear, lookbackStartMonth - 1, 1, 0, 0, 0, 0));

  const daysInMonth = Math.round((monthEndUtc.getTime() - monthStartUtc.getTime()) / (1000 * 60 * 60 * 24));
  const daysInPriorMonth = Math.round((priorMonthEndUtc.getTime() - priorMonthStartUtc.getTime()) / (1000 * 60 * 60 * 24));

  const periodLabel = `${selectedMonthName} ${calYear}`;
  const priorPeriodLabel = `${prevMonthNum === 1 ? "Jan" : prevMonthNum === 2 ? "Feb" : prevMonthNum === 3 ? "Mar" : prevMonthNum === 4 ? "Apr" : prevMonthNum === 5 ? "May" : prevMonthNum === 6 ? "Jun" : prevMonthNum === 7 ? "Jul" : prevMonthNum === 8 ? "Aug" : prevMonthNum === 9 ? "Sep" : prevMonthNum === 10 ? "Oct" : prevMonthNum === 11 ? "Nov" : "Dec"} ${prevYearNum}`;

  const calculationPeriod = {
    start: formatDateIso(monthStartUtc),
    end: formatDateIso(new Date(monthEndUtc.getTime() - 1))
  };
  const comparisonPeriod = {
    start: formatDateIso(priorMonthStartUtc),
    end: formatDateIso(new Date(priorMonthEndUtc.getTime() - 1))
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

  // 3. Fetch Vouchers (Current Month, Prior Month, Lookback, and Full FY)
  const [vouchersInMonth, vouchersInPriorMonth, vouchersInLookback, vouchersInFY] = await Promise.all([
    prisma.normalizedVoucher.findMany({
      where: { clientId, date: { gte: monthStartUtc, lt: monthEndUtc } },
      include: {
        lines: {
          include: {
            ledger: { select: { id: true, name: true, groupName: true, openingBalance: true } }
          }
        }
      },
      orderBy: { date: "asc" }
    }),
    prisma.normalizedVoucher.findMany({
      where: { clientId, date: { gte: priorMonthStartUtc, lt: priorMonthEndUtc } },
      include: {
        lines: {
          include: {
            ledger: { select: { id: true, name: true, groupName: true } }
          }
        }
      }
    }),
    prisma.normalizedVoucher.findMany({
      where: { clientId, date: { gte: lookbackStartUtc, lt: monthEndUtc } },
      include: {
        lines: {
          include: {
            ledger: { select: { id: true, name: true, groupName: true } }
          }
        }
      }
    }),
    prisma.normalizedVoucher.findMany({
      where: { clientId, date: { gte: fyStartUtc, lt: monthEndUtc } },
      include: {
        lines: {
          select: { ledgerId: true, amount: true, entryType: true }
        }
      }
    })
  ]);

  // Compute exact running balances as of selectedMonthEnd
  const ledgerMovementsUpToSelectedMonth: Record<string, { debit: number; credit: number }> = {};
  const ledgerMovementsUpToPriorMonth: Record<string, { debit: number; credit: number }> = {};

  vouchersInFY.forEach(v => {
    const isPrior = v.date < monthStartUtc;
    v.lines.forEach(l => {
      if (!l.ledgerId) return;
      const amt = Math.abs(l.amount || 0);
      const isDebit = (l.entryType || "").toUpperCase() === "DEBIT";

      if (!ledgerMovementsUpToSelectedMonth[l.ledgerId]) {
        ledgerMovementsUpToSelectedMonth[l.ledgerId] = { debit: 0, credit: 0 };
      }
      if (isDebit) ledgerMovementsUpToSelectedMonth[l.ledgerId].debit += amt;
      else ledgerMovementsUpToSelectedMonth[l.ledgerId].credit += amt;

      if (isPrior) {
        if (!ledgerMovementsUpToPriorMonth[l.ledgerId]) {
          ledgerMovementsUpToPriorMonth[l.ledgerId] = { debit: 0, credit: 0 };
        }
        if (isDebit) ledgerMovementsUpToPriorMonth[l.ledgerId].debit += amt;
        else ledgerMovementsUpToPriorMonth[l.ledgerId].credit += amt;
      }
    });
  });

  const getLedgerBalanceAsOf = (ledger: typeof ledgers[0], isPriorMonth: boolean = false): number => {
    const mov = isPriorMonth 
      ? ledgerMovementsUpToPriorMonth[ledger.id] 
      : ledgerMovementsUpToSelectedMonth[ledger.id];
    const initial = ledger.openingBalance || 0;
    if (!mov) {
      return isPriorMonth ? initial : (ledger.closingBalance || initial);
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
    where: { clientId, year: { in: [fyStartCalYear, targetYear] } }
  });

  // Calculate monthly figures for current and prior month
  let currentMonthSales = 0;
  let currentMonthPurchases = 0;
  let currentMonthPayments = 0;
  let currentMonthReceipts = 0;

  vouchersInMonth.forEach(v => {
    const t = v.type.toLowerCase();
    if (t === "sales") currentMonthSales += v.totalAmount || 0;
    else if (t === "purchase") currentMonthPurchases += v.totalAmount || 0;
    else if (t === "payment") currentMonthPayments += v.totalAmount || 0;
    else if (t === "receipt") currentMonthReceipts += v.totalAmount || 0;
  });

  let priorMonthSales = 0;
  let priorMonthPurchases = 0;
  let priorMonthPayments = 0;

  vouchersInPriorMonth.forEach(v => {
    const t = v.type.toLowerCase();
    if (t === "sales") priorMonthSales += v.totalAmount || 0;
    else if (t === "purchase") priorMonthPurchases += v.totalAmount || 0;
    else if (t === "payment") priorMonthPayments += v.totalAmount || 0;
  });

  // Fallback to monthly PNL values if voucher sales are zero
  if (currentMonthSales === 0) {
    pnlValues.forEach(pv => {
      if (pv.month?.toLowerCase() === selectedMonthName.toLowerCase()) {
        const h = pv.headName.toLowerCase();
        const amt = decryptValue(pv.amount);
        if (h.includes("revenue") || h.includes("sales") || h.includes("income")) {
          currentMonthSales += amt;
        } else if (h.includes("cogs") || h.includes("purchase") || h.includes("direct expense")) {
          currentMonthPurchases += amt;
        }
      }
    });
  }

  // Balances as of Month End
  const totalCashAndBank = cashAndBankLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l)), 0);
  const priorCashAndBank = cashAndBankLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l, true)), 0);

  const totalReceivables = receivableLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l)), 0);
  const priorReceivables = receivableLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l, true)), 0);

  const totalPayables = payableLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l)), 0);
  const priorPayables = payableLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l, true)), 0);

  const totalInventory = client.sector === "SERVICE" 
    ? 0 
    : inventoryLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l)), 0);
  const priorInventory = client.sector === "SERVICE"
    ? 0
    : inventoryLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l, true)), 0);

  const netWorkingCapital = totalReceivables + totalInventory - totalPayables;
  const priorNetWorkingCapital = priorReceivables + priorInventory - priorPayables;

  // Monthly Profitability
  const grossProfit = currentMonthSales - currentMonthPurchases;
  const grossMarginPct = currentMonthSales > 0 ? (grossProfit / currentMonthSales) * 100 : 0;
  const priorGrossProfit = priorMonthSales - priorMonthPurchases;
  const priorGrossMarginPct = priorMonthSales > 0 ? (priorGrossProfit / priorMonthSales) * 100 : 0;

  // Expense grouping for current month
  const monthlyExpenseByLedger: Record<string, { name: string; group: string; amount: number }> = {};
  vouchersInMonth.forEach(v => {
    if (v.type.toLowerCase() === "payment" || v.type.toLowerCase() === "journal") {
      v.lines.forEach(l => {
        if (l.ledger) {
          const g = (l.ledger.groupName || "").toLowerCase();
          if (g.includes("expense") || g.includes("indirect") || g.includes("admin") || g.includes("salary") || g.includes("rent") || g.includes("fees")) {
            const amt = Math.abs(l.amount || 0);
            if (!monthlyExpenseByLedger[l.ledger.id]) {
              monthlyExpenseByLedger[l.ledger.id] = { name: l.ledger.name, group: l.ledger.groupName, amount: 0 };
            }
            monthlyExpenseByLedger[l.ledger.id].amount += amt;
          }
        }
      });
    }
  });

  const totalMonthlyOpex = Object.values(monthlyExpenseByLedger).reduce((s, e) => s + e.amount, 0);
  const netProfit = grossProfit - totalMonthlyOpex;
  const netMarginPct = currentMonthSales > 0 ? (netProfit / currentMonthSales) * 100 : 0;

  // Customer Concentration for Month
  const customerBillingInMonth: Record<string, { name: string; amount: number }> = {};
  let totalDebtorBillingInMonth = 0;

  vouchersInMonth.forEach(v => {
    if (v.type.toLowerCase() === "sales" || v.type.toLowerCase() === "receipt") {
      for (const line of v.lines) {
        if (line.ledger && (line.ledger.groupName || "").toLowerCase().includes("debtor")) {
          const amount = Math.abs(line.amount || 0);
          if (!customerBillingInMonth[line.ledger.id]) {
            customerBillingInMonth[line.ledger.id] = { name: line.ledger.name, amount: 0 };
          }
          customerBillingInMonth[line.ledger.id].amount += amount;
          totalDebtorBillingInMonth += amount;
        }
      }
    }
  });

  const sortedCustomersInMonth = Object.values(customerBillingInMonth).sort((a, b) => b.amount - a.amount);
  const topCustomerInMonth = sortedCustomersInMonth[0];
  const topCustomerSharePct = topCustomerInMonth && totalDebtorBillingInMonth > 0
    ? Math.round((topCustomerInMonth.amount / totalDebtorBillingInMonth) * 100)
    : 0;

  // Vendor Concentration for Month (Trading / Mfg)
  const vendorPurchasesInMonth: Record<string, { name: string; amount: number }> = {};
  let totalCreditorPurchasesInMonth = 0;

  vouchersInMonth.forEach(v => {
    if (v.type.toLowerCase() === "purchase" || v.type.toLowerCase() === "payment") {
      for (const line of v.lines) {
        if (line.ledger && (line.ledger.groupName || "").toLowerCase().includes("creditor")) {
          const amount = Math.abs(line.amount || 0);
          if (!vendorPurchasesInMonth[line.ledger.id]) {
            vendorPurchasesInMonth[line.ledger.id] = { name: line.ledger.name, amount: 0 };
          }
          vendorPurchasesInMonth[line.ledger.id].amount += amount;
          totalCreditorPurchasesInMonth += amount;
        }
      }
    }
  });

  const sortedVendorsInMonth = Object.values(vendorPurchasesInMonth).sort((a, b) => b.amount - a.amount);
  const topVendorInMonth = sortedVendorsInMonth[0];
  const topVendorSharePct = topVendorInMonth && totalCreditorPurchasesInMonth > 0
    ? Math.round((topVendorInMonth.amount / totalCreditorPurchasesInMonth) * 100)
    : 0;

  // Operational Burn and Cash Runway
  let lookbackPaymentsTotal = 0;
  vouchersInLookback.forEach(v => {
    if (v.type.toLowerCase() === "payment" || v.type.toLowerCase() === "purchase") {
      lookbackPaymentsTotal += v.totalAmount || 0;
    }
  });
  const effectiveLookbackMonths = Math.max(1, lookbackMonthsCount);
  const monthlyOperationalBurn = lookbackPaymentsTotal > 0
    ? (lookbackPaymentsTotal / effectiveLookbackMonths)
    : (currentMonthPayments > 0 ? currentMonthPayments : (totalMonthlyOpex + currentMonthPurchases));

  const dailyBurnRate = monthlyOperationalBurn > 0 ? (monthlyOperationalBurn / daysInMonth) : 0;
  const cashRunwayDays = dailyBurnRate > 0 ? Math.round(totalCashAndBank / dailyBurnRate) : (totalCashAndBank > 0 ? 365 : 0);

  // DSO Calculation
  const dsoDays = currentMonthSales > 0 
    ? Math.round((totalReceivables / currentMonthSales) * daysInMonth)
    : (priorMonthSales > 0 ? Math.round((totalReceivables / priorMonthSales) * daysInMonth) : 0);

  const priorDsoDays = priorMonthSales > 0
    ? Math.round((priorReceivables / priorMonthSales) * daysInPriorMonth)
    : 0;

  // 5. Scrutiny & Compliance Integration
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

  addMovement("Revenue / Billing", currentMonthSales, priorMonthSales, true, 
    currentMonthSales > priorMonthSales 
      ? `Revenue grew by ${formatLakhs(currentMonthSales - priorMonthSales)} (+${Math.round(((currentMonthSales - priorMonthSales) / (priorMonthSales || 1)) * 100)}%) in ${periodLabel}.`
      : `Revenue declined by ${formatLakhs(priorMonthSales - currentMonthSales)} in ${periodLabel}.`);

  addMovement("Trade Receivables (AR)", totalReceivables, priorReceivables, false,
    totalReceivables > priorReceivables
      ? `Outstanding receivables expanded by ${formatLakhs(totalReceivables - priorReceivables)} tied up with customers.`
      : `Receivables decreased by ${formatLakhs(priorReceivables - totalReceivables)} due to collection receipts.`);

  addMovement("Liquid Cash & Bank", totalCashAndBank, priorCashAndBank, true,
    totalCashAndBank >= priorCashAndBank
      ? `Cash reserves strengthened by ${formatLakhs(totalCashAndBank - priorCashAndBank)}.`
      : `Cash reserves declined by ${formatLakhs(priorCashAndBank - totalCashAndBank)} due to operational disbursements.`);

  addMovement("Trade Payables (AP)", totalPayables, priorPayables, true,
    totalPayables > priorPayables
      ? `Supplier credit extended by ${formatLakhs(totalPayables - priorPayables)}.`
      : `Creditor obligations settled down by ${formatLakhs(priorPayables - totalPayables)}.`);

  addMovement("Net Working Capital", netWorkingCapital, priorNetWorkingCapital, true,
    netWorkingCapital >= 0
      ? `Net working capital stands positive at ${formatLakhs(netWorkingCapital)}.`
      : `Net working capital is in a deficit of ${formatLakhs(Math.abs(netWorkingCapital))}.`);

  // 7. Structured CFO Insight Cards (Observation -> Driver -> Impact -> Risk -> Action -> Question)
  const structuredInsights: CfoInsightCard[] = [];

  // Insight 1: Receivables vs Revenue Elasticity
  const revGrowthPct = priorMonthSales > 0 ? ((currentMonthSales - priorMonthSales) / priorMonthSales) * 100 : 0;
  const arGrowthPct = priorReceivables > 0 ? ((totalReceivables - priorReceivables) / priorReceivables) * 100 : 0;

  if (totalReceivables > 0 && (arGrowthPct > revGrowthPct + 10 || dsoDays > 60)) {
    const topDebtors = receivableLedgers.slice(0, 3).map(l => ({ name: l.name, group: l.groupName, amount: getLedgerBalanceAsOf(l) }));
    structuredInsights.push({
      id: "cfo-insight-receivables-drag",
      category: "WORKING_CAPITAL",
      priority: dsoDays > 90 || totalReceivables > totalCashAndBank * 5 ? "IMMEDIATE" : "MANAGEMENT_ATTENTION",
      title: "Working Capital Drag: Receivables Growing Faster than Revenue",
      observation: `Trade receivables increased by ${arGrowthPct > 0 ? `+${arGrowthPct.toFixed(1)}%` : `${formatLakhs(totalReceivables)}`} in ${periodLabel}, outpacing revenue movement (${revGrowthPct > 0 ? `+${revGrowthPct.toFixed(1)}%` : "flat/declining"}). Collection velocity stands at ${dsoDays} Days.`,
      driver: topCustomerInMonth 
        ? `Receivable accumulation is concentrated in key accounts including '${topCustomerInMonth.name}' which accounts for ${topCustomerSharePct}% of recorded billing in ${periodLabel}.`
        : "Likely driver cannot be determined from available accounting data.",
      impact: `An additional ${formatLakhs(Math.max(0, totalReceivables - priorReceivables))} of operational liquidity is trapped in unpaid client invoices, increasing short-term funding reliance.`,
      risk: "Failure to enforce committed payment dates will compress operating cash runway and potentially require expensive short-term bridge borrowing.",
      action: "Review the top 3 overdue debtor ledgers, institute weekly milestone follow-ups, and require milestone advances on future engagements.",
      cfoQuestion: topCustomerInMonth
        ? `What caused the outstanding balance for '${topCustomerInMonth.name}' to reach ${formatLakhs(topCustomerInMonth.amount)}, and what is the committed collection schedule?`
        : `What explains the collection cycle stretching to ${dsoDays} days, and which customer invoices are past 30 days?`,
      metricValue: `${dsoDays} Days DSO`,
      metricTrend: dsoDays > priorDsoDays ? "UP" : "STABLE",
      drilldown: {
        ruleName: "Receivables-to-Revenue Elasticity & Working Capital Trap",
        formula: `DSO = (Receivables as of ${periodLabel} / Monthly Sales) × ${daysInMonth} Days`,
        calculatedValue: `DSO: ${dsoDays} Days (Receivables: ${formatLakhs(totalReceivables)} vs Sales: ${formatLakhs(currentMonthSales)})`,
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
      title: cashRunwayDays <= 15 ? "Critical Liquidity Alert: Constrained Cash Runway" : "Liquidity Management Notice",
      observation: `Available cash and bank balances stand at ${formatLakhs(totalCashAndBank)} as of ${periodLabel}, representing an estimated ${cashRunwayDays > 365 ? "> 1 Year" : `${cashRunwayDays} Days`} of operating runway at the current monthly burn of ${formatLakhs(monthlyOperationalBurn)}.`,
      driver: totalPayables > 0 
        ? `Current trade payables obligations of ${formatLakhs(totalPayables)} exceed immediate liquid cash reserves by ${formatLakhs(Math.max(0, totalPayables - totalCashAndBank))}.`
        : "Operational cash disbursements over the lookback window exceed cash receipts.",
      impact: `The company is operating on tight liquidity buffers, leaving little margin for delayed customer receipts or unexpected statutory/vendor liabilities.`,
      risk: "Inability to meet payroll, statutory tax remittances, or essential supplier dues without relying on immediate incoming customer collections.",
      action: `Expedite collection on ${formatLakhs(totalReceivables)} in trade receivables and structure vendor payment tranches to preserve a minimum 30-day liquidity buffer.`,
      cfoQuestion: `Given the ${cashRunwayDays}-day cash runway, which specific customer collections are forecasted to close within the next 10 business days?`,
      metricValue: `${cashRunwayDays} Days Runway`,
      metricTrend: cashRunwayDays < 30 ? "DOWN" : "STABLE",
      drilldown: {
        ruleName: "Cash Liquidity & Operating Burn Analysis",
        formula: "Cash Runway = Liquid Cash & Bank Balances / (Average Monthly Operational Outflow / 30)",
        calculatedValue: `Runway: ${cashRunwayDays} Days | Cash: ${formatLakhs(totalCashAndBank)} | Monthly Burn: ${formatLakhs(monthlyOperationalBurn)}`,
        periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
        supportingLedgers: topCashAndBank,
        dataSufficiency: "FULL"
      }
    });
  }

  // Insight 3: Profitability & Margin Diagnostics
  if (currentMonthSales > 0) {
    const topDirectCosts = directExpenseLedgers.slice(0, 3).map(l => ({ name: l.name, group: l.groupName, amount: getLedgerBalanceAsOf(l) }));
    if (grossMarginPct < 30 || (priorGrossMarginPct > 0 && grossMarginPct < priorGrossMarginPct - 5)) {
      structuredInsights.push({
        id: "cfo-insight-margin-compression",
        category: "PROFITABILITY",
        priority: "MANAGEMENT_ATTENTION",
        title: "Gross Margin Compression Detected",
        observation: `Gross Margin is ${grossMarginPct.toFixed(1)}% in ${periodLabel}${priorGrossMarginPct > 0 ? `, compressing from ${priorGrossMarginPct.toFixed(1)}% in ${priorPeriodLabel}` : ""}.`,
        driver: currentMonthPurchases > 0
          ? `Direct procurement / delivery expenses of ${formatLakhs(currentMonthPurchases)} absorbed ${((currentMonthPurchases / currentMonthSales) * 100).toFixed(1)}% of total revenue in ${periodLabel}.`
          : "Direct operational delivery costs increased relative to billable revenue.",
        impact: `Unit economics and contribution margin have weakened, requiring higher sales volumes to cover fixed operating overhead.`,
        risk: "Persistent margin compression will erode operating EBITDA and eliminate net profitability if cost increases cannot be passed on to clients.",
        action: "Conduct a line-item audit of direct delivery costs and review client engagement pricing to re-align rates with current operational cost bases.",
        cfoQuestion: `What specific cost elements drove direct delivery expenses to ${formatLakhs(currentMonthPurchases)}, and can pricing on active contracts be adjusted?`,
        metricValue: `${grossMarginPct.toFixed(1)}% Margin`,
        metricTrend: grossMarginPct < priorGrossMarginPct ? "DOWN" : "STABLE",
        drilldown: {
          ruleName: "Gross Profit Margin & Direct Cost Ratio",
          formula: "Gross Margin % = ((Revenue - Direct Cost) / Revenue) × 100",
          calculatedValue: `Gross Margin: ${grossMarginPct.toFixed(1)}% (Revenue: ${formatLakhs(currentMonthSales)}, Direct Costs: ${formatLakhs(currentMonthPurchases)})`,
          periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
          supportingLedgers: topDirectCosts,
          dataSufficiency: "FULL"
        }
      });
    }
  }

  // Insight 4: Revenue / Customer Concentration
  if (client.sector === "SERVICE" && topCustomerSharePct >= 35 && topCustomerInMonth) {
    const debtorLedgersSample = sortedCustomersInMonth.slice(0, 5).map(c => ({ name: c.name, group: "Sundry Debtors", amount: c.amount }));
    structuredInsights.push({
      id: "cfo-insight-customer-concentration",
      category: "CUSTOMER",
      priority: topCustomerSharePct > 55 ? "IMMEDIATE" : "MANAGEMENT_ATTENTION",
      title: "Elevated Client Revenue Concentration Risk",
      observation: `In ${periodLabel}, a single client '${topCustomerInMonth.name}' represented ${topCustomerSharePct}% (${formatLakhs(topCustomerInMonth.amount)}) of total monthly billings (${formatLakhs(totalDebtorBillingInMonth)}).`,
      driver: `Revenue generation is heavily concentrated in a single engagement account during ${periodLabel}.`,
      impact: `Monthly business cash flow is disproportionately reliant on the ongoing scope and punctual payment of '${topCustomerInMonth.name}'.`,
      risk: "Any dispute, milestone delay, or contract scope reduction with this primary client would immediately destabilize monthly revenue.",
      action: "Accelerate outreach to secondary client pipelines to distribute monthly revenue across wider customer accounts.",
      cfoQuestion: `What is the contract term and renewal status for '${topCustomerInMonth.name}', and what secondary client proposals are in the active closing pipeline?`,
      metricValue: `${topCustomerSharePct}% Share`,
      metricTrend: "UP",
      drilldown: {
        ruleName: "Client Billing Concentration Analysis",
        formula: "(Top Client Monthly Billing / Total Monthly Billing) × 100",
        calculatedValue: `Top Client '${topCustomerInMonth.name}' = ${formatLakhs(topCustomerInMonth.amount)} (${topCustomerSharePct}%)`,
        periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
        supportingLedgers: debtorLedgersSample,
        dataSufficiency: "FULL"
      }
    });
  } else if (client.sector !== "SERVICE" && topVendorSharePct >= 40 && topVendorInMonth) {
    const creditorLedgersSample = sortedVendorsInMonth.slice(0, 5).map(v => ({ name: v.name, group: "Sundry Creditors", amount: v.amount }));
    structuredInsights.push({
      id: "cfo-insight-vendor-concentration",
      category: "VENDOR",
      priority: topVendorSharePct > 60 ? "IMMEDIATE" : "MANAGEMENT_ATTENTION",
      title: "Supplier Concentration & Procurement Dependency",
      observation: `Procurement from top vendor '${topVendorInMonth.name}' accounted for ${topVendorSharePct}% (${formatLakhs(topVendorInMonth.amount)}) of total monthly supplier purchases (${formatLakhs(totalCreditorPurchasesInMonth)}).`,
      driver: `Procurement is heavily centralized with '${topVendorInMonth.name}' during ${periodLabel}.`,
      impact: `The company has elevated operational dependency on a single supplier for production/inventory availability.`,
      risk: "Supplier price increases or supply-chain bottlenecks would directly impact order fulfillment and gross margins.",
      action: "Engage secondary backup suppliers and negotiate multi-vendor volume agreements to safeguard supply stability.",
      cfoQuestion: `What pricing benchmarks exist for materials supplied by '${topVendorInMonth.name}', and are backup supply agreements active?`,
      metricValue: `${topVendorSharePct}% Share`,
      metricTrend: "UP",
      drilldown: {
        ruleName: "Single Supplier Concentration Analysis",
        formula: "(Top Vendor Procurement / Total Supplier Procurement) × 100",
        calculatedValue: `Top Supplier '${topVendorInMonth.name}' = ${formatLakhs(topVendorInMonth.amount)} (${topVendorSharePct}%)`,
        periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
        supportingLedgers: creditorLedgersSample,
        dataSufficiency: "FULL"
      }
    });
  }

  // Insight 5: Accounting & Scrutiny Observations
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
      risk: "Risk of departmental scrutiny, tax notice exposure, or misstated financial ratios if balances are unadjusted.",
      action: "Direct the accounts team to review and resolve the flagged voucher entries before finalize monthly reporting.",
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

  if (currentMonthSales > priorMonthSales && totalReceivables > priorReceivables && totalCashAndBank < priorCashAndBank) {
    crossMetricCorrelations.push({
      title: "Revenue Growth is Trapping Cash in Uncollected Receivables",
      pattern: "Revenue ↑ | Receivables ↑↑ | Cash Balance ↓",
      implication: "Although revenue expanded, it has not translated into operating liquidity because receivables increased faster than collections, leading to an operating cash drain.",
      managementAction: "Enforce milestone billing and tighten collection windows for active accounts to convert reported revenue into realized cash."
    });
  }

  if (grossMarginPct < priorGrossMarginPct && currentMonthPurchases > priorMonthPurchases) {
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
      pattern: `Revenue: ${formatLakhs(currentMonthSales)} | Receivables: ${formatLakhs(totalReceivables)} | Cash: ${formatLakhs(totalCashAndBank)}`,
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
      { label: "Revenue Realization", value: formatLakhs(currentMonthSales), assessment: currentMonthSales > 0 ? "Active" : "Low Volume" },
      { label: "Collection Velocity (DSO)", value: `${dsoDays} Days`, assessment: dsoDays <= 45 ? "Healthy" : "Elevated" },
      { label: "Client Concentration", value: `${topCustomerSharePct}%`, assessment: topCustomerSharePct <= 35 ? "Diversified" : "Concentrated" }
    );
    sectorAnalysisText = `As a Service sector business, cash generation is governed by billable realization and debtor collection velocity. In ${periodLabel}, collection cycle stands at ${dsoDays} Days. Retaining low client concentration below 35% is key to ensuring sustainable monthly cash flow.`;
  } else if (client.sector === "MANUFACTURING") {
    const dsiDays = currentMonthPurchases > 0 ? Math.round((totalInventory / currentMonthPurchases) * daysInMonth) : 0;
    sectorKeyMetrics.push(
      { label: "Gross Margin", value: `${grossMarginPct.toFixed(1)}%`, assessment: grossMarginPct >= 35 ? "Strong" : "Compressed" },
      { label: "Inventory Holding (DSI)", value: `${dsiDays} Days`, assessment: dsiDays <= 60 ? "Optimal" : "Extended" },
      { label: "Supplier Concentration", value: `${topVendorSharePct}%`, assessment: topVendorSharePct <= 40 ? "Diversified" : "High" }
    );
    sectorAnalysisText = `In Manufacturing, operating profitability hinges on raw material cost control and inventory holding velocity. Total closing stock stands at ${formatLakhs(totalInventory)}. Ensuring inventory turnover matches rolling 30-day production schedules avoids tying up scarce working capital.`;
  } else {
    // Trading
    const dsiDays = currentMonthPurchases > 0 ? Math.round((totalInventory / currentMonthPurchases) * daysInMonth) : 0;
    sectorKeyMetrics.push(
      { label: "Gross Margin", value: `${grossMarginPct.toFixed(1)}%`, assessment: grossMarginPct >= 20 ? "Standard" : "Low" },
      { label: "Inventory Holding (DSI)", value: `${dsiDays} Days`, assessment: dsiDays <= 45 ? "Optimal" : "Stretched" },
      { label: "Vendor Concentration", value: `${topVendorSharePct}%`, assessment: topVendorSharePct <= 40 ? "Diversified" : "High" }
    );
    sectorAnalysisText = `Trading operations rely on rapid stock turns and supplier financing terms. Working capital cycle is currently at ${dsoDays + dsiDays} Days (DSO + DSI). Optimizing purchase batch sizes and maintaining strong creditor relationships preserves liquidity.`;
  }

  // 10. CFO Questions for Management
  const cfoQuestions: CfoManagementQuestion[] = [];

  if (dsoDays > 45) {
    cfoQuestions.push({
      id: "q-dso",
      area: "CREDIT_CONTROL",
      question: `Why has our collection cycle reached ${dsoDays} Days, and what specific recovery dates are committed for receivables past 30 days?`,
      context: `Receivables stand at ${formatLakhs(totalReceivables)} as of ${periodLabel}.`,
      dataTrace: `Receivables: ${formatLakhs(totalReceivables)} | Sales: ${formatLakhs(currentMonthSales)}`
    });
  }

  if (topCustomerInMonth && topCustomerSharePct >= 35) {
    cfoQuestions.push({
      id: "q-cust-conc",
      area: "SALES",
      question: `What steps are being taken to expand billing across other accounts so that '${topCustomerInMonth.name}' does not represent ${topCustomerSharePct}% of our revenue?`,
      context: `Top client generated ${formatLakhs(topCustomerInMonth.amount)} of ${formatLakhs(totalDebtorBillingInMonth)} in ${periodLabel}.`,
      dataTrace: `Top Customer Share: ${topCustomerSharePct}%`
    });
  }

  if (cashRunwayDays < 45) {
    cfoQuestions.push({
      id: "q-liquidity",
      area: "FINANCE",
      question: `With liquid cash reserves of ${formatLakhs(totalCashAndBank)} giving a ${cashRunwayDays}-day runway, what cash collections are forecasted over the next 14 days?`,
      context: `Current monthly operational burn rate is estimated at ${formatLakhs(monthlyOperationalBurn)}.`,
      dataTrace: `Cash & Bank: ${formatLakhs(totalCashAndBank)} | Monthly Burn: ${formatLakhs(monthlyOperationalBurn)}`
    });
  }

  if (grossMarginPct < priorGrossMarginPct - 3 && currentMonthSales > 0) {
    cfoQuestions.push({
      id: "q-margin",
      area: "OPERATIONS",
      question: `What caused gross profit margin to decline from ${priorGrossMarginPct.toFixed(1)}% to ${grossMarginPct.toFixed(1)}% in ${periodLabel}?`,
      context: `Direct costs were ${formatLakhs(currentMonthPurchases)} on ${formatLakhs(currentMonthSales)} revenue.`,
      dataTrace: `Direct Cost Ratio: ${((currentMonthPurchases / currentMonthSales) * 100).toFixed(1)}%`
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
      context: `Revenue for ${periodLabel} reached ${formatLakhs(currentMonthSales)} with Net Working Capital at ${formatLakhs(netWorkingCapital)}.`,
      dataTrace: `Revenue: ${formatLakhs(currentMonthSales)} | NWC: ${formatLakhs(netWorkingCapital)}`
    });
  }

  // 11. Management Action Plan
  const managementActionPlan: ManagementActionItem[] = [];

  if (totalReceivables > 0 && dsoDays > 45) {
    managementActionPlan.push({
      id: "act-1",
      priority: "Immediate (0-30 Days)",
      issue: `Receivables stand at ${formatLakhs(totalReceivables)} with DSO at ${dsoDays} Days.`,
      evidence: topCustomerInMonth ? `Concentrated in '${topCustomerInMonth.name}' (${formatLakhs(topCustomerInMonth.amount)}).` : `Total trade debtors balance of ${formatLakhs(totalReceivables)}.`,
      financialImpact: `Releasing overdue receivables will inject up to ${formatLakhs(totalReceivables * 0.3)} directly into liquid cash reserves.`,
      responsibleArea: "Sales & Collections",
      recommendedAction: "Execute structured payment reminders, follow up on all invoices >30 days, and establish agreed payment schedules.",
      timeHorizon: "0-30 Days"
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

  if (grossMarginPct < 35 && currentMonthSales > 0) {
    managementActionPlan.push({
      id: "act-3",
      priority: "Medium-Term (30-90 Days)",
      issue: `Gross profit margin is ${grossMarginPct.toFixed(1)}%.`,
      evidence: `Direct costs absorbed ${formatLakhs(currentMonthPurchases)} out of ${formatLakhs(currentMonthSales)} revenue.`,
      financialImpact: "A 3-5 percentage point improvement in gross margin expands monthly operating profit significantly.",
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

  const keyPositiveMovement = currentMonthSales > priorMonthSales
    ? `Revenue expanded to ${formatLakhs(currentMonthSales)} (+${revGrowthPct.toFixed(1)}% vs ${priorPeriodLabel}).`
    : totalCashAndBank >= priorCashAndBank
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
    financialYear: targetYear,
    selectedMonth: selectedMonthName,
    periodLabel,
    calculationPeriod,
    comparisonPeriod,
    executiveTakeaway: {
      overallPosition,
      keyPositiveMovement,
      keyConcern,
      cashLiquidityObservation: `Liquid cash & bank funds stand at ${formatLakhs(totalCashAndBank)} providing ${cashRunwayDays > 365 ? "> 1 Year" : `${cashRunwayDays} Days`} runway.`,
      workingCapitalObservation: `Net working capital is ${formatLakhs(netWorkingCapital)} (AR: ${formatLakhs(totalReceivables)}, AP: ${formatLakhs(totalPayables)}, Inventory: ${formatLakhs(totalInventory)}).`,
      profitabilityObservation: `Gross Profit Margin is ${grossMarginPct.toFixed(1)}% on recorded revenue of ${formatLakhs(currentMonthSales)}.`,
      immediateManagementAttention,
      headlineMetrics: {
        revenue: currentMonthSales,
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
      totalVouchersInPeriod: vouchersInMonth.length,
      totalLedgersAnalyzed: ledgers.length,
      periodDays: daysInMonth,
      comparisonDays: daysInPriorMonth
    }
  };
}
