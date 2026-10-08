import { GSTReconciliationEngine } from "./GSTReconciliationEngine";
import { GSTComplianceFinding } from "../types";
import { prisma } from "@/lib/prisma";

export class GSTComplianceEngine {
  /**
   * Run full compliance diagnostics for a client and period
   */
  public static async evaluateCompliance(clientId: string, period: string): Promise<{
    period: string;
    totalFindings: number;
    highRiskCount: number;
    mediumRiskCount: number;
    findings: GSTComplianceFinding[];
  }> {
    const findings: GSTComplianceFinding[] = [];

    // 1. Fetch reconciliation datasets
    const [salesRecon, itcRecon, gstr3bRecon, returnStatuses] = await Promise.all([
      GSTReconciliationEngine.reconcileGSTR1(clientId, period),
      GSTReconciliationEngine.reconcileGSTR2B(clientId, period),
      GSTReconciliationEngine.reconcileGSTR3B(clientId, period),
      prisma.gSTReturnStatus.findMany({
        where: { clientId, returnPeriod: period }
      })
    ]);

    // Check 1: Books vs GSTR-1 Turnover Mismatch
    const salesTaxableVariance = Math.abs(salesRecon.summary.taxableVariance);
    if (salesTaxableVariance > 500) {
      const isUnderReported = salesRecon.summary.totalBooksTaxable > salesRecon.summary.totalGstTaxable;
      findings.push({
        ruleCode: "GST_COMP_SALES_VARIANCE",
        title: "Books vs GSTR-1 Turnover Variance",
        category: "OUTWARD_MISMATCH",
        severity: salesTaxableVariance > 50000 ? "HIGH" : "MEDIUM",
        description: isUnderReported
          ? `Accounting books reflect ₹${salesTaxableVariance.toLocaleString("en-IN")} higher taxable turnover than reported in GSTR-1 for ${period}.`
          : `GSTR-1 outward turnover exceeds accounting sales by ₹${salesTaxableVariance.toLocaleString("en-IN")} in ${period}.`,
        impactAmount: salesTaxableVariance,
        suggestedAction: "Reconcile unmapped sales invoices and file amendments in the subsequent GSTR-1 filing.",
        affectedCount: salesRecon.summary.mismatchedCount + salesRecon.summary.missingInGstCount
      });
    }

    // Check 2: Unmatched ITC Exposure in Books vs GSTR-2B
    const unmatchedItc = itcRecon.summary.itcVariance;
    if (unmatchedItc > 500) {
      findings.push({
        ruleCode: "GST_COMP_UNMATCHED_ITC",
        title: "Unmatched Input Tax Credit (ITC) in GSTR-2B",
        category: "ITC_EXPOSURE",
        severity: unmatchedItc > 25000 ? "HIGH" : "MEDIUM",
        description: `₹${unmatchedItc.toLocaleString("en-IN")} of input tax credit booked in purchases is currently not reflected in suppliers' GSTR-2B statements.`,
        impactAmount: unmatchedItc,
        suggestedAction: "Follow up with suppliers to upload pending invoices in their monthly GSTR-1 before filing GSTR-3B.",
        affectedCount: itcRecon.summary.unmatchedBooksCount
      });
    }

    // Check 3: GSTR-1 vs GSTR-3B Output Tax Discrepancy
    const outputTaxVariance = Math.abs(gstr3bRecon.outputTaxVariance);
    if (outputTaxVariance > 100) {
      findings.push({
        ruleCode: "GST_COMP_3B_LIABILITY_DIFF",
        title: "GSTR-1 vs GSTR-3B Output Tax Discrepancy",
        category: "OUTWARD_MISMATCH",
        severity: outputTaxVariance > 10000 ? "HIGH" : "MEDIUM",
        description: `Output tax declared in GSTR-3B differs from GSTR-1 table-wise tax liability by ₹${outputTaxVariance.toLocaleString("en-IN")}.`,
        impactAmount: outputTaxVariance,
        suggestedAction: "Verify tax liability adjustment under Table 3.1 of GSTR-3B to prevent statutory difference notice.",
        affectedCount: 1
      });
    }

    // Check 4: Return Filing Status
    const gstr1Status = returnStatuses.find(r => r.returnType === "GSTR1");
    const gstr3bStatus = returnStatuses.find(r => r.returnType === "GSTR3B");

    if (gstr1Status && gstr1Status.status !== "FILED") {
      findings.push({
        ruleCode: "GST_COMP_GSTR1_PENDING",
        title: "GSTR-1 Return Filing Pending",
        category: "FILING",
        severity: "HIGH",
        description: `GSTR-1 for return period ${period} is marked as ${gstr1Status.status}.`,
        impactAmount: 0,
        suggestedAction: "File pending GSTR-1 outward return immediately to enable ITC pass-through for recipients.",
        affectedCount: 1
      });
    }

    if (gstr3bStatus && gstr3bStatus.status !== "FILED") {
      findings.push({
        ruleCode: "GST_COMP_GSTR3B_PENDING",
        title: "GSTR-3B Return Filing Pending",
        category: "FILING",
        severity: "HIGH",
        description: `GSTR-3B monthly return for period ${period} is marked as ${gstr3bStatus.status}.`,
        impactAmount: 0,
        suggestedAction: "Submit GSTR-3B and discharge statutory tax dues to prevent interest accrual under Section 50.",
        affectedCount: 1
      });
    }

    const highRiskCount = findings.filter(f => f.severity === "HIGH").length;
    const mediumRiskCount = findings.filter(f => f.severity === "MEDIUM").length;

    return {
      period,
      totalFindings: findings.length,
      highRiskCount,
      mediumRiskCount,
      findings
    };
  }
}
