const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const records = await prisma.financialRecord.findMany({
    select: { period: true, revenue: true, netIncome: true }
  });
  console.log("Records:", records);
}

check().catch(console.error).finally(() => prisma.$disconnect());
