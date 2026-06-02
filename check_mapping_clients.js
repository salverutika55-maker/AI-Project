const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkMappings() {
  const mappings = await prisma.pNLMapping.findMany();
  const clients = await prisma.client.findMany();
  
  console.log("Mappings clients:", [...new Set(mappings.map(m => m.clientId))]);
  console.log("All clients:", clients.map(c => c.id + " - " + c.name));
}

checkMappings().catch(console.error).finally(() => prisma.$disconnect());
