const { PrismaClient } = require('@prisma/client');
const { decrypt } = require('./src/lib/encryption');
const prisma = new PrismaClient();

async function check() {
  const values = await prisma.pNLValue.findMany({
    where: { month: 'Jul', year: 2024 }
  });
  
  console.log("PNL Values for Jul 2024:");
  values.forEach(v => {
      console.log(v.headName, decrypt(v.amount));
  });
}

check().catch(console.error).finally(() => prisma.$disconnect());
