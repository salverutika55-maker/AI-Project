import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const c = await prisma.unifiedLedgerMapping.findFirst({
      where: { statementType: "BS" }
  });
  if (!c) {
      console.log("No client found");
      return;
  }
  const clientId = c.clientId;
  
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { clientId: clientId, isActive: true },
    take: 5
  });
  console.log(ledgers.map(l => ({ name: l.name, openBal: l.openingBalance, closeBal: l.closingBalance })));
}

run().catch(console.error).finally(() => prisma.$disconnect());
