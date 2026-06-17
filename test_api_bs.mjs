import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const client = await prisma.client.findFirst();
  if (!client) return console.log("No client found");
  const id = client.id;
  
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { clientId: id, isActive: true }
  });

  const voucherLines = await prisma.normalizedVoucherLine.findMany({
      where: { voucher: { clientId: id } },
      select: {
        ledgerId: true,
        amount: true,
        entryType: true,
        voucher: { select: { date: true } }
      }
  });
  console.log(`Found ${ledgers.length} ledgers and ${voucherLines.length} voucher lines`);
  
  const bsMappings = await prisma.unifiedLedgerMapping.findMany({
    where: { clientId: id, statementType: "BS" }
  });
  
  // Aggregate movements per ledger per month
  const monthlyMovements = {};
  voucherLines.forEach(vl => {
      const monthIndex = vl.voucher.date.getMonth(); // 0 = Jan
      const monthsNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const mName = monthsNames[monthIndex];
      
      if (!monthlyMovements[vl.ledgerId]) monthlyMovements[vl.ledgerId] = {};
      if (!monthlyMovements[vl.ledgerId][mName]) monthlyMovements[vl.ledgerId][mName] = { debit: 0, credit: 0 };
      
      if (vl.entryType === "DEBIT") monthlyMovements[vl.ledgerId][mName].debit += vl.amount;
      else monthlyMovements[vl.ledgerId][mName].credit += vl.amount;
  });

  const targetLedgers = ledgers.filter(l => l.closingBalance !== 0 || monthlyMovements[l.id]);
  
  let totalDataNodes = 0;
  
  targetLedgers.forEach(ledger => {
      const manualMapping = bsMappings.find(m => m.softwareLedgerName.toLowerCase() === ledger.name.toLowerCase());
      let effectiveGroup = manualMapping ? manualMapping.groupName : ledger.groupName;
      let effectiveSubGroup = manualMapping?.subGroupName || "Uncategorized";
      
      let mainGroup = "Unknown";
      if (["Share Capital", "Reserves & Surplus", "Profit & Loss Account"].includes(effectiveGroup)) mainGroup = "Liabilities";
      else if (["Long Term Borrowings", "Deferred Tax Liabilities (Net)", "Other Long term Liabilities", "Long Term Provisions"].includes(effectiveGroup)) mainGroup = "Liabilities";
      else if (["Short Term Borrowings", "Trade Payables", "Other Current Liabilities", "Short Term Provisions"].includes(effectiveGroup)) mainGroup = "Liabilities";
      else if (["Fixed Assets", "Non-Current Investments", "Deferred Tax Assets (Net)", "Long Term Loans and Advances", "Other Non-Current Assets"].includes(effectiveGroup)) mainGroup = "Assets";
      else if (["Current Investments", "Inventories", "Trade Receivables", "Cash and Cash Equivalents", "Short Term Loans and Advances", "Other Current Assets"].includes(effectiveGroup)) mainGroup = "Assets";
      else if (effectiveGroup === "Suspense A/c") mainGroup = "Liabilities";
      
      if (mainGroup !== "Unknown") {
          totalDataNodes++;
          console.log(`Mapped Ledger: ${ledger.name} -> Main: ${mainGroup}, Group: ${effectiveGroup}, SubGroup: ${effectiveSubGroup}`);
      }
  });
  console.log(`Total active BS ledgers mapped: ${totalDataNodes}`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
