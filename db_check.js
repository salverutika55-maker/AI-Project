const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const tallyVouchers = await prisma.tallyVoucher.count();
  const normalizedVouchers = await prisma.normalizedVoucher.count();
  const pnlValues = await prisma.pNLValue.count();
  const normalizedLedgers = await prisma.normalizedLedger.count();

  console.log(`TallyVouchers: ${tallyVouchers}`);
  console.log(`NormalizedVouchers: ${normalizedVouchers}`);
  console.log(`PNLValues: ${pnlValues}`);
  console.log(`NormalizedLedgers: ${normalizedLedgers}`);
}

check().catch(console.error);
