import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

    if (vouchers.length === 0) {
      return NextResponse.json({ message: "No vouchers to process" }, { status: 400 });
    }

    console.log(`[INGEST-VOUCHERS] Received ${vouchers.length} vouchers for client ${client.name}`);

    // Upsert ledgers to NormalizedLedger and keep an ID map
    const ledgerMap = new Map();
    const uniqueLedgerNames = new Set<string>();
    
    for (const v of vouchers) {
      for (const line of v.lines) {
        if (line.ledgerName) uniqueLedgerNames.add(line.ledgerName);
      }
    }

    for (const ledgerName of uniqueLedgerNames) {
      const normalizedLedger = await prisma.normalizedLedger.upsert({
        where: {
          clientId_name: {
            clientId: client.id,
            name: ledgerName
          }
        },
        update: {}, // Don't overwrite group name if it was manually set
        create: {
          clientId: client.id,
          name: ledgerName,
          groupName: "Uncategorized",
          nature: "DEBIT" // Default fallback
        }
      });
      ledgerMap.set(ledgerName.toLowerCase(), normalizedLedger.id);
    }

    let processedCount = 0;

    // We should process them sequentially to avoid locking issues, or batch them
    for (const v of vouchers) {
      // Upsert the Voucher using a composite of client + voucherNumber + date to uniquely identify it
      // For simplicity, we'll use an internal GUID or fallback
      const referenceNo = v.guid || v.voucherNumber || `VCH-${v.date}-${processedCount}`;
      
      const existingVoucher = await prisma.normalizedVoucher.findFirst({
        where: {
          clientId: client.id,
          referenceNo: referenceNo
        }
      });

      let voucherId = existingVoucher?.id;

      if (!existingVoucher) {
        const newVch = await prisma.normalizedVoucher.create({
          data: {
            clientId: client.id,
            voucherNumber: v.voucherNumber || "N/A",
            referenceNo: referenceNo,
            date: new Date(v.date),
            type: v.voucherType || "JOURNAL",
            narration: v.narration || null,
            totalAmount: v.totalAmount || 0,
            isManual: false
          }
        });
        voucherId = newVch.id;
      } else {
        // Clear old lines if we are replacing
        await prisma.normalizedVoucherLine.deleteMany({
          where: { voucherId: existingVoucher.id }
        });
      }

      // Create lines
      const linePayloads = v.lines.map((line: any) => {
        const ledId = ledgerMap.get((line.ledgerName || "").toLowerCase());
        return {
          voucherId: voucherId as string,
          ledgerId: ledId,
          amount: Math.abs(line.amount),
          entryType: line.isDebit ? "DEBIT" : "CREDIT"
        };
      }).filter((l: any) => l.ledgerId); // skip if ledger not found

      if (linePayloads.length > 0) {
        await prisma.normalizedVoucherLine.createMany({
          data: linePayloads
        });
      }

    // --- PNLValue Aggregation from Vouchers ---
    if (client.pnlMappings && client.pnlMappings.length > 0) {
      const monthBalances: Record<string, Record<string, number>> = {}; // { '2026-Apr': { 'Sales': 1000 } }

      // 1. Group vouchers by period
      for (const v of vouchers) {
        const d = new Date(v.date);
        const mShort = d.toLocaleString('default', { month: 'short' });
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
          
          // Debits are technically expenses/assets (positive for PNL expenses), Credits are revenue (positive for PNL revenue)
          // We will sum the absolute transaction volume for P&L based on the entry type.
          // Wait, PNLValue expects a positive absolute number for the movement.
          const amt = Math.abs(line.amount);
          
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
            } else {
              const fuzzyMatchKey = Object.keys(accounts).find(k => k.includes(alias));
              if (fuzzyMatchKey) balance += accounts[fuzzyMatchKey];
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
          amount: encrypt(balance.toString())
        }));

        if (finalEntries.length > 0) {
          await prisma.pNLValue.deleteMany({
            where: { clientId: client.id, month: mShort, year: syncYearToSave }
          });
          await prisma.pNLValue.createMany({ data: finalEntries });
        }
      }
    }

    // Resolve any pending sync tasks
    await prisma.syncTask.updateMany({
      where: {
        clientId: client.id,
        status: { in: ["PENDING", "PROCESSING"] },
        type: "TALLY_SYNC"
      },
      data: {
        status: "COMPLETED",
        result: {
          message: "Data synced successfully via Transaction Vouchers.",
          recordsProcessed: processedCount
        }
      }
    });

    return NextResponse.json({ 
      message: `Successfully processed ${processedCount} vouchers.`,
      recordsProcessed: processedCount
    }, { status: 200 });

  } catch (error) {
    console.error("Voucher Ingestion API Error:", error);
    return NextResponse.json({ message: "Internal Error during API Ingestion" }, { status: 500 });
  }
}
