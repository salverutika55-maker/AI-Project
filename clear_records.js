const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.financialRecord.deleteMany({})
  .then((res) => console.log('Mock records cleared:', res.count))
  .catch(console.error)
  .finally(() => prisma.$disconnect());
