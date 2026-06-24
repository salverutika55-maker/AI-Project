const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Enabling Row Level Security on public login/security tables...');
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "UserLoginActivity" ENABLE ROW LEVEL SECURITY;');
    await prisma.$executeRawUnsafe('ALTER TABLE "SecurityAlert" ENABLE ROW LEVEL SECURITY;');
    await prisma.$executeRawUnsafe('ALTER TABLE "ClientAccessLog" ENABLE ROW LEVEL SECURITY;');
    console.log('Successfully enabled RLS on all three tables!');
  } catch (err) {
    console.error('Failed to enable RLS:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
