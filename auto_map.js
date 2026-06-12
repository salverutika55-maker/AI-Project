const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const groupMapping = {
  "Sundry Debtors": { type: "BS", group: "Current Assets", sub: "Trade Receivable" },
  "Sundry Creditors": { type: "BS", group: "Current Liabilities", sub: "Trade Payable" },
  "Fixed Assets": { type: "BS", group: "Non-Current Assets", sub: "Fixed Assets" },
  "Bank Accounts": { type: "BS", group: "Current Assets", sub: "Bank Accounts" },
  "Cash-in-Hand": { type: "BS", group: "Current Assets", sub: "Cash-In-Hand" },
  "Duties & Taxes": { type: "BS", group: "Current Liabilities", sub: "Duties & Taxes" },
  "Provisions": { type: "BS", group: "Current Liabilities", sub: "Provisions" },
  "Secured Loans": { type: "BS", group: "Non-Current Liabilities", sub: "Unsecured Loans" }, // Unsecured is the closest in UI
  "Unsecured Loans": { type: "BS", group: "Non-Current Liabilities", sub: "Unsecured Loans" },
  "Capital Account": { type: "BS", group: "Owner's Funds", sub: "Share Capital" },
  "Reserves & Surplus": { type: "BS", group: "Owner's Funds", sub: "Reserves & Surplus" },
  "Current Assets": { type: "BS", group: "Current Assets", sub: "Other Current Assets" },
  "Current Liabilities": { type: "BS", group: "Current Liabilities", sub: "Other Current Liabilities" },
  "Suspense A/c": { type: "BS", group: "Current Liabilities", sub: "Suspense A/c" },
  
  "Sales Accounts": { type: "PNL", group: "Revenue" },
  "Purchase Accounts": { type: "PNL", group: "Direct Expenses" },
  "Direct Expenses": { type: "PNL", group: "Direct Expenses" },
  "Direct Incomes": { type: "PNL", group: "Other Income" },
  "Indirect Expenses": { type: "PNL", group: "Operating Expenses" },
  "Indirect Incomes": { type: "PNL", group: "Other Income" }
};

async function autoMap() {
  const clients = await prisma.client.findMany();
  const client = clients[0];
  
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: client.id } });
  const existingMappings = await prisma.unifiedLedgerMapping.findMany({ where: { clientId: client.id } });
  const mappedNames = new Set(existingMappings.map(m => m.softwareLedgerName));
  
  let mappedCount = 0;

  for (const l of ledgers) {
    if (!mappedNames.has(l.name) && l.closingBalance > 0) {
      // Find mapping based on Tally group
      const mapping = groupMapping[l.groupName];
      if (mapping) {
        await prisma.unifiedLedgerMapping.create({
          data: {
            clientId: client.id,
            softwareLedgerName: l.name,
            statementType: mapping.type,
            groupName: mapping.group,
            subGroupName: mapping.type === "BS" ? mapping.sub : null,
            subHeadName: mapping.sub || mapping.group,
            source: "AI_AUTO"
          }
        });
        mappedCount++;
        console.log(`Auto-mapped: ${l.name} -> ${mapping.type} | ${mapping.group}`);
      } else {
        console.log(`Could not auto-map: ${l.name} (Tally Group: ${l.groupName})`);
      }
    }
  }

  console.log(`Successfully auto-mapped ${mappedCount} ledgers!`);
}

autoMap().catch(console.error);
