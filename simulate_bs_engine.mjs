import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const id = "cmq6n9c6b0001l304y8ya0py5"; 
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: id, isActive: true } });
  
  const bsMappings = await prisma.unifiedLedgerMapping.findMany({
    where: { clientId: id, statementType: "BS" }
  });

  console.log(`Found ${ledgers.length} ledgers`);
  
  let mappedToAssets = 0;
  let mappedToLiabilities = 0;
  let unmapped = 0;

  ledgers.forEach(ledger => {
      let effectiveGroup = ledger.groupName;
      let effectiveSubGroup = ledger.groupName;
      
      const customMapping = bsMappings.find(m => m.softwareLedgerName.toLowerCase() === ledger.name.toLowerCase());
      if (customMapping) {
        effectiveGroup = customMapping.groupName;
        effectiveSubGroup = customMapping.subGroupName || customMapping.groupName;
      } else {
        effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
        if (!effectiveGroup || effectiveGroup === "Unknown" || effectiveGroup === "Uncategorized") {
          const n = ledger.name.toLowerCase();
          if (n.includes("bank") || n.includes("hdfc") || n.includes("sbi") || n.includes("icici") || n.includes("axis")) effectiveGroup = "Bank Accounts";
          else if (n.includes("cash")) effectiveGroup = "Cash-in-hand";
          else if (n.includes("loan") || n.includes("borrow")) effectiveGroup = "Unsecured Loans";
          else if (n.includes("tax") || n.includes("gst") || n.includes("tds")) effectiveGroup = "Duties & Taxes";
          else if (n.includes("capital") || n.includes("equity")) effectiveGroup = "Capital Account";
          else if (n.includes("profit") || n.includes("pnl")) effectiveGroup = "Reserves & Surplus";
          else {
             effectiveGroup = ledger.nature === "CREDIT" ? "Current Liabilities" : "Current Assets";
          }
        }
      }

      let mainGroup = "";
      if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities", "Capital Account", "Suspense A/c", "Sundry Creditors", "Duties & Taxes", "Loans (Liability)", "Secured Loans", "Unsecured Loans", "Primary", "Reserves & Surplus"].includes(effectiveGroup)) {
        mainGroup = "Liabilities";
      } else if (["Non-Current Assets", "Current Assets", "Fixed Assets", "Investments", "Sundry Debtors", "Cash-in-hand", "Bank Accounts", "Closing Stock", "Deposits (Asset)", "Loans & Advances (Asset)"].includes(effectiveGroup)) {
        mainGroup = "Assets";
      }
      
      if (mainGroup === "Assets") mappedToAssets++;
      else if (mainGroup === "Liabilities") mappedToLiabilities++;
      else {
          unmapped++;
          console.log(`UNMAPPED: ${ledger.name} -> original: ${ledger.groupName}, effectiveGroup: ${effectiveGroup}`);
      }
  });

  console.log(`\nAssets: ${mappedToAssets}, Liabilities: ${mappedToLiabilities}, Unmapped: ${unmapped}`);
  process.exit(0);
}

run();
