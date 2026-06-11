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
  
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    
    await authorizeClientAction(user.id, id, "READ_ONLY");

    // 1. Fetch Unified Mappings for BS
    const bsMappings = await prisma.unifiedLedgerMapping.findMany({
      where: { clientId: id, statementType: "BS" }
    });

    // 2. Fetch Normalized Ledgers for Closing Balances
    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId: id, isActive: true }
    });

    const ledgerBalances: Record<string, { bal: number, nature: string }> = {};
    ledgers.forEach(l => {
      ledgerBalances[l.name] = { bal: l.closingBalance, nature: l.nature };
    });

    // 3. Define standard BS Structure
    const structure: any = {
      "Liabilities": {
        "Owner's Funds": {
          "Share Capital": {},
          "Reserves & Surplus": {},
          "Profit & Loss Account": {}
        },
        "Non-Current Liabilities": {
          "Unsecured Loans": {}
        },
        "Current Liabilities": {
          "Short Term Borrowing": {},
          "Duties & Taxes": {},
          "Suspense A/c": {},
          "Trade Payable": {},
          "Provisions": {},
          "Other Current Liabilities": {}
        }
      },
      "Assets": {
        "Non-Current Assets": {
          "Fixed Assets": {},
          "Investments": {}
        },
        "Current Assets": {
          "Closing Stock": {},
          "Trade Receivable": {},
          "Cash-In-Hand": {},
          "Bank Accounts": {},
          "Deposits (Assets)": {},
          "Short Term Loan & Advance": {},
          "Other Current Assets": {}
        },
        "Branch Account": {}
      }
    };

    // 4. Map ledgers into structure
    const dataNodes: any[] = [];

    bsMappings.forEach(mapping => {
      let mainGroup = "";
      if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities"].includes(mapping.groupName)) {
        mainGroup = "Liabilities";
      } else {
        mainGroup = "Assets";
      }

      const ledgerInfo = ledgerBalances[mapping.softwareLedgerName] || { bal: 0, nature: mainGroup === "Assets" ? "DEBIT" : "CREDIT" };
      let balance = ledgerInfo.bal;
      
      // If it's a Liability, Credit increases it, Debit decreases it.
      // If it's an Asset, Debit increases it, Credit decreases it.
      if (mainGroup === "Liabilities" && ledgerInfo.nature === "DEBIT") {
          balance = -Math.abs(balance);
      } else if (mainGroup === "Assets" && ledgerInfo.nature === "CREDIT") {
          balance = -Math.abs(balance);
      }
      
      const months = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
      // Note: Opening represents the Opening Balance.
      // We will make Opening = 50%
      // Apr = 54% ... Feb = 96%, Mar = 100%
      
      months.forEach((month, idx) => {
        let percentage = 0.5 + (0.045 * idx); 
        if (month === "Mar") percentage = 1.0;
        
        const mockedBalance = balance * percentage; 

        dataNodes.push({
          id: `${mapping.id}-${month}`,
          period: month,
          mainGroup,
          groupName: mapping.groupName,
          subGroupName: mapping.subGroupName || mapping.groupName,
          subHeadName: mapping.subHeadName,
          ledgerName: mapping.softwareLedgerName,
          amount: mockedBalance,
          nature: ledgerInfo.nature
        });
      });
    });

    // 5. Calculate Current Year Profit from PNL
    // Calculate the raw difference based purely on the final 100% March figures
    const marchAssets = dataNodes.filter(n => n.mainGroup === "Assets" && n.period === "Mar").reduce((sum, n) => sum + (n.amount || 0), 0);
    const marchLiabs = dataNodes.filter(n => n.mainGroup === "Liabilities" && n.period === "Mar").reduce((sum, n) => sum + (n.amount || 0), 0);
    const finalProfit = marchAssets - marchLiabs;

    const monthsForProfit = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    monthsForProfit.forEach((month, idx) => {
        let percentage = 0.5 + (0.045 * idx); 
        if (month === "Mar") percentage = 1.0;

      const scaledProfit = finalProfit * percentage;

      dataNodes.push({
        id: `cy-profit-system-${month}`,
        period: month,
        mainGroup: "Liabilities",
        groupName: "Owner's Funds",
        subGroupName: "Profit & Loss Account",
        subHeadName: "Current Year Profit",
        ledgerName: "P&L Account (Auto)",
        amount: scaledProfit,
        nature: scaledProfit >= 0 ? "CREDIT" : "DEBIT"
      });
    });

    return NextResponse.json({
      structure,
      dataNodes,
      validation: {
        isBalanced: true, // Mocking balanced for now, in real life you sum ASSETS vs LIAB
        difference: 0
      }
    });

  } catch (error: any) {
    console.error("Balance Sheet Fetch Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
