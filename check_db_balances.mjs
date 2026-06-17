import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const id = "cmq6n9c6b0001l304y8ya0py5"; 
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: id, isActive: true } });
  
  console.log("Non-zero Opening Balances:");
  const openBals = ledgers.filter(l => l.openingBalance !== 0);
  console.table(openBals.map(l => ({name: l.name, open: l.openingBalance, close: l.closingBalance})));
  
  console.log("Non-zero Closing Balances:");
  const closeBals = ledgers.filter(l => l.closingBalance !== 0);
  console.table(closeBals.map(l => ({name: l.name, open: l.openingBalance, close: l.closingBalance})).slice(0, 10));

  process.exit(0);
}

run();
