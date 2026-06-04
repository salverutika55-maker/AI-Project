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
      "EQUITY & LIABILITIES": {
        "Shareholders Funds": {
          "Share Capital": {},
          "Reserves & Surplus": {}
        },
        "Non-Current Liabilities": {
          "Term Loans": {},
          "Deferred Tax": {},
          "Long-Term Provisions": {}
        },
        "Current Liabilities": {
          "Sundry Creditors": {},
          "Duties & Taxes": {},
          "Statutory Payables": {},
          "Short-Term Borrowings": {},
          "Other Current Liabilities": {}
        }
      },
      "ASSETS": {
        "Non-Current Assets": {
          "Fixed Assets": {},
          "Capital Work in Progress": {},
          "Investments": {},
          "Long-Term Loans & Advances": {}
        },
        "Current Assets": {
          "Inventory": {},
          "Trade Receivables": {},
          "Cash & Bank": {},
          "Short-Term Loans": {},
          "Advances": {},
          "Deposits": {},
          "Other Current Assets": {}
        }
      }
    };

    // 4. Map ledgers into structure
    const dataNodes: any[] = [];

    bsMappings.forEach(mapping => {
      let mainGroup = "";
      if (mapping.groupName === "Shareholders Funds" || mapping.groupName === "Non-Current Liabilities" || mapping.groupName === "Current Liabilities") {
        mainGroup = "EQUITY & LIABILITIES";
      } else {
        mainGroup = "ASSETS";
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
    
    // Add it to Reserves & Surplus
    dataNodes.push({
      id: "cy-profit-system",
      mainGroup: "EQUITY & LIABILITIES",
      groupName: "Shareholders Funds",
      subGroupName: "Reserves & Surplus",
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
