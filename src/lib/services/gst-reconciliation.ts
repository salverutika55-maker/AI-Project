import { prisma } from "@/lib/prisma";
import { calculateStringSimilarity } from "./nlp-reconciliation";

export interface GSTR2BLine {
  id: string;
  gstin: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: Date;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  itcAvailable: boolean;
}

export interface GSTMatchItem {
  id: string;
  gstin: string;
  vendorName: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  
  // Books comparison values (if matched/mismatched)
  booksInvoiceNo?: string;
  booksDate?: string;
  booksTaxable?: number;
  booksCgst?: number;
  booksSgst?: number;
  booksIgst?: number;
  
  score: number;
  matchType: "MATCHED" | "MISMATCHED" | "UNCLAIMED_ITC" | "MISSING_IN_2B";
  message: string;
}

/**
 * Normalizes alphanumeric invoice numbers by removing common separators
 * e.g., "INV/2026/012" -> "inv2026012"
 */
function normalizeInvoiceNo(inv: string): string {
  return inv.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

/**
 * GST Reconciliation Solver
 * Cross-references Books Purchase records vs GSTR-2B claims.
 */
export async function reconcileGSTData(
  clientId: string,
  period: string, // e.g. "2026-05"
  gstr2bLines: GSTR2BLine[]
): Promise<{
  matches: GSTMatchItem[];
  summary: {
    matchedCount: number;
    matchedAmount: number;
    mismatchedCount: number;
    mismatchedAmount: number;
    unclaimedCount: number;
    unclaimedAmount: number;
    missingCount: number;
    missingAmount: number;
  };
}> {
  // 1. Fetch Books purchase vouchers for the fiscal year
  const [yearStr] = period.split("-");
  const startYear = parseInt(yearStr);
  
  // Fetch vouchers covering +- 90 days from statement month to capture delay timings
  const startDate = new Date(`${startYear}-01-01`);
  const endDate = new Date(`${startYear + 1}-01-01`);

  const booksVouchers = await prisma.normalizedVoucher.findMany({
    where: {
      clientId,
      date: {
        gte: startDate,
        lt: endDate
      }
    },
    include: {
      lines: {
        include: { ledger: true }
      }
    }
  });

  // Extract structured purchases from Books
  const booksPurchases = booksVouchers.filter(v => {
    if (v.type === "PURCHASE") return true;
    // Check if ledger entries contain purchase accounts or GST input tax assets
    return v.lines.some(l => 
      l.ledger.groupName.includes("Purchase Accounts") ||
      l.ledger.name.toLowerCase().includes("purchase") ||
      l.ledger.name.toLowerCase().includes("cgst input") ||
      l.ledger.name.toLowerCase().includes("sgst input") ||
      l.ledger.name.toLowerCase().includes("igst input")
    );
  }).map(v => {
    // Determine Supplier Invoice No (often in referenceNo or voucherNumber)
    const rawInvNo = v.referenceNo || v.voucherNumber;
    
    // Find Vendor Ledger (Sundry Creditor)
    const creditorLine = v.lines.find(l => 
      l.ledger.groupName.includes("Sundry Creditors") || 
      l.ledger.groupName.includes("Creditors")
    );
    const vendorName = creditorLine?.ledger.name || "Unknown Vendor";
    
    // Attempt to extract vendor GSTIN from ledger metadata or name
    let gstin = "";
    const ledgerAny = creditorLine?.ledger as any;
    if (ledgerAny?.metadata) {
      const meta = ledgerAny.metadata;
      gstin = meta.gstin || meta.gstNumber || "";
    }
    // If not found in metadata, try extracting with regex from name/description
    if (!gstin) {
      const match = vendorName.match(/\b\d{2}[A-Z]{5}\d{4}[A-Z]{1}[A-Z\d]{1}[Z]{1}[A-Z\d]{1}\b/);
      if (match) gstin = match[0];
    }

    // Accumulate taxable value (purchases) and tax components
    let taxableValue = 0;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    v.lines.forEach(l => {
      const name = l.ledger.name.toLowerCase();
      const amt = Math.abs(l.amount);
      if (l.ledger.groupName.includes("Purchase Accounts") || name.includes("purchase")) {
        taxableValue += amt;
      } else if (name.includes("cgst") && name.includes("input")) {
        cgst += amt;
      } else if (name.includes("sgst") && name.includes("input")) {
        sgst += amt;
      } else if (name.includes("igst") && name.includes("input")) {
        igst += amt;
      }
    });

    return {
      voucherId: v.id,
      invoiceNumber: rawInvNo,
      invoiceDate: v.date,
      vendorName,
      gstin,
      taxableValue: taxableValue || v.totalAmount - (cgst + sgst + igst),
      cgst,
      sgst,
      igst
    };
  });

  const matches: GSTMatchItem[] = [];
  const matchedBooksIds = new Set<string>();

  // Helper stats trackers
  let stats = {
    matchedCount: 0,
    matchedAmount: 0,
    mismatchedCount: 0,
    mismatchedAmount: 0,
    unclaimedCount: 0,
    unclaimedAmount: 0,
    missingCount: 0,
    missingAmount: 0
  };

  // 2. Iterate GSTR-2B credit list and find match in Books
  for (const gstrLine of gstr2bLines) {
    let bestMatch: typeof booksPurchases[0] | null = null;
    let bestScore = 0.0;

    for (const bookLine of booksPurchases) {
      if (matchedBooksIds.has(bookLine.voucherId)) continue;

      // Match scoring logic
      // GSTIN exact (0.35), Inv number similarity (0.35), Value proximity (0.20), Date proximity (0.10)
      let gstinScore = 0.0;
      if (gstrLine.gstin && bookLine.gstin) {
        gstinScore = gstrLine.gstin.toUpperCase() === bookLine.gstin.toUpperCase() ? 1.0 : 0.0;
      } else if (gstrLine.vendorName && bookLine.vendorName) {
        // Fallback to name Jaccard similarity
        gstinScore = calculateStringSimilarity(gstrLine.vendorName, bookLine.vendorName) * 0.8;
      }

      const normGstInv = normalizeInvoiceNo(gstrLine.invoiceNumber);
      const normBookInv = normalizeInvoiceNo(bookLine.invoiceNumber);
      let invScore = 0.0;
      if (normGstInv === normBookInv) {
        invScore = 1.0;
      } else {
        invScore = calculateStringSimilarity(normGstInv, normBookInv);
      }

      // Taxable Value matching (margin of tolerance - e.g. within 1%)
      const valDiff = Math.abs(gstrLine.taxableValue - bookLine.taxableValue);
      let valScore = 0.0;
      if (valDiff === 0) valScore = 1.0;
      else if (valDiff <= 10) valScore = 0.9;
      else if (valDiff / Math.max(1, gstrLine.taxableValue) < 0.01) valScore = 0.7;

      // Date difference (within 30 days)
      const dateDiffDays = Math.abs(gstrLine.invoiceDate.getTime() - bookLine.invoiceDate.getTime()) / (1000 * 60 * 60 * 24);
      let dateScore = 0.0;
      if (dateDiffDays <= 2) dateScore = 1.0;
      else if (dateDiffDays <= 7) dateScore = 0.8;
      else if (dateDiffDays <= 30) dateScore = 0.4;

      const totalScore = (gstinScore * 0.35) + (invScore * 0.35) + (valScore * 0.20) + (dateScore * 0.10);

      if (totalScore > bestScore && totalScore >= 0.55) {
        bestScore = totalScore;
        bestMatch = bookLine;
      }
    }

    if (bestMatch) {
      matchedBooksIds.add(bestMatch.voucherId);

      // Verify if amounts (CGST, SGST, IGST, Taxable Value) align
      const isMismatch = 
        Math.abs(gstrLine.taxableValue - bestMatch.taxableValue) > 5.0 ||
        Math.abs(gstrLine.cgst - bestMatch.cgst) > 2.0 ||
        Math.abs(gstrLine.sgst - bestMatch.sgst) > 2.0 ||
        Math.abs(gstrLine.igst - bestMatch.igst) > 2.0;

      const totalTaxGstr = gstrLine.cgst + gstrLine.sgst + gstrLine.igst;

      if (isMismatch) {
        stats.mismatchedCount++;
        stats.mismatchedAmount += totalTaxGstr;
        matches.push({
          id: gstrLine.id,
          gstin: gstrLine.gstin,
          vendorName: gstrLine.vendorName,
          invoiceNumber: gstrLine.invoiceNumber,
          invoiceDate: gstrLine.invoiceDate.toISOString().split("T")[0],
          taxableValue: gstrLine.taxableValue,
          cgst: gstrLine.cgst,
          sgst: gstrLine.sgst,
          igst: gstrLine.igst,
          
          booksInvoiceNo: bestMatch.invoiceNumber,
          booksDate: bestMatch.invoiceDate.toISOString().split("T")[0],
          booksTaxable: bestMatch.taxableValue,
          booksCgst: bestMatch.cgst,
          booksSgst: bestMatch.sgst,
          booksIgst: bestMatch.igst,

          score: bestScore,
          matchType: "MISMATCHED",
          message: "⚠️ Invoice mismatch: Value or tax components in Books differ from GST Portal statement."
        });
      } else {
        stats.matchedCount++;
        stats.matchedAmount += totalTaxGstr;
        matches.push({
          id: gstrLine.id,
          gstin: gstrLine.gstin,
          vendorName: gstrLine.vendorName,
          invoiceNumber: gstrLine.invoiceNumber,
          invoiceDate: gstrLine.invoiceDate.toISOString().split("T")[0],
          taxableValue: gstrLine.taxableValue,
          cgst: gstrLine.cgst,
          sgst: gstrLine.sgst,
          igst: gstrLine.igst,

          booksInvoiceNo: bestMatch.invoiceNumber,
          booksDate: bestMatch.invoiceDate.toISOString().split("T")[0],
          booksTaxable: bestMatch.taxableValue,
          booksCgst: bestMatch.cgst,
          booksSgst: bestMatch.sgst,
          booksIgst: bestMatch.igst,

          score: bestScore,
          matchType: "MATCHED",
          message: "✅ Credit perfectly reconciled. Match score: " + Math.round(bestScore * 100) + "%"
        });
      }
    } else {
      // credit exists in GSTR-2B but no record in books -> UNCLAIMED ITC (Opportunity!)
      const totalTaxGstr = gstrLine.cgst + gstrLine.sgst + gstrLine.igst;
      stats.unclaimedCount++;
      stats.unclaimedAmount += totalTaxGstr;

      matches.push({
        id: gstrLine.id,
        gstin: gstrLine.gstin,
        vendorName: gstrLine.vendorName,
        invoiceNumber: gstrLine.invoiceNumber,
        invoiceDate: gstrLine.invoiceDate.toISOString().split("T")[0],
        taxableValue: gstrLine.taxableValue,
        cgst: gstrLine.cgst,
        sgst: gstrLine.sgst,
        igst: gstrLine.igst,

        score: 0,
        matchType: "UNCLAIMED_ITC",
        message: "💡 Unclaimed Input Tax Credit: Found in GSTR-2B, but invoice is missing in your Purchase Books."
      });
    }
  }

  // 3. Purchases in books but not in GSTR-2B -> MISSING IN 2B (Risk!)
  for (const bookLine of booksPurchases) {
    if (matchedBooksIds.has(bookLine.voucherId)) continue;

    const totalTaxBook = bookLine.cgst + bookLine.sgst + bookLine.igst;
    stats.missingCount++;
    stats.missingAmount += totalTaxBook;

    matches.push({
      id: `book_${bookLine.voucherId}`,
      gstin: bookLine.gstin || "N/A",
      vendorName: bookLine.vendorName,
      invoiceNumber: bookLine.invoiceNumber || "Vouch#" + bookLine.voucherId.slice(-4),
      invoiceDate: bookLine.invoiceDate.toISOString().split("T")[0],
      taxableValue: bookLine.taxableValue,
      cgst: 0,
      sgst: 0,
      igst: 0,

      booksInvoiceNo: bookLine.invoiceNumber,
      booksDate: bookLine.invoiceDate.toISOString().split("T")[0],
      booksTaxable: bookLine.taxableValue,
      booksCgst: bookLine.cgst,
      booksSgst: bookLine.sgst,
      booksIgst: bookLine.igst,

      score: 0,
      matchType: "MISSING_IN_2B",
      message: "🚨 Blocked Credit Warning: Purchase recorded but vendor has not declared this invoice in their GSTR-1 yet."
    });
  }

  // 4. Cache state in database
  await prisma.reconciliationState.upsert({
    where: {
      id: `${clientId}_gst2b_${period}`
    },
    update: {
      mismatchAmount: stats.mismatchedAmount + stats.missingAmount,
      lastRun: new Date(),
      metadata: {
        summary: stats,
        totalItems: matches.length
      }
    },
    create: {
      id: `${clientId}_gst2b_${period}`,
      clientId,
      type: "GST_2B",
      statementPeriod: period,
      mismatchAmount: stats.mismatchedAmount + stats.missingAmount,
      metadata: {
        summary: stats,
        totalItems: matches.length
      }
    }
  });

  return { matches, summary: stats };
}
