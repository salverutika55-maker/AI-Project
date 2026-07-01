import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: "Missing or invalid Authorization header" }, { status: 401 });
    }

    const apiKey = authHeader.split('Bearer ')[1].trim();
    const client = await prisma.client.findUnique({
      where: { id: apiKey },
      include: { pnlMappings: true }
    });

    if (!client) {
      return NextResponse.json({ message: "Invalid API Key" }, { status: 401 });
    }

    const body = await req.json();
    const vouchers = body.vouchers || [];
    const syncTaskId = body.syncTaskId;
    const forceFull = body.forceFull === true;

    if (vouchers.length === 0) {
      return NextResponse.json({ message: "No vouchers to process" }, { status: 400 });
    }

    // Force Full Sync: Purge existing records once per sync task session
    if (syncTaskId) {
      const task = await prisma.syncTask.findUnique({
        where: { id: syncTaskId }
      });
      if (task && task.status === "PENDING") {
        let purgedCount = 0;
        await prisma.syncTask.update({
          where: { id: syncTaskId },
          data: { status: "PROCESSING" }
        });

        if (forceFull) {
          console.log(`[INGEST-VOUCHERS] Force Full Sync: Purging data for client ${client.name}`);
          
          const deleteVouchers = await prisma.normalizedVoucher.deleteMany({
            where: { clientId: client.id }
          });
          purgedCount = deleteVouchers.count;

          await prisma.pNLValue.deleteMany({
            where: { clientId: client.id }
          });
          await prisma.financialRecord.deleteMany({
            where: { clientId: client.id }
          });
          await prisma.normalizedLedger.updateMany({
            where: { clientId: client.id },
            data: { closingBalance: 0 }
          });
        }

        // Save initial status and purged count
        await prisma.syncTask.update({
          where: { id: syncTaskId },
          data: {
            payload: { forceFull, purgedCount }
          }
        });
      }
    }

    console.log(`[INGEST-VOUCHERS] Received ${vouchers.length} vouchers for client ${client.name}`);

    // Fetch all existing ledgers for this client to map them case-insensitively
    const existingLedgers = await prisma.normalizedLedger.findMany({
      where: { clientId: client.id }
    });

    const ledgerMap = new Map();
    for (const l of existingLedgers) {
      ledgerMap.set(l.name.toLowerCase(), l.id);
    }

    const uniqueLedgerNames = new Map<string, string>(); // lowercase -> original case
    for (const v of vouchers) {
      for (const line of v.lines) {
        if (line.ledgerName) {
           const original = line.ledgerName.trim();
           const lower = original.toLowerCase();
           if (!ledgerMap.has(lower) && !uniqueLedgerNames.has(lower)) {
             uniqueLedgerNames.set(lower, original);
           }
        }
      }
    }

    const ledgersToCreate = Array.from(uniqueLedgerNames.values()).map(name => {
      const id = crypto.randomUUID();
      ledgerMap.set(name.toLowerCase(), id); // Temporary ID mapping
      return {
        id,
        clientId: client.id,
        name,
        groupName: "Uncategorized",
        nature: "DEBIT"
      };
    });

    if (ledgersToCreate.length > 0) {
      await prisma.normalizedLedger.createMany({
        data: ledgersToCreate,
        skipDuplicates: true
      });

      // Re-fetch all ledgers for this client to ensure ledgerMap has the actual database IDs (handling any skipped/concurrently-created rows)
      const finalLedgers = await prisma.normalizedLedger.findMany({
        where: { clientId: client.id }
      });
      for (const l of finalLedgers) {
        ledgerMap.set(l.name.toLowerCase(), l.id);
      }
    }

    let processedCount = 0;

    // Batch process Vouchers
    const referenceNos = vouchers.map((v: any, idx: number) => v.guid || v.voucherNumber || `VCH-${v.date}-${idx}`);
    
    const existingVouchersList = await prisma.normalizedVoucher.findMany({
      where: { clientId: client.id, referenceNo: { in: referenceNos } }
    });
    
    const existingMap = new Map(existingVouchersList.map(v => [v.referenceNo, v.id]));
    
    const vouchersToCreate = [];
    const linesToCreate = [];
    const vouchersToDeleteLines = [];
    const seenRefsThisBatch = new Set();

    for (const v of vouchers) {
      const referenceNo = v.guid || v.voucherNumber || `VCH-${v.date}-${processedCount}`;
      
      // Prevent duplicates within the same batch payload
      if (seenRefsThisBatch.has(referenceNo)) {
         processedCount++;
         continue;
      }
      seenRefsThisBatch.add(referenceNo);

      const existingId = existingMap.get(referenceNo);

      let voucherId = existingId;

      if (!existingId) {
        voucherId = crypto.randomUUID();
        vouchersToCreate.push({
          id: voucherId,
          clientId: client.id,
          voucherNumber: v.voucherNumber || "N/A",
          referenceNo: referenceNo,
          date: new Date(v.date),
          type: v.voucherType || "JOURNAL",
          narration: v.narration || null,
          totalAmount: v.totalAmount || 0,
          isManual: false
        });
      } else {
        vouchersToDeleteLines.push(existingId);
      }

      const linePayloads = v.lines.map((line: any) => {
        const ledId = ledgerMap.get((line.ledgerName || "").toLowerCase());
        return {
          voucherId: voucherId as string,
          ledgerId: ledId,
          amount: Math.abs(line.amount),
          entryType: line.isDebit ? "DEBIT" : "CREDIT"
        };
      }).filter((l: any) => l.ledgerId);

      linesToCreate.push(...linePayloads);
      processedCount++;
    }

    if (vouchersToDeleteLines.length > 0) {
      await prisma.normalizedVoucherLine.deleteMany({
        where: { voucherId: { in: vouchersToDeleteLines } }
      });
    }

    if (vouchersToCreate.length > 0) {
      await prisma.normalizedVoucher.createMany({
        data: vouchersToCreate
      });
    }

    if (linesToCreate.length > 0) {
      await prisma.normalizedVoucherLine.createMany({
        data: linesToCreate
      });
    }

    // --- PNLValue Aggregation from Vouchers ---
    if (client.pnlMappings && client.pnlMappings.length > 0) {
      const monthBalances: Record<string, Record<string, number>> = {}; // { '2026-Apr': { 'Sales': 1000 } }

      // 1. Group vouchers by period
      for (const v of vouchers) {
        const d = new Date(v.date);
        const mShort = d.toLocaleString('en-US', { month: 'short' });
        const year = d.getFullYear();
        // Adjust for fiscal year (assuming April start)
        const syncYearToSave = d.getMonth() < 3 ? year - 1 : year;
        const periodKey = `${syncYearToSave}-${mShort}`;

        if (!monthBalances[periodKey]) {
          monthBalances[periodKey] = {};
        }

        // 2. Aggregate line amounts per ledger
        for (const line of v.lines) {
          if (!line.ledgerName) continue;
          const ledgerNameLower = line.ledgerName.trim().toLowerCase();
          
          // Debits are negative, Credits are positive. Summing them yields the Net Movement.
          const amt = line.isDebit ? -line.amount : line.amount;
          
          monthBalances[periodKey][ledgerNameLower] = (monthBalances[periodKey][ledgerNameLower] || 0) + amt;
        }
      }

      // 3. Map to Sector Heads
      for (const [periodKey, accounts] of Object.entries(monthBalances)) {
        const [yearStr, mShort] = periodKey.split('-');
        const syncYearToSave = parseInt(yearStr);
        const headBalances: Record<string, number> = {};

        for (const m of client.pnlMappings) {
          const aliases = (m.softwareLedgerName || "").split(",").map(a => a.trim().toLowerCase()).filter(Boolean);
          let balance = 0;
          
          for (const alias of aliases) {
            const exactMatchKey = Object.keys(accounts).find(k => k === alias);
            if (exactMatchKey) {
              balance += accounts[exactMatchKey];
            }
          }

          if (balance !== 0) {
            headBalances[m.sectorHead] = (headBalances[m.sectorHead] || 0) + balance;
          }
        }

        const finalEntries = Object.entries(headBalances).map(([headName, balance]) => ({
          clientId: client.id,
          headName,
          month: mShort,
          year: syncYearToSave,
          amount: encrypt(Math.abs(balance).toString())
        }));

        if (finalEntries.length > 0) {
          await prisma.pNLValue.deleteMany({
            where: { clientId: client.id, month: mShort, year: syncYearToSave }
          });
          await prisma.pNLValue.createMany({ data: finalEntries });
        }
      }
    }

    if (syncTaskId) {
      const task = await prisma.syncTask.findUnique({ where: { id: syncTaskId } });
      if (task) {
        const currentResult = (task.result || {}) as any;
        currentResult.vouchersProcessed = (currentResult.vouchersProcessed || 0) + processedCount;
        currentResult.vouchersCreated = (currentResult.vouchersCreated || 0) + vouchersToCreate.length;
        currentResult.vouchersUpdated = (currentResult.vouchersUpdated || 0) + vouchersToDeleteLines.length;

        await prisma.syncTask.update({
          where: { id: syncTaskId },
          data: { result: currentResult }
        });
      }
    }

    return NextResponse.json({ 
      message: `Successfully processed ${processedCount} vouchers.`,
      recordsProcessed: processedCount
    }, { status: 200 });

  } catch (error) {
    console.error("Voucher Ingestion API Error:", error);
    return NextResponse.json({ message: "Internal Error during API Ingestion" }, { status: 500 });
  }
}
