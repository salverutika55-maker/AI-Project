import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { authorizeClientAction } from "@/lib/rbac";
import { categorizeLedgerForFundFlow, getFiscalYearMonths, MONTH_SHORT_NAMES } from "@/lib/services/fund-flow-engine";
import { Sector } from "@prisma/client";

export const dynamic = "force-dynamic";

function safeNum(val: unknown): number {
  const n = Number(val || 0);
  return Number.isFinite(n) ? n : 0;
}

function cleanStr(val: string | null | undefined): string {
  return (val || "").replace(/[\x00-\x1F\x7F-\x9F]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeKey(val: string | null | undefined): string {
  return cleanStr(val).toLowerCase();
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const categoryKey = searchParams.get("category");
  const monthParam = searchParams.get("month") || "all";
  const mode = (searchParams.get("mode") || "MONTHLY").toUpperCase() as "MONTHLY" | "CUMULATIVE";
  const fyTypeOverride = searchParams.get("fyType") as "APR_MAR" | "JAN_DEC" | undefined;
  const ledgerIdParam = searchParams.get("ledgerId");
  const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString(), 10);

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, sector: true, fiscalYearStartMonth: true }
    });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const sector = client.sector || Sector.TRADING;
    let fyStartMonth = client.fiscalYearStartMonth || 4;
    if (fyTypeOverride === "JAN_DEC") fyStartMonth = 1;
    else if (fyTypeOverride === "APR_MAR") fyStartMonth = 4;

    const FY_MONTHS = getFiscalYearMonths(fyStartMonth);

    const targetFYStart = fyStartMonth === 1 
      ? new Date(`${year}-01-01T00:00:00.000Z`)
      : new Date(`${year}-04-01T00:00:00.000Z`);
    const targetFYEnd = fyStartMonth === 1
      ? new Date(`${year}-12-31T23:59:59.999Z`)
      : new Date(`${year + 1}-03-31T23:59:59.999Z`);

    // Fetch all active ledgers & unified mappings for this client
    const [allLedgers, mappings] = await Promise.all([
      prisma.normalizedLedger.findMany({
        where: { clientId: id, isActive: true }
      }),
      prisma.unifiedLedgerMapping.findMany({
        where: { clientId: id }
      })
    ]);

    const mappingMap = new Map<string, (typeof mappings)[number]>();
    for (const m of mappings) {
      mappingMap.set(normalizeKey(m.softwareLedgerName), m);
    }

    // Filter ledgers that match the categoryKey
    const matchedLedgers = allLedgers.filter(ledger => {
      if (ledgerIdParam && ledger.id !== ledgerIdParam) return false;
      if (!categoryKey || categoryKey === "all") return true;

      const mapping = mappingMap.get(normalizeKey(ledger.name));
      const cat = categorizeLedgerForFundFlow(
        ledger.name,
        ledger.groupName,
        ledger.nature,
        sector,
        mapping?.statementType,
        mapping?.groupName,
        mapping?.subHeadName
      );

      return cat.categoryKey === categoryKey || normalizeKey(cat.categoryLabel) === normalizeKey(categoryKey);
    });

    const targetLedgerIds = matchedLedgers.map(l => l.id);

    // Fetch vouchers for these ledgers within the selected FY
    const voucherLines = await prisma.normalizedVoucherLine.findMany({
      where: {
        ledgerId: { in: targetLedgerIds },
        voucher: {
          clientId: id,
          date: { gte: targetFYStart, lte: targetFYEnd }
        }
      },
      include: {
        ledger: { select: { id: true, name: true, groupName: true, nature: true } },
        voucher: { select: { id: true, voucherNumber: true, date: true, type: true, narration: true } }
      },
      orderBy: { voucher: { date: "asc" } }
    });

    // Resolve month filtering based on mode
    let targetMonthsSet = new Set<string>();
    if (monthParam !== "all") {
      const idx = FY_MONTHS.indexOf(monthParam);
      if (idx !== -1) {
        if (mode === "CUMULATIVE") {
          FY_MONTHS.slice(0, idx + 1).forEach(m => targetMonthsSet.add(m.toLowerCase()));
        } else {
          targetMonthsSet.add(monthParam.toLowerCase());
        }
      } else {
        targetMonthsSet.add(monthParam.toLowerCase());
      }
    }

    // Filter voucher lines
    const filteredLines = voucherLines.filter(line => {
      if (targetMonthsSet.size === 0) return true;
      const d = new Date(line.voucher.date);
      const mName = MONTH_SHORT_NAMES[d.getUTCMonth()].toLowerCase();
      return targetMonthsSet.has(mName);
    });

    // Map voucher details for client drilldown view
    const vouchersList = filteredLines.map(line => ({
      id: line.id,
      voucherId: line.voucher.id,
      voucherNumber: line.voucher.voucherNumber,
      date: line.voucher.date.toISOString().split("T")[0],
      month: MONTH_SHORT_NAMES[new Date(line.voucher.date).getUTCMonth()],
      type: line.voucher.type,
      ledgerId: line.ledger.id,
      ledgerName: line.ledger.name,
      groupName: line.ledger.groupName,
      entryType: line.entryType,
      amount: safeNum(line.amount),
      narration: line.voucher.narration
    }));

    // Calculate ledger-wise totals
    const ledgerBreakdown = matchedLedgers.map(l => {
      const linesForLedger = filteredLines.filter(v => v.ledger.id === l.id);
      const totalDebit = linesForLedger.filter(v => v.entryType === "DEBIT").reduce((acc, v) => acc + safeNum(v.amount), 0);
      const totalCredit = linesForLedger.filter(v => v.entryType === "CREDIT").reduce((acc, v) => acc + safeNum(v.amount), 0);
      const netMovement = l.nature === "DEBIT" ? (totalDebit - totalCredit) : (totalCredit - totalDebit);

      return {
        id: l.id,
        name: l.name,
        groupName: l.groupName,
        nature: l.nature,
        openingBalance: safeNum(l.openingBalance),
        closingBalance: safeNum(l.closingBalance),
        totalDebit,
        totalCredit,
        netMovement,
        voucherCount: linesForLedger.length
      };
    });

    const totalDebit = vouchersList.filter(v => v.entryType === "DEBIT").reduce((acc, v) => acc + v.amount, 0);
    const totalCredit = vouchersList.filter(v => v.entryType === "CREDIT").reduce((acc, v) => acc + v.amount, 0);

    return NextResponse.json({
      clientId: id,
      clientName: client.name,
      sector,
      categoryKey,
      month: monthParam,
      mode,
      year,
      totalMatchedLedgers: matchedLedgers.length,
      totalVouchers: vouchersList.length,
      summary: {
        totalDebit,
        totalCredit,
        netMovement: totalDebit - totalCredit
      },
      ledgers: ledgerBreakdown,
      vouchers: vouchersList
    });
  } catch (error: any) {
    console.error("Fund Flow drilldown error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch drilldown details" },
      { status: 500 }
    );
  }
}
