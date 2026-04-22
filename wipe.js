const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.financialRecord.deleteMany();
  console.log("Wiped old records");
}

main().catch(console.error).finally(() => prisma.$disconnect());
