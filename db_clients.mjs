import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const clients = await prisma.client.findMany();
  console.log("Clients:", clients.map(c => ({ id: c.id, name: c.name })));
  process.exit(0);
}
run();
