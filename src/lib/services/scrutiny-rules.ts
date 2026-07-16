import { prisma } from "@/lib/prisma";

export interface ScrutinyExecutionResult {
  ruleCode: string;
  alertsGenerated: number;
}

function getNaturalBalance(groupName: string, ledgerName: string): "DEBIT" | "CREDIT" {
  const gLower = groupName.toLowerCase();
  const nLower = ledgerName.toLowerCase();

  const creditGroups = [
    "creditor", "liability", "duties", "tax", "provision",
    "capital", "equity", "reserve", "surplus", "income", "revenue", "sales"
  ];
  const creditLedgers = [
    "capital", "sales", "interest income", "secured loan", "unsecured loan", "bank od", "overdraft"
  ];

  if (gLower.includes("od") || gLower.includes("overdraft") || nLower.includes("od") || nLower.includes("overdraft")) {
    return "CREDIT";
  }

  if (creditGroups.some(cg => gLower.includes(cg))) {
    return "CREDIT";
  }
  if (creditLedgers.some(cl => nLower.includes(cl))) {
    return "CREDIT";
  }

  return "DEBIT";
}

/**
 * Unified execution runner that triggers all ledger scrutiny and compliance engines
 */
export async function runAllScrutinyRules(clientId: string, year: number): Promise<{ success: boolean; totalAlerts: number; details: ScrutinyExecutionResult[] }> {
  const details: ScrutinyExecutionResult[] = [];
  let alertsCount = 0;

  const client = await prisma.client.findUnique({
    where: { id: clientId }
  });
  if (!client) {
    throw new Error("Client not found");
  }
  const sector = client.sector || "TRADING";

  // Financial Year Dates (April 1st to March 31st)
  const fyStart = new Date(`${year}-04-01T00:00:00.000Z`);
  const fyEnd = new Date(`${year + 1}-04-01T00:00:00.000Z`);

  // --------------------------------------------------
  // RULE 1: UNUSUAL BALANCE CHECK
  // --------------------------------------------------
  let rule1Count = 0;
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { clientId, isActive: true }
  });

  for (const l of ledgers) {
    if (l.closingBalance <= 10.0) continue; // Skip zero/negligible balances

    const expectedNature = getNaturalBalance(l.groupName, l.name);
    const actualNature = l.nature;

    if (expectedNature !== actualNature) {
      const description = `LEDGER: ${l.name}
RULE TRIGGERED: Natural Balance Violation (UNUSUAL_BALANCE)
EXPOSURE AMOUNT: ₹${l.closingBalance.toLocaleString("en-IN")}
RISK LEVEL: MEDIUM

AUDIT RATIONALE:
Ledgers grouped under "${l.groupName}" carry a natural "${expectedNature}" balance. A closing balance of "${actualNature}" indicates an accounting anomaly.

WHY TRIGGERED:
The closing balance is ${actualNature} (₹${l.closingBalance.toLocaleString("en-IN")}) instead of the expected ${expectedNature} balance.

RECOMMENDED ACTION:
Verify double-entry ledger postings, check adjustment journals, and inspect customer/vendor accounts for overpayments or entry errors.`;

      await prisma.scrutinyAlert.create({
        data: {
          clientId,
          ruleCode: "UNUSUAL_BALANCE",
          category: "CLASSIFICATION",
          severity: "MEDIUM",
          title: `Natural Balance Violation: ${l.name}`,
          description,
          ledgerId: l.id,
          impactAmount: l.closingBalance,
          status: "PENDING",
          metadata: {
            ledgerName: l.name,
            groupName: l.groupName,
            expectedNature,
            actualNature,
            closingBalance: l.closingBalance
          }
        }
      });
      rule1Count++;
      alertsCount++;
    }
  }
  details.push({ ruleCode: "UNUSUAL_BALANCE", alertsGenerated: rule1Count });

  // --------------------------------------------------
  // RULE 2: ROUND VALUE JOURNAL ENTRY CHECK
  // --------------------------------------------------
  let rule2Count = 0;
  const journalVouchers = await prisma.normalizedVoucher.findMany({
    where: {
      clientId,
      type: "JOURNAL",
      date: { gte: fyStart, lt: fyEnd }
    },
    include: {
      lines: { include: { ledger: true } }
    }
  });

  for (const v of journalVouchers) {
    for (const line of v.lines) {
      const amt = Math.abs(line.amount);
      if (amt >= 100000 && amt % 10000 === 0) {
        const day = v.date.getDay();
        const isWeekend = day === 0 || day === 6;
        
        const d = v.date.getDate();
        const lastDay = new Date(v.date.getFullYear(), v.date.getMonth() + 1, 0).getDate();
        const isMonthEnd = d === 1 || d === 2 || d === lastDay || d === lastDay - 1;
        
        const isYearEnd = (v.date.getMonth() === 2 && d >= 26) || (v.date.getMonth() === 3 && d <= 5);

        const triggers = [];
        if (isWeekend) triggers.push(`Weekend posting (${v.date.toLocaleDateString("en-US", { weekday: "long" })})`);
        if (isMonthEnd) triggers.push("Month-end adjustment");
        if (isYearEnd) triggers.push("Year-end cut-off adjustment");
        if (triggers.length === 0) triggers.push("Manual journal posting threshold");

        const severity = isYearEnd ? "HIGH" : (isWeekend ? "MEDIUM" : "LOW");

        const description = `LEDGER: ${line.ledger.name}
RULE TRIGGERED: Round Value Journal Entry (ROUND_VALUE_JOURNAL)
EXPOSURE AMOUNT: ₹${amt.toLocaleString("en-IN")}
RISK LEVEL: ${severity}
VOUCHER REFERENCE: Voucher No. ${v.voucherNumber} dated ${v.date.toLocaleDateString("en-IN")}

AUDIT RATIONALE:
High-value round-number journal adjustments are indicators of potential manual window-dressing or unapproved profit/loss adjustments.

WHY TRIGGERED:
A transaction of ₹${amt.toLocaleString("en-IN")} was booked manually. Suspicion indicators: ${triggers.join(", ")}.

RECOMMENDED ACTION:
Verify original billing details, check for executive level sign-offs, and inspect the narration for business justification.`;

        await prisma.scrutinyAlert.create({
          data: {
            clientId,
            ruleCode: "ROUND_VALUE_JOURNAL",
            category: "FORENSIC",
            severity,
            title: `Round-Value Journal Entry: ${line.ledger.name}`,
            description,
            ledgerId: line.ledgerId,
            voucherId: v.id,
            impactAmount: amt,
            status: "PENDING",
            metadata: {
              voucherNumber: v.voucherNumber,
              date: v.date,
              amount: amt,
              triggers
            }
          }
        });
        rule2Count++;
        alertsCount++;
      }
    }
  }
  details.push({ ruleCode: "ROUND_VALUE_JOURNAL", alertsGenerated: rule2Count });

  // --------------------------------------------------
  // RULE 3: SUSPENSE / GENERIC LEDGER CHECK
  // --------------------------------------------------
  let rule3Count = 0;
  let totalRevenue = 0;
  const revenueRecord = await prisma.financialRecord.findMany({
    where: { clientId, period: { startsWith: `${year}` } }
  });
  totalRevenue = revenueRecord.reduce((sum, r) => sum + (r.revenue || 0), 0);
  
  if (totalRevenue <= 0) {
    const salesLines = await prisma.normalizedVoucherLine.findMany({
      where: {
        ledger: { groupName: { contains: "Sales" } },
        voucher: { clientId, date: { gte: fyStart, lt: fyEnd } }
      }
    });
    totalRevenue = salesLines.reduce((sum, l) => sum + Math.abs(l.amount), 0);
  }
  if (totalRevenue <= 0) {
    totalRevenue = 10000000;
  }
  const genericThreshold = Math.min(0.01 * totalRevenue, 100000);

  const genericLedgers = await prisma.normalizedLedger.findMany({
    where: {
      clientId,
      isActive: true,
      OR: [
        { name: { contains: "suspense", mode: "insensitive" } },
        { name: { contains: "misc", mode: "insensitive" } },
        { name: { contains: "miscellaneous", mode: "insensitive" } },
        { name: { contains: "office expense", mode: "insensitive" } },
        { name: { contains: "general expense", mode: "insensitive" } },
        { name: { contains: "temp", mode: "insensitive" } }
      ]
    }
  });

  for (const l of genericLedgers) {
    const isSuspense = l.name.toLowerCase().includes("suspense");
    
    // Check 3A: Suspense closing balance does not become zero
    if (isSuspense && l.closingBalance > 10.0) {
      const description = `LEDGER: ${l.name}
RULE TRIGGERED: Non-Zero Suspense Balance (SUSPENSE_NON_ZERO)
EXPOSURE AMOUNT: ₹${l.closingBalance.toLocaleString("en-IN")}
RISK LEVEL: HIGH

AUDIT RATIONALE:
Suspense accounts are temporary holding ledgers for unclassified transactions. They must be resolved and cleared to ₹0 at year-end.

WHY TRIGGERED:
Suspense ledger "${l.name}" carries a closing balance of ₹${l.closingBalance.toLocaleString("en-IN")} instead of ₹0.

RECOMMENDED ACTION:
Audit payments/receipts in the suspense daybook and allocate them to the correct accounts.`;

      await prisma.scrutinyAlert.create({
        data: {
          clientId,
          ruleCode: "SUSPENSE_NON_ZERO",
          category: "TIMING",
          severity: "HIGH",
          title: `Non-Zero Suspense Balance: ${l.name}`,
          description,
          ledgerId: l.id,
          impactAmount: l.closingBalance,
          status: "PENDING",
          metadata: { closingBalance: l.closingBalance }
        }
      });
      rule3Count++;
      alertsCount++;
    }

    // Check 3B: High-value transaction in generic ledger
    const lines = await prisma.normalizedVoucherLine.findMany({
      where: {
        ledgerId: l.id,
        voucher: { date: { gte: fyStart, lt: fyEnd } }
      },
      include: { voucher: true }
    });

    for (const line of lines) {
      const amt = Math.abs(line.amount);
      if (amt > genericThreshold) {
        const description = `LEDGER: ${l.name}
RULE TRIGGERED: Generic Ledger Threshold Breach (GENERIC_LEDGER_THRESHOLD)
EXPOSURE AMOUNT: ₹${amt.toLocaleString("en-IN")}
RISK LEVEL: HIGH
VOUCHER REFERENCE: Voucher No. ${line.voucher.voucherNumber} dated ${line.voucher.date.toLocaleDateString("en-IN")}

AUDIT RATIONALE:
High-value transactions booked in miscellaneous, office, or general expenses obscure the nature of expenditure, representing tax compliance and audit risks.

WHY TRIGGERED:
A transaction of ₹${amt.toLocaleString("en-IN")} was booked in generic ledger "${l.name}", exceeding the audit limit of ₹${genericThreshold.toLocaleString("en-IN")} (MIN of 1% of revenue or ₹1,00,000).

RECOMMENDED ACTION:
Reclassify the transaction to a specific ledger head and verify the underlying invoice.`;

        await prisma.scrutinyAlert.create({
          data: {
            clientId,
            ruleCode: "GENERIC_LEDGER_THRESHOLD",
            category: "FLOW",
            severity: "HIGH",
            title: `Generic Ledger Breach: ${l.name}`,
            description,
            ledgerId: l.id,
            voucherId: line.voucherId,
            impactAmount: amt,
            status: "PENDING",
            metadata: {
              amount: amt,
              threshold: genericThreshold,
              voucherNumber: line.voucher.voucherNumber,
              date: line.voucher.date
            }
          }
        });
        rule3Count++;
        alertsCount++;
      }
    }
  }
  details.push({ ruleCode: "GENERIC_LEDGER_THRESHOLD", alertsGenerated: rule3Count });

  // --------------------------------------------------
  // INDUSTRY SPECIFIC CHECKS
  // --------------------------------------------------
  let industryCount = 0;
  if (sector === "MANUFACTURING") {
    // 1. Power & Fuel monthly spike check
    const powerLedgers = ledgers.filter(
      l => l.name.toLowerCase().includes("power") || l.name.toLowerCase().includes("fuel")
    );
    for (const pl of powerLedgers) {
      const plLines = await prisma.normalizedVoucherLine.findMany({
        where: {
          ledgerId: pl.id,
          amount: { gt: 0 },
          voucher: { date: { gte: fyStart, lt: fyEnd } }
        },
        include: { voucher: true }
      });

      const monthlyExpenses = Array(12).fill(0);
      plLines.forEach(line => {
        const m = line.voucher.date.getMonth();
        const idx = m >= 3 ? m - 3 : m + 9;
        monthlyExpenses[idx] += line.amount;
      });

      const monthlyRevenue = Array(12).fill(0);
      const salesLines = await prisma.normalizedVoucherLine.findMany({
        where: {
          ledger: { groupName: { contains: "Sales" } },
          voucher: { date: { gte: fyStart, lt: fyEnd } }
        },
        include: { voucher: true }
      });
      salesLines.forEach(line => {
        const m = line.voucher.date.getMonth();
        const idx = m >= 3 ? m - 3 : m + 9;
        monthlyRevenue[idx] += Math.abs(line.amount);
      });

      const ratios = [];
      for (let i = 0; i < 12; i++) {
        if (monthlyRevenue[i] > 0 && monthlyExpenses[i] > 20000) {
          ratios.push(monthlyExpenses[i] / monthlyRevenue[i]);
        }
      }
      const avgRatio = ratios.length > 0 ? ratios.reduce((sum, r) => sum + r, 0) / ratios.length : 0;

      for (let i = 0; i < 12; i++) {
        if (monthlyRevenue[i] > 0 && monthlyExpenses[i] > 20000) {
          const r = monthlyExpenses[i] / monthlyRevenue[i];
          if (r > 2.5 * avgRatio && avgRatio > 0) {
            const monthNames = ["April", "May", "June", "July", "August", "September", "October", "November", "December", "January", "February", "March"];
            const monthName = monthNames[i];
            const description = `LEDGER: ${pl.name}
RULE TRIGGERED: Abnormal Power & Fuel Spike (MANUFACTURING_POWER_SPIKE)
EXPOSURE AMOUNT: ₹${monthlyExpenses[i].toLocaleString("en-IN")}
RISK LEVEL: MEDIUM

AUDIT RATIONALE:
In manufacturing, power/fuel expenditure should correlate with production/sales. A sudden ratio spike indicates potential raw utility leakages, power theft, or unrecorded production.

WHY TRIGGERED:
Power & fuel cost in ${monthName} was ₹${monthlyExpenses[i].toLocaleString("en-IN")} (${(r*100).toFixed(2)}% of revenue), which exceeds 2.5x the annual average of ${(avgRatio*100).toFixed(2)}%.

RECOMMENDED ACTION:
Audit factory sub-meter logs and utility invoices for the month.`;

            await prisma.scrutinyAlert.create({
              data: {
                clientId,
                ruleCode: "MANUFACTURING_POWER_SPIKE",
                category: "FLOW",
                severity: "MEDIUM",
                title: `Power & Fuel Spike in ${monthName}`,
                description,
                ledgerId: pl.id,
                impactAmount: monthlyExpenses[i],
                status: "PENDING",
                metadata: { month: monthName, expense: monthlyExpenses[i], revenue: monthlyRevenue[i] }
              }
            });
            industryCount++;
            alertsCount++;
          }
        }
      }
    }

    // 2. Repairs & Maintenance capitalization check
    const repairsLedgers = ledgers.filter(
      l => l.name.toLowerCase().includes("repair") || l.name.toLowerCase().includes("maintenance")
    );
    for (const rl of repairsLedgers) {
      const rlLines = await prisma.normalizedVoucherLine.findMany({
        where: {
          ledgerId: rl.id,
          amount: { gt: 100000 },
          voucher: { date: { gte: fyStart, lt: fyEnd } }
        },
        include: { voucher: true }
      });

      for (const line of rlLines) {
        const narr = (line.voucher.narration || "").toLowerCase();
        const capitalKeywords = ["renovation", "construction", "installation", "purchase", "machinery", "motor", "vehicle", "upgrade", "fabrication"];
        const matches = capitalKeywords.some(kw => narr.includes(kw));

        if (matches) {
          const description = `LEDGER: ${rl.name}
RULE TRIGGERED: Capital Repairs Booked as Revenue (MANUFACTURING_CAPITAL_REPAIRS)
EXPOSURE AMOUNT: ₹${line.amount.toLocaleString("en-IN")}
RISK LEVEL: HIGH
VOUCHER REFERENCE: Voucher No. ${line.voucher.voucherNumber} dated ${line.voucher.date.toLocaleDateString("en-IN")}

AUDIT RATIONALE:
Expenditures that extend the useful life or capacity of fixed assets must be capitalized. Fully expensing them violates AS-10 / Ind AS-16.

WHY TRIGGERED:
A high-value repair of ₹${line.amount.toLocaleString("en-IN")} was expensed. Narration mentions capital keywords: "${line.voucher.narration}".

RECOMMENDED ACTION:
Capitalize the amount under Fixed Assets and apply appropriate depreciation.`;

          await prisma.scrutinyAlert.create({
            data: {
              clientId,
              ruleCode: "MANUFACTURING_CAPITAL_REPAIRS",
              category: "CLASSIFICATION",
              severity: "HIGH",
              title: `Potential Capital Repair: ${rl.name}`,
              description,
              ledgerId: rl.id,
              voucherId: line.voucherId,
              impactAmount: line.amount,
              status: "PENDING",
              metadata: { narration: line.voucher.narration, voucherNumber: line.voucher.voucherNumber }
            }
          });
          industryCount++;
          alertsCount++;
        }
      }
    }

    // 3. Scrap Sales Yield check
    const scrapLedgers = ledgers.filter(
      l => l.name.toLowerCase().includes("scrap") || l.name.toLowerCase().includes("waste")
    );
    for (const sl of scrapLedgers) {
      const slLines = await prisma.normalizedVoucherLine.findMany({
        where: {
          ledgerId: sl.id,
          amount: { lt: 0 },
          voucher: { date: { gte: fyStart, lt: fyEnd } }
        }
      });
      const scrapTotal = slLines.reduce((sum, line) => sum + Math.abs(line.amount), 0);

      const salesLines = await prisma.normalizedVoucherLine.findMany({
        where: {
          ledger: { groupName: { contains: "Sales" } },
          voucher: { date: { gte: fyStart, lt: fyEnd } }
        }
      });
      const salesTotal = salesLines.reduce((sum, line) => sum + Math.abs(line.amount), 0);

      const scrapRatio = salesTotal > 0 ? scrapTotal / salesTotal : 0;
      if (scrapRatio > 0.05) {
        const description = `LEDGER: ${sl.name}
RULE TRIGGERED: Abnormal Scrap Sales Yield (MANUFACTURING_SCRAP_YIELD)
EXPOSURE AMOUNT: ₹${scrapTotal.toLocaleString("en-IN")}
RISK LEVEL: MEDIUM

AUDIT RATIONALE:
Scrap yields above 5.0% of total sales represent potential raw material leakages, process inefficiencies, or unrecorded finished product sales.

WHY TRIGGERED:
Scrap sales of ₹${scrapTotal.toLocaleString("en-IN")} represents ${(scrapRatio * 100).toFixed(2)}% of sales, exceeding the 5% threshold.

RECOMMENDED ACTION:
Audit scrap disposal logs and run a raw material reconciliation.`;

        await prisma.scrutinyAlert.create({
          data: {
            clientId,
            ruleCode: "MANUFACTURING_SCRAP_YIELD",
            category: "FLOW",
            severity: "MEDIUM",
            title: `Abnormal Scrap Yield: ${sl.name}`,
            description,
            ledgerId: sl.id,
            impactAmount: scrapTotal,
            status: "PENDING",
            metadata: { scrapTotal, salesTotal, scrapRatio }
          }
        });
        industryCount++;
        alertsCount++;
      }
    }
  }

  if (sector === "TRADING") {
    // 1. Purchase Cut-off Check
    const cutOffStart = new Date(`${year + 1}-03-26T00:00:00.000Z`);
    const cutOffEnd = new Date(`${year + 1}-04-05T00:00:00.000Z`);

    const cutOffPurchases = await prisma.normalizedVoucher.findMany({
      where: {
        clientId,
        type: "PURCHASE",
        date: { gte: cutOffStart, lte: cutOffEnd }
      },
      include: {
        lines: { include: { ledger: true } }
      }
    });

    for (const v of cutOffPurchases) {
      for (const line of v.lines) {
        const amt = Math.abs(line.amount);
        if (amt >= 100000) {
          const description = `LEDGER: ${line.ledger.name}
RULE TRIGGERED: Year-End Purchase Cut-off Risk (TRADING_PURCHASE_CUTOFF)
EXPOSURE AMOUNT: ₹${amt.toLocaleString("en-IN")}
RISK LEVEL: HIGH
VOUCHER REFERENCE: Voucher No. ${v.voucherNumber} dated ${v.date.toLocaleDateString("en-IN")}

AUDIT RATIONALE:
Purchase transactions recorded close to fiscal year-end present high risks of cut-off mismatch, distorting inventory and payables.

WHY TRIGGERED:
A high-value purchase of ₹${amt.toLocaleString("en-IN")} was booked close to year-end on ${v.date.toLocaleDateString("en-IN")}.

RECOMMENDED ACTION:
Verify GRNs (Goods Receipt Notes) and confirm matching inventory count.`;

          await prisma.scrutinyAlert.create({
            data: {
              clientId,
              ruleCode: "TRADING_PURCHASE_CUTOFF",
              category: "TIMING",
              severity: "HIGH",
              title: `Purchase Cut-off Exception`,
              description,
              ledgerId: line.ledgerId,
              voucherId: v.id,
              impactAmount: amt,
              status: "PENDING",
              metadata: { voucherNumber: v.voucherNumber, date: v.date, amount: amt }
            }
          });
          industryCount++;
          alertsCount++;
        }
      }
    }

    // 2. Discount / Incentives Accrual check
    const discountLedgers = ledgers.filter(
      l => l.name.toLowerCase().includes("discount") || l.name.toLowerCase().includes("rebate") || l.name.toLowerCase().includes("incentive")
    );
    for (const dl of discountLedgers) {
      const yearEndStart = new Date(`${year + 1}-03-22T00:00:00.000Z`);
      const yearEndEnd = new Date(`${year + 1}-04-01T00:00:00.000Z`);

      const yearEndEntries = await prisma.normalizedVoucherLine.findMany({
        where: {
          ledgerId: dl.id,
          voucher: { date: { gte: yearEndStart, lt: yearEndEnd } }
        },
        include: { voucher: true }
      });

      for (const line of yearEndEntries) {
        const amt = Math.abs(line.amount);
        if (amt >= 50000) {
          const q1q3Start = new Date(`${year}-04-01T00:00:00.000Z`);
          const q1q3End = new Date(`${year}-12-31T00:00:00.000Z`);

          const priorEntries = await prisma.normalizedVoucherLine.count({
            where: {
              ledgerId: dl.id,
              voucher: { date: { gte: q1q3Start, lt: q1q3End } }
            }
          });

          if (priorEntries === 0) {
            const description = `LEDGER: ${dl.name}
RULE TRIGGERED: Inconsistent Discount Accrual (TRADING_DISCOUNT_ACCRUAL)
EXPOSURE AMOUNT: ₹${amt.toLocaleString("en-IN")}
RISK LEVEL: MEDIUM
VOUCHER REFERENCE: Voucher No. ${line.voucher.voucherNumber} dated ${line.voucher.date.toLocaleDateString("en-IN")}

AUDIT RATIONALE:
Trade discounts and purchase rebates should be accrued consistently. Large lump-sum year-end adjustments without regular quarterly accruals distort gross margins.

WHY TRIGGERED:
A large entry of ₹${amt.toLocaleString("en-IN")} was booked at year-end, but no matching discount records were found in previous quarters.

RECOMMENDED ACTION:
Verify discount agreements/letters from vendors and ensure proper margin recognition.`;

            await prisma.scrutinyAlert.create({
              data: {
                clientId,
                ruleCode: "TRADING_DISCOUNT_ACCRUAL",
                category: "TIMING",
                severity: "MEDIUM",
                title: `Inconsistent Discount Accrual`,
                description,
                ledgerId: dl.id,
                voucherId: line.voucherId,
                impactAmount: amt,
                status: "PENDING",
                metadata: { voucherNumber: line.voucher.voucherNumber, date: line.voucher.date, amount: amt }
              }
            });
            industryCount++;
            alertsCount++;
          }
        }
      }
    }

    // 3. Freight comparison with purchase volume
    const freightLedgers = ledgers.filter(
      l => l.name.toLowerCase().includes("freight") || l.name.toLowerCase().includes("carriage") || l.name.toLowerCase().includes("cartage")
    );
    for (const fl of freightLedgers) {
      const flLines = await prisma.normalizedVoucherLine.findMany({
        where: {
          ledgerId: fl.id,
          amount: { gt: 0 },
          voucher: { date: { gte: fyStart, lt: fyEnd } }
        }
      });
      const freightTotal = flLines.reduce((sum, line) => sum + line.amount, 0);

      const purchaseLines = await prisma.normalizedVoucherLine.findMany({
        where: {
          ledger: { groupName: { contains: "Purchase" } },
          voucher: { date: { gte: fyStart, lt: fyEnd } }
        }
      });
      const purchaseTotal = purchaseLines.reduce((sum, line) => sum + Math.abs(line.amount), 0);

      const ratio = purchaseTotal > 0 ? freightTotal / purchaseTotal : 0;
      if (ratio > 0.10 && freightTotal > 50000) {
        const description = `LEDGER: ${fl.name}
RULE TRIGGERED: High Freight-to-Purchase Ratio (TRADING_FREIGHT_RATIO)
EXPOSURE AMOUNT: ₹${freightTotal.toLocaleString("en-IN")}
RISK LEVEL: MEDIUM

AUDIT RATIONALE:
Transport costs typically constitute a stable percentage of purchase volume in trading. Ratios above 10.0% point to potential expense inflation.

WHY TRIGGERED:
Total freight cost of ₹${freightTotal.toLocaleString("en-IN")} represents ${(ratio * 100).toFixed(2)}% of purchases, exceeding the 10.0% benchmark.

RECOMMENDED ACTION:
Perform rate reconciliation against transporter agreements.`;

        await prisma.scrutinyAlert.create({
          data: {
            clientId,
            ruleCode: "TRADING_FREIGHT_RATIO",
            category: "FLOW",
            severity: "MEDIUM",
            title: `High Freight cost ratio`,
            description,
            ledgerId: fl.id,
            impactAmount: freightTotal,
            status: "PENDING",
            metadata: { freightTotal, purchaseTotal, ratio }
          }
        });
        industryCount++;
        alertsCount++;
      }
    }
  }

  if (sector === "SERVICE") {
    // 1. Unearned Revenue / Stale Advances check
    const advanceLedgers = ledgers.filter(
      l => l.name.toLowerCase().includes("advance") || l.name.toLowerCase().includes("unearned") || l.name.toLowerCase().includes("prepaid revenue")
    );
    for (const al of advanceLedgers) {
      const staleDateLimit = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const staleLines = await prisma.normalizedVoucherLine.findMany({
        where: {
          ledgerId: al.id,
          amount: { lt: 0 },
          voucher: {
            date: { gte: fyStart, lt: staleDateLimit }
          }
        },
        include: { voucher: true }
      });

      for (const line of staleLines) {
        const amt = Math.abs(line.amount);
        if (amt >= 50000) {
          const description = `LEDGER: ${al.name}
RULE TRIGGERED: Stale Customer Advance (SERVICE_UNEARNED_REVENUE)
EXPOSURE AMOUNT: ₹${amt.toLocaleString("en-IN")}
RISK LEVEL: MEDIUM
VOUCHER REFERENCE: Voucher No. ${line.voucher.voucherNumber} dated ${line.voucher.date.toLocaleDateString("en-IN")}

AUDIT RATIONALE:
Customer advances must be recognized as revenue once services are delivered. Advances left unadjusted for over 90 days imply revenue timing and recognition risks.

WHY TRIGGERED:
Customer advance of ₹${amt.toLocaleString("en-IN")} has been sitting unreconciled since ${line.voucher.date.toLocaleDateString("en-IN")}.

RECOMMENDED ACTION:
Review service delivery logs and raise corresponding sales invoices.`;

          await prisma.scrutinyAlert.create({
            data: {
              clientId,
              ruleCode: "SERVICE_UNEARNED_REVENUE",
              category: "TIMING",
              severity: "MEDIUM",
              title: `Stale Customer Advance: ${al.name}`,
              description,
              ledgerId: al.id,
              voucherId: line.voucherId,
              impactAmount: amt,
              status: "PENDING",
              metadata: { voucherNumber: line.voucher.voucherNumber, date: line.voucher.date, amount: amt }
            }
          });
          industryCount++;
          alertsCount++;
        }
      }
    }

    // 2. Legal & Professional Fees TDS Compliance (Section 194J)
    const profLedgers = ledgers.filter(
      l => l.name.toLowerCase().includes("legal") || l.name.toLowerCase().includes("professional") || l.name.toLowerCase().includes("consultancy")
    );
    for (const pl of profLedgers) {
      const plLines = await prisma.normalizedVoucherLine.findMany({
        where: {
          ledgerId: pl.id,
          amount: { gt: 30000 },
          voucher: { date: { gte: fyStart, lt: fyEnd } }
        },
        include: {
          voucher: {
            include: { lines: { include: { ledger: true } } }
          }
        }
      });

      for (const line of plLines) {
        const hasTds = line.voucher.lines.some(l => l.amount < 0 && l.ledger.name.toLowerCase().includes("tds"));
        if (!hasTds) {
          const description = `LEDGER: ${pl.name}
RULE TRIGGERED: TDS Compliance Defaulter Sec 194J (SERVICE_TDS_PROFESSIONAL)
EXPOSURE AMOUNT: ₹${line.amount.toLocaleString("en-IN")}
RISK LEVEL: HIGH
VOUCHER REFERENCE: Voucher No. ${line.voucher.voucherNumber} dated ${line.voucher.date.toLocaleDateString("en-IN")}

AUDIT RATIONALE:
Section 194J of the Income Tax Act requires 10% TDS deduction on professional fees exceeding ₹30,000. Failure to deduct results in 30% expense disallowance.

WHY TRIGGERED:
Professional fee of ₹${line.amount.toLocaleString("en-IN")} was booked without associate TDS credit entry.

RECOMMENDED ACTION:
Deduct applicable TDS retrospectively with interest.`;

          await prisma.scrutinyAlert.create({
            data: {
              clientId,
              ruleCode: "SERVICE_TDS_PROFESSIONAL",
              category: "STATUTORY",
              severity: "HIGH",
              title: `TDS Defaulter Section 194J`,
              description,
              ledgerId: pl.id,
              voucherId: line.voucherId,
              impactAmount: line.amount,
              status: "PENDING",
              metadata: { voucherNumber: line.voucher.voucherNumber, date: line.voucher.date, amount: line.amount }
            }
          });
          industryCount++;
          alertsCount++;
        }
      }
    }

    // 3. Employee Benefits Statutory compliance
    const benefitLedgers = ledgers.filter(
      l => l.name.toLowerCase().includes("welfare") || l.name.toLowerCase().includes("benefit") || l.name.toLowerCase().includes("gratuity") || l.name.toLowerCase().includes("bonus")
    );
    for (const bl of benefitLedgers) {
      const blLines = await prisma.normalizedVoucherLine.findMany({
        where: {
          ledgerId: bl.id,
          amount: { gt: 50000 },
          voucher: { date: { gte: fyStart, lt: fyEnd } }
        },
        include: { voucher: true }
      });

      for (const line of blLines) {
        const description = `LEDGER: ${bl.name}
RULE TRIGGERED: Employee Welfare Compliance Verification (SERVICE_EMPLOYEE_BENEFITS)
EXPOSURE AMOUNT: ₹${line.amount.toLocaleString("en-IN")}
RISK LEVEL: LOW
VOUCHER REFERENCE: Voucher No. ${line.voucher.voucherNumber} dated ${line.voucher.date.toLocaleDateString("en-IN")}

AUDIT RATIONALE:
Disbursements for employee benefits must align with the Payment of Bonus Act, Gratuity Act, and statutory PF caps.

WHY TRIGGERED:
A high-value benefits entry of ₹${line.amount.toLocaleString("en-IN")} was recorded.

RECOMMENDED ACTION:
Reconcile this payout with payroll attendance books and statutory receipts.`;

        await prisma.scrutinyAlert.create({
          data: {
            clientId,
            ruleCode: "SERVICE_EMPLOYEE_BENEFITS",
            category: "STATUTORY",
            severity: "LOW",
            title: `Employee Welfare Audit Check`,
            description,
            ledgerId: bl.id,
            voucherId: line.voucherId,
            impactAmount: line.amount,
            status: "PENDING",
            metadata: { voucherNumber: line.voucher.voucherNumber, date: line.voucher.date, amount: line.amount }
          }
        });
        industryCount++;
        alertsCount++;
      }
    }
  }
  details.push({ ruleCode: `SECTOR_${sector}_CHECKS`, alertsGenerated: industryCount });

  // --------------------------------------------------
  // STATUTORY & TAX CHECKS (UNIVERSAL)
  // --------------------------------------------------
  let statutoryCount = 0;
  // 1. GST Blocked Credit Section 17(5)
  const gstVouchers = await prisma.normalizedVoucher.findMany({
    where: {
      clientId,
      date: { gte: fyStart, lt: fyEnd },
      narration: { not: null }
    },
    include: {
      lines: { include: { ledger: true } }
    }
  });

  for (const v of gstVouchers) {
    const narr = (v.narration || "").toLowerCase();
    const blockedKeywords = ["food", "beverage", "restaurant", "cabs", "hotel", "insurance", "gift", "personal", "car"];
    const matchesBlocked = blockedKeywords.some(kw => narr.includes(kw));

    if (matchesBlocked) {
      const gstCreditLine = v.lines.find(
        l => l.amount > 0 && (l.ledger.name.toLowerCase().includes("cgst") || l.ledger.name.toLowerCase().includes("sgst") || l.ledger.name.toLowerCase().includes("igst") || l.ledger.name.toLowerCase().includes("input tax"))
      );

      if (gstCreditLine) {
        const expenseLine = v.lines.find(l => l.amount > 0 && l.ledger.groupName.includes("Expenses")) || v.lines[0];
        const description = `LEDGER: ${expenseLine.ledger.name}
RULE TRIGGERED: Blocked Credit u/s 17(5) claimed (GST_ITC_BLOCKED)
EXPOSURE AMOUNT: ₹${gstCreditLine.amount.toLocaleString("en-IN")}
RISK LEVEL: HIGH
VOUCHER REFERENCE: Voucher No. ${v.voucherNumber} dated ${v.date.toLocaleDateString("en-IN")}

AUDIT RATIONALE:
Section 17(5) of the CGST Act blocks ITC claims on specific goods and services, including food & beverages, motor vehicles, employee travel, and personal gifts.

WHY TRIGGERED:
GST Input credit of ₹${gstCreditLine.amount.toLocaleString("en-IN")} was claimed on a voucher with narration matching blocked keywords: "${v.narration}".

RECOMMENDED ACTION:
Reverse the claimed input tax credit in GSTR-3B filings.`;

        await prisma.scrutinyAlert.create({
          data: {
            clientId,
            ruleCode: "GST_ITC_BLOCKED",
            category: "STATUTORY",
            severity: "HIGH",
            title: `Blocked GST Credit Claimed`,
            description,
            ledgerId: expenseLine.ledgerId,
            voucherId: v.id,
            impactAmount: gstCreditLine.amount,
            status: "PENDING",
            metadata: { narration: v.narration, gstAmount: gstCreditLine.amount }
          }
        });
        statutoryCount++;
        alertsCount++;
      }
    }
  }

  // 2. Reverse Charge Mechanism (RCM) check
  const rcmLedgers = ledgers.filter(
    l => l.name.toLowerCase().includes("gift") || l.name.toLowerCase().includes("sponsor") || l.name.toLowerCase().includes("security service") || l.name.toLowerCase().includes("gta") || l.name.toLowerCase().includes("transport")
  );
  for (const rl of rcmLedgers) {
    const rlLines = await prisma.normalizedVoucherLine.findMany({
      where: {
        ledgerId: rl.id,
        amount: { gt: 20000 },
        voucher: { date: { gte: fyStart, lt: fyEnd } }
      },
      include: {
        voucher: {
          include: { lines: { include: { ledger: true } } }
        }
      }
    });

    for (const line of rlLines) {
      const hasRcmLiability = line.voucher.lines.some(
        l => l.amount < 0 && (l.ledger.name.toLowerCase().includes("rcm") || l.ledger.name.toLowerCase().includes("payable") || l.ledger.name.toLowerCase().includes("liability"))
      );

      if (!hasRcmLiability) {
        const description = `LEDGER: ${rl.name}
RULE TRIGGERED: Unrecorded RCM Tax Liability (GST_RCM_UNRECORDED)
EXPOSURE AMOUNT: ₹${line.amount.toLocaleString("en-IN")}
RISK LEVEL: MEDIUM
VOUCHER REFERENCE: Voucher No. ${line.voucher.voucherNumber} dated ${line.voucher.date.toLocaleDateString("en-IN")}

AUDIT RATIONALE:
Security services, sponsorships, and GTAs are subject to compulsory reverse charge mechanism (RCM) under GST. Failure to book tax liability leads to compliance defaults.

WHY TRIGGERED:
RCM-prone expenditure of ₹${line.amount.toLocaleString("en-IN")} was booked under "${rl.name}" without matching RCM tax payable booking.

RECOMMENDED ACTION:
Book RCM tax liability and pay tax via GSTR-3B cash ledger.`;

        await prisma.scrutinyAlert.create({
          data: {
            clientId,
            ruleCode: "GST_RCM_UNRECORDED",
            category: "STATUTORY",
            severity: "MEDIUM",
            title: `GTA/Security RCM Missing`,
            description,
            ledgerId: rl.id,
            voucherId: line.voucherId,
            impactAmount: line.amount,
            status: "PENDING",
            metadata: { voucherNumber: line.voucher.voucherNumber, date: line.voucher.date }
          }
        });
        statutoryCount++;
        alertsCount++;
      }
    }
  }

  // 3. Related Party Transactions
  const rpLedgers = ledgers.filter(
    l => l.name.toLowerCase().includes("director") || l.name.toLowerCase().includes("promoter") || l.name.toLowerCase().includes("sister concern") || l.name.toLowerCase().includes("subsidiary") || l.name.toLowerCase().includes("relative")
  );
  for (const rpl of rpLedgers) {
    const rplLines = await prisma.normalizedVoucherLine.findMany({
      where: {
        ledgerId: rpl.id,
        amount: { not: 0 },
        voucher: { date: { gte: fyStart, lt: fyEnd } }
      },
      include: { voucher: true }
    });

    for (const line of rplLines) {
      const amt = Math.abs(line.amount);
      if (amt >= 50000) {
        const description = `LEDGER: ${rpl.name}
RULE TRIGGERED: Related Party Transaction detected (STATUTORY_RELATED_PARTY)
EXPOSURE AMOUNT: ₹${rpLedgers.length}
RISK LEVEL: MEDIUM
VOUCHER REFERENCE: Voucher No. ${line.voucher.voucherNumber} dated ${line.voucher.date.toLocaleDateString("en-IN")}

AUDIT RATIONALE:
Section 188 of the Companies Act, 2013 governs related-party transactions. These must be executed at arm's length and require specific board approvals.

WHY TRIGGERED:
A transaction of ₹${amt.toLocaleString("en-IN")} was detected in promoter/director/related ledger "${rpl.name}".

RECOMMENDED ACTION:
Ensure proper board approvals are signed and transactions comply with transfer pricing rules.`;

        await prisma.scrutinyAlert.create({
          data: {
            clientId,
            ruleCode: "STATUTORY_RELATED_PARTY",
            category: "STATUTORY",
            severity: "MEDIUM",
            title: `Related Party Transaction: ${rpl.name}`,
            description,
            ledgerId: rpl.id,
            voucherId: line.voucherId,
            impactAmount: amt,
            status: "PENDING",
            metadata: { voucherNumber: line.voucher.voucherNumber, date: line.voucher.date }
          }
        });
        statutoryCount++;
        alertsCount++;
      }
    }
  }
  details.push({ ruleCode: "STATUTORY_TAX_CHECKS", alertsGenerated: statutoryCount });

  // 4. Narration NLP checks
  const { analyzeNarrationNLP } = await import("./nlp-reconciliation");
  const nlpResult = await analyzeNarrationNLP(clientId, year);
  details.push({
    ruleCode: "NLP_NARRATION_CHECKS",
    alertsGenerated: nlpResult.alertsGenerated
  });
  alertsCount += nlpResult.alertsGenerated;

  return {
    success: true,
    totalAlerts: alertsCount,
    details
  };
}
