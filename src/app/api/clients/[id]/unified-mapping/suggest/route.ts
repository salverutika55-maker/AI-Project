import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ledgerName, parentGroup } = await req.json();

    // AI Logic for mapping suggestions based on Tally's parentGroup
    const nameStr = ledgerName.toLowerCase();
    const groupStr = (parentGroup || "").toLowerCase();
    
    let suggestion = null;

    // 1. Precise Mapping using Tally's parentGroup (Most accurate)
    if (groupStr.includes("debtor")) {
      suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Trade Receivable", subHeadName: "Trade Debtors" };
    } else if (groupStr.includes("creditor")) {
      suggestion = { statementType: "BS", groupName: "Current Liabilities", subGroupName: "Trade Payable", subHeadName: "Trade Payables" };
    } else if (groupStr.includes("duty") || groupStr.includes("tax")) {
      suggestion = { statementType: "BS", groupName: "Current Liabilities", subGroupName: "Duties & Taxes", subHeadName: "Taxes" };
    } else if (groupStr.includes("indirect expense")) {
      if (nameStr.includes("salary") || nameStr.includes("wage") || nameStr.includes("allowance") || nameStr.includes("pf") || nameStr.includes("bonus")) {
        suggestion = { statementType: "PNL", groupName: "Employee Costs", subHeadName: "Salary & Wages" };
      } else if (nameStr.includes("depreciation") || nameStr.includes("amortization")) {
        suggestion = { statementType: "PNL", groupName: "Depreciation", subHeadName: "Depreciation" };
      } else if (nameStr.includes("interest") || nameStr.includes("bank charge") || nameStr.includes("finance")) {
        suggestion = { statementType: "PNL", groupName: "Finance Costs", subHeadName: "Interest Expense" };
      } else {
        suggestion = { statementType: "PNL", groupName: "Operating Expenses", subHeadName: "General Expenses" };
      }
    } else if (groupStr.includes("direct expense")) {
      if (nameStr.includes("purchase")) {
        suggestion = { statementType: "PNL", groupName: "Direct Expenses", subHeadName: "Purchases" };
      } else {
        suggestion = { statementType: "PNL", groupName: "Direct Expenses", subHeadName: "Direct Expenses" };
      }
    } else if (groupStr.includes("fixed asset")) {
      suggestion = { statementType: "BS", groupName: "Non-Current Assets", subGroupName: "Fixed Assets", subHeadName: "Fixed Assets" };
    } else if (groupStr.includes("bank account")) {
      suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Bank Accounts", subHeadName: "Bank Balances" };
    } else if (groupStr.includes("cash")) {
      suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Cash-In-Hand", subHeadName: "Cash" };
    } else if (groupStr.includes("capital")) {
      suggestion = { statementType: "BS", groupName: "Owner's Funds", subGroupName: "Share Capital", subHeadName: "Capital" };
    } else if (groupStr.includes("loan") && groupStr.includes("liabilit")) {
      suggestion = { statementType: "BS", groupName: "Non-Current Liabilities", subGroupName: "Unsecured Loans", subHeadName: "Loans" };
    } else if (groupStr.includes("loan") && groupStr.includes("asset")) {
      suggestion = { statementType: "BS", groupName: "Current Assets", subGroupName: "Short Term Loan & Advance", subHeadName: "Loans & Advances" };
    } else if (groupStr.includes("sales")) {
      suggestion = { statementType: "PNL", groupName: "Revenue", subHeadName: "Sales Income" };
    } else if (groupStr.includes("indirect income") || groupStr.includes("other income")) {
      suggestion = { statementType: "PNL", groupName: "Other Income", subHeadName: "Other Income" };
    } else if (groupStr.includes("provision")) {
      suggestion = { statementType: "BS", groupName: "Current Liabilities", subGroupName: "Provisions", subHeadName: "Provisions" };
    } else if (groupStr.includes("investment")) {
      suggestion = { statementType: "BS", groupName: "Non-Current Assets", subGroupName: "Investments", subHeadName: "Investments" };
    } else if (groupStr.includes("suspense")) {
      suggestion = { statementType: "BS", groupName: "Current Liabilities", subGroupName: "Suspense A/c", subHeadName: "Suspense" };
    } 
    
    // 2. Name-based heuristics fallback
    if (!suggestion) {
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
        // Fallback for everything else
        suggestion = { statementType: "PNL", groupName: "Operating Expenses", subHeadName: "General Expenses" };
      }
    }

    return NextResponse.json({ suggestion });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
