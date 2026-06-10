const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { clientId: 'REDACTED_TEST_BEARER', closingBalance: 6000 }
  });
  console.log("Ledgers with exactly 6000 balance:");
  ledgers.forEach(l => console.log(`${l.name} (${l.nature})`));
}
main().catch(console.error).finally(() => prisma.$disconnect());
