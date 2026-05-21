import { prisma } from "@/lib/prisma";

export async function normalizeClientAccountingData(clientId: string): Promise<{ success: boolean; vouchersProcessed: number }> {
  try {
    // 1. Fetch raw TallyVouchers from the staging table
    const stagingVouchers = await prisma.tallyVoucher.findMany({
      where: { clientId },
      orderBy: { date: "asc" }
    });

    if (stagingVouchers.length === 0) {
      return { success: true, vouchersProcessed: 0 };
    }

    // 2. Identify and create all unique ledgers in the NormalizedLedger table
    const uniqueLedgerNames = Array.from(new Set(stagingVouchers.map(v => v.ledgerName)));
    
    const ledgersMap: Record<string, string> = {}; // ledgerName -> NormalizedLedger.id

    for (const name of uniqueLedgerNames) {
      let groupName = "Indirect Expenses"; // Default fallback
      const lower = name.toLowerCase();

      // Heuristics to automatically classify ledger groups based on names
      if (lower.includes("bank") || lower.includes("hdfc") || lower.includes("icici") || lower.includes("sbi") || lower.includes("cash")) {
        groupName = "Bank & Cash Accounts";
      } else if (lower.includes("tds") || lower.includes("gst") || lower.includes("vat") || lower.includes("tax") || lower.includes("duties")) {
        groupName = "Duties & Taxes";
      } else if (lower.includes("salary") || lower.includes("payroll") || lower.includes("bonus") || lower.includes("wages")) {
        groupName = "Payroll Expenses";
      } else if (lower.includes("provision") || lower.includes("accrued") || lower.includes("payable")) {
        groupName = "Provisions & Payables";
      } else if (lower.includes("prepaid") || lower.includes("advance") || lower.includes("insurance")) {
        groupName = "Prepaid & Advances";
      } else if (lower.includes("asset") || lower.includes("computer") || lower.includes("furniture") || lower.includes("machinery") || lower.includes("office automation")) {
        groupName = "Fixed Assets";
      } else if (lower.includes("sales") || lower.includes("revenue") || lower.includes("income")) {
        groupName = "Sales Accounts";
      } else if (lower.includes("purchase") || lower.includes("cogs")) {
        groupName = "Purchase Accounts";
      }

      // Upsert the normalized ledger
      const normalizedLedger = await prisma.normalizedLedger.upsert({
        where: {
          clientId_name: { clientId, name }
        },
        update: { groupName },
        create: {
          clientId,
          name,
          groupName,
          nature: lower.includes("bank") || lower.includes("asset") || lower.includes("expense") || lower.includes("prepaid") || lower.includes("purchase") ? "DEBIT" : "CREDIT",
          openingBalance: 0,
          closingBalance: 0
        }
      });
      ledgersMap[name] = normalizedLedger.id;
    }

    // 3. Group staging vouchers by transaction (tallyGuid) to represent individual transactions
    const txMap: Record<string, typeof stagingVouchers> = {};
    stagingVouchers.forEach(v => {
      if (!txMap[v.tallyGuid]) txMap[v.tallyGuid] = [];
      txMap[v.tallyGuid].push(v);
    });

    let vouchersCount = 0;

    // 4. Process each transaction chunk into a NormalizedVoucher + NormalizedVoucherLines
    for (const [guid, lines] of Object.entries(txMap)) {
      const sample = lines[0];

      // Convert Tally's voucher type to our standard ones
      let standardType = "JOURNAL";
      const rawType = sample.voucherType.toLowerCase();
      if (rawType.includes("payment")) standardType = "PAYMENT";
      else if (rawType.includes("receipt")) standardType = "RECEIPT";
      else if (rawType.includes("contra")) standardType = "CONTRA";
      else if (rawType.includes("purchase")) standardType = "PURCHASE";
      else if (rawType.includes("sales")) standardType = "SALES";

      // Sum of debits to determine total voucher value
      const totalDebitAmount = lines
        .filter(l => l.isDebit)
        .reduce((sum, l) => sum + l.amount, 0);

      // Create or update the NormalizedVoucher
      const voucher = await prisma.normalizedVoucher.upsert({
        where: { id: guid }, // Use tallyGuid as stable primary key
        update: {
          date: sample.date,
          type: standardType,
          totalAmount: totalDebitAmount
        },
        create: {
          id: guid,
          clientId,
          voucherNumber: guid.substring(0, 8).toUpperCase(),
          date: sample.date,
          type: standardType,
          totalAmount: totalDebitAmount,
          isManual: false
        }
      });

      // Clear existing lines for this voucher to prevent duplicates during re-syncs
      await prisma.normalizedVoucherLine.deleteMany({
        where: { voucherId: voucher.id }
      });

      // Insert new normalized double-entry lines
      const lineData = lines.map(line => ({
        voucherId: voucher.id,
        ledgerId: ledgersMap[line.ledgerName],
        amount: line.isDebit ? line.amount : -line.amount,
        entryType: line.isDebit ? "DEBIT" : "CREDIT"
      }));

      await prisma.normalizedVoucherLine.createMany({
        data: lineData
      });

      vouchersCount++;
    }

    return { success: true, vouchersProcessed: vouchersCount };
  } catch (error) {
    console.error("Double-Entry Normalization Service Error:", error);
    throw error;
  }
}

/**
 * Normalizes manual Excel Trial Balance uploads
 */
export async function normalizeTrialBalanceUpload(clientId: string, rawRecords: any[]): Promise<{ success: boolean; ledgersProcessed: number }> {
  try {
    let ledgersCount = 0;
    
    for (const record of rawRecords) {
      let groupName = record.groupName || "Indirect Expenses";
      const lower = record.ledgerName.toLowerCase();
      
      const normalizedLedger = await prisma.normalizedLedger.upsert({
        where: {
          clientId_name: { clientId, name: record.ledgerName }
        },
        update: {
          groupName,
          openingBalance: record.openingBalance || 0,
          closingBalance: record.closingBalance || 0
        },
        create: {
          clientId,
          name: record.ledgerName,
          groupName,
          nature: lower.includes("bank") || lower.includes("asset") || lower.includes("expense") || lower.includes("prepaid") || lower.includes("purchase") ? "DEBIT" : "CREDIT",
          openingBalance: record.openingBalance || 0,
          closingBalance: record.closingBalance || 0
        }
      });
      ledgersCount++;
    }

    return { success: true, ledgersProcessed: ledgersCount };
  } catch (error) {
    console.error("Trial Balance Ingestion Normalization Error:", error);
    throw error;
  }
}
