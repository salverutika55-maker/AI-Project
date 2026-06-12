const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const clients = await prisma.client.findMany();
  const client = clients[0];
  
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: client.id } });
  const mappings = await prisma.unifiedLedgerMapping.findMany({ where: { clientId: client.id } });

  console.log(`Ledgers: ${ledgers.length}`);
  console.log(`Mappings: ${mappings.length}`);
  console.log(mappings.map(m => `${m.softwareLedgerName} -> ${m.statementType} | ${m.groupName}`));
}

check().catch(console.error);
