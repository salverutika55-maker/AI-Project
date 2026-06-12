const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const tasks = await prisma.syncTask.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(tasks);
}
check().finally(() => prisma.$disconnect());
