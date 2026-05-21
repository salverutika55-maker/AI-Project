const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const vouchersCount = await prisma.tallyVoucher.count();
    console.log(`Total vouchers in DB: ${vouchersCount}`);
    
    if (vouchersCount > 0) {
      const sampleVouchers = await prisma.tallyVoucher.findMany({
        take: 10
      });
      console.log('Sample Vouchers:', JSON.stringify(sampleVouchers, null, 2));
    }
    
    const recordsCount = await prisma.rawLedgerRecord.count();
    console.log(`Total raw ledger records in DB: ${recordsCount}`);
    
    if (recordsCount > 0) {
      const sampleRecords = await prisma.rawLedgerRecord.findMany({
        take: 10
      });
      console.log('Sample RawLedgerRecords:', JSON.stringify(sampleRecords, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
