require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.client.findMany({
    select: {
      id: true,
      name: true,
      clientCode: true,
      connectorStatus: true,
      lastHeartbeat: true,
      lastSyncedAt: true,
      devices: {
        orderBy: { lastSeen: 'desc' },
        take: 3,
        select: { id: true, deviceId: true, name: true, status: true, lastSeen: true, refreshExpiresAt: true }
      }
    },
    orderBy: { name: 'asc' }
  });
  console.log(JSON.stringify(rows, null, 2));
}

main().catch(err => { console.error(err); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); });
