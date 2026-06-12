const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const client = await prisma.client.findFirst({ where: { id: 'REDACTED_TEST_BEARER' } });
  const mappings = await prisma.unifiedLedgerMapping.findMany({ 
      where: { clientId: client.id, statementType: 'BS' } 
  });
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: client.id } });
  
  let totalAssets = 0;
  console.log("Assets mappings:");
  for (const m of mappings) {
      if (m.groupName.includes("Assets")) {
          const l = ledgers.find(ld => ld.name === m.softwareLedgerName);
          if (l && l.closingBalance !== 0) {
              console.log(`${l.name} - ${l.closingBalance} (${l.nature}) - mapped to ${m.groupName} > ${m.subGroupName}`);
              totalAssets += l.closingBalance;
          }
      }
  }
  console.log(`Total Assets Mapped Value (Abs): ${totalAssets}`);
}
check().finally(() => prisma.$disconnect());
