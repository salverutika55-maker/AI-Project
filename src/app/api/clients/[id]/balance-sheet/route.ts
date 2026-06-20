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
  const { searchParams } = new URL(req.url);
  const selectedYear = parseInt(searchParams.get("year") || new Date().getFullYear().toString());

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
    const mappedLedgerNames = new Set<string>();
    ledgers.forEach(l => {
      ledgerBalances[l.name] = { openBal: l.openingBalance, closeBal: l.closingBalance, nature: l.nature };
    });
    bsMappings.forEach(m => mappedLedgerNames.add(m.softwareLedgerName.toLowerCase()));

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

    // Calculate All-Time movements (for backward calculation of Time 0)
    const totalMovements: Record<string, { debit: number, credit: number }> = {};
    const preFYMovements: Record<string, { debit: number, credit: number }> = {};
    const monthlyMovements: Record<string, Record<string, { debit: number, credit: number }>> = {};
    
    const targetFYStart = new Date(`${selectedYear}-04-01T00:00:00.000Z`);
    const targetFYEnd = new Date(`${selectedYear + 1}-03-31T23:59:59.999Z`);

    voucherLines.forEach(vl => {
        const d = new Date(vl.voucher.date);
        
        // All-Time
        if (!totalMovements[vl.ledgerId]) totalMovements[vl.ledgerId] = { debit: 0, credit: 0 };
        if (vl.entryType === "DEBIT") totalMovements[vl.ledgerId].debit += vl.amount;
        else totalMovements[vl.ledgerId].credit += vl.amount;
        
        // Pre-FY
        if (d < targetFYStart) {
            if (!preFYMovements[vl.ledgerId]) preFYMovements[vl.ledgerId] = { debit: 0, credit: 0 };
            if (vl.entryType === "DEBIT") preFYMovements[vl.ledgerId].debit += vl.amount;
            else preFYMovements[vl.ledgerId].credit += vl.amount;
        }
        
        // Current FY Monthly
        if (d >= targetFYStart && d <= targetFYEnd) {
            const monthIndex = d.getMonth(); // 0 = Jan
            const monthsNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const mName = monthsNames[monthIndex];
            
            if (!monthlyMovements[vl.ledgerId]) monthlyMovements[vl.ledgerId] = {};
            if (!monthlyMovements[vl.ledgerId][mName]) monthlyMovements[vl.ledgerId][mName] = { debit: 0, credit: 0 };
            
            if (vl.entryType === "DEBIT") monthlyMovements[vl.ledgerId][mName].debit += vl.amount;
            else monthlyMovements[vl.ledgerId][mName].credit += vl.amount;
        }
    });

    // 3. Define standard BS Structure
    const structure: any = {
      "Liabilities": {
        "Owner's Funds": {
          "Capital Account": {},
          "Reserves & Surplus": {},
          "Profit & Loss Account": {}
        },
        "Non-Current Liabilities": {
          "Secured Loans": {},
          "Unsecured Loans": {}
        },
        "Current Liabilities": {
          "Short Term Borrowing": {},
          "Duties & Taxes": {},
          "Suspense A/c": {},
          "Trade Payables": {},
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
          "Trade Receivables": {},
          "Cash-in-hand": {},
          "Bank Accounts": {},
          "Deposits (Asset)": {},
          "Loans & Advances (Asset)": {},
          "Other Current Assets": {}
        },
        "Branch Account": {}
      }
    };

    // 4. Map ledgers into structure
    const dataNodes: any[] = [];
    const assetGroupNames = new Set([
      "Non-Current Assets", "Current Assets", "Fixed Assets", "Investments", "Sundry Debtors",
      "Cash-in-hand", "Bank Accounts", "Closing Stock", "Deposits (Asset)", "Loans & Advances (Asset)"
    ]);
    const liabilityGroupNames = new Set([
      "Owner's Funds", "Non-Current Liabilities", "Current Liabilities", "Capital Account",
      "Suspense A/c", "Sundry Creditors", "Duties & Taxes", "Loans (Liability)", "Secured Loans",
      "Unsecured Loans", "Primary", "Reserves & Surplus"
    ]);

    ledgers.forEach(ledger => {
      const customMapping = bsMappings.find(m => m.softwareLedgerName.toLowerCase() === ledger.name.toLowerCase());
      const isPnL = ledger.name.toLowerCase().includes("profit & loss") || ledger.name.toLowerCase().includes("p&l");

      if (!customMapping && !isPnL) {
        return;
      }

      const resolvedGroup = customMapping?.groupName || "";
      const resolvedSubGroup = customMapping?.subGroupName || customMapping?.groupName || "";
      const resolvedSubHead = customMapping?.subHeadName || resolvedSubGroup || resolvedGroup;

      const mainGroup = customMapping
        ? (liabilityGroupNames.has(resolvedGroup) ? "Liabilities" : assetGroupNames.has(resolvedGroup) ? "Assets" : (ledgerBalances[ledger.name]?.nature === "CREDIT" ? "Liabilities" : "Assets"))
        : "Liabilities";

      const effectiveGroup = customMapping ? customMapping.groupName : "Owner's Funds";
      const effectiveSubGroup = isPnL ? "Profit & Loss Account" : resolvedSubHead;

      if (!structure[mainGroup]) structure[mainGroup] = {};
      if (!structure[mainGroup][effectiveGroup]) structure[mainGroup][effectiveGroup] = {};
      if (!structure[mainGroup][effectiveGroup][effectiveSubGroup]) structure[mainGroup][effectiveGroup][effectiveSubGroup] = {};

      const ledgerInfo = ledgerBalances[ledger.name] || { openBal: ledger.openingBalance, closeBal: ledger.closingBalance, nature: mainGroup === "Assets" ? "DEBIT" : "CREDIT" };
      const fyMvmt = { debit: 0, credit: 0 };
      const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
      months.forEach(m => {
        if (monthlyMovements[ledger.id] && monthlyMovements[ledger.id][m]) {
          fyMvmt.debit += monthlyMovements[ledger.id][m].debit;
          fyMvmt.credit += monthlyMovements[ledger.id][m].credit;
        }
      });

      const preFY = preFYMovements[ledger.id] || { debit: 0, credit: 0 };
      let fyOpening = ledger.openingBalance;
      if (fyOpening === 0) {
        if (ledger.closingBalance !== 0) {
          fyOpening = ledger.closingBalance - fyMvmt.debit + fyMvmt.credit;
        } else {
          fyOpening = preFY.debit - preFY.credit;
        }
      }

      const allMonths = ["Opening", ...months];
      let runningBalance = fyOpening;

      allMonths.forEach((month) => {
        let exactBalance = 0;

        if (month === "Opening") {
          exactBalance = fyOpening;
        } else {
          const mvmt = (monthlyMovements[ledger.id] && monthlyMovements[ledger.id][month]) || { debit: 0, credit: 0 };
          const startBal = runningBalance;
          runningBalance = startBal + mvmt.debit - mvmt.credit;
          exactBalance = runningBalance;

          if (month === months[months.length - 1]) {
            console.log(JSON.stringify({
              ledger: ledger.name,
              opening: startBal,
              debit: mvmt.debit,
              credit: mvmt.credit,
              formula_used: "opening + debit - credit",
              calculated_closing: exactBalance,
              displayed_balance: exactBalance
            }, null, 2));
          }
        }

        dataNodes.push({
          id: `${ledger.id}-${month}`,
          ledgerId: ledger.id,
          period: month,
          mainGroup,
          groupName: effectiveGroup,
          subGroupName: effectiveSubGroup,
          subHeadName: customMapping?.subHeadName,
          ledgerName: ledger.name,
          amount: exactBalance,
          nature: ledgerInfo.nature
        });
      });
    });

    // 5. Calculate Current Year Profit from PNL dynamically
    const profitMovements: Record<string, number> = {};
    const fullMonths = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
    fullMonths.forEach(m => profitMovements[m] = 0);

    ledgers.forEach(ledger => {
      const manualMapping = bsMappings.find(m => m.softwareLedgerName.toLowerCase() === ledger.name.toLowerCase());
      let effectiveGroup = manualMapping ? manualMapping.groupName : ledger.groupName;
      effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();

      const isIncome = ["Sales Accounts", "Direct Incomes", "Indirect Incomes"].includes(effectiveGroup);
      const isExpense = ["Purchase Accounts", "Direct Expenses", "Indirect Expenses"].includes(effectiveGroup);

      if (isIncome || isExpense) {
          // P&L ledgers always start the year with 0 balance
          let runBal = 0; 
          
          fullMonths.forEach(month => {
              if (month !== "Opening") {
                  const mvmt = (monthlyMovements[ledger.id] && monthlyMovements[ledger.id][month]) || { debit: 0, credit: 0 };
                  runBal += (mvmt.debit - mvmt.credit);
              }
              // Income normal is Credit (-), Expense normal is Debit (+)
              // Profit = Income - Expense
              if (isIncome) {
                  profitMovements[month] += (-runBal);
              } else if (isExpense) {
                  profitMovements[month] -= (runBal);
              }
          });
      }
    });

    fullMonths.forEach(month => {
      const exactProfit = profitMovements[month] || 0;
      dataNodes.push({
        id: `cy-profit-system-${month}`,
        ledgerId: `cy-profit-system-${month}`,
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

    // 6. Calculate Difference to ensure BS tallies (just for sanity check)
    const finalAssets = dataNodes.filter(n => n.mainGroup === "Assets" && n.period === "Mar").reduce((sum, n) => sum + (n.amount || 0), 0);
    const finalLiabs = dataNodes.filter(n => n.mainGroup === "Liabilities" && n.period === "Mar").reduce((sum, n) => sum + (n.amount || 0), 0);
    const diff = finalAssets - finalLiabs;

    const unmappedLedgers = ledgers.filter(l => !mappedLedgerNames.has(l.name.toLowerCase()) && !l.name.toLowerCase().includes("profit & loss") && !l.name.toLowerCase().includes("p&l")).map(l => ({
      id: l.id,
      name: l.name,
      groupName: l.groupName,
      openingBalance: l.openingBalance,
      closingBalance: l.closingBalance,
      nature: l.nature
    }));

    return NextResponse.json({
      structure,
      dataNodes,
      validation: {
        isBalanced: Math.abs(diff) < 1,
        difference: Math.abs(diff)
      },
      audit: {
        totalMappings: bsMappings.length,
        totalActiveLedgers: ledgers.length,
        unmappedActiveLedgers: unmappedLedgers.length,
        unmappedLedgers
      }
    });

  } catch (error: any) {
    console.error("Balance Sheet Fetch Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
