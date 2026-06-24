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

    return NextResponse.json({
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
    });
  } catch (error: any) {
    console.error("Balance Sheet Fetch Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
