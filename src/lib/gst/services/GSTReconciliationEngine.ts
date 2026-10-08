import { prisma } from "@/lib/prisma";
import { 
  GSTSalesReconItem, 
  GSTPurchaseITCReconItem, 
  GSTR3BReconSummary, 
  GSTMatchStatus 
} from "../types";

function normalizeDocNumber(docNo: string): string {
  if (!docNo) return "";
  return docNo.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

export class GSTReconciliationEngine {
  /**
   * Reconcile Books Sales vs GSTR-1 for a specific period
   */
  public static async reconcileGSTR1(clientId: string, period: string): Promise<{
    period: string;
    summary: {
      totalBooksTaxable: number;
      totalGstTaxable: number;
      taxableVariance: number;
      totalBooksOutputTax: number;
      totalGstOutputTax: number;
      taxVariance: number;
      matchedCount: number;
      mismatchedCount: number;
      missingInGstCount: number;
      missingInBooksCount: number;
      matchRatePct: number;
      gstr1RecordCount: number;
    };
    items: GSTSalesReconItem[];
  }> {
    const [yearStr, monthStr] = period.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // 1. Fetch Books Sales Vouchers for the period
    const vouchers = await prisma.normalizedVoucher.findMany({
      where: {
        clientId,
        date: { gte: periodStart, lte: periodEnd }
      },
      include: {
        lines: {
          include: { ledger: true }
        }
      },
      orderBy: { date: "asc" }
    });

    // Filter sales / revenue / billing vouchers
    const salesVouchers = vouchers.filter(v => {
      const type = (v.type || "").toUpperCase();
      if (type === "SALES") return true;
      return v.lines.some(l => {
        const g = (l.ledger.groupName || "").toLowerCase();
        const n = (l.ledger.name || "").toLowerCase();
        return g.includes("sales") || g.includes("revenue") || g.includes("direct income") || n.includes("sales") || n.includes("billing");
      });
    });

    // 2. Fetch Synced GSTR-1 Records
    const gstr1Records = await prisma.gSTR1Record.findMany({
      where: {
        clientId,
        returnPeriod: period
      },
      orderBy: { documentDate: "asc" }
    });

    // Structure Books Sales Invoices
    const booksSalesMap = new Map<string, {
      voucherId: string;
      voucherNumber: string;
      date: Date;
      type: string;
      customerName?: string;
      customerGSTIN?: string;
      taxableValue: number;
      igst: number;
      cgst: number;
      sgst: number;
      totalValue: number;
    }>();

    for (const v of salesVouchers) {
      const docKey = normalizeDocNumber(v.voucherNumber);
      let taxable = 0;
      let igst = 0;
      let cgst = 0;
      let sgst = 0;
      let partyName = "";

      for (const line of v.lines) {
        const amt = Math.abs(line.amount);
        const g = (line.ledger.groupName || "").toLowerCase();
        const n = (line.ledger.name || "").toLowerCase();

        if (g.includes("debtor") || g.includes("customer") || line.entryType === "DEBIT") {
          if (!partyName && !n.includes("gst") && !n.includes("tax") && !n.includes("sales") && !n.includes("round")) {
            partyName = line.ledger.name;
          }
        }

        if (n.includes("igst output") || n.includes("output igst")) {
          igst += amt;
        } else if (n.includes("cgst output") || n.includes("output cgst")) {
          cgst += amt;
        } else if (n.includes("sgst output") || n.includes("output sgst")) {
          sgst += amt;
        } else if (g.includes("sales") || g.includes("revenue") || g.includes("income") || line.entryType === "CREDIT") {
          taxable += amt;
        }
      }

      if (taxable === 0 && v.totalAmount > 0) {
        taxable = v.totalAmount;
      }

      booksSalesMap.set(docKey, {
        voucherId: v.id,
        voucherNumber: v.voucherNumber,
        date: v.date,
        type: v.type,
        customerName: partyName || "Sundry Debtor",
        taxableValue: taxable,
        igst,
        cgst,
        sgst,
        totalValue: taxable + igst + cgst + sgst
      });
    }

    const items: GSTSalesReconItem[] = [];
    const matchedGstIds = new Set<string>();

    // 3. Compare Books with GSTR-1
    booksSalesMap.forEach((booksDoc, normDocNo) => {
      // Find matching GSTR-1 record
      const matchedGst = gstr1Records.find(r => 
        !matchedGstIds.has(r.id) && normalizeDocNumber(r.documentNumber) === normDocNo
      );

      if (matchedGst) {
        matchedGstIds.add(matchedGst.id);
        const taxableDiff = Math.abs(booksDoc.taxableValue - matchedGst.taxableValue);
        const taxDiff = Math.abs((booksDoc.igst + booksDoc.cgst + booksDoc.sgst) - (matchedGst.igst + matchedGst.cgst + matchedGst.sgst));

        let status: GSTMatchStatus = "MATCHED";
        let matchScore = 100;
        let explanation = "Exact match between Books sales invoice and GSTR-1 reported supply.";

        if (taxableDiff > 10) {
          status = "VALUE_MISMATCH";
          matchScore = 70;
          explanation = `Taxable turnover variance of ₹${taxableDiff.toFixed(2)} between Books (₹${booksDoc.taxableValue}) and GSTR-1 (₹${matchedGst.taxableValue}).`;
        } else if (taxDiff > 5) {
          status = "TAX_MISMATCH";
          matchScore = 80;
          explanation = `Tax rate or tax amount variance of ₹${taxDiff.toFixed(2)} between Books and GSTR-1.`;
        }

        items.push({
          id: `recon-sales-${normDocNo}`,
          documentNumber: booksDoc.voucherNumber,
          documentDate: booksDoc.date.toISOString().split("T")[0],
          customerGSTIN: matchedGst.customerGSTIN || undefined,
          customerName: matchedGst.customerName || booksDoc.customerName,
          booksTaxable: booksDoc.taxableValue,
          booksIgst: booksDoc.igst,
          booksCgst: booksDoc.cgst,
          booksSgst: booksDoc.sgst,
          booksTotal: booksDoc.totalValue,
          booksVoucherId: booksDoc.voucherId,
          booksVoucherType: booksDoc.type,
          gstTaxable: matchedGst.taxableValue,
          gstIgst: matchedGst.igst,
          gstCgst: matchedGst.cgst,
          gstSgst: matchedGst.sgst,
          gstTotal: matchedGst.totalValue,
          gstRecordId: matchedGst.id,
          taxableDiff,
          taxDiff,
          status,
          matchScore,
          explanation
        });
      } else {
        // Missing in GSTR-1
        items.push({
          id: `recon-sales-missing-gst-${normDocNo}`,
          documentNumber: booksDoc.voucherNumber,
          documentDate: booksDoc.date.toISOString().split("T")[0],
          customerName: booksDoc.customerName,
          booksTaxable: booksDoc.taxableValue,
          booksIgst: booksDoc.igst,
          booksCgst: booksDoc.cgst,
          booksSgst: booksDoc.sgst,
          booksTotal: booksDoc.totalValue,
          booksVoucherId: booksDoc.voucherId,
          booksVoucherType: booksDoc.type,
          gstTaxable: 0,
          gstIgst: 0,
          gstCgst: 0,
          gstSgst: 0,
          gstTotal: 0,
          taxableDiff: booksDoc.taxableValue,
          taxDiff: booksDoc.igst + booksDoc.cgst + booksDoc.sgst,
          status: "MISSING_IN_GST",
          matchScore: 0,
          explanation: "Invoice recorded in accounting books but not found in reported GSTR-1 return for this period."
        });
      }
    });

    // 4. Identify GSTR-1 records missing in Books
    for (const gst of gstr1Records) {
      if (!matchedGstIds.has(gst.id)) {
        const gstTax = gst.igst + gst.cgst + gst.sgst;
        items.push({
          id: `recon-sales-missing-books-${gst.id}`,
          documentNumber: gst.documentNumber,
          documentDate: gst.documentDate.toISOString().split("T")[0],
          customerGSTIN: gst.customerGSTIN || undefined,
          customerName: gst.customerName || "B2B Customer",
          booksTaxable: 0,
          booksIgst: 0,
          booksCgst: 0,
          booksSgst: 0,
          booksTotal: 0,
          gstTaxable: gst.taxableValue,
          gstIgst: gst.igst,
          gstCgst: gst.cgst,
          gstSgst: gst.sgst,
          gstTotal: gst.totalValue,
          gstRecordId: gst.id,
          taxableDiff: gst.taxableValue,
          taxDiff: gstTax,
          status: "MISSING_IN_BOOKS",
          matchScore: 0,
          explanation: "Invoice reported in GSTR-1 return but not found in accounting books."
        });
      }
    }

    // Compute summary totals
    let totalBooksTaxable = 0;
    let totalGstTaxable = 0;
    let totalBooksOutputTax = 0;
    let totalGstOutputTax = 0;
    let matchedCount = 0;
    let mismatchedCount = 0;
    let missingInGstCount = 0;
    let missingInBooksCount = 0;

    for (const it of items) {
      totalBooksTaxable += it.booksTaxable;
      totalGstTaxable += it.gstTaxable;
      totalBooksOutputTax += (it.booksIgst + it.booksCgst + it.booksSgst);
      totalGstOutputTax += (it.gstIgst + it.gstCgst + it.gstSgst);

      if (it.status === "MATCHED") matchedCount++;
      else if (it.status === "VALUE_MISMATCH" || it.status === "TAX_MISMATCH") mismatchedCount++;
      else if (it.status === "MISSING_IN_GST") missingInGstCount++;
      else if (it.status === "MISSING_IN_BOOKS") missingInBooksCount++;
    }

    const totalCount = items.length;
    const matchRatePct = totalCount > 0 ? Number(((matchedCount / totalCount) * 100).toFixed(1)) : 100;

    return {
      period,
      summary: {
        totalBooksTaxable,
        totalGstTaxable,
        taxableVariance: totalBooksTaxable - totalGstTaxable,
        totalBooksOutputTax,
        totalGstOutputTax,
        taxVariance: totalBooksOutputTax - totalGstOutputTax,
        matchedCount,
        mismatchedCount,
        missingInGstCount,
        missingInBooksCount,
        matchRatePct,
        gstr1RecordCount: gstr1Records.length
      },
      items
    };
  }

  /**
   * Reconcile Books Purchases vs GSTR-2B (ITC Verification)
   */
  public static async reconcileGSTR2B(clientId: string, period: string): Promise<{
    period: string;
    summary: {
      totalBooksITC: number;
      totalGst2bITC: number;
      itcVariance: number;
      eligibleGst2bITC: number;
      ineligibleGst2bITC: number;
      matchedCount: number;
      mismatchedCount: number;
      unmatchedBooksCount: number;
      unmatched2bCount: number;
      matchRatePct: number;
      gstr2bRecordCount: number;
    };
    items: GSTPurchaseITCReconItem[];
  }> {
    const [yearStr, monthStr] = period.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const periodStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    // 1. Fetch Books Purchase Vouchers for the period
    const vouchers = await prisma.normalizedVoucher.findMany({
      where: {
        clientId,
        date: { gte: periodStart, lte: periodEnd }
      },
      include: {
        lines: {
          include: { ledger: true }
        }
      },
      orderBy: { date: "asc" }
    });

    const purchaseVouchers = vouchers.filter(v => {
      const type = (v.type || "").toUpperCase();
      if (type === "PURCHASE") return true;
      return v.lines.some(l => {
        const g = (l.ledger.groupName || "").toLowerCase();
        const n = (l.ledger.name || "").toLowerCase();
        return g.includes("purchase") || n.includes("purchase") || n.includes("input igst") || n.includes("input cgst") || n.includes("input sgst");
      });
    });

    // 2. Fetch Synced GSTR-2B Records
    const gstr2bRecords = await prisma.gSTR2BRecord.findMany({
      where: {
        clientId,
        returnPeriod: period
      },
      orderBy: { invoiceDate: "asc" }
    });

    // Structure Books Purchases
    const booksPurchaseMap = new Map<string, {
      voucherId: string;
      invoiceNumber: string;
      date: Date;
      supplierName?: string;
      supplierGSTIN?: string;
      taxableValue: number;
      igst: number;
      cgst: number;
      sgst: number;
      totalITC: number;
    }>();

    for (const v of purchaseVouchers) {
      const docKey = normalizeDocNumber(v.voucherNumber);
      let taxable = 0;
      let igst = 0;
      let cgst = 0;
      let sgst = 0;
      let partyName = "";

      for (const line of v.lines) {
        const amt = Math.abs(line.amount);
        const g = (line.ledger.groupName || "").toLowerCase();
        const n = (line.ledger.name || "").toLowerCase();

        if (g.includes("creditor") || g.includes("vendor") || line.entryType === "CREDIT") {
          if (!partyName && !n.includes("gst") && !n.includes("tax") && !n.includes("purchase") && !n.includes("round")) {
            partyName = line.ledger.name;
          }
        }

        if (n.includes("igst input") || n.includes("input igst")) {
          igst += amt;
        } else if (n.includes("cgst input") || n.includes("input cgst")) {
          cgst += amt;
        } else if (n.includes("sgst input") || n.includes("input sgst")) {
          sgst += amt;
        } else if (g.includes("purchase") || g.includes("expense") || line.entryType === "DEBIT") {
          taxable += amt;
        }
      }

      const totalITC = igst + cgst + sgst;
      booksPurchaseMap.set(docKey, {
        voucherId: v.id,
        invoiceNumber: v.voucherNumber,
        date: v.date,
        supplierName: partyName || "Sundry Creditor",
        taxableValue: taxable || v.totalAmount,
        igst,
        cgst,
        sgst,
        totalITC
      });
    }

    const items: GSTPurchaseITCReconItem[] = [];
    const matched2bIds = new Set<string>();

    // 3. Match Books vs GSTR-2B
    booksPurchaseMap.forEach((booksDoc, normDocNo) => {
      const matched2b = gstr2bRecords.find(r => 
        !matched2bIds.has(r.id) && normalizeDocNumber(r.invoiceNumber) === normDocNo
      );

      if (matched2b) {
        matched2bIds.add(matched2b.id);
        const gst2bTotalITC = matched2b.igst + matched2b.cgst + matched2b.sgst;
        const itcDiff = Math.abs(booksDoc.totalITC - gst2bTotalITC);

        let status: GSTMatchStatus = "MATCHED";
        let matchScore = 100;
        let explanation = "ITC matched between Books purchase voucher and GSTR-2B statement.";

        if (itcDiff > 5) {
          status = "TAX_MISMATCH";
          matchScore = 75;
          explanation = `ITC claim variance of ₹${itcDiff.toFixed(2)} between Books (₹${booksDoc.totalITC}) and GSTR-2B (₹${gst2bTotalITC}).`;
        }

        items.push({
          id: `recon-itc-${normDocNo}`,
          invoiceNumber: booksDoc.invoiceNumber,
          invoiceDate: booksDoc.date.toISOString().split("T")[0],
          supplierGSTIN: matched2b.supplierGSTIN,
          supplierName: matched2b.supplierName || booksDoc.supplierName,
          booksTaxable: booksDoc.taxableValue,
          booksIgst: booksDoc.igst,
          booksCgst: booksDoc.cgst,
          booksSgst: booksDoc.sgst,
          booksTotalITC: booksDoc.totalITC,
          booksVoucherId: booksDoc.voucherId,
          gst2bTaxable: matched2b.taxableValue,
          gst2bIgst: matched2b.igst,
          gst2bCgst: matched2b.cgst,
          gst2bSgst: matched2b.sgst,
          gst2bTotalITC,
          itcAvailable: matched2b.itcAvailable,
          itcReason: matched2b.itcReason || undefined,
          gstRecordId: matched2b.id,
          itcDiff,
          status,
          matchScore,
          explanation
        });
      } else {
        // Missing in GSTR-2B
        items.push({
          id: `recon-itc-missing-2b-${normDocNo}`,
          invoiceNumber: booksDoc.invoiceNumber,
          invoiceDate: booksDoc.date.toISOString().split("T")[0],
          supplierGSTIN: "N/A",
          supplierName: booksDoc.supplierName,
          booksTaxable: booksDoc.taxableValue,
          booksIgst: booksDoc.igst,
          booksCgst: booksDoc.cgst,
          booksSgst: booksDoc.sgst,
          booksTotalITC: booksDoc.totalITC,
          booksVoucherId: booksDoc.voucherId,
          gst2bTaxable: 0,
          gst2bIgst: 0,
          gst2bCgst: 0,
          gst2bSgst: 0,
          gst2bTotalITC: 0,
          itcAvailable: false,
          itcReason: "NOT_REFLECTED_IN_2B",
          itcDiff: booksDoc.totalITC,
          status: "MISSING_IN_GST",
          matchScore: 0,
          explanation: "Purchase recorded in Books but supplier has not uploaded invoice into GSTR-1/GSTR-2B for this period (Unmatched — Review Required)."
        });
      }
    });

    // 4. In GSTR-2B but Missing in Books
    for (const r of gstr2bRecords) {
      if (!matched2bIds.has(r.id)) {
        const gst2bTotalITC = r.igst + r.cgst + r.sgst;
        items.push({
          id: `recon-itc-missing-books-${r.id}`,
          invoiceNumber: r.invoiceNumber,
          invoiceDate: r.invoiceDate.toISOString().split("T")[0],
          supplierGSTIN: r.supplierGSTIN,
          supplierName: r.supplierName || "Registered Supplier",
          booksTaxable: 0,
          booksIgst: 0,
          booksCgst: 0,
          booksSgst: 0,
          booksTotalITC: 0,
          gst2bTaxable: r.taxableValue,
          gst2bIgst: r.igst,
          gst2bCgst: r.cgst,
          gst2bSgst: r.sgst,
          gst2bTotalITC,
          itcAvailable: r.itcAvailable,
          itcReason: r.itcReason || undefined,
          gstRecordId: r.id,
          itcDiff: gst2bTotalITC,
          status: "MISSING_IN_BOOKS",
          matchScore: 0,
          explanation: "Supplier invoice present in GSTR-2B with eligible ITC, but missing in accounting books."
        });
      }
    }

    // Calculate Summary
    let totalBooksITC = 0;
    let totalGst2bITC = 0;
    let eligibleGst2bITC = 0;
    let ineligibleGst2bITC = 0;
    let matchedCount = 0;
    let mismatchedCount = 0;
    let unmatchedBooksCount = 0;
    let unmatched2bCount = 0;

    for (const it of items) {
      totalBooksITC += it.booksTotalITC;
      totalGst2bITC += it.gst2bTotalITC;
      if (it.itcAvailable) {
        eligibleGst2bITC += it.gst2bTotalITC;
      } else {
        ineligibleGst2bITC += it.gst2bTotalITC;
      }

      if (it.status === "MATCHED") matchedCount++;
      else if (it.status === "TAX_MISMATCH" || it.status === "VALUE_MISMATCH") mismatchedCount++;
      else if (it.status === "MISSING_IN_GST") unmatchedBooksCount++;
      else if (it.status === "MISSING_IN_BOOKS") unmatched2bCount++;
    }

    const totalCount = items.length;
    const matchRatePct = totalCount > 0 ? Number(((matchedCount / totalCount) * 100).toFixed(1)) : 100;

    return {
      period,
      summary: {
        totalBooksITC,
        totalGst2bITC,
        itcVariance: totalBooksITC - totalGst2bITC,
        eligibleGst2bITC,
        ineligibleGst2bITC,
        matchedCount,
        mismatchedCount,
        unmatchedBooksCount,
        unmatched2bCount,
        matchRatePct,
        gstr2bRecordCount: gstr2bRecords.length
      },
      items
    };
  }

  /**
   * Reconcile GSTR-3B vs Books and Returns (3-way reconciliation)
   */
  public static async reconcileGSTR3B(clientId: string, period: string): Promise<GSTR3BReconSummary> {
    const [salesRecon, itcRecon, gstr3b, returnStatus] = await Promise.all([
      this.reconcileGSTR1(clientId, period),
      this.reconcileGSTR2B(clientId, period),
      prisma.gSTR3BRecord.findUnique({
        where: {
          clientId_gstin_returnPeriod: {
            clientId,
            gstin: (await prisma.gSTConnection.findUnique({ where: { clientId }, select: { gstin: true } }))?.gstin || "",
            returnPeriod: period
          }
        }
      }),
      prisma.gSTReturnStatus.findFirst({
        where: { clientId, returnType: "GSTR3B", returnPeriod: period }
      })
    ]);

    const booksOutwardTaxable = salesRecon.summary.totalBooksTaxable;
    const gstr1OutwardTaxable = salesRecon.summary.totalGstTaxable;
    const gstr3bOutwardTaxable = gstr3b?.outwardTaxableSupplies || 0;
    const outwardTaxableVariance = booksOutwardTaxable - gstr3bOutwardTaxable;

    const booksOutputTax = salesRecon.summary.totalBooksOutputTax;
    const gstr1OutputTax = salesRecon.summary.totalGstOutputTax;
    const gstr3bOutputTax = (gstr3b?.outwardIgst || 0) + (gstr3b?.outwardCgst || 0) + (gstr3b?.outwardSgst || 0);
    const outputTaxVariance = booksOutputTax - gstr3bOutputTax;

    const booksItcTotal = itcRecon.summary.totalBooksITC;
    const gstr2bItcTotal = itcRecon.summary.totalGst2bITC;
    const gstr3bItcClaimed = (gstr3b?.itcIgst || 0) + (gstr3b?.itcCgst || 0) + (gstr3b?.itcSgst || 0);
    const itcVariance = booksItcTotal - gstr3bItcClaimed;

    const isOutwardBalanced = Math.abs(outwardTaxableVariance) < 100 && Math.abs(outputTaxVariance) < 50;
    const isItcBalanced = Math.abs(itcVariance) < 100;

    let riskSummary = "GSTR-3B reconciles cleanly with Books and GSTR-1/2B.";
    if (!gstr3b && salesRecon.summary.gstr1RecordCount === 0 && itcRecon.summary.gstr2bRecordCount === 0) {
      riskSummary = `No GST return filings have been synchronized yet for ${period}.`;
    } else if (!isOutwardBalanced && !isItcBalanced) {
      riskSummary = "Material variances detected in both Outward Taxable Turnover and Input Tax Credit claimed in GSTR-3B.";
    } else if (!isOutwardBalanced) {
      riskSummary = `Outward turnover in GSTR-3B differs from Books by ₹${Math.abs(outwardTaxableVariance).toLocaleString("en-IN")}.`;
    } else if (!isItcBalanced) {
      riskSummary = `ITC claimed in GSTR-3B differs from Books purchase ledger by ₹${Math.abs(itcVariance).toLocaleString("en-IN")}.`;
    }

    return {
      period,
      filingStatus: returnStatus?.status || (gstr3b ? "FILED" : "NOT_FILED"),
      filingDate: gstr3b?.filingDate ? gstr3b.filingDate.toISOString().split("T")[0] : undefined,
      arn: gstr3b?.arn || returnStatus?.arn || undefined,
      booksOutwardTaxable,
      gstr1OutwardTaxable,
      gstr3bOutwardTaxable,
      outwardTaxableVariance,
      booksOutputTax,
      gstr1OutputTax,
      gstr3bOutputTax,
      outputTaxVariance,
      booksItcTotal,
      gstr2bItcTotal,
      gstr3bItcClaimed,
      itcVariance,
      isOutwardBalanced,
      isItcBalanced,
      riskSummary,
      gstr3bExists: !!gstr3b
    };
  }
}
