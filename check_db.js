const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkData() {
  const clients = await prisma.client.findMany({
    include: { financialRecords: true }
  });
  console.log(JSON.stringify(clients, null, 2));
}

checkData();
