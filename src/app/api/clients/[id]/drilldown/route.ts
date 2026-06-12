import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { authorizeClientAction } from "@/lib/rbac";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const statementType = searchParams.get("statementType"); // "PNL" or "BS"
  const subHeadName = searchParams.get("subHeadName");
  const month = searchParams.get("month");
  const year = parseInt(searchParams.get("year") || "2026");

  if (!statementType || !subHeadName || !month) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    // 1. Fetch Mapped Ledgers for this Sub-Head
    const mappings = await prisma.unifiedLedgerMapping.findMany({
      where: {
        clientId: id,
        statementType,
        subHeadName
      }
    });

    const mappedLedgerNames = mappings.map(m => m.softwareLedgerName);

    // 2. Determine balances for these ledgers
    // If it's a BS sub-head, we can just use the latest Closing Balances (or apply the mock month logic for dev)
    // If it's a PNL sub-head, we ideally aggregate Vouchers for that month.
    // For this implementation, we will use NormalizedLedger for BS and aggregate Vouchers for PNL.
    
    let ledgersWithBalances = [];

    if (statementType === "BS") {
      const ledgers = await prisma.normalizedLedger.findMany({
        where: { clientId: id, name: { in: mappedLedgerNames } }
      });

      // Apply the same dev logic as BalanceSheet API for mock monthly distributions
      const months = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
      const monthIdx = months.indexOf(month);
      let percentage = 1.0;
      if (monthIdx !== -1) {
          percentage = 0.5 + (0.045 * monthIdx);
          if (month === "Mar") percentage = 1.0;
      }

      ledgersWithBalances = ledgers.map(l => {
        let balance = l.closingBalance;
        // Determine main group for sign adjustment
        let mainGroup = "Assets";
        if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities", "Capital Account", "Suspense A/c", "Sundry Creditors", "Duties & Taxes", "Loans (Liability)", "Secured Loans", "Unsecured Loans", "Primary", "Reserves & Surplus"].includes(l.groupName)) {
            mainGroup = "Liabilities";
        }
        
        if (mainGroup === "Liabilities" && l.nature === "DEBIT") {
            balance = -Math.abs(balance);
        } else if (mainGroup === "Assets" && l.nature === "CREDIT") {
            balance = -Math.abs(balance);
        }

        return {
          id: l.id,
          name: l.name,
          nature: l.nature,
          groupName: l.groupName,
          amount: balance * percentage,
          isMapped: true
        };
      });

    } else {
      // statementType === "PNL"
      // Map months to numbers
      const monthMap: Record<string, number> = {
        "Jan": 0, "Feb": 1, "Mar": 2, "Apr": 3, "May": 4, "Jun": 5,
        "Jul": 6, "Aug": 7, "Sep": 8, "Oct": 9, "Nov": 10, "Dec": 11
      };
      
      const monthNum = monthMap[month];
      let startDate = new Date(year, monthNum, 1);
      let endDate = new Date(year, monthNum + 1, 0, 23, 59, 59);

      // If user selected Fiscal Year crossing Dec-Jan, year parameter might need adjustment 
      // depending on how they selected it, but we assume UI passes the exact calendar year.
      
      const ledgers = await prisma.normalizedLedger.findMany({
        where: { clientId: id, name: { in: mappedLedgerNames } }
      });

      // Aggregate vouchers
      const ledgerIds = ledgers.map(l => l.id);
      
      const lines = await prisma.normalizedVoucherLine.groupBy({
        by: ['ledgerId', 'entryType'],
        where: {
          ledgerId: { in: ledgerIds },
          voucher: {
             date: { gte: startDate, lte: endDate }
          }
        },
        _sum: { amount: true }
      });

      // Combine Dr/Cr per ledger
      const balanceMap: Record<string, number> = {};
      lines.forEach(line => {
         const amt = line._sum.amount || 0;
         if (!balanceMap[line.ledgerId]) balanceMap[line.ledgerId] = 0;
         if (line.entryType === "DEBIT") balanceMap[line.ledgerId] += amt;
         else balanceMap[line.ledgerId] -= amt;
      });

      ledgersWithBalances = ledgers.map(l => {
         let netAmount = balanceMap[l.id] || 0;
         
         // For Revenue, Credit is positive. For Expenses, Debit is positive.
         // A simple heuristic based on subHeadName:
         const isRevenue = subHeadName.toLowerCase().includes("revenue") || subHeadName.toLowerCase().includes("income") || subHeadName.toLowerCase().includes("sales");
         if (isRevenue) {
             netAmount = -netAmount; // Since Credits are negative in our balanceMap above
         }

         return {
           id: l.id,
           name: l.name,
           nature: l.nature,
           groupName: l.groupName,
           amount: Math.abs(netAmount), // Display positive amounts in drill down, nature denotes dr/cr
           actualAmount: netAmount,
           isMapped: true
         };
      });
    }

    // Sort by amount descending
    ledgersWithBalances.sort((a, b) => b.amount - a.amount);

    return NextResponse.json({
      subHeadName,
      statementType,
      month,
      year,
      totalMapped: mappedLedgerNames.length,
      ledgers: ledgersWithBalances
    });

  } catch (error: any) {
    console.error("Drilldown Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
