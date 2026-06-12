const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const client = await prisma.client.findFirst({ where: { software: 'TALLY' } });
  const mappings = await prisma.unifiedLedgerMapping.findMany({ 
      where: { clientId: client.id, statementType: 'BS' } 
  });
  
  const names = mappings.map(m => m.softwareLedgerName);
  
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: client.id } });
  
  for (const l of ledgers) {
      if (l.closingBalance !== 0) {
          const isMapped = names.includes(l.name);
          console.log(`Non-zero: ${l.name} (${l.closingBalance}) - Mapped to BS? ${isMapped}`);
          if (isMapped) {
              const m = mappings.find(ma => ma.softwareLedgerName === l.name);
              console.log(`  -> Mapped to: ${m.groupName} > ${m.subGroupName}`);
          }
      }
  }
}
check().finally(() => prisma.$disconnect());
