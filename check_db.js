const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const tasks = await prisma.syncTask.findMany();
  console.log("Tasks:", JSON.stringify(tasks, null, 2));
  
  const records = await prisma.financialRecord.findMany();
  console.log("Records:", records.length);
}

check().catch(console.error).finally(() => prisma.$disconnect());
