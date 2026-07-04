const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clients = await prisma.client.findMany();
  console.log(`Found ${clients.length} clients:`);
  for (const c of clients) {
    const ledgersCount = await prisma.normalizedLedger.count({ where: { clientId: c.id } });
    const activeLedgersCount = await prisma.normalizedLedger.count({ where: { clientId: c.id, isActive: true } });
    const vouchersCount = await prisma.normalizedVoucher.count({ where: { clientId: c.id } });
    const mappingsCount = await prisma.unifiedLedgerMapping.count({ where: { clientId: c.id } });
    console.log(`- ID: ${c.id}`);
    console.log(`  Name: ${c.name}, Software: ${c.software}`);
    console.log(`  Ledgers: ${ledgersCount} (Active: ${activeLedgersCount}), Vouchers: ${vouchersCount}, Mappings: ${mappingsCount}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
