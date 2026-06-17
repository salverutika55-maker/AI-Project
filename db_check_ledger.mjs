import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const id = "cmq6n9c6b0001l304y8ya0py5";
    const ledgers = await prisma.normalizedLedger.findMany({
        where: { clientId: id }
    });

    console.log(`Total ledgers: ${ledgers.length}`);
    const sample = ledgers.slice(0, 5);
    console.log("Sample ledgers:");
    sample.forEach(l => {
        console.log(`- ${l.name}: Open=${l.openingBalance}, Close=${l.closingBalance}, Nature=${l.nature}`);
    });
    
    // Sum of all closing balances
    const assetSum = ledgers.filter(l => l.nature === 'DEBIT').reduce((acc, l) => acc + l.closingBalance, 0);
    const liabSum = ledgers.filter(l => l.nature === 'CREDIT').reduce((acc, l) => acc + l.closingBalance, 0);
    console.log(`Total Asset Closing: ${assetSum}`);
    console.log(`Total Liab Closing: ${liabSum}`);
    console.log(`Difference: ${assetSum - liabSum}`);
    
    // Are there any ledgers with openingBalance != 0?
    const withOpen = ledgers.filter(l => l.openingBalance !== 0);
    console.log(`Ledgers with Opening Balance != 0: ${withOpen.length}`);
    if (withOpen.length > 0) {
        console.log("Sample with open:");
        withOpen.slice(0, 5).forEach(l => {
             console.log(`- ${l.name}: Open=${l.openingBalance}, Close=${l.closingBalance}`);
        });
    }
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
