import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const id = "cmq6n9c6b0001l304y8ya0py5";
    const mappings = await prisma.pNLMapping.findMany({
        where: { clientId: id }
    });

    console.log(`Total PNL mappings: ${mappings.length}`);
    const sample = mappings.slice(0, 10);
    sample.forEach(m => {
        console.log(`- ${m.softwareLedgerName} -> Type: ${m.statementType}, Group: ${m.groupName}, Sub: ${m.subGroupName}`);
    });
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
