import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const id = "cmq6n9c6b0001l304y8ya0py5"; 
  
  const voucherLines = await prisma.normalizedVoucherLine.findMany({
      where: { voucher: { clientId: id }, ledger: { name: 'Cosmos Bank( HUF)' } },
      select: { amount: true, entryType: true, voucher: { select: { date: true, voucherNumber: true } } },
      orderBy: { voucher: { date: 'asc' } }
  });

  let balance = 0; // Assuming 0 opening
  console.log("Vouchers for Cosmos Bank( HUF):");
  voucherLines.forEach(vl => {
      if (vl.entryType === 'DEBIT') balance += vl.amount;
      else balance -= vl.amount;
      console.log(`${vl.voucher.date.toISOString().split('T')[0]} | ${vl.entryType} | ${vl.amount} | Bal: ${balance.toFixed(2)}`);
  });

  process.exit(0);
}

run();
