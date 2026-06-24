import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";
import { buildBalanceSheetTrace } from "@/lib/services/balance-sheet-trace";

const MONTH_ORDER = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const statementType = searchParams.get("statementType");
  const subHeadName = searchParams.get("subHeadName");
  const monthsParam = searchParams.get("months");
  const year = parseInt(searchParams.get("year") || "2026", 10);

  if (!statementType || !subHeadName || !monthsParam) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  const requestedMonths = monthsParam
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    if (statementType !== "BS") {
      return NextResponse.json({
        subHeadName,
        statementType,
        months: requestedMonths,
        year,
        totalMapped: 0,
        ledgers: [],
      });
    }

    const trace = await buildBalanceSheetTrace(id, year);

    const ledgers = trace.ledgerTraces
      .filter((row) => row.subHeadName.toLowerCase() === subHeadName.toLowerCase())
      .map((row) => {
        const amounts: Record<string, { opening: number; debit: number; credit: number; closing: number }> = {};

        for (const month of requestedMonths) {
          if (!MONTH_ORDER.includes(month)) continue;
          amounts[month] = row.monthTraces[month] || { opening: 0, debit: 0, credit: 0, closing: 0 };
        }

        return {
          id: row.ledgerId,
          name: row.ledgerName,
          nature: row.nature,
          groupName: row.groupName,
          amounts,
          isMapped: true,
        };
      })
      .sort((a, b) => {
        const latestMonth = requestedMonths[requestedMonths.length - 1] || "Mar";
        const av = a.amounts[latestMonth]?.closing || 0;
        const bv = b.amounts[latestMonth]?.closing || 0;
        return bv - av;
      });

    return NextResponse.json({
      subHeadName,
      statementType,
      months: requestedMonths,
      year,
      totalMapped: ledgers.length,
      ledgers,
      traceMode: {
        formula: "opening + debit - credit",
        syntheticValues: false,
      },
    });
  } catch (error: any) {
    console.error("Drilldown Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
