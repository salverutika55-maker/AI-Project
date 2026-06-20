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
  const year = parseInt(searchParams.get("year") || "2026");

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    // Fetch the actual Balance Sheet data to get the displayed totals
    const protocol = req.headers.get("x-forwarded-proto") || "http";
    const host = req.headers.get("host") || "localhost:3000";
    const bsResponse = await fetch(`${protocol}://${host}/api/clients/${id}/balance-sheet?year=${year}`, {
        headers: {
            Cookie: req.headers.get("cookie") || ""
        }
    });
    
    if (!bsResponse.ok) {
        return NextResponse.json({ error: "Failed to fetch Balance Sheet data" }, { status: 500 });
    }
    
    const bsData = await bsResponse.json();
    const dataNodes = bsData.dataNodes || [];
    
    const latestMonth = "Mar"; // We use March as the standard end-of-year month for validation
    
    // Fetch all active ledgers
    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId: id, isActive: true }
    });

    // Fetch unified mappings
    const mappings = await prisma.unifiedLedgerMapping.findMany({
      where: { clientId: id, statementType: "BS" }
    });

    const voucherLines = await prisma.normalizedVoucherLine.findMany({
      where: { voucher: { clientId: id } },
      select: {
        ledgerId: true,
        amount: true,
        entryType: true,
        voucher: { select: { date: true } }
      }
    });

    const preFYMovements: Record<string, { debit: number, credit: number }> = {};
    const monthlyMovements: Record<string, Record<string, { debit: number, credit: number }>> = {};
    const targetFYStart = new Date(`${year}-04-01T00:00:00.000Z`);
    const targetFYEnd = new Date(`${year + 1}-03-31T23:59:59.999Z`);
    const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];

    voucherLines.forEach(vl => {
      const d = new Date(vl.voucher.date);
      if (d < targetFYStart) {
        if (!preFYMovements[vl.ledgerId]) preFYMovements[vl.ledgerId] = { debit: 0, credit: 0 };
        if (vl.entryType === "DEBIT") preFYMovements[vl.ledgerId].debit += vl.amount;
        else preFYMovements[vl.ledgerId].credit += vl.amount;
      }

      if (d >= targetFYStart && d <= targetFYEnd) {
        const monthIndex = d.getMonth();
        const monthsNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const mName = monthsNames[monthIndex];
        if (!monthlyMovements[vl.ledgerId]) monthlyMovements[vl.ledgerId] = {};
        if (!monthlyMovements[vl.ledgerId][mName]) monthlyMovements[vl.ledgerId][mName] = { debit: 0, credit: 0 };
        if (vl.entryType === "DEBIT") monthlyMovements[vl.ledgerId][mName].debit += vl.amount;
        else monthlyMovements[vl.ledgerId][mName].credit += vl.amount;
      }
    });

    const diagnostics: Record<string, {
        subHeadName: string,
        mappedLedgersCount: number,
        ledgerNames: string[],
        ledgerTotal: number,
        displayedTotal: number,
        difference: number
    }> = {};

    const getSubHeadKey = (node: any) => node.subGroupName || node.subHeadName || node.groupName || "Unknown";

    dataNodes.forEach((node: any) => {
      if (node.period === latestMonth) {
        const subHead = getSubHeadKey(node);
        if (!diagnostics[subHead]) {
          diagnostics[subHead] = {
            subHeadName: subHead,
            mappedLedgersCount: 0,
            ledgerNames: [],
            ledgerTotal: 0,
            displayedTotal: 0,
            difference: 0
          };
        }
        diagnostics[subHead].displayedTotal += node.amount;
      }
    });

    ledgers.forEach(l => {
      const manualMapping = mappings.find(m => m.softwareLedgerName.toLowerCase() === l.name.toLowerCase());
      if (!manualMapping) return;

      const subHead = manualMapping.subHeadName || manualMapping.subGroupName || manualMapping.groupName;
      if (!diagnostics[subHead]) {
        diagnostics[subHead] = {
          subHeadName: subHead,
          mappedLedgersCount: 0,
          ledgerNames: [],
          ledgerTotal: 0,
          displayedTotal: 0,
          difference: 0
        };
      }

      diagnostics[subHead].mappedLedgersCount += 1;
      diagnostics[subHead].ledgerNames.push(l.name);

      const preFY = preFYMovements[l.id] || { debit: 0, credit: 0 };
      const fyMvmt = { debit: 0, credit: 0 };
      months.forEach(m => {
        if (monthlyMovements[l.id] && monthlyMovements[l.id][m]) {
          fyMvmt.debit += monthlyMovements[l.id][m].debit;
          fyMvmt.credit += monthlyMovements[l.id][m].credit;
        }
      });

      let fyOpening = l.openingBalance;
      if (fyOpening === 0) {
        if (l.closingBalance !== 0) {
          fyOpening = l.closingBalance - fyMvmt.debit + fyMvmt.credit;
        } else {
          fyOpening = preFY.debit - preFY.credit;
        }
      }

      let runningBalance = fyOpening;
      const allMonths = ["Opening", ...months];
      allMonths.forEach(month => {
        if (month !== "Opening") {
          const mvmt = (monthlyMovements[l.id] && monthlyMovements[l.id][month]) || { debit: 0, credit: 0 };
          runningBalance += mvmt.debit - mvmt.credit;
        }
      });

      diagnostics[subHead].ledgerTotal += runningBalance;
    });

    const results = Object.values(diagnostics).map(d => {
      d.difference = Math.abs(d.displayedTotal - d.ledgerTotal);
      return d;
    });

    return NextResponse.json(results);
  } catch (error: any) {
    console.error("Balance Sheet Diagnostic API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
