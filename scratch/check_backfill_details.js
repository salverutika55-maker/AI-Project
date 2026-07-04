const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { clientId, isActive: true }
  });

  console.log("=== Active Ledgers for SSA TAX CONSULTANT ===");
  for (const l of ledgers) {
    if (["Gst Tax Account", "Income Tax Account", "PTEC Payment", "Drawing", "Ajit Pathak", "TDS Receivable"].includes(l.name)) {
      console.log(`- Ledger: ${l.name}, Group: ${l.groupName}, Nature: ${l.nature}, DB Closing: ${l.closingBalance}`);
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
