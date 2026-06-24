import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizeClientAction } from "@/lib/rbac";
import { buildBalanceSheetTrace } from "@/lib/services/balance-sheet-trace";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const selectedYear = parseInt(searchParams.get("year") || new Date().getFullYear().toString(), 10);
  const debugTrace = ["1", "true", "yes"].includes((searchParams.get("trace") || "").toLowerCase());

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    const trace = await buildBalanceSheetTrace(id, selectedYear);
    const diff = Math.abs(trace.totalsByMainGroup.Assets - trace.totalsByMainGroup.Liabilities);

    const mappedSet = new Set(trace.mappings.map((m) => m.softwareLedgerName.trim().toLowerCase()));
    const includedSet = new Set(trace.ledgerTraces.map((l) => l.ledgerName.trim().toLowerCase()));

    const unmappedLedgers = trace.ledgers
      .filter((l) => !mappedSet.has(l.name.trim().toLowerCase()))
      .map((l) => ({
        id: l.id,
        name: l.name,
        groupName: l.groupName,
        openingBalance: l.openingBalance,
        closingBalance: l.closingBalance,
        nature: l.nature,
      }));

    const responsePayload: Record<string, unknown> = {
      structure: trace.structure,
      dataNodes: trace.dataNodes,
      validation: {
        isBalanced: diff < 1,
        difference: diff,
      },
      audit: {
        totalMappings: trace.mappings.length,
        totalActiveLedgers: trace.ledgers.length,
        totalIncludedLedgers: trace.ledgerTraces.length,
        unmappedActiveLedgers: unmappedLedgers.length,
        missingMappedLedgers: trace.missingMappedLedgerNames,
        includedMappedLedgers: Array.from(includedSet),
        unmappedLedgers,
      },
      traceMode: {
        formula: "opening + debit - credit",
        months: ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"],
      },
    };

    if (debugTrace) {
      const keySubheads = [
        "capital account",
        "reserves & surplus",
        "trade receivable",
        "trade receivables",
        "trade payable",
        "trade payables",
        "bank accounts",
        "loans & advances",
      ];

      const mappingVerification = trace.subheadDiagnostics
        .filter((row) => keySubheads.some((key) => row.subHeadName.toLowerCase().includes(key)))
        .map((row) => ({
          mainGroup: row.mainGroup,
          groupName: row.groupName,
          subHeadName: row.subHeadName,
          mappedLedgerCount: row.mappedLedgersCount,
          mappedLedgerNames: trace.ledgerTraces
            .filter(
              (ledger) =>
                ledger.mainGroup === row.mainGroup &&
                ledger.groupName === row.groupName &&
                ledger.subHeadName === row.subHeadName
            )
            .map((ledger) => ledger.ledgerName),
          failureType:
            row.mappedLedgersCount === 0
              ? "mapping_failure"
              : row.calculatedTotal === 0 && row.displayedTotal === 0
              ? "calculation_failure"
              : "ok",
        }));

      const ledgerFlow = trace.ledgerTraces.map((ledger) => ({
        ledgerName: ledger.ledgerName,
        mainGroup: ledger.mainGroup,
        groupName: ledger.groupName,
        subHeadName: ledger.subHeadName,
        openingSource: ledger.openingSource,
        openingBalance: ledger.monthTraces.Opening?.closing || 0,
        marchOpening: ledger.monthTraces.Opening?.closing || 0,
        marchDebit: ledger.monthTraces.Mar?.debit || 0,
        marchCredit: ledger.monthTraces.Mar?.credit || 0,
        marchClosing: ledger.monthTraces.Mar?.closing || 0,
        aprilDebit: ledger.monthTraces.Apr?.debit || 0,
        aprilCredit: ledger.monthTraces.Apr?.credit || 0,
        aprilClosing: ledger.monthTraces.Apr?.closing || 0,
        mayDebit: ledger.monthTraces.May?.debit || 0,
        mayCredit: ledger.monthTraces.May?.credit || 0,
        mayClosing: ledger.monthTraces.May?.closing || 0,
      }));

      const subheadAuditReport = trace.subheadDiagnostics.map((row) => ({
        mainGroup: row.mainGroup,
        groupName: row.groupName,
        subHeadName: row.subHeadName,
        mappedLedgers: row.mappedLedgersCount,
        expectedBalance: row.calculatedTotal,
        displayedBalance: row.displayedTotal,
        variance: row.variance,
      }));

      responsePayload.auditReport = {
        mappingVerification,
        ledgerFlow,
        subheadAuditReport,
        subheadMonthAudit: trace.subheadMonthAudit,
        openingSourceSummary: trace.openingSourceSummary,
        rootCauseIndicators: {
          mappedButZeroOpeningCount: trace.subheadMonthAudit.filter(
            (row) =>
              row.period === "Opening" &&
              row.expectedTotal === 0 &&
              trace.subheadDiagnostics.some(
                (diag) =>
                  diag.mainGroup === row.mainGroup &&
                  diag.groupName === row.groupName &&
                  diag.subHeadName === row.subHeadName &&
                  diag.mappedLedgersCount > 0
              )
          ).length,
          missingMappedLedgerNames: trace.missingMappedLedgerNames,
        },
      };
    }

    return NextResponse.json(responsePayload);
  } catch (error: any) {
    console.error("Balance Sheet Fetch Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
