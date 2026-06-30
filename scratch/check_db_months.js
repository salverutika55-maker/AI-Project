const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clients = await prisma.client.findMany({
    where: {
      name: { contains: "SSA" }
    }
  });

  for (const c of clients) {
    console.log(`\nClient: ${c.name} (${c.id})`);
    
    // Group vouchers by year and month
    const vouchers = await prisma.normalizedVoucher.findMany({
      where: { clientId: c.id },
      select: { date: true }
    });
    
    const counts = {};
    for (const v of vouchers) {
      const d = new Date(v.date);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const key = `${year}-${month}`;
      counts[key] = (counts[key] || 0) + 1;
    }
    
    console.log("Vouchers per month:");
    const sortedKeys = Object.keys(counts).sort();
    for (const key of sortedKeys) {
      console.log(`  - ${key}: ${counts[key]}`);
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
