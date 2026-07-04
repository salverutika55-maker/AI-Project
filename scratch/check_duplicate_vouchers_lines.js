const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  
  const dups = await prisma.normalizedVoucher.findMany({
    where: {
      clientId,
      voucherNumber: "7",
      date: new Date("2024-04-26T00:00:00.000Z")
    },
    include: {
      lines: {
        include: {
          ledger: true
        }
      }
    }
  });

  console.log(`Found ${dups.length} vouchers for #7 on 2024-04-26:`);
  for (const v of dups) {
    console.log(`\n- Voucher ID: ${v.id}, Ref: ${v.referenceNo}, Type: ${v.type}, Amount: ${v.totalAmount}`);
    console.log("  Lines:");
    for (const l of v.lines) {
      console.log(`    * Ledger: ${l.ledger.name}, EntryType: ${l.entryType}, Amount: ${l.amount}`);
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
