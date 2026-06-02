const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const pnlValues = await prisma.pNLValue.findMany({
    select: { month: true, year: true, amount: true, headName: true }
  });
  console.log("PNLValues:", pnlValues);
}

check().catch(console.error).finally(() => prisma.$disconnect());
