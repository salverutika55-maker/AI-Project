import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { openingBalance: { not: 0 } },
    take: 10,
    select: {
      name: true,
      openingBalance: true,
      nature: true,
      groupName: true
    }
  });
  console.log(ledgers);
}

main().catch(console.error).finally(() => prisma.$disconnect());
