const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clients = await prisma.client.findMany({
    include: {
      _count: {
        select: {
          normalizedVouchers: true,
          tallyVouchers: true,
          normalizedLedgers: true
        }
      }
    }
  });

  console.log("Client Stats:");
  for (const c of clients) {
    console.log(`- ID: ${c.id}`);
    console.log(`  Name: ${c.name}`);
    console.log(`  Normalized Vouchers: ${c._count.normalizedVouchers}`);
    console.log(`  Tally Vouchers: ${c._count.tallyVouchers}`);
    console.log(`  Normalized Ledgers: ${c._count.normalizedLedgers}`);
    
    if (c._count.normalizedVouchers > 0) {
      const sample = await prisma.normalizedVoucher.findFirst({
        where: { clientId: c.id },
        orderBy: { date: 'desc' }
      });
      console.log(`  Latest Normalized Voucher Date: ${sample.date}`);
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
