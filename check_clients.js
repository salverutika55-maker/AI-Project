const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const clients = await prisma.client.findMany({ select: { id: true, name: true, software: true }});
  console.log("Clients:", clients);
  
  for (const c of clients) {
      const mappings = await prisma.unifiedLedgerMapping.count({ where: { clientId: c.id }});
      console.log(`Client ${c.name} (${c.id}) has ${mappings} mappings.`);
  }
}
check().finally(() => prisma.$disconnect());
