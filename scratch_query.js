const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const id = 'REDACTED_TEST_BEARER';
    const bsMappings = await prisma.unifiedLedgerMapping.findMany({
      where: { clientId: id, statementType: "BS" }
    });

    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId: id, isActive: true }
    });

    const ledgerBalances = {};
    ledgers.forEach(l => {
      ledgerBalances[l.name] = l.closingBalance;
    });

    const dataNodes = [];
    bsMappings.forEach(mapping => {
      let mainGroup = "";
      if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities"].includes(mapping.groupName)) {
        mainGroup = "Liabilities";
      } else {
        mainGroup = "Assets";
      }

      const balance = ledgerBalances[mapping.softwareLedgerName] || 0;
      
      const mockedBalance = balance;
      if (mockedBalance > 0 && mapping.groupName === 'Current Assets') {
         console.log("MAPPED LEDGER HAS BALANCE:", mapping.softwareLedgerName, balance);
      }

      dataNodes.push({
        id: `${mapping.id}-May`,
        period: "May",
        mainGroup,
        groupName: mapping.groupName,
        subGroupName: mapping.subGroupName || mapping.groupName,
        subHeadName: mapping.subHeadName,
        ledgerName: mapping.softwareLedgerName,
        amount: mockedBalance,
        nature: balance > 0 ? "DEBIT" : "CREDIT"
      });
    });
    
    console.log("Total Nodes:", dataNodes.length);
    console.log("Sample non-zero nodes:", dataNodes.filter(n => n.amount > 0).slice(0, 5));
}
main().catch(console.error).finally(() => prisma.$disconnect());
