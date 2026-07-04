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

    if (statementType === "PNL") {
      const client = await prisma.client.findUnique({
        where: { id },
        select: { software: true, fiscalYearStartMonth: true }
      });
      if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

      // Fetch P&L mappings for this subhead
      let mappings = await prisma.unifiedLedgerMapping.findMany({
        where: {
          clientId: id,
          statementType: "PNL",
          subHeadName: {
            equals: subHeadName,
            mode: "insensitive"
          }
        }
      });

      // Fallback/Legacy migration logic
      let mappedNames = mappings.map(m => m.softwareLedgerName.trim().toLowerCase());
      if (mappedNames.length === 0) {
        const legacyPnl = await prisma.pNLMapping.findMany({
          where: {
            clientId: id,
            sectorHead: {
              equals: subHeadName,
              mode: "insensitive"
            }
          }
        });
        mappedNames = legacyPnl.map(m => m.softwareLedgerName.trim().toLowerCase());
      }

      // Fetch all active normalized ledgers for the client
      const allLedgers = await prisma.normalizedLedger.findMany({
        where: { clientId: id, isActive: true }
      });

      const matchedLedgers = allLedgers.filter(l => mappedNames.includes(l.name.trim().toLowerCase()));

      // Identify unmapped/skipped ledgers in the same software group
      const mappedGroups = Array.from(new Set(matchedLedgers.map(l => l.groupName)));
      const skippedLedgers = allLedgers.filter(l => 
        l.isActive && 
        mappedGroups.includes(l.groupName) && 
        !mappedNames.includes(l.name.trim().toLowerCase())
      );

      // Custom Subhead ID query
      const subheadObj = await prisma.customSubHead.findFirst({
        where: {
          clientId: id,
          statementType: "PNL",
          name: {
            equals: subHeadName,
            mode: "insensitive"
          }
        }
      });
      const subHeadId = subheadObj?.id || "N/A";

      // Date calculations
      const startMonth = client.fiscalYearStartMonth || 4;
      const targetFYStart = startMonth === 1 
        ? new Date(`${year}-01-01T00:00:00.000Z`) 
        : new Date(`${year}-04-01T00:00:00.000Z`);
      const targetFYEnd = startMonth === 1
        ? new Date(`${year}-12-31T23:59:59.999Z`)
        : new Date(`${year + 1}-03-31T23:59:59.999Z`);

      // Fetch voucher lines for mapped ledgers
      const voucherLines = await prisma.normalizedVoucherLine.findMany({
        where: {
          voucher: {
            clientId: id,
            date: {
              gte: targetFYStart,
              lte: targetFYEnd,
            }
          },
          ledgerId: {
            in: matchedLedgers.map(l => l.id)
          }
        },
        select: {
          ledgerId: true,
          amount: true,
          entryType: true,
          voucher: {
            select: {
              date: true
            }
          }
        }
      });

      const monthlyMovements: Record<string, Record<string, { debit: number; credit: number }>> = {};
      const MONTH_SHORT_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

      for (const vl of voucherLines) {
        const d = new Date(vl.voucher.date);
        const mName = MONTH_SHORT_NAMES[d.getMonth()];
        
        if (!monthlyMovements[vl.ledgerId]) monthlyMovements[vl.ledgerId] = {};
        if (!monthlyMovements[vl.ledgerId][mName]) monthlyMovements[vl.ledgerId][mName] = { debit: 0, credit: 0 };
        
        if (vl.entryType === "DEBIT") {
          monthlyMovements[vl.ledgerId][mName].debit += vl.amount;
        } else {
          monthlyMovements[vl.ledgerId][mName].credit += vl.amount;
        }
      }

      const ledgers = matchedLedgers.map(ledger => {
        const amounts: Record<string, { opening: number; debit: number; credit: number; closing: number }> = {};
        
        for (const month of requestedMonths) {
          const mv = monthlyMovements[ledger.id]?.[month] || { debit: 0, credit: 0 };
          const debit = mv.debit;
          const credit = mv.credit;
          const net = ledger.nature === "CREDIT" ? (credit - debit) : (debit - credit);
          
          amounts[month] = {
            opening: 0,
            debit,
            credit,
            closing: net
          };
        }

        return {
          id: ledger.id,
          name: ledger.name,
          nature: ledger.nature,
          groupName: ledger.groupName,
          isActive: ledger.isActive,
          amounts,
          isMapped: true
        };
      });

      // Prepare simulated queries for Trace Mode display
      const sqlQueries = [
        `SELECT * FROM "UnifiedLedgerMapping" WHERE "clientId" = '${id}' AND "statementType" = 'PNL' AND "subHeadName" = '${subHeadName}';`,
        `SELECT * FROM "NormalizedLedger" WHERE "clientId" = '${id}' AND "name" IN (${matchedLedgers.map(l => `'${l.name}'`).join(", ") || "none"});`,
        `SELECT * FROM "NormalizedVoucherLine" WHERE "voucherId" IN (SELECT "id" FROM "NormalizedVoucher" WHERE "clientId" = '${id}' AND "date" BETWEEN '${targetFYStart.toISOString()}' AND '${targetFYEnd.toISOString()}') AND "ledgerId" IN (${matchedLedgers.map(l => `'${l.id}'`).join(", ") || "none"});`
      ];

      return NextResponse.json({
        subHeadName,
        statementType,
        months: requestedMonths,
        year,
        totalMapped: ledgers.length,
        ledgers,
        traceMode: {
          subHeadId,
          mappedLedgersCount: ledgers.length,
          mappedLedgerNames: ledgers.map(l => l.name),
          sqlQueries,
          skippedLedgers: skippedLedgers.map(l => ({
            name: l.name,
            groupName: l.groupName,
            isActive: l.isActive,
            closingBalance: l.closingBalance
          }))
        }
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
          mainGroup: row.mainGroup,
          dbOpeningBalance: row.dbOpeningBalance,
          dbClosingBalance: row.dbClosingBalance,
          openingSource: row.openingSource,
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

    // Prepare simulated queries for BS Trace Mode display
    const sqlQueries = [
      `SELECT * FROM "UnifiedLedgerMapping" WHERE "clientId" = '${id}' AND "statementType" = 'BS' AND "subHeadName" = '${subHeadName}';`,
      `SELECT * FROM "NormalizedLedger" WHERE "clientId" = '${id}' AND "isActive" = true;`,
      `SELECT * FROM "NormalizedVoucherLine" WHERE "voucherId" IN (SELECT "id" FROM "NormalizedVoucher" WHERE "clientId" = '${id}')`
    ];

    // Find any unmapped/skipped ledgers in the same database groups
    const mappedGroups = Array.from(new Set(ledgers.map(l => l.groupName)));
    const skippedLedgers = trace.ledgers.filter(l => 
      l.isActive && 
      mappedGroups.includes(l.groupName) && 
      !trace.mappings.some(m => m.softwareLedgerName.trim().toLowerCase() === l.name.trim().toLowerCase())
    );

    return NextResponse.json({
      subHeadName,
      statementType,
      months: requestedMonths,
      year,
      totalMapped: ledgers.length,
      ledgers,
      traceMode: {
        subHeadId: "N/A",
        mappedLedgersCount: ledgers.length,
        mappedLedgerNames: ledgers.map(l => l.name),
        sqlQueries,
        skippedLedgers: skippedLedgers.map(l => ({
          name: l.name,
          groupName: l.groupName,
          isActive: l.isActive,
          closingBalance: l.closingBalance
        })),
        formula: "classification-based: Assets (Opening + Debit - Credit) | Liabilities & Equity (Opening + Credit - Debit)",
        syntheticValues: false,
      },
    });
  } catch (error: any) {
    console.error("Drilldown Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
