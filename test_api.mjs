import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const clientId = "cmq6n9c6b0001l304y8ya0py5"; 
  const year = 2025;
  const targetFYStart = new Date(`${year}-04-01T00:00:00.000Z`);
  const targetFYEnd = new Date(`${year + 1}-03-31T23:59:59.999Z`);
  
  const voucherLines = await prisma.normalizedVoucherLine.findMany({
    where: { voucher: { clientId } },
    select: { ledgerId: true, amount: true, entryType: true, voucher: { select: { date: true } } }
  });

  const totalMovements = {};
  const preFYMovements = {};
  const monthlyMovements = {};

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
  
  console.log("Movements aggregated.");
  console.log(Object.keys(monthlyMovements).length, "ledgers have movements this FY");
  
  process.exit(0);
}

run();
