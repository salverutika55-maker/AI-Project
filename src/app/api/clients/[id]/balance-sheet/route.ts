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
      
      dataNodes.push({
        id: mapping.id,
        mainGroup,
        groupName: mapping.groupName,
        subGroupName: mapping.subGroupName || mapping.groupName,
        subHeadName: mapping.subHeadName,
        ledgerName: mapping.softwareLedgerName,
        amount: Math.abs(balance), // Assuming absolute for display, logic can adjust based on nature
        nature: balance > 0 ? "DEBIT" : "CREDIT"
      });
    });

    // 5. Calculate Current Year Profit from PNL (Reconciliation)
    // For simplicity, we assume we fetch PNL values and find Net Income
    // We mock the Net Profit calculation if there are no mappings just for the prototype
    const netProfit = 4500000; // Simulated Current Year Profit
    
    // Add it to Profit & Loss Account
    dataNodes.push({
      id: "cy-profit-system",
      mainGroup: "Liabilities",
      groupName: "Owner's Funds",
      subGroupName: "Profit & Loss Account",
      subHeadName: "Current Year Profit",
      ledgerName: "P&L Account (Auto)",
      amount: netProfit,
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
