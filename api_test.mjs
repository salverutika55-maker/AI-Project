import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testAPI() {
    const id = "cmq6n9c6b0001l304y8ya0py5"; // Color Interior client id

    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId: id, isActive: true }
    });

    const bsMappings = []; // assuming empty for test

    const ledgerBalances = {};
    ledgers.forEach(l => {
      ledgerBalances[l.name] = { openBal: l.openingBalance, closeBal: l.closingBalance, nature: l.nature };
    });

    const dataNodes = [];
    ledgers.forEach(ledger => {
      let effectiveGroup = ledger.groupName;
      let effectiveSubGroup = effectiveGroup;
      
      effectiveGroup = effectiveGroup.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
      
      if (!effectiveGroup) {
          effectiveGroup = "Uncategorized";
          effectiveSubGroup = "Uncategorized";
      }

      let mainGroup = "";
      if (["Owner's Funds", "Non-Current Liabilities", "Current Liabilities", "Capital Account", "Suspense A/c", "Sundry Creditors", "Duties & Taxes", "Loans (Liability)", "Secured Loans", "Unsecured Loans", "Primary", "Reserves & Surplus"].includes(effectiveGroup)) {
        mainGroup = "Liabilities";
      } else if (["Non-Current Assets", "Current Assets", "Fixed Assets", "Investments", "Sundry Debtors", "Cash-in-hand", "Bank Accounts", "Closing Stock", "Deposits (Asset)", "Loans & Advances (Asset)"].includes(effectiveGroup)) {
        mainGroup = "Assets";
      } else {
        if (["Sales Accounts", "Purchase Accounts", "Direct Expenses", "Direct Incomes", "Indirect Expenses", "Indirect Incomes"].includes(effectiveGroup)) {
            return;
        }
        mainGroup = "Assets"; 
      }

      let finalGroup = mainGroup === "Assets" ? "Current Assets" : "Current Liabilities";
      let finalSubGroup = mainGroup === "Assets" ? "Other Current Assets" : "Other Current Liabilities";
      
      const gMatch = effectiveGroup.toLowerCase();
      
      if (mainGroup === "Liabilities") {
          if (["owner's funds", "capital account", "reserves & surplus", "retained earnings"].some(x => gMatch.includes(x))) {
              finalGroup = "Owner's Funds";
              finalSubGroup = gMatch.includes("capital") ? "Share Capital" : (gMatch.includes("profit") ? "Profit & Loss Account" : "Reserves & Surplus");
          } else if (["non-current", "long term", "secured loans", "unsecured loans", "loans (liability)"].some(x => gMatch.includes(x))) {
              finalGroup = "Non-Current Liabilities";
              finalSubGroup = "Unsecured Loans";
          } else {
              finalGroup = "Current Liabilities";
              if (["duties & taxes", "tax"].some(x => gMatch.includes(x))) finalSubGroup = "Duties & Taxes";
              else if (["suspense"].some(x => gMatch.includes(x))) finalSubGroup = "Suspense A/c";
              else if (["sundry creditors", "trade payable", "sundry creditor"].some(x => gMatch.includes(x))) finalSubGroup = "Trade Payable";
              else if (["provisions", "provision"].some(x => gMatch.includes(x))) finalSubGroup = "Provisions";
              else if (["short term borrowing", "bank od"].some(x => gMatch.includes(x))) finalSubGroup = "Short Term Borrowing";
              else finalSubGroup = "Other Current Liabilities";
          }
      } else {
          if (["branch", "division"].some(x => gMatch.includes(x))) {
              finalGroup = "Branch Account";
              finalSubGroup = "Branch Account";
          } else if (["non-current", "fixed assets", "investments", "investment"].some(x => gMatch.includes(x))) {
              finalGroup = "Non-Current Assets";
              finalSubGroup = gMatch.includes("investment") ? "Investments" : "Fixed Assets";
          } else {
              finalGroup = "Current Assets";
              if (["closing stock", "inventory", "stock"].some(x => gMatch.includes(x))) finalSubGroup = "Closing Stock";
              else if (["sundry debtors", "trade receivable", "sundry debtor"].some(x => gMatch.includes(x))) finalSubGroup = "Trade Receivable";
              else if (["cash"].some(x => gMatch.includes(x))) finalSubGroup = "Cash-In-Hand";
              else if (["bank"].some(x => gMatch.includes(x))) finalSubGroup = "Bank Accounts";
              else if (["deposit"].some(x => gMatch.includes(x))) finalSubGroup = "Deposits (Assets)";
              else if (["loan", "advance"].some(x => gMatch.includes(x))) finalSubGroup = "Short Term Loan & Advance";
              else finalSubGroup = "Other Current Assets";
          }
      }
      
      effectiveGroup = finalGroup;
      effectiveSubGroup = finalSubGroup;

      const ledgerInfo = ledgerBalances[ledger.name] || { openBal: 0, closeBal: 0, nature: mainGroup === "Assets" ? "DEBIT" : "CREDIT" };
      
      let baseOpen = ledgerInfo.openBal;
      let baseClose = ledgerInfo.closeBal;
      
      if (mainGroup === "Assets") {
          baseOpen = ledgerInfo.nature === "DEBIT" ? Math.abs(baseOpen) : -Math.abs(baseOpen);
          baseClose = ledgerInfo.nature === "DEBIT" ? Math.abs(baseClose) : -Math.abs(baseClose);
      } else if (mainGroup === "Liabilities" || mainGroup === "Equity") {
          baseOpen = ledgerInfo.nature === "CREDIT" ? Math.abs(baseOpen) : -Math.abs(baseOpen);
          baseClose = ledgerInfo.nature === "CREDIT" ? Math.abs(baseClose) : -Math.abs(baseClose);
      }
      
      const months = ["Opening", "Mar"];
      
      months.forEach((month, idx) => {
        let mockedBalance = month === "Opening" ? baseOpen : baseClose; 

        dataNodes.push({
          id: ledger.id + "-" + month,
          period: month,
          mainGroup,
          groupName: effectiveGroup,
          subGroupName: effectiveSubGroup,
          ledgerName: ledger.name,
          amount: mockedBalance,
          nature: ledgerInfo.nature
        });
      });
    });

    const marNodes = dataNodes.filter(n => n.period === "Mar");
    console.log("Total Mar Nodes:", marNodes.length);
    console.log("Mar Assets sum:", marNodes.filter(n => n.mainGroup === "Assets").reduce((a, b) => a + b.amount, 0));
    console.log("Mar Liabilities sum:", marNodes.filter(n => n.mainGroup === "Liabilities").reduce((a, b) => a + b.amount, 0));

    const openingNodes = dataNodes.filter(n => n.period === "Opening");
    console.log("Opening Assets sum:", openingNodes.filter(n => n.mainGroup === "Assets").reduce((a, b) => a + b.amount, 0));
    console.log("Opening Liabilities sum:", openingNodes.filter(n => n.mainGroup === "Liabilities").reduce((a, b) => a + b.amount, 0));

    console.log("First 3 Mar Nodes:", marNodes.slice(0, 3));
}

testAPI().catch(console.error).finally(() => prisma.$disconnect());
