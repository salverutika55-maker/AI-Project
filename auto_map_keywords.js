const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const keywordMapping = [
  { keys: ["bank", "cash"], type: "BS", group: "Current Assets", sub: "Bank Accounts" },
  { keys: ["tax", "gst", "tds", "ptec", "ptrc"], type: "BS", group: "Current Liabilities", sub: "Duties & Taxes" },
  { keys: ["trader", "enterprises", "labs", "engineering", "solution", "jwellers", "automotive", "seller"], type: "BS", group: "Current Assets", sub: "Trade Receivable" }, // Assuming most are customers
  { keys: ["capital", "drawing", "huf"], type: "BS", group: "Owner's Funds", sub: "Share Capital" },
  { keys: ["sales", "turnover"], type: "PNL", group: "Revenue", sub: "Revenue" },
  { keys: ["purchase"], type: "PNL", group: "Direct Expenses", sub: "Direct Expenses" },
  { keys: ["salary", "wages"], type: "PNL", group: "Employee Costs", sub: "Employee Costs" },
  { keys: ["rent", "commission", "charges", "fees", "audit", "certificate", "discount"], type: "PNL", group: "Operating Expenses", sub: "Operating Expenses" },
  { keys: ["interest", "miscellaneous income", "refund"], type: "PNL", group: "Other Income", sub: "Other Income" },
  { keys: ["bad debts"], type: "PNL", group: "Operating Expenses", sub: "Operating Expenses" }
];

async function autoMapKeywords() {
  const clients = await prisma.client.findMany();
  const client = clients[0];
  
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: client.id } });
  const existingMappings = await prisma.unifiedLedgerMapping.findMany({ where: { clientId: client.id } });
  const mappedNames = new Set(existingMappings.map(m => m.softwareLedgerName));
  
  let mappedCount = 0;

  for (const l of ledgers) {
    if (!mappedNames.has(l.name) && l.closingBalance > 0) {
      let mapped = false;
      for (const rule of keywordMapping) {
        if (rule.keys.some(k => l.name.toLowerCase().includes(k))) {
          await prisma.unifiedLedgerMapping.create({
            data: {
              clientId: client.id,
              softwareLedgerName: l.name,
              statementType: rule.type,
              groupName: rule.group,
              subGroupName: rule.type === "BS" ? rule.sub : null,
              subHeadName: rule.sub || rule.group,
              source: "AI_AUTO_KEYWORD"
            }
          });
          mappedCount++;
          console.log(`Keyword Mapped: ${l.name} -> ${rule.type} | ${rule.group}`);
          mapped = true;
          break;
        }
      }
      
      // If no keyword matched, assume it's a person/entity -> Sundry Debtor (Current Asset)
      if (!mapped && !["income", "expense", "account"].some(k => l.name.toLowerCase().includes(k))) {
          await prisma.unifiedLedgerMapping.create({
            data: {
              clientId: client.id,
              softwareLedgerName: l.name,
              statementType: "BS",
              groupName: "Current Assets",
              subGroupName: "Trade Receivable",
              subHeadName: "Trade Receivable",
              source: "AI_AUTO_FALLBACK"
            }
          });
          mappedCount++;
          console.log(`Fallback Mapped: ${l.name} -> BS | Current Assets`);
      }
    }
  }

  console.log(`Successfully auto-mapped ${mappedCount} ledgers via keywords/fallback!`);
}

autoMapKeywords().catch(console.error);
