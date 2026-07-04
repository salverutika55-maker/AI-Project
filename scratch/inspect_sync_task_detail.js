const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const latestTask = await prisma.syncTask.findFirst({
    where: { status: "COMPLETED" },
    orderBy: { createdAt: 'desc' }
  });
  if (latestTask) {
    console.log(`Task ID: ${latestTask.id}`);
    console.log(`Type: ${latestTask.type}`);
    console.log(`Result JSON:`, JSON.stringify(latestTask.result, null, 2));
    console.log(`Payload JSON:`, JSON.stringify(latestTask.payload, null, 2));
  } else {
    console.log("No completed sync task found");
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
