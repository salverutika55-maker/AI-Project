const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const c = await prisma.client.findFirst({where: {id: 'cmofxajoa0002l504dapzj3jh'}});
  console.log(c.oauthToken);
}
check().catch(console.error).finally(() => prisma.$disconnect());
