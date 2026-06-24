import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { buildBalanceSheetTrace } from "@/lib/services/balance-sheet-trace";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    const trace = await buildBalanceSheetTrace(id, year);
    const mappedLedgerIds = trace.mappings
      .map((m) => {
        const match = trace.ledgers.find((l) => l.name.trim().toLowerCase() === m.softwareLedgerName.trim().toLowerCase());
        return match?.id;
      })
      .filter((v): v is string => Boolean(v));

    const displayedLedgerIds = new Set(trace.ledgerTraces.map((l) => l.ledgerId));
    const missingLedgerIds = mappedLedgerIds.filter((ledgerId) => !displayedLedgerIds.has(ledgerId));
    const includedLedgerIds = mappedLedgerIds.filter((ledgerId) => displayedLedgerIds.has(ledgerId));

    const missingLedgerDetails = await prisma.normalizedLedger.findMany({
      where: { clientId: id, id: { in: missingLedgerIds } }
    });

    const subheadSummaries = trace.subheadDiagnostics.map((summary) => {
      return {
        subHeadName: summary.subHeadName,
        groupName: summary.groupName,
        mainGroup: summary.mainGroup,
        mappedLedgersCount: summary.mappedLedgersCount,
        mappedLedgerIds: trace.ledgerTraces
          .filter((l) => l.groupName === summary.groupName && l.subHeadName === summary.subHeadName && l.mainGroup === summary.mainGroup)
          .map((l) => l.ledgerId),
        missingLedgerIds: [],
        ledgerTotal: summary.calculatedTotal,
        displayedTotal: summary.displayedTotal,
        difference: summary.variance,
      };
    });

    const groupMap = new Map<string, {
      groupName: string;
      mainGroup: "Assets" | "Liabilities";
      subheads: typeof subheadSummaries;
      ledgerTotal: number;
      displayedTotal: number;
      difference: number;
    }>();

    for (const sh of subheadSummaries) {
      const key = `${sh.mainGroup}|||${sh.groupName}`;
      const group = groupMap.get(key) || {
        groupName: sh.groupName,
        mainGroup: sh.mainGroup,
        subheads: [],
        ledgerTotal: 0,
        displayedTotal: 0,
        difference: 0,
      };

      group.subheads.push(sh);
      group.ledgerTotal += sh.ledgerTotal;
      group.displayedTotal += sh.displayedTotal;
      group.difference = Math.abs(group.displayedTotal - group.ledgerTotal);
      groupMap.set(key, group);
    }

    const groupSummaries = Array.from(groupMap.values());

    const reconciled = missingLedgerIds.length === 0 && subheadSummaries.every((s) => s.difference < 1);

    return NextResponse.json({
      totalMappedLedgers: mappedLedgerIds.length,
      totalIncludedLedgers: includedLedgerIds.length,
      totalMissingLedgers: missingLedgerIds.length,
      mappedLedgerIds,
      includedLedgerIds,
      missingLedgerIds,
      subheadSummaries,
      groupSummaries,
      reconciled,
      traceMode: {
        formula: "opening + debit - credit",
        syntheticValues: false,
      },
      actualDisplayedLedgerIds: Array.from(displayedLedgerIds),
      actualIncludedLedgerCount: includedLedgerIds.length,
      actualMissingLedgerCount: missingLedgerIds.length,
      actualMissingLedgerDetails: missingLedgerDetails.map((ledger) => ({ id: ledger.id, name: ledger.name }))
    });
  } catch (error: any) {
    console.error("Balance Sheet Reconciliation Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
