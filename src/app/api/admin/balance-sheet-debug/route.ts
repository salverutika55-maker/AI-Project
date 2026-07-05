import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildBalanceSheetTrace } from "@/lib/services/balance-sheet-trace";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId") || "cmprtm96f0001ju049crqkyre";
    const year = parseInt(searchParams.get("year") || "2025", 10);
    const targetLedgerName = searchParams.get("ledgerName");
    const targetLedgerId = searchParams.get("ledgerId");
    const targetMonth = searchParams.get("month");

    // 1. Fetch Client info
    const client = await prisma.client.findUnique({
      where: { id: clientId }
    });
    if (!client) {
      return NextResponse.json({ error: "Client not found" }, { status: 404 });
    }

    // 2. Fetch all mappings and ledgers to cross-reference
    const mappings = await prisma.unifiedLedgerMapping.findMany({
      where: { clientId }
    });

    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId, isActive: true }
    });

    // 3. Fetch latest sync task to get run details
    const latestSync = await prisma.syncTask.findFirst({
      where: { clientId },
      orderBy: { createdAt: "desc" }
    });


    // 4. Run the production Balance Sheet trace engine
    const trace = await buildBalanceSheetTrace(clientId, year);

    // 5. Construct the debug trace response
    const debugRows: any[] = [];
    const MONTHS = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

    for (const ledger of ledgers) {
      // Filter if specific ledger requested
      if (targetLedgerId && ledger.id !== targetLedgerId) continue;
      if (targetLedgerName && ledger.name.toLowerCase() !== targetLedgerName.toLowerCase()) continue;

      const mapping = mappings.find(m => m.softwareLedgerName.trim().toLowerCase() === ledger.name.trim().toLowerCase());
      const ledgerTrace = trace.ledgerTraces.find(t => t.ledgerId === ledger.id);

      const mainGroup = ledgerTrace?.mainGroup || (mapping?.groupName && [
        "capital account", "reserves & surplus", "current liabilities", "duties & taxes",
        "provisions", "sundry creditors", "loans (liability)", "bank od a/c",
        "secured loans", "unsecured loans", "suspense a/c", "equity", "owner's funds",
        "liabilities", "revenue", "income", "sales"
      ].some(cg => mapping.groupName.toLowerCase().includes(cg)) ? "Liabilities" : "Assets") || "Assets";

      for (const month of MONTHS) {
        if (targetMonth && month.toLowerCase() !== targetMonth.toLowerCase()) continue;

        let periodStart = "";
        let periodEnd = "";
        if (month !== "Opening") {
          const mIdx = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(month);
          const currentYear = mIdx < 3 ? year + 1 : year;
          const monthNum = String(mIdx + 1).padStart(2, '0');
          const lastDay = new Date(currentYear, mIdx + 1, 0).getDate();
          periodStart = `${currentYear}-${monthNum}-01`;
          periodEnd = `${currentYear}-${monthNum}-${lastDay}`;
        } else {
          periodStart = `${year}-04-01 (Opening)`;
          periodEnd = `${year}-04-01 (Opening)`;
        }

        const monthTrace = ledgerTrace?.monthTraces[month] || { opening: 0, debit: 0, credit: 0, closing: 0 };
        const calculatedClosing = monthTrace.closing;
        const apiReturnedValue = calculatedClosing;

        // Determine contribution to the Balance Sheet subhead sum:
        let statementContribution = apiReturnedValue;
        
        const rawOpeningValue = ledger.openingBalance;
        const rawOpeningNature = ledger.nature === "CREDIT" ? "Cr" : "Dr";

        let normalizedOpeningValue = 0;
        const absOp = Math.abs(rawOpeningValue);
        if (mainGroup === "Assets") {
          normalizedOpeningValue = ledger.nature === "CREDIT" ? -absOp : absOp;
        } else {
          normalizedOpeningValue = ledger.nature === "DEBIT" ? -absOp : absOp;
        }

        debugRows.push({
          companyId: client.id,
          companyName: client.name,
          ledgerId: ledger.id,
          ledgerGuid: ledger.sourceLedgerId || ledger.sourceGuid || "N/A",
          ledgerName: ledger.name,
          tallyParentGroup: ledger.groupName,
          mappedStatement: mapping?.statementType || "N/A",
          mappedGroup: mapping?.groupName || "N/A",
          mappedSubhead: mapping?.subHeadName || "N/A",

          rawOpeningValue,
          rawOpeningNature,
          normalizedOpeningValue,

          month,
          periodStart,
          periodEnd,

          rawDebitSum: monthTrace.debit,
          rawCreditSum: monthTrace.credit,

          formulaType: mainGroup === "Assets" ? "Assets (Op + Dr - Cr)" : "Liabilities (Op + Cr - Dr)",
          calculatedClosing,

          sourceClosingValue: ledger.closingBalance,
          sourceClosingNature: ledger.nature === "CREDIT" ? "Cr" : "Dr",

          syncRunId: latestSync?.id || "N/A",
          syncTimestamp: latestSync?.updatedAt || new Date(),

          apiReturnedValue,
          statementContribution,
          frontendDisplayedValue: apiReturnedValue
        });
      }
    }

    return NextResponse.json(debugRows);
  } catch (err: any) {
    console.error("[DEBUG-ROUTE] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
