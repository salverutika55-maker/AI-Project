const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.client.deleteMany();
  console.log('Wiped clients');
}
main().catch(console.error).finally(() => prisma.$disconnect());
