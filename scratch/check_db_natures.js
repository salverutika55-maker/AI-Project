const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { clientId, isActive: true }
  });

  const creditGroups = [
    "capital account", "reserves & surplus", "current liabilities", "duties & taxes",
    "provisions", "sundry creditors", "loans (liability)", "bank od a/c",
    "secured loans", "unsecured loans", "suspense a/c", "equity", "owner's funds"
  ];

  console.log("=== SCANNING FOR UNUSUAL/INCONSISTENT LEDGER NATURES IN DB ===");
  let count = 0;
  for (const l of ledgers) {
    const gLower = l.groupName.toLowerCase();
    const isCreditGroup = creditGroups.some(cg => gLower.includes(cg));
    const expectedNature = isCreditGroup ? "CREDIT" : "DEBIT";
    
    if (l.nature !== expectedNature) {
      count++;
      console.log(`- Mismatch in ${l.name}:`);
      console.log(`  Tally Parent Group: ${l.groupName}`);
      console.log(`  Expected Nature:    ${expectedNature} (based on parent group)`);
      console.log(`  Actual DB Nature:   ${l.nature}`);
      console.log(`  DB Closing Balance: ${l.closingBalance}`);
    }
  }
  console.log(`\nTotal mismatching ledgers in database: ${count}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
