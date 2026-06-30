const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { clientId }
  });

  console.log(`Total ledgers in DB for client: ${ledgers.length}`);
  
  // Find case-insensitive duplicates in existing DB ledgers
  const nameMap = new Map();
  const duplicates = [];
  
  for (const l of ledgers) {
    const lower = l.name.toLowerCase();
    if (nameMap.has(lower)) {
      duplicates.push({
        first: nameMap.get(lower),
        second: l
      });
    } else {
      nameMap.set(lower, l);
    }
  }

  if (duplicates.length > 0) {
    console.log("Case-insensitive duplicates already in DB:");
    duplicates.forEach(d => {
      console.log(`- "${d.first.name}" (ID: ${d.first.id}) vs "${d.second.name}" (ID: ${d.second.id})`);
    });
  } else {
    console.log("No case-insensitive duplicates found in DB.");
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
