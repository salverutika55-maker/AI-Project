import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const id = "cmq6n9c6b0001l304y8ya0py5"; 
  const ledgers = await prisma.normalizedLedger.findMany({ where: { clientId: id, isActive: true } });
  
  const voucherLines = await prisma.normalizedVoucherLine.findMany({
      where: { voucher: { clientId: id } },
      select: { ledgerId: true, amount: true, entryType: true }
  });

  const totalMovements = {};
  voucherLines.forEach(vl => {
      if (!totalMovements[vl.ledgerId]) totalMovements[vl.ledgerId] = { debit: 0, credit: 0 };
      if (vl.entryType === "DEBIT") totalMovements[vl.ledgerId].debit += vl.amount;
      else totalMovements[vl.ledgerId].credit += vl.amount;
  });

  const report = [];

  ledgers.forEach(ledger => {
      let effectiveGroup = ledger.groupName;
      effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
      if (!effectiveGroup || effectiveGroup === "Unknown" || effectiveGroup === "Uncategorized") {
        const n = ledger.name.toLowerCase();
        if (n.includes("bank")) effectiveGroup = "Bank Accounts";
        else effectiveGroup = ledger.nature === "CREDIT" ? "Current Liabilities" : "Current Assets";
      }

      let mainGroup = "";
      if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities", "Capital Account", "Suspense A/c", "Sundry Creditors", "Duties & Taxes", "Loans (Liability)", "Secured Loans", "Unsecured Loans", "Primary", "Reserves & Surplus"].includes(effectiveGroup)) {
        mainGroup = "Liabilities";
      } else if (["Non-Current Assets", "Current Assets", "Fixed Assets", "Investments", "Sundry Debtors", "Cash-in-hand", "Bank Accounts", "Closing Stock", "Deposits (Asset)", "Loans & Advances (Asset)"].includes(effectiveGroup)) {
        mainGroup = "Assets";
      } else {
        if (["Sales Accounts", "Purchase Accounts", "Direct Expenses", "Direct Incomes", "Indirect Expenses", "Indirect Incomes"].includes(effectiveGroup)) return;
        mainGroup = ledger.nature === "CREDIT" ? "Liabilities" : "Assets";
      }

      const mvmt = totalMovements[ledger.id] || { debit: 0, credit: 0 };
      
      let expected = 0;
      let app = 0;

      // User's strictly requested formula:
      if (mainGroup === "Assets") {
          expected = Math.abs(ledger.openingBalance) + mvmt.debit - mvmt.credit;
      } else {
          expected = Math.abs(ledger.openingBalance) + mvmt.credit - mvmt.debit;
      }

      // Current App logic:
      let runningBalance = ledger.nature === "DEBIT" ? Math.abs(ledger.openingBalance) : -Math.abs(ledger.openingBalance);
      runningBalance += (mvmt.debit - mvmt.credit);
      app = mainGroup === "Assets" ? runningBalance : -runningBalance;

      if (expected !== 0 || app !== 0) {
          report.push({
              Ledger: ledger.name.substring(0, 20),
              Opening: ledger.openingBalance,
              Debit: mvmt.debit,
              Credit: mvmt.credit,
              Grp: mainGroup,
              Nat: ledger.nature,
              Exp: expected,
              App: app
          });
      }
  });

  console.table(report.slice(0, 30));
  process.exit(0);
}

run();
