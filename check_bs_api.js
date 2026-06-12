const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const clients = await prisma.client.findMany();
  const client = clients[0];
  
  const bsMappings = await prisma.unifiedLedgerMapping.findMany({
    where: { clientId: client.id, statementType: 'BS' }
  });
  
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { clientId: client.id }
  });

  const mappedNames = new Set(bsMappings.map(m => m.softwareLedgerName));
  const unmapped = ledgers.filter(l => !mappedNames.has(l.name) && l.closingBalance > 0);

  console.log(`Mapped BS Ledgers: ${bsMappings.length}`);
  console.log(`Total Ledgers: ${ledgers.length}`);
  console.log(`Unmapped with >0 balance: ${unmapped.length}`);
  
  let assetsSum = 0;
  let liabsSum = 0;

  for (const m of bsMappings) {
     const l = ledgers.find(led => led.name === m.softwareLedgerName);
     if (l) {
        if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities"].includes(m.groupName)) {
           liabsSum += l.closingBalance;
        } else {
           assetsSum += l.closingBalance;
        }
     }
  }

  console.log(`Mapped Assets Sum: ${assetsSum}`);
  console.log(`Mapped Liabs Sum: ${liabsSum}`);
  console.log(`Calculated Profit: ${assetsSum - liabsSum}`);
}

check().catch(console.error);
