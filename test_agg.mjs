import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const id = "cm0j91j5q0000a6o8h1n3w719";
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: id, isActive: true } });
  
  const ledgerBalances = {};
  ledgers.forEach(l => {
    ledgerBalances[l.name] = { openBal: l.openingBalance, closeBal: l.closingBalance, nature: l.nature };
  });

  const voucherLines = await prisma.normalizedVoucherLine.findMany({
    where: { voucher: { clientId: id } },
    include: { voucher: true }
  });

  const monthlyMovements = {};
  voucherLines.forEach(vl => {
      const monthIndex = vl.voucher.date.getMonth();
      const monthsNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const mName = monthsNames[monthIndex];
      
      if (!monthlyMovements[vl.ledgerId]) monthlyMovements[vl.ledgerId] = {};
      if (!monthlyMovements[vl.ledgerId][mName]) monthlyMovements[vl.ledgerId][mName] = { debit: 0, credit: 0 };
      
      if (vl.entryType === "DEBIT") monthlyMovements[vl.ledgerId][mName].debit += vl.amount;
      else monthlyMovements[vl.ledgerId][mName].credit += vl.amount;
  });

  const bsMappings = await prisma.unifiedLedgerMapping.findMany({
    where: { clientId: id, statementType: "BS" }
  });

  const dataNodes = [];
  
  ledgers.forEach(ledger => {
      let effectiveGroup = ledger.groupName;
      let effectiveSubGroup = ledger.groupName;
      
      const customMapping = bsMappings.find(m => m.softwareLedgerName.toLowerCase() === ledger.name.toLowerCase());
      if (customMapping) {
        effectiveGroup = customMapping.groupName;
        effectiveSubGroup = customMapping.subGroupName || customMapping.groupName;
      } else {
        effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
        if (!effectiveGroup || effectiveGroup === "Unknown" || effectiveGroup === "Uncategorized") {
          const n = ledger.name.toLowerCase();
          if (n.includes("bank")) effectiveGroup = "Bank Accounts";
          else effectiveGroup = ledger.nature === "CREDIT" ? "Current Liabilities" : "Current Assets";
        }
      }

      let mainGroup = "";
      if (["Current Liabilities"].includes(effectiveGroup)) mainGroup = "Liabilities";
      else if (["Current Assets"].includes(effectiveGroup)) mainGroup = "Assets";
      else mainGroup = ledgerBalances[ledger.name]?.nature === "CREDIT" ? "Liabilities" : "Assets";

      let finalGroup = mainGroup === "Assets" ? "Current Assets" : "Current Liabilities";
      let finalSubGroup = mainGroup === "Assets" ? "Other Current Assets" : "Other Current Liabilities";
      
      effectiveGroup = finalGroup;
      effectiveSubGroup = finalSubGroup;

      const ledgerInfo = ledgerBalances[ledger.name] || { openBal: 0, closeBal: 0, nature: mainGroup === "Assets" ? "DEBIT" : "CREDIT" };
      let runningBalance = ledgerInfo.nature === "DEBIT" ? Math.abs(ledgerInfo.openBal) : -Math.abs(ledgerInfo.openBal);
      
      const months = ["Opening", "Apr", "May"];
      months.forEach((month) => {
        if (month !== "Opening") {
            const mvmt = (monthlyMovements[ledger.id] && monthlyMovements[ledger.id][month]) || { debit: 0, credit: 0 };
            runningBalance += (mvmt.debit - mvmt.credit);
        }
        let displayBalance = mainGroup === "Assets" ? runningBalance : -runningBalance;
        
        dataNodes.push({
          period: month,
          mainGroup,
          groupName: effectiveGroup,
          subGroupName: effectiveSubGroup,
          amount: displayBalance
        });
      });
  });

  const getSubGroupTotal = (main, group, subGroup, month) => {
    return dataNodes.filter(n => n.mainGroup === main && n.groupName === group && n.subGroupName === subGroup && n.period === month)
      .reduce((sum, n) => sum + n.amount, 0); 
  };
  
  const getMainTotal = (main, month) => {
    return dataNodes.filter(n => n.mainGroup === main && n.period === month)
      .reduce((sum, n) => sum + n.amount, 0);
  };

  console.log("Main Total Assets Apr:", getMainTotal("Assets", "Apr"));
  console.log("Subgroup Total (Assets > Current Assets > Other Current Assets) Apr:", getSubGroupTotal("Assets", "Current Assets", "Other Current Assets", "Apr"));

  process.exit(0);
}

run();
