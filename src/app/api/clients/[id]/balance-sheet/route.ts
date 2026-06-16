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

    // 2.5 Fetch Voucher Lines for rolling balances
    const voucherLines = await prisma.normalizedVoucherLine.findMany({
      where: { voucher: { clientId: id } },
      select: {
        ledgerId: true,
        amount: true,
        entryType: true,
        voucher: { select: { date: true } }
      }
    });

    // Aggregate movements per ledger per month
    const monthlyMovements: Record<string, Record<string, { debit: number, credit: number }>> = {};
    voucherLines.forEach(vl => {
        const monthIndex = vl.voucher.date.getMonth(); // 0 = Jan
        const monthsNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const mName = monthsNames[monthIndex];
        
        if (!monthlyMovements[vl.ledgerId]) monthlyMovements[vl.ledgerId] = {};
        if (!monthlyMovements[vl.ledgerId][mName]) monthlyMovements[vl.ledgerId][mName] = { debit: 0, credit: 0 };
        
        if (vl.entryType === "DEBIT") monthlyMovements[vl.ledgerId][mName].debit += vl.amount;
        else monthlyMovements[vl.ledgerId][mName].credit += vl.amount;
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
      let effectiveGroup = ledger.groupName;
      let effectiveSubGroup = ledger.groupName;
      
      // Check unified mapping
      const customMapping = bsMappings.find(m => m.softwareLedgerName.toLowerCase() === ledger.name.toLowerCase());
      if (customMapping) {
        effectiveGroup = customMapping.groupName;
        effectiveSubGroup = customMapping.subGroupName || customMapping.groupName;
      } else {
        effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
        if (!effectiveGroup || effectiveGroup === "Unknown" || effectiveGroup === "Uncategorized") {
          // Heuristic guessing based on ledger name
          const n = ledger.name.toLowerCase();
          if (n.includes("bank") || n.includes("hdfc") || n.includes("icici") || n.includes("sbi")) {
            effectiveGroup = "Bank Accounts";
          } else if (n.includes("cash")) {
            effectiveGroup = "Cash-in-hand";
          } else if (n.includes("capital") || n.includes("equity")) {
            effectiveGroup = "Capital Account";
          } else if (n.includes("gst") || n.includes("tax") || n.includes("tds") || n.includes("duty") || n.includes("cgst") || n.includes("sgst") || n.includes("igst")) {
            effectiveGroup = "Duties & Taxes";
          } else if (n.includes("loan") || n.includes("borrowing")) {
            effectiveGroup = ledger.nature === "CREDIT" ? "Secured Loans" : "Loans & Advances (Asset)";
          } else if (n.includes("stock") || n.includes("inventory")) {
            effectiveGroup = "Closing Stock";
          } else if (n.includes("depreciation") || n.includes("asset") || n.includes("furniture") || n.includes("computer") || n.includes("machinery") || n.includes("vehicle") || n.includes("building")) {
            effectiveGroup = "Fixed Assets";
          } else if (n.includes("investment") || n.includes("deposit")) {
            effectiveGroup = "Investments";
          } else if (n.includes("payable") || n.includes("creditor") || n.includes("vendor")) {
            effectiveGroup = "Sundry Creditors";
          } else if (n.includes("receivable") || n.includes("debtor") || n.includes("customer")) {
            effectiveGroup = "Sundry Debtors";
          } else if (n.includes("profit") || n.includes("p&l")) {
            effectiveGroup = "Reserves & Surplus";
          } else {
            // Default based on nature
            effectiveGroup = ledger.nature === "CREDIT" ? "Current Liabilities" : "Current Assets";
          }
          effectiveSubGroup = effectiveGroup;
        }
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
            // Default based on strict accounting nature if group is unknown
            const info = ledgerBalances[ledger.name] || { nature: "DEBIT" };
            mainGroup = info.nature === "CREDIT" ? "Liabilities" : "Assets";
        }
      }

      // STRICT MAPPING TO PREDEFINED TEMPLATE
      // This ensures we NEVER inject dynamic Tally-specific groups ("Uncategorized", "Sundry Debtors") into the UI.
      let finalGroup = mainGroup === "Assets" ? "Current Assets" : "Current Liabilities";
      let finalSubGroup = mainGroup === "Assets" ? "Other Current Assets" : "Other Current Liabilities";
      
      const gMatch = effectiveGroup.toLowerCase();
      
      if (mainGroup === "Liabilities") {
          if (["owner's funds", "capital account", "reserves & surplus", "retained earnings"].some(x => gMatch.includes(x))) {
              finalGroup = "Owner's Funds";
              finalSubGroup = gMatch.includes("capital") ? "Share Capital" : (gMatch.includes("profit") ? "Profit & Loss Account" : "Reserves & Surplus");
          } else if (["non-current", "long term", "secured loans", "unsecured loans", "loans (liability)"].some(x => gMatch.includes(x))) {
              finalGroup = "Non-Current Liabilities";
              finalSubGroup = "Unsecured Loans";
          } else {
              finalGroup = "Current Liabilities";
              if (["duties & taxes", "tax"].some(x => gMatch.includes(x))) finalSubGroup = "Duties & Taxes";
              else if (["suspense"].some(x => gMatch.includes(x))) finalSubGroup = "Suspense A/c";
              else if (["sundry creditors", "trade payable", "sundry creditor"].some(x => gMatch.includes(x))) finalSubGroup = "Trade Payable";
              else if (["provisions", "provision"].some(x => gMatch.includes(x))) finalSubGroup = "Provisions";
              else if (["short term borrowing", "bank od"].some(x => gMatch.includes(x))) finalSubGroup = "Short Term Borrowing";
              else finalSubGroup = "Other Current Liabilities";
          }
      } else {
          if (["branch", "division"].some(x => gMatch.includes(x))) {
              finalGroup = "Branch Account";
              finalSubGroup = "Branch Account";
          } else if (["non-current", "fixed assets", "investments", "investment"].some(x => gMatch.includes(x))) {
              finalGroup = "Non-Current Assets";
              finalSubGroup = gMatch.includes("investment") ? "Investments" : "Fixed Assets";
          } else {
              finalGroup = "Current Assets";
              if (["closing stock", "inventory", "stock"].some(x => gMatch.includes(x))) finalSubGroup = "Closing Stock";
              else if (["sundry debtors", "trade receivable", "sundry debtor"].some(x => gMatch.includes(x))) finalSubGroup = "Trade Receivable";
              else if (["cash"].some(x => gMatch.includes(x))) finalSubGroup = "Cash-In-Hand";
              else if (["bank"].some(x => gMatch.includes(x))) finalSubGroup = "Bank Accounts";
              else if (["deposit"].some(x => gMatch.includes(x))) finalSubGroup = "Deposits (Assets)";
              else if (["loan", "advance"].some(x => gMatch.includes(x))) finalSubGroup = "Short Term Loan & Advance";
              else finalSubGroup = "Other Current Assets";
          }
      }
      
      // Override effective variables to strictly adhere to standard format
      effectiveGroup = finalGroup;
      effectiveSubGroup = finalSubGroup;

      const ledgerInfo = ledgerBalances[ledger.name] || { openBal: 0, closeBal: 0, nature: mainGroup === "Assets" ? "DEBIT" : "CREDIT" };
      
      const months = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
      
      // Initialize running balance using CA logic
      let runningBalance = ledgerInfo.nature === "DEBIT" ? Math.abs(ledgerInfo.openBal) : -Math.abs(ledgerInfo.openBal);
      
      months.forEach((month, idx) => {
        if (month !== "Opening") {
            const mvmt = (monthlyMovements[ledger.id] && monthlyMovements[ledger.id][month]) || { debit: 0, credit: 0 };
            runningBalance += (mvmt.debit - mvmt.credit);
        }

        // Apply strict signs per user instruction:
        // Asset: Opening Balance + Debit - Credit (which is exactly runningBalance)
        // Liability: Opening Balance + Credit - Debit (which is -runningBalance)
        let displayBalance = mainGroup === "Assets" ? runningBalance : -runningBalance;
        
        dataNodes.push({
          id: `${ledger.id}-${month}`,
          period: month,
          mainGroup,
          groupName: effectiveGroup,
          subGroupName: effectiveSubGroup,
          subHeadName: customMapping?.subHeadName,
          ledgerName: ledger.name,
          amount: displayBalance,
          nature: ledgerInfo.nature
        });
      });
    });

    // 5. Calculate Current Year Profit from PNL dynamically
    const profitMovements: Record<string, number> = {};
    const monthsForProfit = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];
    monthsForProfit.forEach(m => profitMovements[m] = 0);

    ledgers.forEach(ledger => {
      const manualMapping = bsMappings.find(m => m.softwareLedgerName.toLowerCase() === ledger.name.toLowerCase());
      let effectiveGroup = manualMapping ? manualMapping.groupName : ledger.groupName;
      effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();

      const isIncome = ["Sales Accounts", "Direct Incomes", "Indirect Incomes"].includes(effectiveGroup);
      const isExpense = ["Purchase Accounts", "Direct Expenses", "Indirect Expenses"].includes(effectiveGroup);

      if (isIncome || isExpense) {
          const ledgerInfo = ledgerBalances[ledger.name] || { openBal: 0, closeBal: 0, nature: "CREDIT" };
          let runBal = ledgerInfo.nature === "DEBIT" ? Math.abs(ledgerInfo.openBal) : -Math.abs(ledgerInfo.openBal);
          
          monthsForProfit.forEach(month => {
              if (month !== "Opening") {
                  const mvmt = (monthlyMovements[ledger.id] && monthlyMovements[ledger.id][month]) || { debit: 0, credit: 0 };
                  runBal += (mvmt.debit - mvmt.credit);
              }
              // Income normal is Credit, Expense normal is Debit
              // So Profit = Income (Credit = -runBal) - Expense (Debit = runBal)
              if (isIncome) {
                  profitMovements[month] += (-runBal);
              } else if (isExpense) {
                  profitMovements[month] -= (runBal);
              }
          });
      }
    });

    monthsForProfit.forEach(month => {
      const exactProfit = profitMovements[month] || 0;
      dataNodes.push({
        id: `cy-profit-system-${month}`,
        period: month,
        mainGroup: "Liabilities",
        groupName: "Owner's Funds",
        subGroupName: "Profit & Loss Account",
        subHeadName: "Current Year Profit",
        ledgerName: "P&L Account (Auto)",
        amount: exactProfit,
        nature: exactProfit >= 0 ? "CREDIT" : "DEBIT"
      });
    });

    // 6. Calculate Difference to ensure BS tallies
    const finalAssets = dataNodes.filter(n => n.mainGroup === "Assets" && n.period === "Feb").reduce((sum, n) => sum + (n.amount || 0), 0);
    const finalLiabs = dataNodes.filter(n => n.mainGroup === "Liabilities" && n.period === "Feb").reduce((sum, n) => sum + (n.amount || 0), 0);
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
