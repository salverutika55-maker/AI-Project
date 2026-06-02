const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRecords() {
  const records = await prisma.financialRecord.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 5
  });
  console.log("Recent records:", records.map(r => ({
    period: r.period,
    updatedAt: r.updatedAt,
    revenue: r.revenue
  })));
}

checkRecords().catch(console.error).finally(() => prisma.$disconnect());
