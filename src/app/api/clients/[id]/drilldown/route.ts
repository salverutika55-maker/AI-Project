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
      
      // 1. Fetch Vouchers for backward calc
      const voucherLines = await prisma.normalizedVoucherLine.findMany({
        where: { voucher: { clientId: id } },
        select: { ledgerId: true, amount: true, entryType: true, voucher: { select: { date: true } } }
      });

      const totalMovements: Record<string, { debit: number, credit: number }> = {};
      const preFYMovements: Record<string, { debit: number, credit: number }> = {};
      const monthlyMovements: Record<string, Record<string, { debit: number, credit: number }>> = {};
      
      const targetFYStart = new Date(`${year}-04-01T00:00:00.000Z`);
      const targetFYEnd = new Date(`${year + 1}-03-31T23:59:59.999Z`);

      voucherLines.forEach(vl => {
          const d = new Date(vl.voucher.date);
          if (!totalMovements[vl.ledgerId]) totalMovements[vl.ledgerId] = { debit: 0, credit: 0 };
          if (vl.entryType === "DEBIT") totalMovements[vl.ledgerId].debit += vl.amount;
          else totalMovements[vl.ledgerId].credit += vl.amount;
          
          if (d < targetFYStart) {
              if (!preFYMovements[vl.ledgerId]) preFYMovements[vl.ledgerId] = { debit: 0, credit: 0 };
              if (vl.entryType === "DEBIT") preFYMovements[vl.ledgerId].debit += vl.amount;
              else preFYMovements[vl.ledgerId].credit += vl.amount;
          }
          
          if (d >= targetFYStart && d <= targetFYEnd) {
              const monthIndex = d.getMonth();
              const monthsNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
              const mName = monthsNames[monthIndex];
              if (!monthlyMovements[vl.ledgerId]) monthlyMovements[vl.ledgerId] = {};
              if (!monthlyMovements[vl.ledgerId][mName]) monthlyMovements[vl.ledgerId][mName] = { debit: 0, credit: 0 };
              if (vl.entryType === "DEBIT") monthlyMovements[vl.ledgerId][mName].debit += vl.amount;
              else monthlyMovements[vl.ledgerId][mName].credit += vl.amount;
          }
      });

      let localMappedCount = 0;

      ledgers.forEach(l => {
        const manualMapping = mappings.find(m => m.softwareLedgerName === l.name);
        if (manualMapping) localMappedCount++;

        const isPnL = l.name.toLowerCase().includes("profit & loss") || l.name.toLowerCase().includes("p&l");

        if (!manualMapping && !isPnL) {
            return;
        }

        let mainGroup = "";
        let finalGroup = "";
        let finalSubGroup = "";

        if (manualMapping) {
            finalGroup = manualMapping.groupName;
            finalSubGroup = manualMapping.subGroupName || manualMapping.groupName;

            if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities", "Capital Account", "Suspense A/c", "Sundry Creditors", "Duties & Taxes", "Loans (Liability)", "Secured Loans", "Unsecured Loans", "Primary", "Reserves & Surplus"].includes(finalGroup)) {
                mainGroup = "Liabilities";
            } else if (["Non-Current Assets", "Current Assets", "Fixed Assets", "Investments", "Sundry Debtors", "Cash-in-hand", "Bank Accounts", "Closing Stock", "Deposits (Asset)", "Loans & Advances (Asset)"].includes(finalGroup)) {
                mainGroup = "Assets";
            } else {
                mainGroup = l.nature === "CREDIT" ? "Liabilities" : "Assets";
            }
        } else if (isPnL) {
            mainGroup = "Liabilities";
            finalGroup = "Owner's Funds";
            finalSubGroup = "Profit & Loss Account";
        }

        if (finalSubGroup !== subHeadName) return;

        const allTimeMvmt = totalMovements[l.id] || { debit: 0, credit: 0 };
        
        const fyMvmt = { debit: 0, credit: 0 };
        const months = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
        months.forEach(m => {
            if (monthlyMovements[l.id] && monthlyMovements[l.id][m]) {
                fyMvmt.debit += monthlyMovements[l.id][m].debit;
                fyMvmt.credit += monthlyMovements[l.id][m].credit;
            }
        });

        let fyOpening = l.openingBalance;
        if (fyOpening === 0) {
            if (mainGroup === "Assets") {
                fyOpening = l.closingBalance - fyMvmt.debit + fyMvmt.credit;
            } else {
                fyOpening = l.closingBalance - fyMvmt.credit + fyMvmt.debit;
            }
        }

        let runningBalance = fyOpening;
        const amountsByMonth: Record<string, number> = {};
        const fullYearMonths = ["Opening", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"];
        
        fullYearMonths.forEach(m => {
            let exactBalance = 0;
            if (m === "Opening") {
                exactBalance = fyOpening;
            } else if (m === "Mar") {
                exactBalance = l.closingBalance;
                runningBalance = exactBalance;
            } else {
                const mvmt = (monthlyMovements[l.id] && monthlyMovements[l.id][m]) || { debit: 0, credit: 0 };
                if (mainGroup === "Assets") {
                    runningBalance = runningBalance + mvmt.debit - mvmt.credit;
                } else {
                    runningBalance = runningBalance + mvmt.credit - mvmt.debit;
                }
                exactBalance = runningBalance;
            }
            if (requestedMonths.includes(m)) {
                amountsByMonth[m] = exactBalance;
            }
        });

        ledgersWithBalances.push({
          id: l.id,
          name: l.name,
          nature: l.nature,
          groupName: finalGroup,
          amounts: amountsByMonth,
          isMapped: !!manualMapping
        });
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
