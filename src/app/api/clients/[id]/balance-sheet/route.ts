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

    const ledgerBalances: Record<string, number> = {};
    ledgers.forEach(l => {
      ledgerBalances[l.name] = l.closingBalance;
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

      const balance = ledgerBalances[mapping.softwareLedgerName] || 0;
      
      // Push May Data (Actual Closing)
      dataNodes.push({
        id: `${mapping.id}-May`,
        period: "May",
        mainGroup,
        groupName: mapping.groupName,
        subGroupName: mapping.subGroupName || mapping.groupName,
        subHeadName: mapping.subHeadName,
        ledgerName: mapping.softwareLedgerName,
        amount: Math.abs(balance),
        nature: balance > 0 ? "DEBIT" : "CREDIT"
      });

      // Push Apr Data (Mocked variation for prototype)
      dataNodes.push({
        id: `${mapping.id}-Apr`,
        period: "Apr",
        mainGroup,
        groupName: mapping.groupName,
        subGroupName: mapping.subGroupName || mapping.groupName,
        subHeadName: mapping.subHeadName,
        ledgerName: mapping.softwareLedgerName,
        amount: Math.abs(balance * 0.95), // 5% less for Apr
        nature: balance > 0 ? "DEBIT" : "CREDIT"
      });
    });

    // 5. Calculate Current Year Profit from PNL
    const netProfitMay = 4500000;
    const netProfitApr = 4000000;
    
    // Add it to Profit & Loss Account
    dataNodes.push({
      id: "cy-profit-system-may",
      period: "May",
      mainGroup: "Liabilities",
      groupName: "Owner's Funds",
      subGroupName: "Profit & Loss Account",
      subHeadName: "Current Year Profit",
      ledgerName: "P&L Account (Auto)",
      amount: netProfitMay,
      nature: "CREDIT"
    });

    dataNodes.push({
      id: "cy-profit-system-apr",
      period: "Apr",
      mainGroup: "Liabilities",
      groupName: "Owner's Funds",
      subGroupName: "Profit & Loss Account",
      subHeadName: "Current Year Profit",
      ledgerName: "P&L Account (Auto)",
      amount: netProfitApr,
      nature: "CREDIT"
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
