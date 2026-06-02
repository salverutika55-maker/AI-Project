const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const vouchers = await prisma.tallyVoucher.count();
  console.log("Vouchers:", vouchers);
  const pnlValues = await prisma.pNLValue.count();
  console.log("PNLValues:", pnlValues);
}

check().catch(console.error).finally(() => prisma.$disconnect());
