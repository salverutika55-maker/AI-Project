import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const id = "cmq6n9c6b0001l304y8ya0py5"; 
  
  const minVoucher = await prisma.normalizedVoucher.findFirst({
      where: { clientId: id },
      orderBy: { date: 'asc' },
      select: { date: true }
  });

  const maxVoucher = await prisma.normalizedVoucher.findFirst({
      where: { clientId: id },
      orderBy: { date: 'desc' },
      select: { date: true }
  });

  console.log(`Vouchers span from ${minVoucher?.date.toISOString()} to ${maxVoucher?.date.toISOString()}`);
  process.exit(0);
}

run();
