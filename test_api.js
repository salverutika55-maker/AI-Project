const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const client = await prisma.client.findFirst({ where: { id: 'REDACTED_TEST_BEARER' } });
  
  const mappings = await prisma.unifiedLedgerMapping.findMany({ 
      where: { clientId: client.id, statementType: 'BS' } 
  });
  
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: client.id } });
  
  for (const m of mappings) {
      if (m.groupName.includes("Assets")) {
          const l = ledgers.find(ld => ld.name === m.softwareLedgerName);
          if (l) {
              console.log(`${l.name}: mapped to ${m.groupName}. Balance: ${l.closingBalance} ${l.nature}`);
          }
      }
  }
}
check().finally(() => prisma.$disconnect());
