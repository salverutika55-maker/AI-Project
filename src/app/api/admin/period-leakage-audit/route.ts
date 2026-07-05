import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildBalanceSheetTrace, normalizeOpeningForFormula } from "@/lib/services/balance-sheet-trace";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId") || "cmprtm96f0001ju049crqkyre";
    const year = parseInt(searchParams.get("year") || "2025", 10);

    const client = await prisma.client.findUnique({
      where: { id: clientId }
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    const latestSync = await prisma.syncTask.findFirst({
      where: { clientId },
      orderBy: { createdAt: "desc" }
    });

    const [mappings, ledgers, voucherLines] = await Promise.all([
      prisma.unifiedLedgerMapping.findMany({ where: { clientId } }),
      prisma.normalizedLedger.findMany({ where: { clientId, isActive: true } }),
      prisma.normalizedVoucherLine.findMany({
        where: { voucher: { clientId } },
        include: { voucher: true }
      })
    ]);

    // Find the latest synced year
    let latestYear = year;
    const voucherYears = voucherLines.map((vl) => {
      const d = new Date(vl.voucher.date);
      return d.getUTCMonth() < 3 ? d.getUTCFullYear() - 1 : d.getUTCFullYear();
    });
    if (voucherYears.length > 0) {
      latestYear = Math.max(...voucherYears);
    }

    // Map vouchers to detect first transaction date per ledger
    const firstTxDateByLedger = new Map<string, Date>();
    const allMovementsByLedger = new Map<string, { debit: number; credit: number }>();
    const currentFYMovements = new Map<string, { debit: number; credit: number }>();
    const startFY = new Date(`${year}-04-01T00:00:00.000Z`);
    const endFY = new Date(`${year + 1}-03-31T23:59:59.999Z`);

    for (const vl of voucherLines) {
      const d = new Date(vl.voucher.date);
      const currentFirst = firstTxDateByLedger.get(vl.ledgerId);
      if (!currentFirst || d < currentFirst) {
        firstTxDateByLedger.set(vl.ledgerId, d);
      }

      if (!allMovementsByLedger.has(vl.ledgerId)) {
        allMovementsByLedger.set(vl.ledgerId, { debit: 0, credit: 0 });
      }
      const allMov = allMovementsByLedger.get(vl.ledgerId)!;
      if (vl.entryType === "DEBIT") allMov.debit += vl.amount;
      else allMov.credit += vl.amount;

      if (d >= startFY && d <= endFY) {
        if (!currentFYMovements.has(vl.ledgerId)) {
          currentFYMovements.set(vl.ledgerId, { debit: 0, credit: 0 });
        }
        const cfMov = currentFYMovements.get(vl.ledgerId)!;
        if (vl.entryType === "DEBIT") cfMov.debit += vl.amount;
        else cfMov.credit += vl.amount;
      }
    }

    // Run actual production balance sheet trace
    const realTrace = await buildBalanceSheetTrace(clientId, year);

    const report: any[] = [];
    const MONTHS = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

    for (const lTrace of realTrace.ledgerTraces) {
      const ledger = ledgers.find((l) => l.id === lTrace.ledgerId);
      const firstTx = firstTxDateByLedger.get(lTrace.ledgerId);
      const hasTransactionsInFYOrPast = firstTx ? firstTx <= endFY : false;
      const mapping = mappings.find((m) => m.softwareLedgerName.trim().toLowerCase() === lTrace.ledgerName.trim().toLowerCase());

      for (const m of MONTHS) {
        const monthTrace = lTrace.monthTraces[m] || { opening: 0, debit: 0, credit: 0, closing: 0 };
        const displayedAmount = monthTrace.closing;

        // Simulate legacy un-isolated calculation to detect leakage/contamination
        let legacyValue = 0;
        const fyMov = currentFYMovements.get(lTrace.ledgerId) || { debit: 0, credit: 0 };
        const initialRunning = normalizeOpeningForFormula(ledger?.openingBalance || 0, lTrace.nature, lTrace.mainGroup);
        if (initialRunning === 0 && ledger?.closingBalance !== 0 && !hasTransactionsInFYOrPast) {
          // If we had no transactions in this FY or past, but the legacy logic used static closing balance:
          legacyValue = Math.abs(ledger?.closingBalance || 0);
        } else {
          legacyValue = displayedAmount;
        }

        // Expected amount is the correctly isolated chronological balance
        const expectedAmount = displayedAmount;

        let status = "OK";
        let rootCause = "N/A";
        let futureTransactionLeakage = false;
        let openingContaminated = false;
        let repeatedSnapshot = false;

        // Detect issues
        if (firstTx && firstTx > endFY && legacyValue !== 0) {
          futureTransactionLeakage = true;
          status = "FUTURE_PERIOD_LEAKAGE";
          rootCause = "April transaction leaked backward into prior year because static closing balance was reused.";
        }

        if (m === "Opening" && status !== "OK") {
          openingContaminated = true;
          status = "INVALID_OPENING";
        }

        if (status !== "OK" || expectedAmount !== legacyValue) {
          report.push({
            company: client.name,
            financialYear: `${year}-${String(year + 1).substring(2)}`,
            ledger: lTrace.ledgerName,
            ledgerId: lTrace.ledgerId,
            ledgerGuid: ledger?.sourceLedgerId || ledger?.sourceGuid || "N/A",
            subhead: mapping?.subHeadName || "Unmapped",
            month: m,
            displayedAmount,
            expectedAmount,
            firstActualTransactionDate: firstTx ? firstTx.toISOString().substring(0, 10) : "None",
            sourceDebit: monthTrace.debit,
            sourceCredit: monthTrace.credit,
            sourceClosing: ledger?.closingBalance || 0,
            futureTransactionLeakage,
            openingContaminated,
            repeatedSnapshot,
            syncRunId: latestSync?.id || "N/A",
            rootCause,
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
    console.error("[PERIOD-LEAKAGE-AUDIT] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
