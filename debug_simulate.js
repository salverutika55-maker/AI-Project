const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debugSimulate() {
  const mappings = await prisma.pNLMapping.findMany();

  const accounts = { "Sales Accounts": 1000, "Rent Expenses": 500 };
  const headBalances = {};
  
  for (const m of mappings) {
    const aliases = (m.softwareLedgerName || "").split(",").map(a => a.trim().toLowerCase()).filter(Boolean);
    let balance = 0;
    
    for (const alias of aliases) {
      const exactMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase() === alias);
      if (exactMatchKey) {
        balance += accounts[exactMatchKey];
      } else {
        const fuzzyMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase().includes(alias));
        if (fuzzyMatchKey) balance += accounts[fuzzyMatchKey];
      }
    }

    if (balance !== 0) {
      headBalances[m.sectorHead] = (headBalances[m.sectorHead] || 0) + Math.abs(balance);
    }
  }

  console.log("headBalances:", headBalances);
}

debugSimulate().catch(console.error).finally(() => prisma.$disconnect());
