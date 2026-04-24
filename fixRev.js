const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixRevenue() {
  const records = await prisma.financialRecord.findMany({
    orderBy: { period: 'asc' }
  });

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    let netRev = r.revenue;
    let netCogs = r.cogs;
    let netOpEx = r.operatingExpenses;

    if (i > 0) {
      const prev = records[i-1];
      if (r.revenue >= prev.revenue) netRev = r.revenue - prev.revenue;
      if (r.cogs >= prev.cogs) netCogs = r.cogs - prev.cogs;
      if (r.operatingExpenses >= prev.operatingExpenses) netOpEx = r.operatingExpenses - prev.operatingExpenses;
    }

    await prisma.financialRecord.update({
      where: { id: r.id },
      data: {
        revenue: netRev,
        cogs: netCogs,
        operatingExpenses: netOpEx,
        netIncome: netRev - netCogs - netOpEx
      }
    });
  }
  console.log('Database Revenue, COGS, and OpEx converted from YTD to Net Movement!');
  await prisma.$disconnect();
}
fixRevenue();
