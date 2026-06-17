import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const clients = await prisma.client.findMany();
  console.log("Clients:", clients.map(c => ({ id: c.id, name: c.name, status: c.status })));
  
  // Also check ledgers for the first client
  if (clients.length > 0) {
      const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: clients[0].id } });
      const activeCount = ledgers.filter(l => l.isActive).length;
      console.log(`Client 1 ledgers: Total ${ledgers.length}, Active ${activeCount}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
