const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany();
  const activeClient = clients.find(c => c.name.includes("SSA TAX")) || clients[0];
  
  const mappings = await prisma.pNLMapping.findMany({
    where: { clientId: activeClient.id }
  });
  
  console.log("Mappings count:", mappings.length);
  for (const m of mappings) {
    console.log(`${m.sectorHead} -> ${m.softwareLedgerName}`);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
