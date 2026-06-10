const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const vouchers = await prisma.tallyVoucher.findMany({
    take: 5
  });
  console.log("Vouchers:", vouchers.length);
  if (vouchers.length > 0) {
    console.log("Sample voucher:", vouchers[0]);
    const counts = await prisma.tallyVoucher.groupBy({
      by: ['clientId'],
      _count: true
    });
    console.log("Counts per client:", counts);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
