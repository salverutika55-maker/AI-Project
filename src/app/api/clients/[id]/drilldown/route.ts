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
  const { searchParams } = new URL(req.url);
  const statementType = searchParams.get("statementType"); // "PNL" or "BS"
  const subHeadName = searchParams.get("subHeadName");
  const monthsParam = searchParams.get("months"); // e.g. "Apr,May"
  const year = parseInt(searchParams.get("year") || "2026");

  if (!statementType || !subHeadName || !monthsParam) {
    return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
  }

  const requestedMonths = monthsParam.split(",").map(m => m.trim()).filter(Boolean);

  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: session.user.email } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    await authorizeClientAction(user.id, id, "READ_ONLY");

    // 1. Fetch Mapped Ledgers for this Sub-Head
    const mappings = await prisma.unifiedLedgerMapping.findMany({
      where: {
        clientId: id,
        statementType,
        ...(statementType === "PNL" ? { subHeadName } : {})
      }
    });

    const mappedLedgerNames = mappings.map(m => m.softwareLedgerName);
    let totalMappedCount = mappedLedgerNames.length;

    let ledgersWithBalances = [];

    if (statementType === "BS") {
      const allMonths = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
      
      const ledgers = await prisma.normalizedLedger.findMany({
        where: { clientId: id, isActive: true }
      });
      
      // Filter ledgers that belong to this subHeadName (which corresponds to effectiveSubGroup in BS)
      const bsLedgers = ledgers.filter(ledger => {
        const manualMapping = mappings.find(m => m.softwareLedgerName === ledger.name);
        let effectiveGroup = manualMapping ? manualMapping.groupName : ledger.groupName;
        let effectiveSubGroup = manualMapping ? (manualMapping.subGroupName || effectiveGroup) : effectiveGroup;
        
        effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
        
        if (!effectiveGroup) effectiveGroup = "Uncategorized";
        if (["Sales Accounts", "Purchase Accounts", "Direct Expenses", "Direct Incomes", "Indirect Expenses", "Indirect Incomes"].includes(effectiveGroup)) return false;
        
        if (ledger.name.toLowerCase().includes("profit & loss") || ledger.name.toLowerCase().includes("p&l")) {
            mainGroup = "Liabilities";
            effectiveGroup = "Owner's Funds";
            effectiveSubGroup = "Profit & Loss Account";
        } else {
            mainGroup = ledger.nature === "CREDIT" ? "Liabilities" : "Assets";
        }
        
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
        
        effectiveGroup = finalGroup;
        effectiveSubGroup = finalSubGroup;
        
        return effectiveSubGroup === subHeadName;
      });

      let localMappedCount = 0;

      ledgersWithBalances = bsLedgers.map(l => {
        const isMapped = mappings.some(m => m.softwareLedgerName === l.name);
        if (isMapped) localMappedCount++;

        let baseBalanceClose = l.closingBalance;
        let baseBalanceOpen = l.openingBalance;
        let mainGroup = "Assets";
        
        const manualMapping = mappings.find(m => m.softwareLedgerName === l.name);
        let effectiveGroup = manualMapping ? manualMapping.groupName : l.groupName;
        let effectiveSubGroup = manualMapping ? (manualMapping.subGroupName || effectiveGroup) : effectiveGroup;
        
        effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
        if (!effectiveGroup) effectiveGroup = "Uncategorized";
        
        if (l.name.toLowerCase().includes("profit & loss") || l.name.toLowerCase().includes("p&l")) {
            mainGroup = "Liabilities";
            effectiveGroup = "Owner's Funds";
            effectiveSubGroup = "Profit & Loss Account";
        } else {
            mainGroup = l.nature === "CREDIT" ? "Liabilities" : "Assets";
        }

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
        
        effectiveGroup = finalGroup;
        effectiveSubGroup = finalSubGroup;

        baseBalanceOpen = l.openingBalance;
        baseBalanceClose = l.closingBalance;
        
        if (mainGroup === "Assets") {
            baseBalanceOpen = l.nature === "DEBIT" ? Math.abs(baseBalanceOpen) : -Math.abs(baseBalanceOpen);
            baseBalanceClose = l.nature === "DEBIT" ? Math.abs(baseBalanceClose) : -Math.abs(baseBalanceClose);
        } else if (mainGroup === "Liabilities" || mainGroup === "Equity" || mainGroup === "Owner's Funds") {
            baseBalanceOpen = l.nature === "CREDIT" ? Math.abs(baseBalanceOpen) : -Math.abs(baseBalanceOpen);
            baseBalanceClose = l.nature === "CREDIT" ? Math.abs(baseBalanceClose) : -Math.abs(baseBalanceClose);
        }
        
        const amountsByMonth: Record<string, number> = {};
        
        requestedMonths.forEach(month => {
            amountsByMonth[month] = month === "Opening" ? baseBalanceOpen : baseBalanceClose;
        });

        return {
          id: l.id,
          name: l.name,
          nature: l.nature,
          groupName: l.groupName,
          amounts: amountsByMonth,
          isMapped
        };
      });
      
      totalMappedCount = localMappedCount;
      
      // Auto-generated P&L logic for BS
      if (subHeadName === "Profit & Loss Account") {
          const pnlLedgers = ledgers.filter(l => ["Sales Accounts", "Purchase Accounts", "Direct Expenses", "Direct Incomes", "Indirect Expenses", "Indirect Incomes"].includes(l.groupName));
          const netProfitClosing = pnlLedgers.reduce((sum, l) => {
              const isIncome = ["Sales Accounts", "Direct Incomes", "Indirect Incomes"].includes(l.groupName);
              const bal = Math.abs(l.closingBalance);
              if (isIncome) {
                 return sum + (l.nature === "CREDIT" ? bal : -bal);
              } else {
                 return sum - (l.nature === "DEBIT" ? bal : -bal);
              }
          }, 0);
          
          const netProfitOpening = pnlLedgers.reduce((sum, l) => {
              const isIncome = ["Sales Accounts", "Direct Incomes", "Indirect Incomes"].includes(l.groupName);
              const bal = Math.abs(l.openingBalance);
              if (isIncome) {
                 return sum + (l.nature === "CREDIT" ? bal : -bal);
              } else {
                 return sum - (l.nature === "DEBIT" ? bal : -bal);
              }
          }, 0);
          
          const cyProfitAmounts: Record<string, number> = {};
          requestedMonths.forEach(month => {
             const monthIdx = allMonths.indexOf(month);
             let percentage = 0.5 + (0.045 * monthIdx);
             if (month === "Mar") percentage = 1.0;
             
             cyProfitAmounts[month] = netProfitClosing * percentage;
          });
          
          ledgersWithBalances.push({
             id: "cy-profit-system",
             name: "Current Year Profit (Auto)",
             nature: netProfitClosing >= 0 ? "CREDIT" : "DEBIT",
             groupName: "Owner's Funds",
             amounts: cyProfitAmounts,
             isMapped: true
          });
      }

    } else {
      // statementType === "PNL"
      const ledgers = await prisma.normalizedLedger.findMany({
        where: { clientId: id, name: { in: mappedLedgerNames } }
      });

      const monthMap: Record<string, number> = {
        "Jan": 0, "Feb": 1, "Mar": 2, "Apr": 3, "May": 4, "Jun": 5,
        "Jul": 6, "Aug": 7, "Sep": 8, "Oct": 9, "Nov": 10, "Dec": 11
      };
      
      const ledgerIds = ledgers.map(l => l.id);
      
      // We will do a single query for all months by finding min and max dates
      const validMonths = requestedMonths.filter(m => monthMap[m] !== undefined);
      
      const amountsByMonthPerLedger: Record<string, Record<string, number>> = {};
      
      // Initialize map
      ledgerIds.forEach(id => {
         amountsByMonthPerLedger[id] = {};
         validMonths.forEach(m => amountsByMonthPerLedger[id][m] = 0);
      });
      
      if (validMonths.length > 0) {
          const monthNums = validMonths.map(m => monthMap[m]);
          const minMonth = Math.min(...monthNums);
          const maxMonth = Math.max(...monthNums);
          
          let startDate = new Date(year, minMonth, 1);
          let endDate = new Date(year, maxMonth + 1, 0, 23, 59, 59);

          const lines = await prisma.normalizedVoucherLine.findMany({
            where: {
              ledgerId: { in: ledgerIds },
              voucher: {
                 date: { gte: startDate, lte: endDate }
              }
            },
            include: { voucher: { select: { date: true } } }
          });
          
          // Map JS month (0-11) back to our short names
          const reverseMonthMap: Record<number, string> = {
            0: "Jan", 1: "Feb", 2: "Mar", 3: "Apr", 4: "May", 5: "Jun",
            6: "Jul", 7: "Aug", 8: "Sep", 9: "Oct", 10: "Nov", 11: "Dec"
          };

          lines.forEach(line => {
             const mShort = reverseMonthMap[line.voucher.date.getMonth()];
             if (validMonths.includes(mShort)) {
                 const amt = line.amount || 0;
                 if (line.entryType === "DEBIT") {
                     amountsByMonthPerLedger[line.ledgerId][mShort] += amt;
                 } else {
                     amountsByMonthPerLedger[line.ledgerId][mShort] -= amt;
                 }
             }
          });
      }

      ledgersWithBalances = ledgers.map(l => {
         const finalAmounts: Record<string, number> = {};
         const isRevenue = subHeadName.toLowerCase().includes("revenue") || subHeadName.toLowerCase().includes("income") || subHeadName.toLowerCase().includes("sales");
         
         validMonths.forEach(m => {
             let netAmount = amountsByMonthPerLedger[l.id][m] || 0;
             if (isRevenue) netAmount = -netAmount; 
             finalAmounts[m] = Math.abs(netAmount);
         });

         return {
           id: l.id,
           name: l.name,
           nature: l.nature,
           groupName: l.groupName,
           amounts: finalAmounts, 
           isMapped: true
         };
      });
    }

    // Sort by the latest month's amount descending
    const latestMonth = requestedMonths[requestedMonths.length - 1];
    ledgersWithBalances.sort((a, b) => (b.amounts[latestMonth] || 0) - (a.amounts[latestMonth] || 0));

    return NextResponse.json({
      subHeadName,
      statementType,
      months: requestedMonths,
      year,
      totalMapped: totalMappedCount,
      ledgers: ledgersWithBalances
    });

  } catch (error: any) {
    console.error("Drilldown Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
