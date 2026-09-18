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
  periodLabel: string;
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

export async function calculateEarlyWarnings(
  clientId: string,
  targetYear: number
): Promise<EarlyWarningResult> {
  // 1. Fetch Client profile
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

  const fyStartMonth = client.fiscalYearStartMonth || 4; // 1-indexed (4 = April)
  const startMonthIndex = fyStartMonth - 1; // 0-indexed (3 = April)
  
  // Date window for the selected FY
  // E.g. FY 2026 (Apr 2025 - Mar 2026) or (Apr 2026 - Mar 2027 depending on start/end convention)
  // Let's check both standard start-year convention (2025 for 2025-26 or 2026 for 2026-27)
  let startUtc = new Date(Date.UTC(targetYear, startMonthIndex, 1, 0, 0, 0, 0));
  let endUtc = new Date(Date.UTC(targetYear + 1, startMonthIndex, 1, 0, 0, 0, 0));

  // Check if vouchers exist in this window or if targetYear refers to end of FY (e.g. 2026 -> 2025-04 to 2026-03)
  const voucherCountInWindow = await prisma.normalizedVoucher.count({
    where: {
      clientId,
      date: { gte: startUtc, lt: endUtc }
    }
  });

  if (voucherCountInWindow === 0) {
    // Check previous window (targetYear - 1 to targetYear)
    const prevWindowStart = new Date(Date.UTC(targetYear - 1, startMonthIndex, 1, 0, 0, 0, 0));
    const prevWindowEnd = new Date(Date.UTC(targetYear, startMonthIndex, 1, 0, 0, 0, 0));
    const countInPrevWindow = await prisma.normalizedVoucher.count({
      where: {
        clientId,
        date: { gte: prevWindowStart, lt: prevWindowEnd }
      }
    });

    if (countInPrevWindow > 0) {
      startUtc = prevWindowStart;
      endUtc = prevWindowEnd;
    }
  }

  // 2. Fetch all Ledgers for this client
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

  // Group ledgers by accounting classification
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

  // 3. Fetch Vouchers in the Period
  const vouchers = await prisma.normalizedVoucher.findMany({
    where: {
      clientId,
      date: { gte: startUtc, lt: endUtc }
    },
    include: {
      lines: {
        include: {
          ledger: {
            select: { id: true, name: true, groupName: true }
          }
        }
      }
    },
    orderBy: { date: "asc" }
  });

  // Calculate distinct active months
  const activeMonthSet = new Set<string>();
  vouchers.forEach(v => {
    activeMonthSet.add(`${v.date.getUTCFullYear()}-${v.date.getUTCMonth() + 1}`);
  });
  const monthsWithData = activeMonthSet.size;

  // 4. Fetch PNL Values for the FY
  const pnlValues = await prisma.pNLValue.findMany({
    where: {
      clientId,
      year: { in: [targetYear, targetYear - 1] }
    }
  });

  let annualRevenueFromPnl = 0;
  let annualCogsFromPnl = 0;
  let annualIndirectExpFromPnl = 0;

  pnlValues.forEach(pv => {
    const h = pv.headName.toLowerCase();
    const val = decryptValue(pv.amount);
    if (pv.year === targetYear || pv.year === targetYear - 1) {
      if (h.includes("revenue") || h.includes("sales") || h.includes("income")) {
        annualRevenueFromPnl += val;
      } else if (h.includes("cogs") || h.includes("cost of goods") || h.includes("direct expense")) {
        annualCogsFromPnl += val;
      } else if (h.includes("indirect expense") || h.includes("operating expense") || h.includes("administrative")) {
        annualIndirectExpFromPnl += val;
      }
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

  // Initialize generated alerts array
  const alerts: EarlyWarningAlert[] = [];
  const periodLabel = `FY ${startUtc.getUTCFullYear()}-${String(endUtc.getUTCFullYear()).slice(-2)}`;

  // =========================================================================
  // RULE 1: CASH FLOW & LIQUIDITY RISK
  // =========================================================================
  const totalCashAndBank = cashAndBankLedgers.reduce((sum, l) => sum + (l.closingBalance || 0), 0);
  const totalPayables = payableLedgers.reduce((sum, l) => sum + (l.closingBalance || 0), 0);
  const totalReceivables = receivableLedgers.reduce((sum, l) => sum + (l.closingBalance || 0), 0);

  // Compute monthly operational outflow from vouchers / PNL
  let totalPaymentsInPeriod = 0;
  vouchers.forEach(v => {
    if (v.type.toLowerCase() === "payment") {
      totalPaymentsInPeriod += v.totalAmount || 0;
    }
  });

  const effectiveMonths = Math.max(1, monthsWithData);
  const avgMonthlyBurn = totalPaymentsInPeriod > 0 
    ? (totalPaymentsInPeriod / effectiveMonths)
    : (annualIndirectExpFromPnl + annualCogsFromPnl) / 12;

  const dailyBurnRate = avgMonthlyBurn > 0 ? (avgMonthlyBurn / 30) : 0;
  const cashRunwayDays = dailyBurnRate > 0 ? Math.round(totalCashAndBank / dailyBurnRate) : 999;
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
        description: `Current liquid cash & bank funds stand at ${formatLakhs(totalCashAndBank)} against trade payables obligations of ${formatLakhs(totalPayables)}. Estimated cash runway is ${cashRunwayDays > 365 ? "> 1 Year" : `${cashRunwayDays} Days`} at an average monthly burn rate of ${formatLakhs(avgMonthlyBurn)}.`,
        metric: cashRunwayDays < 90 ? `${cashRunwayDays} Days` : formatLakhs(netLiquidityGap),
        trend: cashRunwayDays < 30 ? "DOWN" : "STABLE",
        drilldown: {
          ruleName: "Cash Flow Runway & Working Capital Liquidity Test",
          calculatedValue: `Runway: ${cashRunwayDays} Days | Liquid Funds: ${formatLakhs(totalCashAndBank)} | Payables: ${formatLakhs(totalPayables)}`,
          formula: "Cash Runway = Total Liquid Cash & Bank Balances / (Average Monthly Operational Outflow / 30)",
          periodAnalyzed: periodLabel,
          threshold: "Runway < 45 Days or Immediate Payables > Liquid Cash",
          reason: `Liquid funds of ${formatLakhs(totalCashAndBank)} are insufficient to comfortably service ${formatLakhs(totalPayables)} in outstanding payables without relying on incoming collections.`,
          recommendation: `Accelerate collection of ${formatLakhs(totalReceivables)} in trade receivables and establish structured payment milestones with key creditors.`,
          supportingLedgers: [
            ...cashAndBankLedgers.map(l => ({ name: l.name, group: l.groupName, amount: l.closingBalance })),
            ...payableLedgers.slice(0, 5).map(l => ({ name: l.name, group: l.groupName, amount: l.closingBalance }))
          ],
          dataSufficiency: vouchers.length > 50 ? "FULL" : "PARTIAL"
        }
      });
    }
  }

  // =========================================================================
  // RULE 2: RECEIVABLES / DSO DETERIORATION
  // =========================================================================
  // Total sales from vouchers or P&L
  let totalSalesInPeriod = 0;
  vouchers.forEach(v => {
    if (v.type.toLowerCase() === "sales") {
      totalSalesInPeriod += v.totalAmount || 0;
    }
  });

  const effectiveAnnualSales = totalSalesInPeriod > 0
    ? (totalSalesInPeriod / effectiveMonths) * 12
    : annualRevenueFromPnl;

  if (effectiveAnnualSales > 0 && totalReceivables > 0) {
    const calculatedDso = Math.round((totalReceivables / effectiveAnnualSales) * 365);
    
    // Check prior period / mid-year DSO if vouchers span multiple months
    const midPointDate = new Date(startUtc.getTime() + (endUtc.getTime() - startUtc.getTime()) / 2);
    let firstHalfSales = 0;
    let secondHalfSales = 0;
    vouchers.forEach(v => {
      if (v.type.toLowerCase() === "sales") {
        if (v.date < midPointDate) firstHalfSales += v.totalAmount;
        else secondHalfSales += v.totalAmount;
      }
    });

    const isDeteriorating = calculatedDso > 60 || (secondHalfSales > 0 && calculatedDso > 45);

    if (calculatedDso > 50) {
      const severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = calculatedDso > 80 ? "HIGH" : "MEDIUM";

      alerts.push({
        id: "alert-receivables-dso",
        type: severity,
        category: "RECEIVABLES",
        title: calculatedDso > 75 ? "DSO Deteriorating Rapidly" : "Elevated Days Sales Outstanding (DSO)",
        description: `Days Sales Outstanding is currently ${calculatedDso} Days. Total trade receivables are ${formatLakhs(totalReceivables)} against annualized sales volume of ${formatLakhs(effectiveAnnualSales)}.`,
        metric: `${calculatedDso} Days`,
        trend: isDeteriorating ? "UP" : "STABLE",
        drilldown: {
          ruleName: "Days Sales Outstanding (DSO) & Working Capital Trap",
          calculatedValue: `DSO: ${calculatedDso} Days | Receivables: ${formatLakhs(totalReceivables)} | Annualized Sales: ${formatLakhs(effectiveAnnualSales)}`,
          formula: "DSO = (Trade Receivables / Annualized Sales) × 365 Days",
          periodAnalyzed: periodLabel,
          threshold: "DSO > 50 Days (Standard Industry Baseline: 30-45 Days)",
          reason: `Average collection cycle of ${calculatedDso} days exceeds standard credit terms, tying up significant working capital in unpaid customer invoices.`,
          recommendation: "Implement automated payment reminders, offer early settlement discounts, and enforce strict credit limits on slow-paying accounts.",
          supportingLedgers: receivableLedgers.slice(0, 10).map(l => ({
            name: l.name,
            group: l.groupName,
            amount: l.closingBalance
          })),
          dataSufficiency: effectiveAnnualSales > 0 ? "FULL" : "PARTIAL"
        }
      });
    }
  }

  // =========================================================================
  // RULE 3: GST & STATUTORY COMPLIANCE RISK
  // =========================================================================
  const gstRecon = reconStates.find(r => r.type.includes("GST"));
  const gstScrutinyAlerts = scrutinyAlerts.filter(a => (a.ruleCode || "").includes("GST") || (a.title || "").includes("GST"));
  const complianceTaxAlerts = complianceAlerts.filter(a => (a.category || "").includes("TDS") || (a.category || "").includes("TAX"));

  let gstMismatchAmount = 0;
  let gstMismatchDetails = "";

  if (gstRecon && gstRecon.mismatchAmount && Math.abs(gstRecon.mismatchAmount) > 0) {
    gstMismatchAmount = Math.abs(gstRecon.mismatchAmount);
    gstMismatchDetails = `ITC/Output tax mismatch of ${formatLakhs(gstMismatchAmount)} identified in ${gstRecon.statementPeriod} GST reconciliation.`;
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
      description: gstMismatchDetails || `Potential tax variance of ${formatLakhs(gstMismatchAmount)} detected in statutory duties ledgers. Immediate reconciliation advised.`,
      metric: formatLakhs(gstMismatchAmount),
      trend: "UP",
      drilldown: {
        ruleName: "Statutory Tax & GST Reconciliation Audit",
        calculatedValue: `Variance: ${formatLakhs(gstMismatchAmount)} across ${dutiesAndTaxesLedgers.length} Duties & Taxes ledgers`,
        formula: "GST Mismatch = |Output Liability - Input Tax Credit Claimed - GSTR Portal Filings|",
        periodAnalyzed: periodLabel,
        threshold: "Mismatch > ₹5,000",
        reason: gstMismatchDetails || `Variance of ${formatLakhs(gstMismatchAmount)} detected between ledger entries and tax balances.`,
        recommendation: "Reconcile purchase register with GSTR-2B before monthly filing to prevent departmental notices and interest penalties under Section 50.",
        supportingLedgers: dutiesAndTaxesLedgers.map(l => ({
          name: l.name,
          group: l.groupName,
          amount: l.closingBalance
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
      drilldown: {
        ruleName: "Statutory TDS Compliance Verification",
        calculatedValue: `${complianceTaxAlerts.length} alerts totaling ${formatLakhs(tdsImpact)}`,
        formula: "Audit checks on TDS rate applicability, deductee PAN verification, and timely deposit",
        periodAnalyzed: periodLabel,
        threshold: "Unresolved compliance exceptions > 0",
        reason: "Transactions found where statutory deduction rates deviate from prescribed IT Act schedules.",
        recommendation: "Review flagged vouchers and make necessary adjustment provisions or deposit interest on delayed deductions.",
        supportingLedgers: dutiesAndTaxesLedgers.map(l => ({
          name: l.name,
          group: l.groupName,
          amount: l.closingBalance
        })),
        dataSufficiency: "FULL"
      }
    });
  }

  // =========================================================================
  // RULE 4: VENDOR / CUSTOMER CONCENTRATION RISK
  // =========================================================================
  if (client.sector === "SERVICE") {
    // For Service sector: Evaluate Customer Concentration (Billing concentration)
    const customerBilling: Record<string, { name: string; amount: number }> = {};
    let totalServiceBilling = 0;

    vouchers.forEach(v => {
      if (v.type.toLowerCase() === "sales" || v.type.toLowerCase() === "receipt") {
        for (const line of v.lines) {
          if (line.ledger && (line.ledger.groupName || "").toLowerCase().includes("debtor")) {
            const amount = Math.abs(line.amount || 0);
            if (!customerBilling[line.ledger.id]) {
              customerBilling[line.ledger.id] = { name: line.ledger.name, amount: 0 };
            }
            customerBilling[line.ledger.id].amount += amount;
            totalServiceBilling += amount;
          }
        }
      }
    });

    const sortedCustomers = Object.values(customerBilling).sort((a, b) => b.amount - a.amount);
    if (sortedCustomers.length > 0 && totalServiceBilling > 0) {
      const topCustomer = sortedCustomers[0];
      const customerShare = Math.round((topCustomer.amount / totalServiceBilling) * 100);

      if (customerShare >= 35) {
        alerts.push({
          id: "alert-customer-concentration",
          type: customerShare > 55 ? "HIGH" : "MEDIUM",
          category: "OPERATIONAL",
          title: "High Client Revenue Concentration",
          description: `Top client '${topCustomer.name}' accounts for ${customerShare}% (${formatLakhs(topCustomer.amount)}) of total recorded billings (${formatLakhs(totalServiceBilling)}).`,
          metric: `${customerShare}%`,
          trend: "UP",
          drilldown: {
            ruleName: "Client Revenue Concentration Risk",
            calculatedValue: `Top Client '${topCustomer.name}' = ${formatLakhs(topCustomer.amount)} (${customerShare}%) of ${formatLakhs(totalServiceBilling)}`,
            formula: "(Top Client Billing / Total Revenue Billing) × 100",
            periodAnalyzed: periodLabel,
            threshold: "Top client share > 35%",
            reason: `Excessive dependency on a single key account poses significant revenue volatility risk if contract scope or payment terms change.`,
            recommendation: "Diversify client acquisition and build retainers across complementary service verticals to reduce key-account dependency.",
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
    // For Trading & Manufacturing: Evaluate Vendor / Procurement Concentration
    const vendorPurchases: Record<string, { name: string; amount: number }> = {};
    let totalPurchases = 0;

    vouchers.forEach(v => {
      if (v.type.toLowerCase() === "purchase" || v.type.toLowerCase() === "payment") {
        for (const line of v.lines) {
          if (line.ledger && (line.ledger.groupName || "").toLowerCase().includes("creditor")) {
            const amount = Math.abs(line.amount || 0);
            if (!vendorPurchases[line.ledger.id]) {
              vendorPurchases[line.ledger.id] = { name: line.ledger.name, amount: 0 };
            }
            vendorPurchases[line.ledger.id].amount += amount;
            totalPurchases += amount;
          }
        }
      }
    });

    const sortedVendors = Object.values(vendorPurchases).sort((a, b) => b.amount - a.amount);
    if (sortedVendors.length > 0 && totalPurchases > 0) {
      const topVendor = sortedVendors[0];
      const vendorShare = Math.round((topVendor.amount / totalPurchases) * 100);

      if (vendorShare >= 40) {
        alerts.push({
          id: "alert-vendor-concentration",
          type: vendorShare > 55 ? "HIGH" : "MEDIUM",
          category: "OPERATIONAL",
          title: "High Vendor Dependency",
          description: `Procurement from top vendor '${topVendor.name}' represents ${vendorShare}% (${formatLakhs(topVendor.amount)}) of total supplier purchases (${formatLakhs(totalPurchases)}).`,
          metric: `${vendorShare}%`,
          trend: "UP",
          drilldown: {
            ruleName: "Single Supplier & Vendor Concentration Risk",
            calculatedValue: `Top Supplier '${topVendor.name}' = ${formatLakhs(topVendor.amount)} (${vendorShare}%) of ${formatLakhs(totalPurchases)}`,
            formula: "(Top Vendor Procurement / Total Supplier Procurement) × 100",
            periodAnalyzed: periodLabel,
            threshold: "Top vendor share > 40%",
            reason: `High reliance on '${topVendor.name}' creates operational bottleneck risk and limits procurement pricing leverage.`,
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
  // RULE 5: INVENTORY AGEING & STOCK BUILDUP (TRADING & MANUFACTURING ONLY)
  // =========================================================================
  if (client.sector !== "SERVICE") {
    const totalInventoryValue = inventoryLedgers.reduce((sum, l) => sum + (l.closingBalance || 0), 0);
    const effectiveCogs = annualCogsFromPnl > 0 
      ? annualCogsFromPnl 
      : (effectiveAnnualSales * 0.7);

    if (totalInventoryValue > 0 && effectiveCogs > 0) {
      const dsiDays = Math.round((totalInventoryValue / effectiveCogs) * 365);

      if (dsiDays > 75) {
        const severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = dsiDays > 120 ? "HIGH" : "MEDIUM";
        alerts.push({
          id: "alert-inventory-ageing",
          type: severity,
          category: "INVENTORY",
          title: dsiDays > 120 ? "Severe Inventory Stagnation & Ageing" : "Inventory Holding Period Stretched",
          description: `Days Sales of Inventory (DSI) is ${dsiDays} Days with total stock valued at ${formatLakhs(totalInventoryValue)} against annual cost of goods of ${formatLakhs(effectiveCogs)}.`,
          metric: `${dsiDays} Days`,
          trend: "UP",
          drilldown: {
            ruleName: "Inventory Turnover & Days Sales in Inventory (DSI)",
            calculatedValue: `DSI: ${dsiDays} Days | Stock Value: ${formatLakhs(totalInventoryValue)} | Annual COGS: ${formatLakhs(effectiveCogs)}`,
            formula: "DSI = (Closing Inventory Value / Annualized COGS) × 365 Days",
            periodAnalyzed: periodLabel,
            threshold: "DSI > 75 Days (Benchmark: 45-60 Days)",
            reason: `Holding inventory for ${dsiDays} days ties up liquidity and increases carrying costs, storage overhead, and obsolescence risk.`,
            recommendation: "Conduct physical stock aging scrutiny, bundle slow-moving inventory items, and calibrate replenishment orders to match rolling 30-day demand.",
            supportingLedgers: inventoryLedgers.map(l => ({
              name: l.name,
              group: l.groupName,
              amount: l.closingBalance
            })),
            dataSufficiency: "FULL"
          }
        });
      }
    }
  }

  // 6. Summary aggregation
  const summary = {
    criticalCount: alerts.filter(a => a.type === "CRITICAL").length,
    highCount: alerts.filter(a => a.type === "HIGH").length,
    mediumCount: alerts.filter(a => a.type === "MEDIUM").length,
    lowCount: alerts.filter(a => a.type === "LOW").length,
    totalCount: alerts.length
  };

  const hasData = ledgers.length > 0 || vouchers.length > 0 || pnlValues.length > 0;
  const sufficiencyStatus: "SUFFICIENT" | "PARTIAL" | "INSUFFICIENT" = 
    vouchers.length > 30 && ledgers.length > 5 
      ? "SUFFICIENT" 
      : hasData 
        ? "PARTIAL" 
        : "INSUFFICIENT";

  return {
    clientId: client.id,
    clientName: client.name,
    sector: client.sector,
    financialYear: targetYear,
    periodLabel,
    hasData,
    alerts,
    summary,
    dataSufficiency: {
      totalLedgers: ledgers.length,
      totalVouchersInPeriod: vouchers.length,
      monthsWithData,
      status: sufficiencyStatus,
      notes: sufficiencyStatus === "INSUFFICIENT" 
        ? "No synced vouchers or ledger accounts found for this client and financial year." 
        : sufficiencyStatus === "PARTIAL"
          ? "Limited voucher history available. Some predictive calculations are utilizing available balance sheet ledger balances."
          : undefined
    }
  };
}
