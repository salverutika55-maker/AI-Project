import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const clients = await prisma.client.findMany({
        include: {
            normalizedLedgers: true,
            pnlMappings: true,
            unifiedMappings: true
        }
    });

    clients.forEach(c => {
        console.log(`Client: ${c.id} - ${c.name}`);
        console.log(`  Ledgers: ${c.normalizedLedgers.length}`);
        console.log(`  PNL Mappings: ${c.pnlMappings.length}`);
        console.log(`  Unified Mappings: ${c.unifiedMappings.length}`);
    });
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
