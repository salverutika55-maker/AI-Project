const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { clientId: 'REDACTED_TEST_BEARER', name: { in: ['Rajesh Shinde', 'Supriya Shinde'] } }
  });
  console.log("Ledgers:", ledgers.map(l => ({ name: l.name, bal: l.closingBalance })));
}
main().catch(console.error).finally(() => prisma.$disconnect());
