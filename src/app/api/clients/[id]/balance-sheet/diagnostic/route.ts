import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { buildBalanceSheetTrace } from "@/lib/services/balance-sheet-trace";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") || "2026");

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    const trace = await buildBalanceSheetTrace(id, year);
    const results = trace.subheadDiagnostics.map((d) => ({
      subHeadName: d.subHeadName,
      mappedLedgersCount: d.mappedLedgersCount,
      ledgerNames: d.mappedLedgerNames,
      ledgerTotal: d.calculatedTotal,
      displayedTotal: d.displayedTotal,
      difference: d.variance,
      groupName: d.groupName,
      mainGroup: d.mainGroup,
    }));

    return NextResponse.json(results);
  } catch (error: any) {
    console.error("Balance Sheet Diagnostic API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
