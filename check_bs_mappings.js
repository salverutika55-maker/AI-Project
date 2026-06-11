const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const mappings = await prisma.unifiedLedgerMapping.findMany();
  console.log("UnifiedLedgerMapping Count:", mappings.length);
  
  if (mappings.length > 0) {
     console.log("Sample Mappings:");
     console.log(mappings.slice(0, 5));
     
     // Check if they have statementType BS
     const bs = mappings.filter(m => m.statementType === 'BS');
     console.log("BS mappings count:", bs.length);
  }
}

run().finally(() => prisma.$disconnect());
