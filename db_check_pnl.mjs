import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
    const id = "cmq6n9c6b0001l304y8ya0py5";
    const ledgers = await prisma.normalizedLedger.findMany({
        where: { clientId: id }
    });

    const pnl = ledgers.find(l => l.name.toLowerCase().includes("profit & loss") || l.name.toLowerCase().includes("p&l"));
    if (pnl) {
        console.log(`P&L Ledger: ${pnl.name}, Closing=${pnl.closingBalance}, Nature=${pnl.nature}`);
    } else {
        console.log("No P&L ledger found!");
    }

    // Check all PnL account items (Sales, Purchases, Expenses)
    const pnlGroups = ["Sales Accounts", "Purchase Accounts", "Direct Expenses", "Direct Incomes", "Indirect Expenses", "Indirect Incomes"];
    const pnlLedgers = ledgers.filter(l => pnlGroups.includes(l.groupName));
    let currentYearProfit = 0;
    
    pnlLedgers.forEach(l => {
       const isIncome = ["Sales Accounts", "Direct Incomes", "Indirect Incomes"].includes(l.groupName);
       const isExpense = ["Purchase Accounts", "Direct Expenses", "Indirect Expenses"].includes(l.groupName);
       
       if (isIncome) {
           currentYearProfit += (l.nature === "CREDIT" ? l.closingBalance : -l.closingBalance);
       } else if (isExpense) {
           currentYearProfit -= (l.nature === "DEBIT" ? l.closingBalance : -l.closingBalance);
       }
    });
    console.log(`Current Year Profit from Ledgers: ${currentYearProfit}`);
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
