const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.financialRecord.findMany({
  where: { clientId: 'cmo9wah920002l704u8d6rhy7' },
  orderBy: { period: 'asc' }
}).then(c => {
  const fs = require('fs');
  fs.writeFileSync('records_dump.json', JSON.stringify(c, null, 2));
}).finally(() => prisma.$disconnect());
