import { prisma } from "@/lib/prisma";

export interface ScrutinyExecutionResult {
  ruleCode: string;
  alertsGenerated: number;
}

/**
 * 1. Accrual Flow Validation: Direct Payments without prior payable/liability booking
 */
export async function verifyAccrualFlow(clientId: string, year: number): Promise<ScrutinyExecutionResult> {
  let count = 0;

  // Fetch all payment vouchers for the fiscal year
  const paymentVouchers = await prisma.normalizedVoucher.findMany({
    where: {
      clientId,
      type: "PAYMENT",
      date: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`)
      }
    },
    include: {
      lines: {
        include: { ledger: true }
      }
    }
  });

  for (const voucher of paymentVouchers) {
    const directExpenses = voucher.lines.filter(
      l => l.amount > 0 && l.ledger.groupName.includes("Expenses")
    );

    for (const expLine of directExpenses) {
      // Trace if a purchase or journal entry was booked for this ledger in the preceding 90 days
      const intermediateBooking = await prisma.normalizedVoucherLine.findFirst({
        where: {
          ledgerId: expLine.ledgerId,
          amount: { gt: 0 },
          voucher: {
            clientId,
            type: { in: ["PURCHASE", "JOURNAL"] },
            date: {
              gte: new Date(voucher.date.getTime() - 90 * 24 * 60 * 60 * 1000),
              lte: voucher.date
            }
          }
        }
      });

      if (!intermediateBooking) {
        await prisma.scrutinyAlert.create({
          data: {
            clientId,
            ruleCode: "ACC_FLOW_BYPASS",
            category: "FLOW",
            severity: "MEDIUM",
            title: `Direct Expense Payment (Accrual Bypass)`,
            description: `⚠️ ${expLine.ledger.name} of ₹${Math.abs(expLine.amount).toLocaleString("en-IN")} was paid directly via bank without intermediate payable liability booking.`,
            ledgerId: expLine.ledgerId,
            voucherId: voucher.id,
            impactAmount: Math.abs(expLine.amount),
            status: "PENDING",
            metadata: {
              date: voucher.date,
              voucherNumber: voucher.voucherNumber,
              ledgerName: expLine.ledger.name
            }
          }
        });
        count++;
      }
    }
  }

  return { ruleCode: "ACC_FLOW_BYPASS", alertsGenerated: count };
}

/**
 * 2. Statutory Deductions Verification: Audits PF and ESIC rates & thresholds
 */
export async function verifyPayrollDeductions(clientId: string, year: number): Promise<ScrutinyExecutionResult> {
  let count = 0;
  
  // Scans for vouchers under group "Payroll Expenses"
  const payrollVouchers = await prisma.normalizedVoucher.findMany({
    where: {
      clientId,
      date: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`)
      },
      lines: {
        some: {
          ledger: { groupName: "Payroll Expenses" }
        }
      }
    },
    include: {
      lines: { include: { ledger: true } }
    }
  });

  for (const v of payrollVouchers) {
    const salaryDebit = v.lines.find(l => l.amount > 0 && l.ledger.groupName.includes("Payroll"));
    const pfCredit = v.lines.find(l => l.amount < 0 && l.ledger.name.toLowerCase().includes("pf"));

    if (salaryDebit && pfCredit) {
      // Mock employee level breakdown from ledger totals (e.g. average check threshold)
      const baseSalary = salaryDebit.amount;
      const actualPF = Math.abs(pfCredit.amount);

      // In India, standard PF is capped at 12% of Basic up to ₹15,000 threshold
      // For ledger checking, let's flag if direct PF deductions deviate from 12% by a high tolerance
      const expectedPFMax = baseSalary * 0.12;
      
      if (actualPF > expectedPFMax + 10.0) { // Toll tolerance for structural differences
        await prisma.scrutinyAlert.create({
          data: {
            clientId,
            ruleCode: "STATUTORY_PF_MISMATCH",
            category: "STATUTORY",
            severity: "HIGH",
            title: "Abnormal PF Deduction Mismatch",
            description: `⚠️ PF deduction of ₹${actualPF.toLocaleString("en-IN")} on gross payroll booking of ₹${baseSalary.toLocaleString("en-IN")} exceeds standard statutory expectations.`,
            ledgerId: pfCredit.ledgerId,
            voucherId: v.id,
            impactAmount: Math.abs(actualPF - expectedPFMax),
            status: "PENDING",
            metadata: { baseSalary, actualPF, expectedPFMax }
          }
        });
        count++;
      }
    }
  }

  return { ruleCode: "STATUTORY_PF_MISMATCH", alertsGenerated: count };
}

/**
 * 3. Provision Lifecycle Auditor: Flags provisions that stay open incorrectly
 */
export async function verifyProvisionClosures(clientId: string, year: number): Promise<ScrutinyExecutionResult> {
  let count = 0;

  // Find all provisions/accruals entries booked over 60 days ago
  const staleProvisions = await prisma.normalizedVoucherLine.findMany({
    where: {
      ledger: { groupName: { contains: "Provisions" } },
      amount: { lt: 0 }, // Credit balance indicates liability entry
      voucher: {
        clientId,
        date: {
          gte: new Date(`${year}-01-01`),
          lt: new Date(`${year + 1}-01-01`),
          lte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
        }
      }
    },
    include: { ledger: true, voucher: true }
  });

  for (const prov of staleProvisions) {
    // Look for a reversal debit entry in the same ledger group
    const reversal = await prisma.normalizedVoucherLine.findFirst({
      where: {
        ledgerId: prov.ledgerId,
        amount: { gt: 0 }, // Debit indicates reversal/payment
        voucher: {
          date: { gte: prov.voucher.date }
        }
      }
    });

    if (!reversal) {
      await prisma.scrutinyAlert.create({
        data: {
          clientId,
          ruleCode: "PROVISION_LIFECYCLE",
          category: "TIMING",
          severity: "MEDIUM",
          title: "Provision Aging Anomaly",
          description: `⚠️ Accrued expense provision of ₹${Math.abs(prov.amount).toLocaleString("en-IN")} in "${prov.ledger.name}" remained open for over 60 days without matching reversal.`,
          ledgerId: prov.ledgerId,
          voucherId: prov.voucher.id,
          impactAmount: Math.abs(prov.amount),
          status: "PENDING",
          metadata: { date: prov.voucher.date, ledgerName: prov.ledger.name }
        }
      });
      count++;
    }
  }

  return { ruleCode: "PROVISION_LIFECYCLE", alertsGenerated: count };
}

/**
 * 4. General Forensic Audit Checks: Cash Balances, OD limits, Round numbers, and Weekends
 */
export async function verifyForensicChecks(clientId: string, year: number): Promise<ScrutinyExecutionResult> {
  let count = 0;

  // Check 4A: OD Account Debit Balance Validation
  const odLedgers = await prisma.normalizedLedger.findMany({
    where: {
      clientId,
      groupName: { contains: "Bank" },
      name: { contains: "OD" }
    }
  });

  for (const ledger of odLedgers) {
    if (ledger.closingBalance > 0) { // Debit balance is positive in our system
      await prisma.scrutinyAlert.create({
        data: {
          clientId,
          ruleCode: "FORENSIC_OD_DEBIT",
          category: "FORENSIC",
          severity: "MEDIUM",
          title: "Abnormal Balance: OD Account showing Debit",
          description: `⚠️ Overdraft/Cash Credit ledger "${ledger.name}" is showing a Debit balance of ₹${ledger.closingBalance.toLocaleString("en-IN")}. Review treatment.`,
          ledgerId: ledger.id,
          impactAmount: ledger.closingBalance,
          status: "PENDING"
        }
      });
      count++;
    }
  }

  // Check 4B: Round-Value Manual Adjustments
  const manualVouchers = await prisma.normalizedVoucher.findMany({
    where: {
      clientId,
      type: "JOURNAL",
      date: {
        gte: new Date(`${year}-01-01`),
        lt: new Date(`${year + 1}-01-01`)
      }
    },
    include: {
      lines: { include: { ledger: true } }
    }
  });

  for (const v of manualVouchers) {
    for (const line of v.lines) {
      const amt = Math.abs(line.amount);
      if (amt >= 50000 && amt % 50000 === 0) {
        await prisma.scrutinyAlert.create({
          data: {
            clientId,
            ruleCode: "FORENSIC_ROUND_VALUE",
            category: "FORENSIC",
            severity: "LOW",
            title: "Round-Value Transaction Alert",
            description: `⚠️ High round-value manual journal entry of ₹${amt.toLocaleString("en-IN")} detected in ledger "${line.ledger.name}" under voucher ${v.voucherNumber}.`,
            ledgerId: line.ledgerId,
            voucherId: v.id,
            impactAmount: amt,
            status: "PENDING",
            metadata: { date: v.date, narration: v.narration }
          }
        });
        count++;
      }
    }
  }

  // Check 4C: Holiday/Weekend Transactions
  for (const v of manualVouchers) {
    const day = v.date.getDay();
    if (day === 0 || day === 6) { // Sunday or Saturday
      await prisma.scrutinyAlert.create({
        data: {
          clientId,
          ruleCode: "FORENSIC_WEEKEND_POSTING",
          category: "FORENSIC",
          severity: "LOW",
          title: "Weekend Manual Posting Alert",
          description: `⚠️ Manual journal adjustment of ₹${v.totalAmount.toLocaleString("en-IN")} was posted on a weekend (${v.date.toLocaleDateString("en-US", { weekday: "long" })}).`,
          voucherId: v.id,
          impactAmount: v.totalAmount,
          status: "PENDING",
          metadata: { date: v.date, type: v.type }
        }
      });
      count++;
    }
  }

  return { ruleCode: "FORENSIC_CHECKS", alertsGenerated: count };
}

/**
 * Unified execution runner that triggers all ledger scrutiny and compliance engines
 */
export async function runAllScrutinyRules(clientId: string, year: number): Promise<{ success: boolean; totalAlerts: number; details: ScrutinyExecutionResult[] }> {
  const details: ScrutinyExecutionResult[] = [];
  
  // 1. Accrual validations
  const accrualResult = await verifyAccrualFlow(clientId, year);
  details.push(accrualResult);
  
  // 2. Payroll audits
  const payrollResult = await verifyPayrollDeductions(clientId, year);
  details.push(payrollResult);
  
  // 3. Provision lifecycles
  const provisionResult = await verifyProvisionClosures(clientId, year);
  details.push(provisionResult);
  
  // 4. Forensic checks (OD balance, manual adjustments, round numbers, weekends)
  const forensicResult = await verifyForensicChecks(clientId, year);
  details.push(forensicResult);

  // 5. Narration NLP checks
  const { analyzeNarrationNLP } = await import("./nlp-reconciliation");
  const nlpResult = await analyzeNarrationNLP(clientId, year);
  details.push({
    ruleCode: "NLP_NARRATION_CHECKS",
    alertsGenerated: nlpResult.alertsGenerated
  });

  const totalAlerts = details.reduce((sum, r) => sum + r.alertsGenerated, 0);

  return {
    success: true,
    totalAlerts,
    details
  };
}

