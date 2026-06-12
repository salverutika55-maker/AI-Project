const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function check() {
  const client = await prisma.client.findFirst({ where: { software: 'TALLY' } });
  const mappings = await prisma.unifiedLedgerMapping.findMany({ 
      where: { clientId: client.id } 
  });
  
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: client.id } });
  
  const mappedNames = mappings.map(m => m.softwareLedgerName);
  
  console.log("Looking for ledgers with non-zero balance...");
  for (const l of ledgers) {
      if (l.closingBalance !== 0) {
          // Check if there is ANY mapping that is case-insensitive match or substring match
          const fuzzyMatch = mappings.find(m => 
             m.softwareLedgerName.toLowerCase() === l.name.toLowerCase() ||
             m.softwareLedgerName.trim() === l.name.trim() ||
             m.softwareLedgerName.includes(l.name) ||
             l.name.includes(m.softwareLedgerName)
          );
          
          if (fuzzyMatch && fuzzyMatch.softwareLedgerName !== l.name) {
              console.log(`Fuzzy match found for ${l.name}: Mapped as '${fuzzyMatch.softwareLedgerName}'`);
          } else if (!mappedNames.includes(l.name)) {
              console.log(`${l.name} is totally unmapped!`);
          }
      }
  }
}
check().finally(() => prisma.$disconnect());
