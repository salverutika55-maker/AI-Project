import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const id = "cmq6n9c6b0001l304y8ya0py5"; 
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: id, isActive: true } });
  
  const voucherLines = await prisma.normalizedVoucherLine.findMany({
      where: { voucher: { clientId: id } },
      select: { ledgerId: true, amount: true, entryType: true }
  });

  const mvmts = {};
  voucherLines.forEach(v => {
      if (!mvmts[v.ledgerId]) mvmts[v.ledgerId] = { dr: 0, cr: 0 };
      if (v.entryType === 'DEBIT') mvmts[v.ledgerId].dr += v.amount;
      else mvmts[v.ledgerId].cr += v.amount;
  });

  console.log("Backward calculation check:");
  const testLedgers = ledgers.filter(l => l.closingBalance !== 0).slice(0, 10);
  
  for (const l of testLedgers) {
      const mv = mvmts[l.id] || {dr:0, cr:0};
      let calcOpen = 0;
      if (l.nature === 'DEBIT') { // Asset or Expense
          calcOpen = l.closingBalance - (mv.dr - mv.cr);
      } else { // Liability or Income
          calcOpen = l.closingBalance - (mv.cr - mv.dr);
      }
      console.log(`${l.name} (${l.nature}) | Close (DB): ${l.closingBalance} | Dr: ${mv.dr} | Cr: ${mv.cr} | Calc Open: ${calcOpen}`);
  }

  process.exit(0);
}

run();
