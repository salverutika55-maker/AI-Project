const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMappings() {
  const mappings = await prisma.pNLMapping.findMany();
  console.log("Mappings:", mappings.map(m => ({
    head: m.sectorHead, 
    ledger: m.softwareLedgerName
  })));
}

checkMappings().catch(console.error).finally(() => prisma.$disconnect());
