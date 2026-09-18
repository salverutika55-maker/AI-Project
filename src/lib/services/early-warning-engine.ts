import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";

export interface EarlyWarningAlert {
  id: string;
  type: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: "CASH_FLOW" | "RECEIVABLES" | "COMPLIANCE" | "OPERATIONAL" | "INVENTORY";
  title: string;
  description: string;
  metric: string;
  trend: "UP" | "DOWN" | "STABLE";
  selectedPeriod: string;
  calculationPeriod: {
    start: string;
    end: string;
  };
  comparisonPeriod?: {
    start: string;
    end: string;
  };
  sourceMetadata?: {
    ledgerCount: number;
    voucherCount: number;
    periodVolume: number;
  };
  drilldown: {
    ruleName: string;
    calculatedValue: string;
    formula: string;
    periodAnalyzed: string;
    comparisonPeriod?: string;
    threshold: string;
    reason: string;
    recommendation: string;
    supportingLedgers: Array<{ name: string; group: string; amount: number }>;
    supportingVouchersSummary?: Array<{ date: string; type: string; amount: number; party?: string }>;
    dataSufficiency: "FULL" | "PARTIAL" | "MINIMAL";
  };
}

export interface EarlyWarningResult {
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
  comparisonPeriod?: {
    start: string;
    end: string;
  };
  hasData: boolean;
  alerts: EarlyWarningAlert[];
  summary: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    totalCount: number;
  };
  dataSufficiency: {
    totalLedgers: number;
    totalVouchersInPeriod: number;
    monthsWithData: number;
    status: "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT";
    notes?: string;
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

export function parseFinancialPeriod(
  targetYear: number,
  selectedMonthParam: string = "Apr",
  fyStartMonth: number = 4
) {
  const isJanDec = fyStartMonth === 1;
  const monthNames = isJanDec
    ? ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    : ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

  let targetMonthIndex = monthNames.findIndex(
    m => m.toLowerCase() === selectedMonthParam.trim().toLowerCase()
  );
  if (targetMonthIndex === -1) {
    const num = parseInt(selectedMonthParam, 10);
    if (!isNaN(num) && num >= 1 && num <= 12) {
      if (isJanDec) targetMonthIndex = num - 1;
      else targetMonthIndex = num >= 4 ? num - 4 : num + 8;
    } else {
      targetMonthIndex = 0;
    }
  }

  const selectedMonthName = monthNames[targetMonthIndex];

  return {
    targetMonthIndex,
    selectedMonthName,
    isJanDec,
    monthNames
  };
}

export async function calculateEarlyWarnings(
  clientId: string,
  targetYear: number,
  selectedMonthParam: string = "Apr",
  fyTypeParam: string = "APR_MAR"
): Promise<EarlyWarningResult> {
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
  const { targetMonthIndex, selectedMonthName, isJanDec, monthNames } = parseFinancialPeriod(
    targetYear,
    selectedMonthParam,
    fyStartMonth
  );

  // Determine calendar years:
  // Detect if FY data in database aligns with startYear = targetYear or startYear = targetYear - 1
  let fyStartCalYear = isJanDec ? targetYear : targetYear;
  let startMonthZeroIndexed = fyStartMonth - 1;

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

  // Calculate calendar month (1-12) & year for the selected month
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

  const selectedPeriodKey = `${calYear}-${String(calMonth).padStart(2, "0")}`;
  const periodLabel = `${selectedMonthName} ${calYear}`;
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
  const expenseLedgers: typeof ledgers = [];

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
    if (g.includes("expense") || g.includes("purchase") || g.includes("cost") || n.includes("purchase")) {
      expenseLedgers.push(l);
    }
  }

  // 3. Fetch Vouchers for the Selected Month, Prior Month, and Trailing Window
  const [vouchersInMonth, vouchersInPriorMonth, vouchersInLookback, vouchersInFY] = await Promise.all([
    // Selected Month
    prisma.normalizedVoucher.findMany({
      where: {
        clientId,
        date: { gte: monthStartUtc, lt: monthEndUtc }
      },
      include: {
        lines: {
          include: {
            ledger: { select: { id: true, name: true, groupName: true, openingBalance: true } }
          }
        }
      },
      orderBy: { date: "asc" }
    }),
    // Prior Month
    prisma.normalizedVoucher.findMany({
      where: {
        clientId,
        date: { gte: priorMonthStartUtc, lt: priorMonthEndUtc }
      },
      include: {
        lines: {
          include: {
            ledger: { select: { id: true, name: true, groupName: true } }
          }
        }
      }
    }),
    // Trailing Lookback
    prisma.normalizedVoucher.findMany({
      where: {
        clientId,
        date: { gte: lookbackStartUtc, lt: monthEndUtc }
      },
      include: {
        lines: {
          include: {
            ledger: { select: { id: true, name: true, groupName: true } }
          }
        }
      }
    }),
    // All vouchers in FY up to selected month end
    prisma.normalizedVoucher.findMany({
      where: {
        clientId,
        date: { gte: fyStartUtc, lt: monthEndUtc }
      },
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

  // 4. Fetch PNL Values for the FY
  const pnlValues = await prisma.pNLValue.findMany({
    where: {
      clientId,
      year: { in: [fyStartCalYear, targetYear] }
    }
  });

  let annualRevenueFromPnl = 0;
  let annualCogsFromPnl = 0;
  let annualIndirectExpFromPnl = 0;

  pnlValues.forEach(pv => {
    const h = pv.headName.toLowerCase();
    const val = decryptValue(pv.amount);
    if (h.includes("revenue") || h.includes("sales") || h.includes("income")) {
      annualRevenueFromPnl += val;
    } else if (h.includes("cogs") || h.includes("cost of goods") || h.includes("direct expense")) {
      annualCogsFromPnl += val;
    } else if (h.includes("indirect expense") || h.includes("operating expense") || h.includes("administrative")) {
      annualIndirectExpFromPnl += val;
    }
  });

  // 5. Fetch Reconciliation States & Scrutiny/Compliance Alerts
  const reconStates = await prisma.reconciliationState.findMany({
    where: { clientId }
  });

  const scrutinyAlerts = await prisma.scrutinyAlert.findMany({
    where: { clientId, status: "PENDING" }
  });

  const complianceAlerts = await prisma.complianceAlert.findMany({
    where: { clientId, status: "PENDING" }
  });

  // Array to collect data-driven alerts
  const alerts: EarlyWarningAlert[] = [];

  // =========================================================================
  // RULE 1: CASH FLOW & LIQUIDITY RISK (PERIOD-AWARE)
  // =========================================================================
  const totalCashAndBank = cashAndBankLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l)), 0);
  const totalPayables = payableLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l)), 0);
  const totalReceivables = receivableLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l)), 0);

  // Operational Outflows in the selected month & lookback window
  let monthlyPaymentsInSelectedMonth = 0;
  vouchersInMonth.forEach(v => {
    if (v.type.toLowerCase() === "payment" || v.type.toLowerCase() === "purchase") {
      monthlyPaymentsInSelectedMonth += v.totalAmount || 0;
    }
  });

  let lookbackPaymentsTotal = 0;
  vouchersInLookback.forEach(v => {
    if (v.type.toLowerCase() === "payment" || v.type.toLowerCase() === "purchase") {
      lookbackPaymentsTotal += v.totalAmount || 0;
    }
  });

  const effectiveLookbackMonths = Math.max(1, lookbackMonthsCount);
  const monthlyOperationalBurn = lookbackPaymentsTotal > 0
    ? (lookbackPaymentsTotal / effectiveLookbackMonths)
    : monthlyPaymentsInSelectedMonth > 0
      ? monthlyPaymentsInSelectedMonth
      : (annualIndirectExpFromPnl + annualCogsFromPnl) / 12;

  const dailyBurnRate = monthlyOperationalBurn > 0 ? (monthlyOperationalBurn / daysInMonth) : 0;
  const cashRunwayDays = dailyBurnRate > 0 ? Math.round(totalCashAndBank / dailyBurnRate) : (totalCashAndBank > 0 ? 365 : 0);
  const netLiquidityGap = totalPayables - totalCashAndBank;

  if (dailyBurnRate > 0 || totalPayables > 0) {
    if (netLiquidityGap > 0 || cashRunwayDays < 45) {
      let severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "MEDIUM";
      if (cashRunwayDays <= 15 || netLiquidityGap > totalCashAndBank * 2) {
        severity = "CRITICAL";
      } else if (cashRunwayDays <= 35 || netLiquidityGap > 0) {
        severity = "HIGH";
      }

      alerts.push({
        id: "alert-cashflow-liquidity",
        type: severity,
        category: "CASH_FLOW",
        title: netLiquidityGap > 0 ? "Cash Flow Deficit & Liquidity Pressure" : "Constrained Cash Runway",
        description: `As of ${periodLabel}, liquid cash & bank funds stand at ${formatLakhs(totalCashAndBank)} against payable obligations of ${formatLakhs(totalPayables)}. Estimated cash runway is ${cashRunwayDays > 365 ? "> 1 Year" : `${cashRunwayDays} Days`} at an operational burn rate of ${formatLakhs(monthlyOperationalBurn)}/month.`,
        metric: cashRunwayDays < 90 ? `${cashRunwayDays} Days` : formatLakhs(netLiquidityGap),
        trend: cashRunwayDays < 30 ? "DOWN" : "STABLE",
        selectedPeriod: selectedPeriodKey,
        calculationPeriod,
        comparisonPeriod,
        sourceMetadata: {
          ledgerCount: cashAndBankLedgers.length + payableLedgers.length,
          voucherCount: vouchersInMonth.length,
          periodVolume: monthlyPaymentsInSelectedMonth
        },
        drilldown: {
          ruleName: `Cash Flow Runway & Working Capital Liquidity Test (${periodLabel})`,
          calculatedValue: `Runway: ${cashRunwayDays} Days | Liquid Funds: ${formatLakhs(totalCashAndBank)} | Payables: ${formatLakhs(totalPayables)}`,
          formula: `Cash Runway = Liquid Cash & Bank Balances (as of ${periodLabel}) / (Average Daily Operational Outflow)`,
          periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
          comparisonPeriod: `${comparisonPeriod.start} → ${comparisonPeriod.end}`,
          threshold: "Runway < 45 Days or Immediate Payables > Liquid Cash",
          reason: `Liquid funds of ${formatLakhs(totalCashAndBank)} are insufficient to comfortably service ${formatLakhs(totalPayables)} in outstanding payables without relying on incoming collections.`,
          recommendation: `Accelerate collection of ${formatLakhs(totalReceivables)} in trade receivables and establish structured payment milestones with key creditors.`,
          supportingLedgers: [
            ...cashAndBankLedgers.map(l => ({ name: l.name, group: l.groupName, amount: getLedgerBalanceAsOf(l) })),
            ...payableLedgers.slice(0, 5).map(l => ({ name: l.name, group: l.groupName, amount: getLedgerBalanceAsOf(l) }))
          ],
          dataSufficiency: vouchersInMonth.length > 5 ? "FULL" : "PARTIAL"
        }
      });
    }
  }

  // =========================================================================
  // RULE 2: RECEIVABLES / DSO DETERIORATION (PERIOD-AWARE)
  // =========================================================================
  let monthlySalesInSelectedMonth = 0;
  vouchersInMonth.forEach(v => {
    if (v.type.toLowerCase() === "sales") {
      monthlySalesInSelectedMonth += v.totalAmount || 0;
    }
  });

  let monthlySalesInPriorMonth = 0;
  vouchersInPriorMonth.forEach(v => {
    if (v.type.toLowerCase() === "sales") {
      monthlySalesInPriorMonth += v.totalAmount || 0;
    }
  });

  // Effective sales for period
  const effectiveMonthlySales = monthlySalesInSelectedMonth > 0 
    ? monthlySalesInSelectedMonth 
    : (annualRevenueFromPnl > 0 ? annualRevenueFromPnl / 12 : 0);

  if (effectiveMonthlySales > 0 && totalReceivables > 0) {
    const calculatedDso = Math.round((totalReceivables / effectiveMonthlySales) * daysInMonth);

    // Prior month DSO for trend detection
    const priorReceivables = receivableLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l, true)), 0);
    const priorMonthlySales = monthlySalesInPriorMonth > 0 ? monthlySalesInPriorMonth : effectiveMonthlySales;
    const priorDso = Math.round((priorReceivables / priorMonthlySales) * daysInPriorMonth);

    const isDeteriorating = calculatedDso > priorDso + 5;
    const isImproving = calculatedDso < priorDso - 5;
    const trend: "UP" | "DOWN" | "STABLE" = isDeteriorating ? "UP" : isImproving ? "DOWN" : "STABLE";

    if (calculatedDso > 45) {
      const severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = calculatedDso > 80 ? "HIGH" : "MEDIUM";

      alerts.push({
        id: "alert-receivables-dso",
        type: severity,
        category: "RECEIVABLES",
        title: isDeteriorating && calculatedDso > 70 ? "DSO Deteriorating Rapidly" : "Elevated Days Sales Outstanding (DSO)",
        description: `Days Sales Outstanding is ${calculatedDso} Days in ${periodLabel} (${trend === "UP" ? `up from ${priorDso} Days in prior month` : `vs ${priorDso} Days prior`}). Trade receivables stand at ${formatLakhs(totalReceivables)} against monthly revenue of ${formatLakhs(effectiveMonthlySales)}.`,
        metric: `${calculatedDso} Days`,
        trend,
        selectedPeriod: selectedPeriodKey,
        calculationPeriod,
        comparisonPeriod,
        sourceMetadata: {
          ledgerCount: receivableLedgers.length,
          voucherCount: vouchersInMonth.length,
          periodVolume: monthlySalesInSelectedMonth
        },
        drilldown: {
          ruleName: `Days Sales Outstanding (DSO) Analysis (${periodLabel})`,
          calculatedValue: `DSO: ${calculatedDso} Days | Prior DSO: ${priorDso} Days | Receivables: ${formatLakhs(totalReceivables)} | Month Sales: ${formatLakhs(effectiveMonthlySales)}`,
          formula: `DSO = (Trade Receivables as of ${periodLabel} / Monthly Sales in ${periodLabel}) × ${daysInMonth} Days`,
          periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
          comparisonPeriod: `${comparisonPeriod.start} → ${comparisonPeriod.end}`,
          threshold: "DSO > 45 Days (Standard Industry Baseline: 30-45 Days)",
          reason: `Average collection velocity of ${calculatedDso} days exceeds standard commercial credit terms, locking liquidity in uncollected invoices.`,
          recommendation: "Issue automated statement reminders, establish milestone-based billing, and follow up immediately on invoices past 30 days.",
          supportingLedgers: receivableLedgers.slice(0, 10).map(l => ({
            name: l.name,
            group: l.groupName,
            amount: getLedgerBalanceAsOf(l)
          })),
          dataSufficiency: effectiveMonthlySales > 0 ? "FULL" : "PARTIAL"
        }
      });
    }
  }

  // =========================================================================
  // RULE 3: GST & STATUTORY COMPLIANCE RISK (PERIOD-AWARE)
  // =========================================================================
  const dutiesAndTaxesBalance = dutiesAndTaxesLedgers.reduce((sum, l) => sum + Math.abs(getLedgerBalanceAsOf(l)), 0);
  const gstRecon = reconStates.find(r => r.type.includes("GST") && (r.statementPeriod?.includes(selectedPeriodKey) || r.statementPeriod?.includes(selectedMonthName)));
  const generalGstRecon = reconStates.find(r => r.type.includes("GST"));
  
  const gstScrutinyAlerts = scrutinyAlerts.filter(a => (a.ruleCode || "").includes("GST") || (a.title || "").includes("GST"));
  const complianceTaxAlerts = complianceAlerts.filter(a => (a.category || "").includes("TDS") || (a.category || "").includes("TAX"));

  let gstMismatchAmount = 0;
  let gstMismatchDetails = "";

  if (gstRecon && gstRecon.mismatchAmount && Math.abs(gstRecon.mismatchAmount) > 0) {
    gstMismatchAmount = Math.abs(gstRecon.mismatchAmount);
    gstMismatchDetails = `ITC/Output tax mismatch of ${formatLakhs(gstMismatchAmount)} identified in ${gstRecon.statementPeriod} GST reconciliation.`;
  } else if (generalGstRecon && generalGstRecon.mismatchAmount && Math.abs(generalGstRecon.mismatchAmount) > 0) {
    gstMismatchAmount = Math.abs(generalGstRecon.mismatchAmount);
    gstMismatchDetails = `Tax variance of ${formatLakhs(gstMismatchAmount)} identified in GST return filings.`;
  } else if (gstScrutinyAlerts.length > 0) {
    gstMismatchAmount = gstScrutinyAlerts.reduce((s, a) => s + (a.impactAmount || 0), 0);
    gstMismatchDetails = `${gstScrutinyAlerts.length} GST transactional classification exceptions totaling ${formatLakhs(gstMismatchAmount)} detected in ledger audit.`;
  }

  if (gstMismatchAmount > 5000) {
    const severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = gstMismatchAmount > 100000 ? "HIGH" : "MEDIUM";
    alerts.push({
      id: "alert-gst-compliance",
      type: severity,
      category: "COMPLIANCE",
      title: "GST Mismatch & Statutory Audit Alert",
      description: gstMismatchDetails || `Potential tax variance of ${formatLakhs(gstMismatchAmount)} detected in statutory duties ledgers for ${periodLabel}. Immediate reconciliation advised.`,
      metric: formatLakhs(gstMismatchAmount),
      trend: "UP",
      selectedPeriod: selectedPeriodKey,
      calculationPeriod,
      comparisonPeriod,
      drilldown: {
        ruleName: `Statutory Tax & GST Reconciliation Audit (${periodLabel})`,
        calculatedValue: `Variance: ${formatLakhs(gstMismatchAmount)} across ${dutiesAndTaxesLedgers.length} Duties & Taxes ledgers (Balance: ${formatLakhs(dutiesAndTaxesBalance)})`,
        formula: "GST Mismatch = |Output Liability - Input Tax Credit Claimed - GSTR Portal Filings|",
        periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
        threshold: "Mismatch > ₹5,000",
        reason: gstMismatchDetails || `Variance of ${formatLakhs(gstMismatchAmount)} detected between ledger entries and tax balances.`,
        recommendation: "Reconcile purchase register with GSTR-2B before monthly filing to prevent departmental notices and interest penalties under Section 50.",
        supportingLedgers: dutiesAndTaxesLedgers.map(l => ({
          name: l.name,
          group: l.groupName,
          amount: getLedgerBalanceAsOf(l)
        })),
        dataSufficiency: "FULL"
      }
    });
  } else if (complianceTaxAlerts.length > 0) {
    const tdsImpact = complianceTaxAlerts.reduce((s, a) => s + (a.impactAmount || 0), 0);
    alerts.push({
      id: "alert-tds-compliance",
      type: "MEDIUM",
      category: "COMPLIANCE",
      title: "Statutory TDS / Tax Audit Exceptions",
      description: `${complianceTaxAlerts.length} statutory deduction exceptions totaling ${formatLakhs(tdsImpact)} flagged during automated ledger verification.`,
      metric: formatLakhs(tdsImpact),
      trend: "STABLE",
      selectedPeriod: selectedPeriodKey,
      calculationPeriod,
      drilldown: {
        ruleName: `Statutory TDS Compliance Verification (${periodLabel})`,
        calculatedValue: `${complianceTaxAlerts.length} alerts totaling ${formatLakhs(tdsImpact)}`,
        formula: "Audit checks on TDS rate applicability, deductee PAN verification, and timely deposit",
        periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
        threshold: "Unresolved compliance exceptions > 0",
        reason: "Transactions found where statutory deduction rates deviate from prescribed IT Act schedules.",
        recommendation: "Review flagged vouchers and make necessary adjustment provisions or deposit interest on delayed deductions.",
        supportingLedgers: dutiesAndTaxesLedgers.map(l => ({
          name: l.name,
          group: l.groupName,
          amount: getLedgerBalanceAsOf(l)
        })),
        dataSufficiency: "FULL"
      }
    });
  }

  // =========================================================================
  // RULE 4: CONCENTRATION RISK (MONTHLY DATA-DRIVEN)
  // =========================================================================
  if (client.sector === "SERVICE") {
    // Service sector: Customer / Client Billing Concentration in Selected Month
    const customerBillingInMonth: Record<string, { name: string; amount: number }> = {};
    let totalServiceBillingInMonth = 0;

    vouchersInMonth.forEach(v => {
      if (v.type.toLowerCase() === "sales" || v.type.toLowerCase() === "receipt") {
        for (const line of v.lines) {
          if (line.ledger && (line.ledger.groupName || "").toLowerCase().includes("debtor")) {
            const amount = Math.abs(line.amount || 0);
            if (!customerBillingInMonth[line.ledger.id]) {
              customerBillingInMonth[line.ledger.id] = { name: line.ledger.name, amount: 0 };
            }
            customerBillingInMonth[line.ledger.id].amount += amount;
            totalServiceBillingInMonth += amount;
          }
        }
      }
    });

    const sortedCustomers = Object.values(customerBillingInMonth).sort((a, b) => b.amount - a.amount);
    if (sortedCustomers.length > 0 && totalServiceBillingInMonth > 0) {
      const topCustomer = sortedCustomers[0];
      const customerShare = Math.round((topCustomer.amount / totalServiceBillingInMonth) * 100);

      if (customerShare >= 35) {
        alerts.push({
          id: "alert-customer-concentration",
          type: customerShare > 55 ? "HIGH" : "MEDIUM",
          category: "OPERATIONAL",
          title: "High Client Revenue Concentration",
          description: `In ${periodLabel}, top client '${topCustomer.name}' accounts for ${customerShare}% (${formatLakhs(topCustomer.amount)}) of total recorded billings (${formatLakhs(totalServiceBillingInMonth)}).`,
          metric: `${customerShare}%`,
          trend: customerShare > 50 ? "UP" : "STABLE",
          selectedPeriod: selectedPeriodKey,
          calculationPeriod,
          comparisonPeriod,
          sourceMetadata: {
            ledgerCount: sortedCustomers.length,
            voucherCount: vouchersInMonth.length,
            periodVolume: totalServiceBillingInMonth
          },
          drilldown: {
            ruleName: `Client Revenue Concentration Risk (${periodLabel})`,
            calculatedValue: `Top Client '${topCustomer.name}' = ${formatLakhs(topCustomer.amount)} (${customerShare}%) of ${formatLakhs(totalServiceBillingInMonth)}`,
            formula: `(Top Client Billing in ${periodLabel} / Total Billings in ${periodLabel}) × 100`,
            periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
            threshold: "Top client share > 35%",
            reason: `High reliance on '${topCustomer.name}' for ${customerShare}% of ${periodLabel} billings creates vulnerability to revenue shocks if client scopes adjust.`,
            recommendation: "Accelerate outreach to secondary client pipelines to distribute monthly revenue across wider customer accounts.",
            supportingLedgers: sortedCustomers.slice(0, 5).map(c => ({
              name: c.name,
              group: "Sundry Debtors",
              amount: c.amount
            })),
            dataSufficiency: "FULL"
          }
        });
      }
    }
  } else {
    // Trading & Manufacturing: Vendor / Procurement Concentration in Selected Month
    const vendorPurchasesInMonth: Record<string, { name: string; amount: number }> = {};
    let totalPurchasesInMonth = 0;

    vouchersInMonth.forEach(v => {
      if (v.type.toLowerCase() === "purchase" || v.type.toLowerCase() === "payment") {
        for (const line of v.lines) {
          if (line.ledger && (line.ledger.groupName || "").toLowerCase().includes("creditor")) {
            const amount = Math.abs(line.amount || 0);
            if (!vendorPurchasesInMonth[line.ledger.id]) {
              vendorPurchasesInMonth[line.ledger.id] = { name: line.ledger.name, amount: 0 };
            }
            vendorPurchasesInMonth[line.ledger.id].amount += amount;
            totalPurchasesInMonth += amount;
          }
        }
      }
    });

    const sortedVendors = Object.values(vendorPurchasesInMonth).sort((a, b) => b.amount - a.amount);
    if (sortedVendors.length > 0 && totalPurchasesInMonth > 0) {
      const topVendor = sortedVendors[0];
      const vendorShare = Math.round((topVendor.amount / totalPurchasesInMonth) * 100);

      if (vendorShare >= 40) {
        alerts.push({
          id: "alert-vendor-concentration",
          type: vendorShare > 55 ? "HIGH" : "MEDIUM",
          category: "OPERATIONAL",
          title: "High Vendor Dependency",
          description: `In ${periodLabel}, procurement from top vendor '${topVendor.name}' represents ${vendorShare}% (${formatLakhs(topVendor.amount)}) of total monthly purchases (${formatLakhs(totalPurchasesInMonth)}).`,
          metric: `${vendorShare}%`,
          trend: vendorShare > 50 ? "UP" : "STABLE",
          selectedPeriod: selectedPeriodKey,
          calculationPeriod,
          comparisonPeriod,
          sourceMetadata: {
            ledgerCount: sortedVendors.length,
            voucherCount: vouchersInMonth.length,
            periodVolume: totalPurchasesInMonth
          },
          drilldown: {
            ruleName: `Single Supplier & Vendor Concentration Risk (${periodLabel})`,
            calculatedValue: `Top Supplier '${topVendor.name}' = ${formatLakhs(topVendor.amount)} (${vendorShare}%) of ${formatLakhs(totalPurchasesInMonth)}`,
            formula: `(Top Vendor Procurement in ${periodLabel} / Total Supplier Purchases in ${periodLabel}) × 100`,
            periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
            threshold: "Top vendor share > 40%",
            reason: `High reliance on '${topVendor.name}' creates supply-chain vulnerability and reduces procurement bargaining leverage.`,
            recommendation: "Engage secondary backup suppliers and negotiate multi-vendor volume agreements to safeguard supply stability.",
            supportingLedgers: sortedVendors.slice(0, 5).map(v => ({
              name: v.name,
              group: "Sundry Creditors",
              amount: v.amount
            })),
            dataSufficiency: "FULL"
          }
        });
      }
    }
  }

  // =========================================================================
  // RULE 5: INVENTORY AGEING / DSI (PERIOD-AWARE FOR TRADING & MANUFACTURING)
  // =========================================================================
  if (client.sector !== "SERVICE") {
    const totalInventoryValue = inventoryLedgers.reduce((sum, l) => sum + Math.max(0, getLedgerBalanceAsOf(l)), 0);
    
    // Monthly COGS / Purchases in the selected month
    let monthlyPurchases = 0;
    vouchersInMonth.forEach(v => {
      if (v.type.toLowerCase() === "purchase") {
        monthlyPurchases += v.totalAmount || 0;
      }
    });

    const effectiveMonthlyCogs = monthlyPurchases > 0 
      ? monthlyPurchases 
      : (annualCogsFromPnl > 0 ? annualCogsFromPnl / 12 : effectiveMonthlySales * 0.7);

    if (totalInventoryValue > 0 && effectiveMonthlyCogs > 0) {
      const dsiDays = Math.round((totalInventoryValue / effectiveMonthlyCogs) * daysInMonth);

      if (dsiDays > 60) {
        const severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = dsiDays > 120 ? "HIGH" : "MEDIUM";
        alerts.push({
          id: "alert-inventory-ageing",
          type: severity,
          category: "INVENTORY",
          title: dsiDays > 120 ? "Severe Inventory Stagnation & Ageing" : "Inventory Holding Period Stretched",
          description: `Days Sales of Inventory (DSI) is ${dsiDays} Days in ${periodLabel} with closing stock valued at ${formatLakhs(totalInventoryValue)} against monthly COGS of ${formatLakhs(effectiveMonthlyCogs)}.`,
          metric: `${dsiDays} Days`,
          trend: "UP",
          selectedPeriod: selectedPeriodKey,
          calculationPeriod,
          comparisonPeriod,
          sourceMetadata: {
            ledgerCount: inventoryLedgers.length,
            voucherCount: vouchersInMonth.length,
            periodVolume: effectiveMonthlyCogs
          },
          drilldown: {
            ruleName: `Inventory Turnover & Days Sales in Inventory (${periodLabel})`,
            calculatedValue: `DSI: ${dsiDays} Days | Stock Value: ${formatLakhs(totalInventoryValue)} | Month COGS: ${formatLakhs(effectiveMonthlyCogs)}`,
            formula: `DSI = (Closing Inventory as of ${periodLabel} / Monthly COGS in ${periodLabel}) × ${daysInMonth} Days`,
            periodAnalyzed: `${calculationPeriod.start} → ${calculationPeriod.end}`,
            threshold: "DSI > 60 Days (Benchmark: 45-60 Days)",
            reason: `Holding inventory for ${dsiDays} days ties up working capital and increases inventory holding costs and obsolescence risk.`,
            recommendation: "Conduct physical stock aging scrutiny, bundle slow-moving inventory items, and calibrate replenishment orders to match rolling 30-day demand.",
            supportingLedgers: inventoryLedgers.map(l => ({
              name: l.name,
              group: l.groupName,
              amount: getLedgerBalanceAsOf(l)
            })),
            dataSufficiency: "FULL"
          }
        });
      }
    }
  }

  // 6. Summary Aggregation
  const summary = {
    criticalCount: alerts.filter(a => a.type === "CRITICAL").length,
    highCount: alerts.filter(a => a.type === "HIGH").length,
    mediumCount: alerts.filter(a => a.type === "MEDIUM").length,
    lowCount: alerts.filter(a => a.type === "LOW").length,
    totalCount: alerts.length
  };

  const hasData = ledgers.length > 0 || vouchersInMonth.length > 0 || vouchersInFY.length > 0;
  const sufficiencyStatus: "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT" = 
    vouchersInMonth.length > 5 && ledgers.length > 5 
      ? "SUFFICIENT" 
      : hasData 
        ? "PARTIAL" 
        : "INSUFFICIENT";

  return {
    clientId: client.id,
    clientName: client.name,
    sector: client.sector,
    financialYear: targetYear,
    selectedMonth: selectedMonthName,
    periodLabel,
    calculationPeriod,
    comparisonPeriod,
    hasData,
    alerts,
    summary,
    dataSufficiency: {
      totalLedgers: ledgers.length,
      totalVouchersInPeriod: vouchersInMonth.length,
      monthsWithData: Math.max(1, lookbackMonthsCount),
      status: sufficiencyStatus,
      notes: sufficiencyStatus === "INSUFFICIENT" 
        ? `No synced vouchers or ledger accounts found for ${periodLabel}.` 
        : sufficiencyStatus === "PARTIAL"
          ? `Limited voucher transactions in ${periodLabel}. Calculations utilize available ledger position data.`
          : undefined
    }
  };
}
