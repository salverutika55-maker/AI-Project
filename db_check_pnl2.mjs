import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const id = "cmq6n9c6b0001l304y8ya0py5";
    const ledgers = await prisma.normalizedLedger.findMany({
        where: { clientId: id }
    });

    console.log("Checking for ANY ledger that might be P&L or Retained Earnings:");
    const possible = ledgers.filter(l => 
        l.name.toLowerCase().includes("profit") || 
        l.name.toLowerCase().includes("loss") || 
        l.name.toLowerCase().includes("retained") ||
        l.name.toLowerCase().includes("surplus")
    );
    possible.forEach(p => console.log(`- ${p.name}: Open=${p.openingBalance}, Close=${p.closingBalance}, Nature=${p.nature}`));

    console.log("All groups:");
    const groups = new Set(ledgers.map(l => l.groupName));
    console.log([...groups]);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
