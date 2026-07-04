const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  
  const ledger = await prisma.normalizedLedger.findFirst({
    where: { clientId, name: "Ajit Pathak" }
  });
  
  if (!ledger) {
    console.log("Ajit Pathak ledger not found");
    return;
  }

  const lines = await prisma.normalizedVoucherLine.findMany({
    where: { ledgerId: ledger.id },
    include: {
      voucher: true
    },
    orderBy: {
      voucher: {
        date: 'asc'
      }
    }
  });

  console.log(`Found ${lines.length} voucher lines for Ajit Pathak:`);
  for (const l of lines) {
    console.log(`- Date: ${l.voucher.date.toISOString()}, Type: ${l.voucher.type.padEnd(8)}, EntryType: ${l.entryType}, Amount: ${l.amount.toString().padEnd(6)}, Ref: ${l.voucher.referenceNo}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
