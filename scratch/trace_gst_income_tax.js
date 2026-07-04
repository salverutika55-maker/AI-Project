const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const negativeVoucherLines = await prisma.normalizedVoucherLine.findMany({
    where: {
      amount: { lt: 0 }
    }
  });

  console.log(`Found ${negativeVoucherLines.length} voucher lines with negative values in the database:`);
  for (const vl of negativeVoucherLines) {
    console.log(`- ID: ${vl.id}, LedgerId: ${vl.ledgerId}, Amount: ${vl.amount}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
