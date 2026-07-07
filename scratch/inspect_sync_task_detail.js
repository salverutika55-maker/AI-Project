const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const taskId = "cmrara2250001ky04p1i7qyl6";
  const task = await prisma.syncTask.findUnique({
    where: { id: taskId }
  });

  if (!task) {
    console.log(`Sync task ${taskId} not found.`);
    return;
  }

  console.log("=== Sync Task Result ===");
  console.log(JSON.stringify(task.result, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
