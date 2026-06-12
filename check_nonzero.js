const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const client = await prisma.client.findFirst({ where: { id: 'REDACTED_TEST_BEARER' } });
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: client.id, closingBalance: { not: 0 } } });
  console.log(ledgers.map(l => `${l.name} - ${l.closingBalance} (${l.nature})`));
}
check().finally(() => prisma.$disconnect());
