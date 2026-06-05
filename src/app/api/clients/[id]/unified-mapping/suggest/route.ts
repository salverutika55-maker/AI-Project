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

    if (nameStr.includes("salary") || nameStr.includes("wage") || nameStr.includes("allowance")) {
      suggestion = { statementType: "PNL", groupName: "Employee Costs", subHeadName: "Salary & Wages" };
    } else if (nameStr.includes("sales") || nameStr.includes("income") || nameStr.includes("revenue")) {
      suggestion = { statementType: "PNL", groupName: "Revenue", subHeadName: "Sales Income" };
    } else if (nameStr.includes("deposit") && !nameStr.includes("received")) {
      suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Deposits (Assets)", subHeadName: "Deposits" };
    } else if (nameStr.includes("bank") || nameStr.includes("cash")) {
      suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Bank Accounts", subHeadName: "Bank Balances" };
    } else if (nameStr.includes("loan") || nameStr.includes("borrow")) {
      suggestion = { statementType: "BS", groupName: "Non-Current Liabilities", subGroupName: "Unsecured Loans", subHeadName: "Loans" };
    } else if (nameStr.includes("creditor") || nameStr.includes("payable") || nameStr.includes("supplier")) {
      suggestion = { statementType: "BS", groupName: "Current Liabilities", subGroupName: "Trade Payable", subHeadName: "Trade Payables" };
    } else if (nameStr.includes("debtor") || nameStr.includes("receivable") || nameStr.includes("customer")) {
      suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Trade Receivable", subHeadName: "Trade Debtors" };
    } else if (nameStr.includes("capital") || nameStr.includes("equity") || nameStr.includes("fund")) {
      suggestion = { statementType: "BS", groupName: "Owner's Funds", subGroupName: "Share Capital", subHeadName: "Capital" };
    } else if (nameStr.includes("tax") || nameStr.includes("gst") || nameStr.includes("vat")) {
      suggestion = { statementType: "BS", groupName: "Current Liabilities", subGroupName: "Duties & Taxes", subHeadName: "Taxes" };
    } else if (nameStr.includes("depreciation") || nameStr.includes("amortization")) {
      suggestion = { statementType: "PNL", groupName: "Depreciation", subHeadName: "Depreciation" };
    } else {
      // Fallback for everything else (usually these are expenses or random personal accounts)
      suggestion = { statementType: "PNL", groupName: "Operating Expenses", subHeadName: "General Expenses" };
    }

    return NextResponse.json({ suggestion });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
