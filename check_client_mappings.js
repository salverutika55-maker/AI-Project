const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRecentRecords() {
  const records = await prisma.financialRecord.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 1
  });
  console.log("Recent record clientId:", records[0].clientId);
  
  const client = await prisma.client.findUnique({
    where: { id: records[0].clientId },
    include: { pnlMappings: true }
  });
  console.log("Client PNL Mappings count:", client.pnlMappings.length);
}

checkRecentRecords().catch(console.error).finally(() => prisma.$disconnect());
