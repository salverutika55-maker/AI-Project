import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  
  // 1. Authenticate user session
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // 2. Authorize action for this client
    await authorizeClientAction(user.id, id, "READ_ONLY");

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || "VENDORS"; // VENDORS or CUSTOMERS
    const year = parseInt(searchParams.get("year") || "2026");

    // Fetch client to confirm existence and config
    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    const startMonth = client.fiscalYearStartMonth - 1; // e.g. 3 for April (0-indexed)
    const startUtc = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
    const endUtc = new Date(Date.UTC(year + 1, startMonth, 1, 0, 0, 0, 0));

    // 3. Fetch Ledgers representing Customers or Vendors for this client
    const ledgers = await prisma.normalizedLedger.findMany({
      where: {
        clientId: id,
        OR: [
          { groupName: { contains: type === "CUSTOMERS" ? "Debtors" : "Creditors", mode: "insensitive" } },
          { groupName: { contains: type === "CUSTOMERS" ? "Receivables" : "Payables", mode: "insensitive" } }
        ]
      }
    });

    if (ledgers.length === 0) {
      return NextResponse.json({
        success: true,
        data: []
      });
    }

    const ledgerIds = ledgers.map(l => l.id);

    // 4. Fetch all historical voucher lines for these ledgers up to the end of the target year
    const lines = await prisma.normalizedVoucherLine.findMany({
      where: {
        ledgerId: { in: ledgerIds },
        voucher: {
          clientId: id,
          date: { lt: endUtc }
        }
      },
      include: {
        voucher: {
          select: {
            date: true
          }
        }
      }
    });

    // 5. Initialize aggregation stats
    const partyStats: Record<string, {
      name: string;
      nature: string;
      openingBalance: number;
      debitsDuringYear: number;
      creditsDuringYear: number;
      transactionCount: number;
      lastTransactionDate: Date | null;
      monthlyValues: number[];
    }> = {};

    for (const l of ledgers) {
      partyStats[l.id] = {
        name: l.name,
        nature: l.nature,
        openingBalance: l.openingBalance,
        debitsDuringYear: 0,
        creditsDuringYear: 0,
        transactionCount: 0,
        lastTransactionDate: null,
        monthlyValues: Array(12).fill(0)
      };
    }

    // 6. Aggregate historical and year-specific movements
    for (const line of lines) {
      const stats = partyStats[line.ledgerId];
      if (!stats) continue;

      const vDate = new Date(line.voucher.date);
      const amount = line.amount;
      const isDebit = line.entryType === "DEBIT";

      if (vDate < startUtc) {
        // Roll-forward opening balance
        if (stats.nature === "DEBIT") {
          stats.openingBalance += isDebit ? amount : -amount;
        } else {
          stats.openingBalance += isDebit ? -amount : amount;
        }
      } else {
        // Movements during target year
        stats.transactionCount++;
        if (!stats.lastTransactionDate || vDate > stats.lastTransactionDate) {
          stats.lastTransactionDate = vDate;
        }

        if (isDebit) {
          stats.debitsDuringYear += amount;
        } else {
          stats.creditsDuringYear += amount;
        }

        let monthIndex = vDate.getUTCMonth() - startMonth;
        if (monthIndex < 0) {
          monthIndex += 12;
        }
        stats.monthlyValues[monthIndex] += amount;
      }
    }

    // 7. Map and build normalized results
    const results = Object.values(partyStats).map(stats => {
      // For customers, total value represents sales (debits). For vendors, purchases (credits).
      const totalValue = type === "CUSTOMERS" ? stats.debitsDuringYear : stats.creditsDuringYear;
      
      let outstanding = stats.openingBalance;
      if (stats.nature === "DEBIT") {
        outstanding += stats.debitsDuringYear - stats.creditsDuringYear;
      } else {
        outstanding += stats.creditsDuringYear - stats.debitsDuringYear;
      }
      const finalOutstanding = Math.max(0, outstanding);

      let overdue = 0;
      if (finalOutstanding > 0) {
        const daysSinceLastTx = stats.lastTransactionDate
          ? (new Date().getTime() - stats.lastTransactionDate.getTime()) / (1000 * 3600 * 24)
          : 999;
        overdue = daysSinceLastTx > 30 ? finalOutstanding * 0.45 : finalOutstanding * 0.1;
      }

      const payments = type === "CUSTOMERS" ? stats.creditsDuringYear : stats.debitsDuringYear;
      const avgDays = payments > 0
        ? Math.round(15 + (finalOutstanding / Math.max(1, totalValue)) * 25)
        : 30;

      return {
        name: stats.name,
        totalValue: Math.round(totalValue * 100) / 100,
        outstanding: Math.round(finalOutstanding * 100) / 100,
        overdue: Math.round(overdue * 100) / 100,
        averageDays: Math.min(90, Math.max(10, avgDays)),
        lastTransaction: stats.lastTransactionDate || new Date(year, startMonth, 1),
        transactionCount: stats.transactionCount,
        monthlyTrend: stats.monthlyValues.map(v => Math.round(v * 100) / 100),
        openingBalance: Math.round(stats.openingBalance * 100) / 100,
        debits: Math.round(stats.debitsDuringYear * 100) / 100,
        credits: Math.round(stats.creditsDuringYear * 100) / 100
      };
    })
    .filter(p => p.totalValue > 0 || p.outstanding > 0)
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 10);

    return NextResponse.json({
      success: true,
      data: results
    });

  } catch (error: any) {
    console.error("Analytics Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
