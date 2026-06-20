import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { buildBalanceSheetReconciliation } from "@/lib/services/balance-sheet";

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

    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || "localhost:3000";
    const bsResponse = await fetch(`${protocol}://${host}/api/clients/${id}/balance-sheet?year=${year}`, {
      headers: {
        Cookie: req.headers.get("cookie") || ""
      }
    });

    if (!bsResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch Balance Sheet data" }, { status: 502 });
    }

    const bsData = await bsResponse.json();
    const displayedLedgerIds = new Set<string>();
    const displayedSubheadTotals: Record<string, number> = {};

    (bsData.dataNodes || []).forEach((node: any) => {
      if (typeof node.ledgerId === "string") displayedLedgerIds.add(node.ledgerId);
      const actualSubHead = node.subHeadName || node.subGroupName || node.groupName || "Unknown";
      const actualGroup = node.groupName || "Unknown";
      const key = `${actualGroup}|||${actualSubHead}`;
      displayedSubheadTotals[key] = (displayedSubheadTotals[key] || 0) + (Number(node.amount) || 0);
    });

    const reconciler = await buildBalanceSheetReconciliation(id, year);
    const mappedLedgerIds = reconciler.mappedLedgerIds || [];
    const missingLedgerIds = mappedLedgerIds.filter((ledgerId) => !displayedLedgerIds.has(ledgerId));
    const includedLedgerIds = mappedLedgerIds.filter((ledgerId) => displayedLedgerIds.has(ledgerId));
    const missingLedgerDetails = await prisma.normalizedLedger.findMany({
      where: { clientId: id, id: { in: missingLedgerIds } }
    });

    const subheadSummaries = reconciler.subheadSummaries.map((summary) => {
      const key = `${summary.groupName}|||${summary.subHeadName}`;
      const displayedTotal = displayedSubheadTotals[key] || 0;
      return {
        ...summary,
        displayedTotal,
        difference: Math.abs(displayedTotal - summary.ledgerTotal)
      };
    });

    const groupSummaries = reconciler.groupSummaries.map((group) => {
      const recalculatedDisplayed = subheadSummaries
        .filter((sh) => sh.groupName === group.groupName && sh.mainGroup === group.mainGroup)
        .reduce((sum, sh) => sum + sh.displayedTotal, 0);
      return {
        ...group,
        subheads: subheadSummaries.filter((sh) => sh.groupName === group.groupName && sh.mainGroup === group.mainGroup),
        displayedTotal: recalculatedDisplayed,
        difference: Math.abs(recalculatedDisplayed - group.ledgerTotal)
      };
    });

    return NextResponse.json({
      ...reconciler,
      subheadSummaries,
      groupSummaries,
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
