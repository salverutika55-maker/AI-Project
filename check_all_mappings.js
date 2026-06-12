const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const clients = await prisma.client.findMany();
  const client = clients[0];
  
  const pnlMappings = await prisma.pNLMapping.count({ where: { clientId: client.id }});
  const bsMappings = await prisma.unifiedLedgerMapping.count({ where: { clientId: client.id, statementType: 'BS' }});
  const allUnified = await prisma.unifiedLedgerMapping.count({ where: { clientId: client.id }});

  console.log(`PNL Mappings: ${pnlMappings}`);
  console.log(`BS Unified Mappings: ${bsMappings}`);
  console.log(`All Unified Mappings: ${allUnified}`);
}

check().catch(console.error);
