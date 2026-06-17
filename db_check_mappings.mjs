import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const id = "cmq6n9c6b0001l304y8ya0py5";
    const mappings = await prisma.unifiedLedgerMapping.findMany({
        where: { clientId: id }
    });

    console.log(`Total unified mappings: ${mappings.length}`);
    mappings.forEach(m => {
        console.log(`- ${m.softwareLedgerName} -> Type: ${m.statementType}, Group: ${m.groupName}, Sub: ${m.subGroupName}`);
    });
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
