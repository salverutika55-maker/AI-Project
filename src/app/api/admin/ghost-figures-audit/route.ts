import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildBalanceSheetTrace } from "@/lib/services/balance-sheet-trace";
import { decrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

function decryptValue(amountStr: string) {
  try {
    return parseFloat(decrypt(amountStr));
  } catch (e) {
    return parseFloat(amountStr) || 0;
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId") || "cmprtm96f0001ju049crqkyre";
    const year = parseInt(searchParams.get("year") || "2026", 10);

    // 1. Fetch Client info
    const client = await prisma.client.findUnique({
      where: { id: clientId }
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // 2. Fetch all mappings, custom subheads, and ledgers
    const mappings = await prisma.unifiedLedgerMapping.findMany({
      where: { clientId }
    });

    const subheads = await prisma.customSubHead.findMany({
      where: { clientId }
    });

    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId }
    });

    const latestSync = await prisma.syncTask.findFirst({
      where: { clientId },
      orderBy: { createdAt: "desc" }
    });

    const pnlValues = await prisma.pNLValue.findMany({
      where: { clientId, year: { in: [year, year + 1] } }
    });

    // 3. Run Balance Sheet Trace
    const bsTrace = await buildBalanceSheetTrace(clientId, year);

    // 4. Fetch all vouchers for FY P&L recalculation audit
    const startFY = new Date(`${year}-04-01T00:00:00.000Z`);
    const endFY = new Date(`${year + 1}-03-31T23:59:59.999Z`);
    const vouchers = await prisma.normalizedVoucher.findMany({
      where: {
        clientId,
        date: { gte: startFY, lte: endFY }
      },
      include: { lines: { include: { ledger: true } } }
    });

    // Compute P&L ledger monthly movements
    const MONTHS = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    const MONTH_SHORT_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const pnlLedgerMonthlyBalances: Record<string, Record<string, number>> = {}; // { ledgerId: { month: net } }

    for (const v of vouchers) {
      const mShort = MONTH_SHORT_NAMES[v.date.getUTCMonth()];
      for (const line of v.lines) {
        if (!line.ledgerId) continue;
        if (!pnlLedgerMonthlyBalances[line.ledgerId]) {
          pnlLedgerMonthlyBalances[line.ledgerId] = {};
        }
        const amt = line.entryType === "DEBIT" ? -line.amount : line.amount;
        pnlLedgerMonthlyBalances[line.ledgerId][mShort] = (pnlLedgerMonthlyBalances[line.ledgerId][mShort] || 0) + amt;
      }
    }

    const report: any[] = [];

    // Audit PNL Statement
    const pnlSubheads = subheads.filter(s => s.statementType === "PNL");
    for (const sh of pnlSubheads) {
      const shMappings = mappings.filter(m => m.statementType === "PNL" && m.subHeadName.toLowerCase() === sh.name.toLowerCase());
      
      for (const month of MONTHS) {
        if (month === "Opening") continue; // PNL has no opening
        const syncYear = ["Jan", "Feb", "Mar"].includes(month) ? year + 1 : year;
        
        // Stored P&L value
        const storedPnlVal = pnlValues.find(v => v.headName.toLowerCase() === sh.name.toLowerCase() && v.month === month && v.year === syncYear);
        const appAmount = storedPnlVal ? decryptValue(storedPnlVal.amount) : 0;

        // Calculate mapped ledger contribution
        let ledgerSum = 0;
        const contributingLedgerDetails: any[] = [];

        for (const m of shMappings) {
          const ledger = ledgers.find(l => l.name.trim().toLowerCase() === m.softwareLedgerName.trim().toLowerCase());
          if (ledger) {
            const net = pnlLedgerMonthlyBalances[ledger.id]?.[month] || 0;
            const contribution = Math.abs(net);
            ledgerSum += contribution;
            contributingLedgerDetails.push({
              name: ledger.name,
              id: ledger.id,
              guid: ledger.sourceLedgerId || ledger.sourceGuid || "N/A",
              opening: 0,
              debit: net < 0 ? -net : 0,
              credit: net >= 0 ? net : 0,
              closing: contribution,
              isActive: ledger.isActive,
              existsInTally: ledger.sourceStatus !== "deleted"
            });
          }
        }

        const variance = appAmount - ledgerSum;
        const hasMismatch = Math.abs(variance) > 0.01;

        if (hasMismatch || appAmount > 0 || ledgerSum > 0) {
          let status = "OK";
          let suspectedCause = "N/A";

          if (hasMismatch) {
            if (ledgerSum === 0 && appAmount > 0) {
              status = "GHOST_FIGURE";
              suspectedCause = "Legacy fuzzy matching or stale PNLValue from historical mapping remnants.";
            } else {
              status = "SUMMARY_DRILLDOWN_MISMATCH";
              suspectedCause = "The P&L statement value diverges from exact ledger transaction aggregates.";
            }
          }

          report.push({
            company: client.name,
            financialYear: `${year}-${String(year + 1).substring(2)}`,
            month,
            statementType: "PNL",
            group: sh.headName,
            subhead: sh.name,
            ledgersCount: shMappings.length,
            contributingLedgers: contributingLedgerDetails,
            tallyOpening: 0,
            tallyClosing: ledgerSum,
            appOpening: 0,
            appClosing: appAmount,
            statementContribution: appAmount,
            variance,
            latestSyncRunId: latestSync?.id || "N/A",
            suspectedCause,
            status
          });
        }
      }
    }

    // Audit Balance Sheet Statement
    for (const trace of bsTrace.ledgerTraces) {
      const mapping = mappings.find(m => m.softwareLedgerName.trim().toLowerCase() === trace.ledgerName.trim().toLowerCase());
      const isMapped = !!mapping;
      const ledger = ledgers.find(l => l.id === trace.ledgerId);
      
      for (const month of MONTHS) {
        const monthTrace = trace.monthTraces[month] || { opening: 0, debit: 0, credit: 0, closing: 0 };
        
        // Tally values for this period
        const dbClosing = ledger?.closingBalance || 0;
        const existsInTally = ledger ? ledger.sourceStatus !== "deleted" : false;
        
        const appAmount = monthTrace.closing;
        const variance = appAmount - (existsInTally ? dbClosing : 0);

        let status = "OK";
        let suspectedCause = "N/A";

        if (existsInTally && ledger?.openingBalance === 0 && ledger?.closingBalance === 0 && appAmount !== 0) {
          status = "GHOST_FIGURE";
          suspectedCause = "Tally ledger is zero but app shows non-zero calculated balance.";
        } else if (!existsInTally && appAmount !== 0) {
          status = "DELETED_LEDGER_CONTRIBUTION";
          suspectedCause = "Ledger deleted in current Tally sync but continues contributing in app.";
        }

        if (status !== "OK" || Math.abs(variance) > 1) {
          report.push({
            company: client.name,
            financialYear: `${year}-${String(year + 1).substring(2)}`,
            month,
            statementType: "BS",
            group: mapping?.groupName || "Unmapped",
            subhead: mapping?.subHeadName || "Unmapped",
            ledgerName: trace.ledgerName,
            ledgerId: trace.ledgerId,
            ledgerGuid: ledger?.sourceLedgerId || ledger?.sourceGuid || "N/A",
            mapped: isMapped,
            existsInTally,
            tallyOpening: ledger?.openingBalance || 0,
            tallyClosing: dbClosing,
            appOpening: monthTrace.opening,
            appClosing: appAmount,
            statementContribution: appAmount,
            variance,
            latestSyncRunId: latestSync?.id || "N/A",
            suspectedCause,
            status
          });
        }
      }
    }

    return NextResponse.json({
      clientId,
      year,
      scannedAt: new Date().toISOString(),
      reportCount: report.length,
      auditReport: report
    });
  } catch (err: any) {
    console.error("[GHOST-FIGURES-AUDIT] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
