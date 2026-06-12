const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const client = await prisma.client.findFirst({ where: { software: 'TALLY' } });
  const mappings = await prisma.unifiedLedgerMapping.findMany({ 
      where: { clientId: client.id } 
  });
  
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: client.id } });
  
  for (const l of ledgers) {
      if (l.closingBalance !== 0) {
          const m = mappings.find(ma => ma.softwareLedgerName === l.name);
          if (m) {
              console.log(`${l.name} is mapped to: ${m.statementType} > ${m.groupName}`);
          } else {
              console.log(`${l.name} is UNMAPPED!`);
          }
      }
  }
}
check().finally(() => prisma.$disconnect());
