const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  
  // 1. Group by voucherNumber and date to find duplicate counts
  const duplicates = await prisma.$queryRaw`
    SELECT "voucherNumber", "date", COUNT(*) as c
    FROM "NormalizedVoucher"
    WHERE "clientId" = ${clientId}
    GROUP BY "voucherNumber", "date"
    HAVING COUNT(*) > 1
    ORDER BY c DESC
    LIMIT 20
  `;

  console.log(`=== CHECK FOR DUPLICATE VOUCHER NUMBERS IN CLIENT ===`);
  console.log(`Found ${duplicates.length} duplicate voucherNumber/date combinations:`);
  for (const d of duplicates) {
    console.log(`- Voucher #: ${d.voucherNumber}, Date: ${d.date}, Count: ${d.c}`);
  }

  // 2. Group by tallyGuid or stable identity if available
  // Wait, does NormalizedVoucher have tallyGuid?
  // Let's check the schema. In schema.prisma:
  // model NormalizedVoucher has: id, clientId, voucherNumber, date, type, narration, totalAmount, referenceNo, isManual
  // Wait! NormalizedVoucher does NOT have tallyGuid!
  // TallyVoucher has tallyGuid, but NormalizedVoucher does not!
  // Let's check if there are duplicate voucherNumber/date/totalAmount combinations
  const duplicatesByAmount = await prisma.$queryRaw`
    SELECT "voucherNumber", "date", "totalAmount", COUNT(*) as c
    FROM "NormalizedVoucher"
    WHERE "clientId" = ${clientId}
    GROUP BY "voucherNumber", "date", "totalAmount"
    HAVING COUNT(*) > 1
    ORDER BY c DESC
    LIMIT 20
  `;
  
  console.log(`\n=== CHECK FOR DUPLICATE VOUCHERS BY AMOUNT ===`);
  console.log(`Found ${duplicatesByAmount.length} duplicate voucherNumber/date/amount combinations:`);
  for (const d of duplicatesByAmount) {
    console.log(`- Voucher #: ${d.voucherNumber}, Date: ${d.date}, Amount: ${d.totalAmount}, Count: ${d.c}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
