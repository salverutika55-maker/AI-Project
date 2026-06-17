import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const ledgers = await prisma.normalizedLedger.findMany({
      where: { isActive: true }
  });
  
  const unsecured = ledgers.filter(l => l.groupName.includes("Unsecured") || l.name.includes("Loan"));
  console.log("Unsecured Loans:", unsecured.slice(0, 5).map(l => ({ name: l.name, close: l.closingBalance, nature: l.nature })));
  
  const bank = ledgers.filter(l => l.groupName.includes("Bank"));
  console.log("Bank Accounts:", bank.slice(0, 5).map(l => ({ name: l.name, close: l.closingBalance, nature: l.nature })));
}

run().catch(console.error).finally(() => prisma.$disconnect());
