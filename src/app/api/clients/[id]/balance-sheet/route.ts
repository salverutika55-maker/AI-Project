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

    const ledgerBalances: Record<string, { openBal: number, closeBal: number, nature: string }> = {};
    ledgers.forEach(l => {
      ledgerBalances[l.name] = { openBal: l.openingBalance, closeBal: l.closingBalance, nature: l.nature };
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

    // Combine manual mappings with native Tally groupings for any unmapped ledgers
    ledgers.forEach(ledger => {
      const manualMapping = bsMappings.find(m => m.softwareLedgerName === ledger.name);
      
      // Use manual mapping if it exists, otherwise fall back to native Tally group
      let effectiveGroup = manualMapping ? manualMapping.groupName : ledger.groupName;
      let effectiveSubGroup = manualMapping ? (manualMapping.subGroupName || effectiveGroup) : effectiveGroup;
      
      // Clean non-printable characters from effectiveGroup
      effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
      
      // If the group is still unknown/uncategorized, skip it from BS calculations
      if (!effectiveGroup || effectiveGroup.toLowerCase() === "unknown" || effectiveGroup.toLowerCase() === "uncategorized") {
          return;
      }

      let mainGroup = "";
      if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities", "Capital Account", "Suspense A/c", "Sundry Creditors", "Duties & Taxes", "Loans (Liability)", "Secured Loans", "Unsecured Loans", "Primary", "Reserves & Surplus"].includes(effectiveGroup)) {
        mainGroup = "Liabilities";
      } else if (["Non-Current Assets", "Current Assets", "Fixed Assets", "Investments", "Sundry Debtors", "Cash-in-hand", "Bank Accounts", "Closing Stock", "Deposits (Asset)", "Loans & Advances (Asset)"].includes(effectiveGroup)) {
        mainGroup = "Assets";
      } else {
        // Fallback for PNL groups (skip them for BS)
        if (["Sales Accounts", "Purchase Accounts", "Direct Expenses", "Direct Incomes", "Indirect Expenses", "Indirect Incomes"].includes(effectiveGroup)) return;
        
        // If it's literally the Profit & Loss A/c, it's a Liability (Equity)
        if (ledger.name.toLowerCase().includes("profit & loss") || ledger.name.toLowerCase().includes("p&l")) {
            mainGroup = "Liabilities";
            effectiveGroup = "Owner's Funds";
            effectiveSubGroup = "Profit & Loss Account";
        } else {
            // If we can't reliably guess the BS side, default to Assets
            mainGroup = "Assets";
        }
      }

      const ledgerInfo = ledgerBalances[ledger.name] || { openBal: 0, closeBal: 0, nature: mainGroup === "Assets" ? "DEBIT" : "CREDIT" };
      let openBalance = ledgerInfo.openBal;
      let closeBalance = ledgerInfo.closeBal;
      
      // If it's a Liability, Credit increases it, Debit decreases it.
      // If it's an Asset, Debit increases it, Credit decreases it.
      if (mainGroup === "Liabilities" && ledgerInfo.nature === "DEBIT") {
          openBalance = -Math.abs(openBalance);
          closeBalance = -Math.abs(closeBalance);
      } else if (mainGroup === "Assets" && ledgerInfo.nature === "CREDIT") {
          openBalance = -Math.abs(openBalance);
          closeBalance = -Math.abs(closeBalance);
      }
      
      const months = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
      
      months.forEach((month, idx) => {
        let mockedBalance = openBalance;
        if (month === "Opening") {
            mockedBalance = openBalance;
        } else if (month === "Mar") {
            mockedBalance = closeBalance;
        } else {
            // Interpolate between opening and closing for interim months (1 to 11)
            const progress = idx / 12.0; 
            mockedBalance = openBalance + ((closeBalance - openBalance) * progress);
        } 

        dataNodes.push({
          id: `${ledger.id}-${month}`,
          period: month,
          mainGroup,
          groupName: effectiveGroup,
          subGroupName: effectiveSubGroup,
          subHeadName: manualMapping?.subHeadName,
          ledgerName: ledger.name,
          amount: mockedBalance,
          nature: ledgerInfo.nature
        });
      });
    });

    // 5. Calculate Current Year Profit from PNL
    // Instead of forcing Assets - Liabilities, calculate true Profit from Income & Expense ledgers
    let trueProfitOpening = 0;
    let trueProfitClosing = 0;
    ledgers.forEach(ledger => {
      const manualMapping = bsMappings.find(m => m.softwareLedgerName === ledger.name);
      let effectiveGroup = manualMapping ? manualMapping.groupName : ledger.groupName;
      effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();

      const isIncome = ["Sales Accounts", "Direct Incomes", "Indirect Incomes"].includes(effectiveGroup);
      const isExpense = ["Purchase Accounts", "Direct Expenses", "Indirect Expenses"].includes(effectiveGroup);

      const ledgerInfo = ledgerBalances[ledger.name] || { openBal: 0, closeBal: 0, nature: "CREDIT" };
      
      if (isIncome) {
          trueProfitOpening += (ledgerInfo.nature === "CREDIT" ? ledgerInfo.openBal : -ledgerInfo.openBal);
          trueProfitClosing += (ledgerInfo.nature === "CREDIT" ? ledgerInfo.closeBal : -ledgerInfo.closeBal);
      } else if (isExpense) {
          trueProfitOpening -= (ledgerInfo.nature === "DEBIT" ? ledgerInfo.openBal : -ledgerInfo.openBal);
          trueProfitClosing -= (ledgerInfo.nature === "DEBIT" ? ledgerInfo.closeBal : -ledgerInfo.closeBal);
      }
    });
    
    const finalProfitOpen = trueProfitOpening;
    const finalProfitClose = trueProfitClosing;

    const monthsForProfit = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    monthsForProfit.forEach((month, idx) => {
      let scaledProfit = finalProfitOpen;
      if (month === "Opening") {
          scaledProfit = finalProfitOpen;
      } else if (month === "Mar") {
          scaledProfit = finalProfitClose;
      } else {
          const progress = idx / 12.0; 
          scaledProfit = finalProfitOpen + ((finalProfitClose - finalProfitOpen) * progress);
      }

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

    // 6. Calculate Difference to ensure BS tallies
    const finalAssets = dataNodes.filter(n => n.mainGroup === "Assets" && n.period === "Mar").reduce((sum, n) => sum + (n.amount || 0), 0);
    const finalLiabs = dataNodes.filter(n => n.mainGroup === "Liabilities" && n.period === "Mar").reduce((sum, n) => sum + (n.amount || 0), 0);
    const diff = finalAssets - finalLiabs;

    return NextResponse.json({
      structure,
      dataNodes,
      validation: {
        isBalanced: Math.abs(diff) < 1,
        difference: Math.abs(diff)
      }
    });

  } catch (error: any) {
    console.error("Balance Sheet Fetch Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
