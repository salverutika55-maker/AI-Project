import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const id = "REDACTED_TEST_BEARER";
    const ledgers = await prisma.normalizedLedger.findMany({
        where: { clientId: id }
    });

    console.log(`Total ledgers: ${ledgers.length}`);
    const assetSum = ledgers.filter(l => l.nature === 'DEBIT').reduce((acc, l) => acc + l.closingBalance, 0);
    const liabSum = ledgers.filter(l => l.nature === 'CREDIT').reduce((acc, l) => acc + l.closingBalance, 0);
    console.log(`Total Asset Closing: ${assetSum}`);
    console.log(`Total Liab Closing: ${liabSum}`);
    console.log(`Difference: ${assetSum - liabSum}`);
    
    const withOpen = ledgers.filter(l => l.openingBalance !== 0);
    console.log(`Ledgers with Opening Balance != 0: ${withOpen.length}`);
    if (withOpen.length > 0) {
        console.log("Sample with open:");
        withOpen.slice(0, 5).forEach(l => {
             console.log(`- ${l.name}: Open=${l.openingBalance}, Close=${l.closingBalance}`);
        });
    }

    const pnlLedgers = ledgers.filter(l => l.name.toLowerCase().includes("profit") || l.groupName.includes("Profit") || l.name.includes("P&L"));
    console.log("Potential PnL Ledgers:");
    pnlLedgers.forEach(l => console.log(`- ${l.name} (${l.groupName}): Open=${l.openingBalance}, Close=${l.closingBalance}`));

    // Fetch movements
    const movements = await prisma.normalizedVoucherLine.findMany({
        where: { clientId: id },
        select: { amount: true, entryType: true, ledgerId: true, voucher: { select: { date: true } } }
    });
    console.log(`Total voucher lines: ${movements.length}`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
