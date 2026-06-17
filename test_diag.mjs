import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const clients = await prisma.client.findMany();
  
  for (const c of clients) {
      const ledgers = await prisma.normalizedLedger.findMany({
          where: { clientId: c.id, isActive: true }
      });
      if(ledgers.length === 0) continue;

      let pnlClosing = 0;
      let totalAssets = 0;
      let totalLiabilities = 0;

      ledgers.forEach(ledger => {
          let effectiveGroup = ledger.groupName;

          const isIncome = ["Sales Accounts", "Direct Incomes", "Indirect Incomes"].includes(effectiveGroup);
          const isExpense = ["Purchase Accounts", "Direct Expenses", "Indirect Expenses"].includes(effectiveGroup);

          if (isIncome) {
              pnlClosing += (ledger.nature === "CREDIT" ? ledger.closingBalance : -ledger.closingBalance);
          } else if (isExpense) {
              pnlClosing -= (ledger.nature === "DEBIT" ? ledger.closingBalance : -ledger.closingBalance);
          }

          if (["Sales Accounts", "Purchase Accounts", "Direct Expenses", "Direct Incomes", "Indirect Expenses", "Indirect Incomes"].includes(effectiveGroup)) {
              return;
          }
          if (!effectiveGroup || effectiveGroup.toLowerCase() === "unknown" || effectiveGroup.toLowerCase() === "uncategorized") {
              return;
          }

          let mainGroup = "Assets";
          if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities", "Capital Account", "Suspense A/c", "Sundry Creditors", "Duties & Taxes", "Loans (Liability)", "Secured Loans", "Unsecured Loans", "Primary", "Reserves & Surplus"].includes(effectiveGroup)) {
              mainGroup = "Liabilities";
          } else if (["Non-Current Assets", "Current Assets", "Fixed Assets", "Investments", "Sundry Debtors", "Cash-in-hand", "Bank Accounts", "Closing Stock", "Deposits (Asset)", "Loans & Advances (Asset)"].includes(effectiveGroup)) {
              mainGroup = "Assets";
          } else if (ledger.name.toLowerCase().includes("profit & loss") || ledger.name.toLowerCase().includes("p&l")) {
              mainGroup = "Liabilities";
          } else {
              mainGroup = ledger.nature === "CREDIT" ? "Liabilities" : "Assets";
          }

          let appBalance = ledger.closingBalance;
          if (mainGroup === "Assets") {
              appBalance = ledger.nature === "DEBIT" ? Math.abs(appBalance) : -Math.abs(appBalance);
              totalAssets += appBalance;
          } else {
              appBalance = ledger.nature === "CREDIT" ? Math.abs(appBalance) : -Math.abs(appBalance);
              totalLiabilities += appBalance;
          }
      });
      
      totalLiabilities += pnlClosing;

      if (c.name === "SSA TAX CONSULTANT") {
          ledgers.forEach(l => {
              if (l.closingBalance === 940994.52 || l.openingBalance === 940994.52) {
                  console.log("FOUND MAGIC NUMBER:", l.name, l.closingBalance);
              }
              if (Math.abs(l.closingBalance) > 100000) {
                 console.log("LARGE LEDGER:", l.name, l.closingBalance, l.groupName, l.nature);
              }
          });
          console.log(`Client ${c.name}:`);
          console.log("  Assets:", totalAssets);
          console.log("  Liabs+Equity:", totalLiabilities);
          console.log("  Diff:", totalAssets - totalLiabilities);
          console.log("  PNL Closing:", pnlClosing);
          
          let sumAssets = 0;
          let sumLiabs = 0;
          
          ledgers.forEach(l => {
              let effectiveGroup = l.groupName;
              if (["Sales Accounts", "Purchase Accounts", "Direct Expenses", "Direct Incomes", "Indirect Expenses", "Indirect Incomes"].includes(effectiveGroup)) return;
              if (!effectiveGroup || effectiveGroup.toLowerCase() === "unknown" || effectiveGroup.toLowerCase() === "uncategorized") return;
              
              let mainGroup = "Assets";
              if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities", "Capital Account", "Suspense A/c", "Sundry Creditors", "Duties & Taxes", "Loans (Liability)", "Secured Loans", "Unsecured Loans", "Primary", "Reserves & Surplus"].includes(effectiveGroup)) {
                  mainGroup = "Liabilities";
              } else if (["Non-Current Assets", "Current Assets", "Fixed Assets", "Investments", "Sundry Debtors", "Cash-in-hand", "Bank Accounts", "Closing Stock", "Deposits (Asset)", "Loans & Advances (Asset)"].includes(effectiveGroup)) {
                  mainGroup = "Assets";
              } else if (l.name.toLowerCase().includes("profit & loss") || l.name.toLowerCase().includes("p&l")) {
                  mainGroup = "Liabilities";
              } else {
                  mainGroup = l.nature === "CREDIT" ? "Liabilities" : "Assets";
              }
              
              let amt = l.closingBalance;
              if (mainGroup === "Assets") {
                  amt = l.nature === "DEBIT" ? Math.abs(amt) : -Math.abs(amt);
                  if(amt !== 0) { console.log(`ASSET: ${l.name} | ${amt}`); sumAssets += amt; }
              } else {
                  amt = l.nature === "CREDIT" ? Math.abs(amt) : -Math.abs(amt);
                  if(amt !== 0) { console.log(`LIAB:  ${l.name} | ${amt}`); sumLiabs += amt; }
              }
          });
          console.log(`CHECK SUM ASSETS: ${sumAssets}`);
          console.log(`CHECK SUM LIABS: ${sumLiabs} + PNL ${pnlClosing} = ${sumLiabs + pnlClosing}`);
      }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
