import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ledgerName } = await req.json();

    // Mock AI Logic for mapping suggestions based on ledger name heuristics
    const nameStr = ledgerName.toLowerCase();
    
    let suggestion = null;

    if (nameStr.includes("salary") || nameStr.includes("wage")) {
      suggestion = { statementType: "PNL", groupName: "Employee Costs", subHeadName: "Salary & Wages" };
    } else if (nameStr.includes("sales") || nameStr.includes("income") || nameStr.includes("revenue")) {
      suggestion = { statementType: "PNL", groupName: "Revenue", subHeadName: "Sales Income" };
    } else if (nameStr.includes("deposit") && !nameStr.includes("received")) {
      suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Other Current Assets", subHeadName: "Deposits" };
    } else if (nameStr.includes("bank") || nameStr.includes("cash")) {
      suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Cash & Bank", subHeadName: "Bank Balances" };
    } else if (nameStr.includes("loan") || nameStr.includes("borrow")) {
      suggestion = { statementType: "BS", groupName: "Non-Current Liabilities", subGroupName: "Term Loans", subHeadName: "Secured Loans" };
    } else if (nameStr.includes("creditor") || nameStr.includes("payable")) {
      suggestion = { statementType: "BS", groupName: "Current Liabilities", subGroupName: "Sundry Creditors", subHeadName: "Trade Payables" };
    } else if (nameStr.includes("debtor") || nameStr.includes("receivable")) {
      suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Trade Receivables", subHeadName: "Trade Debtors" };
    } else if (nameStr.includes("capital") || nameStr.includes("equity")) {
      suggestion = { statementType: "BS", groupName: "Shareholders Funds", subGroupName: "Share Capital", subHeadName: "Equity Share Capital" };
    }

    return NextResponse.json({ suggestion });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
