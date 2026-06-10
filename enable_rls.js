const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Enabling Row Level Security on UnifiedLedgerMapping and BSValue...');
  try {
    await prisma.$executeRawUnsafe('ALTER TABLE "UnifiedLedgerMapping" ENABLE ROW LEVEL SECURITY;');
    await prisma.$executeRawUnsafe('ALTER TABLE "BSValue" ENABLE ROW LEVEL SECURITY;');
    console.log('Successfully enabled RLS on both tables!');
  } catch (err) {
    console.error('Failed to enable RLS:', err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
