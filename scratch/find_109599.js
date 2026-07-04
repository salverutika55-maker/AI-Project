const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const tracePath = path.resolve(__dirname, '../src/lib/services/balance-sheet-trace');
const { buildBalanceSheetTrace } = require(tracePath);

async function run() {
  const clients = await prisma.client.findMany();
  const years = [2024, 2025, 2026];
  
  console.log("Searching for subheads with totals around 109,599...");
  for (const c of clients) {
    for (const y of years) {
      try {
        const trace = await buildBalanceSheetTrace(c.id, y);
        // Find subhead totals in dataNodes
        const subheads = {};
        for (const n of trace.dataNodes) {
          const key = `${n.period}-${n.subHeadName}`;
          if (!subheads[key]) subheads[key] = 0;
          subheads[key] += n.amount;
        }

        for (const [key, val] of Object.entries(subheads)) {
          if (Math.abs(val - 109599) < 100) {
            console.log(`- MATCH FOUND! Client: ${c.name} (ID: ${c.id}), Year: ${y}, Period/Subhead: ${key}, Value: ${val}`);
          }
        }
      } catch (e) {
        // Skip
      }
    }
  }
  console.log("Search complete.");
}

run().catch(console.error).finally(() => prisma.$disconnect());
