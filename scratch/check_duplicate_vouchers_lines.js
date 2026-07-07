const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  
  // Find duplicate vouchers by voucherNumber and date
  const duplicates = await prisma.$queryRaw`
    SELECT "voucherNumber", date, COUNT(*) 
    FROM "NormalizedVoucher"
    WHERE "clientId" = ${clientId}
    GROUP BY "voucherNumber", date
    HAVING COUNT(*) > 1
  `;

  console.log(`=== Duplicate Vouchers in Database (${duplicates.length}) ===`);
  for (const d of duplicates) {
    console.log(`- VoucherNo: ${d.voucherNumber} | Date: ${d.date.toISOString().split('T')[0]} | Count: ${d.count}`);
  }

  // Also check if there are duplicate voucher lines on the same voucher for same ledger
  const duplicateLines = await prisma.$queryRaw`
    SELECT "voucherId", "ledgerId", "amount", "entryType", COUNT(*)
    FROM "NormalizedVoucherLine"
    GROUP BY "voucherId", "ledgerId", "amount", "entryType"
    HAVING COUNT(*) > 1
  `;
  console.log(`\n=== Duplicate Voucher Lines on Same Voucher (${duplicateLines.length}) ===`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
