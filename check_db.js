const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const clients = await prisma.client.findMany();
  console.log(JSON.stringify(clients, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
