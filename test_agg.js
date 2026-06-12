const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const lines = await prisma.normalizedVoucherLine.groupBy({
    by: ['ledgerId'],
    _sum: { amount: true },
    where: {
      entryType: 'DEBIT',
      voucher: { date: { gte: new Date('2024-04-01'), lt: new Date('2025-04-01') } }
    }
  });
  console.log(`Found ${lines.length} debit ledger aggregations`);
}
check().catch(console.error);
