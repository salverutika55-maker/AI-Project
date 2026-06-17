import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function check() {
  const client = await prisma.client.findFirst();
  if (!client) return console.log("No client found");
  
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { clientId: client.id },
    take: 10
  });
  
  console.log("Sample ledgers opening/closing balances:");
  ledgers.forEach(l => {
    console.log(`${l.name} (${l.groupName}) - Open: ${l.openingBalance}, Close: ${l.closingBalance}, Nature: ${l.nature}`);
  });
}

check()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
