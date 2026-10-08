import { GSTReconciliationEngine } from "./GSTReconciliationEngine";
import { GSTComplianceEngine } from "./GSTComplianceEngine";
import { GSTCFOInsight } from "../types";

export class GSTInsightService {
  /**
   * Generate CFO-level GST management insights from reconciled real data
   */
  public static async generateInsights(clientId: string, period: string): Promise<GSTCFOInsight[]> {
    const [salesRecon, itcRecon, gstr3bRecon, compliance] = await Promise.all([
      GSTReconciliationEngine.reconcileGSTR1(clientId, period),
      GSTReconciliationEngine.reconcileGSTR2B(clientId, period),
      GSTReconciliationEngine.reconcileGSTR3B(clientId, period),
      GSTComplianceEngine.evaluateCompliance(clientId, period)
    ]);

    const insights: GSTCFOInsight[] = [];

    // Insight 1: Sales Reconciliation & Outward Turnover
    if (salesRecon.summary.totalBooksTaxable > 0 || salesRecon.summary.totalGstTaxable > 0) {
      const varAmt = salesRecon.summary.taxableVariance;
      const isMismatch = Math.abs(varAmt) > 500;

      insights.push({
        id: "gst-insight-sales-recon",
        title: isMismatch ? "Revenue Recognition vs GSTR-1 Outward Supply Gap" : "Outward Supplies Reconciled Cleanly with GSTR-1",
        category: "REVENUE_RECON",
        severity: Math.abs(varAmt) > 50000 ? "HIGH" : isMismatch ? "MEDIUM" : "INFO",
        observation: isMismatch
          ? `Books show ₹${salesRecon.summary.totalBooksTaxable.toLocaleString("en-IN")} taxable sales against ₹${salesRecon.summary.totalGstTaxable.toLocaleString("en-IN")} reported in GSTR-1, creating a net variance of ₹${Math.abs(varAmt).toLocaleString("en-IN")}.`
          : `Total accounting sales of ₹${salesRecon.summary.totalBooksTaxable.toLocaleString("en-IN")} match 100% with reported GSTR-1 turnover for ${period}.`,
        driver: isMismatch
          ? `${salesRecon.summary.missingInGstCount} invoice(s) present in Books are unmapped in GSTR-1, and ${salesRecon.summary.mismatchedCount} have value discrepancies.`
          : "All sales invoices have been posted and synchronized with valid customer tax invoices.",
        financialImpact: isMismatch
          ? `Risk of departmental scrutiny or demand notice for ₹${Math.abs(salesRecon.summary.taxVariance).toLocaleString("en-IN")} in output tax reconciliation.`
          : "Zero tax liability mismatch on outward supplies.",
        risk: isMismatch ? "Recipients may face ITC rejection on unfiled invoices, damaging commercial vendor relationships." : "Minimal risk.",
        managementAction: isMismatch
          ? "Instruct billing team to reconcile unfiled vouchers and upload amendments in the current tax period."
          : "Maintain current billing and tax invoice reconciliation discipline.",
        cfoQuestion: isMismatch
          ? `Why were ${salesRecon.summary.missingInGstCount} sales invoices omitted from the monthly GSTR-1 return?`
          : "Are all newly onboarded B2B customer GSTINs validated prior to invoice generation?",
        metricValue: `${salesRecon.summary.matchRatePct}% Match Rate`
      });
    }

    // Insight 2: ITC Leakage & GSTR-2B Supplier Verification
    if (itcRecon.summary.totalBooksITC > 0 || itcRecon.summary.totalGst2bITC > 0) {
      const itcDiff = itcRecon.summary.itcVariance;
      const hasUnmatched = itcDiff > 500;

      insights.push({
        id: "gst-insight-itc-leakage",
        title: hasUnmatched ? "Potential ITC Cash Leakage: Unmatched Supplier Invoices" : "Input Tax Credit Claims Fully Supported by GSTR-2B",
        category: "ITC_LEAKAGE",
        severity: itcDiff > 25000 ? "HIGH" : hasUnmatched ? "MEDIUM" : "INFO",
        observation: hasUnmatched
          ? `₹${itcDiff.toLocaleString("en-IN")} of input tax credit booked in accounts is currently missing from GSTR-2B, representing ${((itcDiff / (itcRecon.summary.totalBooksITC || 1)) * 100).toFixed(1)}% of total input credit.`
          : `All ₹${itcRecon.summary.totalBooksITC.toLocaleString("en-IN")} of booked input tax credit is fully validated against supplier GSTR-2B records.`,
        driver: hasUnmatched
          ? `${itcRecon.summary.unmatchedBooksCount} supplier invoice(s) have not been uploaded by vendors into their monthly GSTR-1 filings.`
          : "Active suppliers adhere to monthly GSTR-1 compliance schedules.",
        financialImpact: hasUnmatched
          ? `Working capital lockup of ₹${itcDiff.toLocaleString("en-IN")} if forced to reverse under Section 16(2)(aa) with 18% interest.`
          : "Full ITC realization against monthly output tax liability.",
        risk: hasUnmatched ? "Disallowance of input credit during GST audit and requirement to discharge liability in cash." : "Low.",
        managementAction: hasUnmatched
          ? "Institute vendor payment withholdings on GST components until supplier invoice reflects in GSTR-2B."
          : "Continue monthly GSTR-2B reconciliation before releasing supplier retention payments.",
        cfoQuestion: hasUnmatched
          ? `Which key vendors account for the ₹${itcDiff.toLocaleString("en-IN")} in unmatched ITC, and what is the status of vendor outreach?`
          : "Is procurement linking vendor payments to GSTR-2B reflection?",
        metricValue: `₹${itcRecon.summary.totalGst2bITC.toLocaleString("en-IN")} Eligible ITC`
      });
    }

    // Insight 3: Statutory Liability & 3-way Balance
    if (!gstr3bRecon.isOutwardBalanced || !gstr3bRecon.isItcBalanced) {
      insights.push({
        id: "gst-insight-3way-balance",
        title: "Multi-Period Statutory Tax Liability Variance Detected",
        category: "STATUTORY_EXPOSURE",
        severity: "HIGH",
        observation: `GSTR-3B tax computation reflects an outward variance of ₹${Math.abs(gstr3bRecon.outwardTaxableVariance).toLocaleString("en-IN")} and an ITC variance of ₹${Math.abs(gstr3bRecon.itcVariance).toLocaleString("en-IN")}.`,
        driver: "Divergence between accounting ledger posting dates and GSTR-3B filing adjustments.",
        financialImpact: `Potential cumulative variance exposure of ₹${(Math.abs(gstr3bRecon.outputTaxVariance) + Math.abs(gstr3bRecon.itcVariance)).toLocaleString("en-IN")}.`,
        risk: "Automated DRC-01B / DRC-01C compliance notices triggered by GSTN automated risk assessment algorithms.",
        managementAction: "Conduct formal 3-way reconciliation across Books, GSTR-1, and GSTR-3B and document reasons for timing adjustments.",
        cfoQuestion: "What explains the timing difference between ledger revenue accrual and GSTR-3B tax payment?",
        metricValue: `₹${Math.abs(gstr3bRecon.outputTaxVariance).toLocaleString("en-IN")} Output Variance`
      });
    }

    return insights;
  }
}
