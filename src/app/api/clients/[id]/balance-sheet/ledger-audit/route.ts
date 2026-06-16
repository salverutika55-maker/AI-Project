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
  const year = parseInt(searchParams.get("year") || new Date().getFullYear().toString());

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    const targetFYStart = new Date(`${year}-04-01T00:00:00Z`);
    const targetFYEnd = new Date(`${year + 1}-03-31T23:59:59Z`);

    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId: id, isActive: true },
    });

    const bsMappings = await prisma.unifiedLedgerMapping.findMany({
      where: { clientId: id, statementType: "BS" }
    });

    const movements = await prisma.normalizedVoucherLine.findMany({
      where: { 
        clientId: id,
      },
      select: {
        ledgerId: true,
        amount: true,
        entryType: true,
        voucher: {
          select: { date: true }
        }
      }
    });

    const fyMovements: Record<string, { debit: number, credit: number }> = {};
    const preFyMovements: Record<string, { debit: number, credit: number }> = {};
    
    movements.forEach(m => {
        const d = new Date(m.voucher.date);
        
        if (d >= targetFYStart && d <= targetFYEnd) {
            if (!fyMovements[m.ledgerId]) fyMovements[m.ledgerId] = { debit: 0, credit: 0 };
            if (m.entryType === "DEBIT") fyMovements[m.ledgerId].debit += m.amount;
            else fyMovements[m.ledgerId].credit += m.amount;
        } else if (d < targetFYStart) {
            if (!preFyMovements[m.ledgerId]) preFyMovements[m.ledgerId] = { debit: 0, credit: 0 };
            if (m.entryType === "DEBIT") preFyMovements[m.ledgerId].debit += m.amount;
            else preFyMovements[m.ledgerId].credit += m.amount;
        }
    });

    const auditReport = [];

    ledgers.forEach(ledger => {
      const customMapping = bsMappings.find(m => m.softwareLedgerName.toLowerCase() === ledger.name.toLowerCase());
      const isPnL = ledger.name.toLowerCase().includes("profit & loss") || ledger.name.toLowerCase().includes("p&l");

      if (!customMapping && !isPnL) {
          return; // Strictly exclude unmapped ledgers
      }

      let mainGroup = "Assets";
      if (customMapping) {
          if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities", "Capital Account", "Suspense A/c", "Sundry Creditors", "Duties & Taxes", "Loans (Liability)", "Secured Loans", "Unsecured Loans", "Primary", "Reserves & Surplus"].includes(customMapping.groupName)) {
            mainGroup = "Liabilities";
          }
      } else if (isPnL) {
          mainGroup = "Liabilities";
      }

      const fyMvmt = fyMovements[ledger.id] || { debit: 0, credit: 0 };
      const preMvmt = preFyMovements[ledger.id] || { debit: 0, credit: 0 };
      
      // Calculate Fallback Opening if ERP Opening is 0
      let calculatedOpening = ledger.openingBalance;
      if (calculatedOpening === 0) {
          if (mainGroup === "Assets") {
              calculatedOpening = ledger.closingBalance - fyMvmt.debit + fyMvmt.credit;
          } else {
              calculatedOpening = ledger.closingBalance - fyMvmt.credit + fyMvmt.debit;
          }
      }

      let expectedClosing = 0;
      if (mainGroup === "Assets") {
          expectedClosing = calculatedOpening + fyMvmt.debit - fyMvmt.credit;
      } else {
          expectedClosing = calculatedOpening + fyMvmt.credit - fyMvmt.debit;
      }

      auditReport.push({
          ledgerId: ledger.id,
          ledgerName: ledger.name,
          nature: mainGroup === "Assets" ? "Asset" : "Liability/Equity",
          openingBalance: calculatedOpening,
          debitTotal: fyMvmt.debit,
          creditTotal: fyMvmt.credit,
          expectedClosing: expectedClosing,
          appClosing: expectedClosing,
          erpClosing: ledger.closingBalance,
          variance: ledger.closingBalance - expectedClosing,
          isPnL: isPnL
      });
    });

    return NextResponse.json(auditReport);

  } catch (error: any) {
    console.error("Ledger Audit API Error:", error);
    return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
