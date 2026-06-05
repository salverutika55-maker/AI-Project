const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function syncMasterCOA() {
  const client = await prisma.client.findFirst();
  if (!client) {
    console.log("No client found");
    return;
  }

  const ledgersArray = [
    { name: "Aaliya Enterprises", parentGroup: "Sundry Debtors" },
    { name: "ABZ Automation", parentGroup: "Sundry Creditors" },
    { name: "Accounting Chargres", parentGroup: "Indirect Expenses" },
    { name: "Advance Paints Private Limited", parentGroup: "Sundry Creditors" },
    { name: "Ajit Pathak", parentGroup: "Sundry Debtors" },
    { name: "Alka Shah", parentGroup: "Sundry Debtors" },
    { name: "Sales", parentGroup: "Sales Accounts" },
    { name: "Axis Bank OD", parentGroup: "Bank OD A/c" },
    { name: "Rent", parentGroup: "Indirect Expenses" },
    { name: "CGST", parentGroup: "Duties & Taxes" },
    { name: "Cash", parentGroup: "Cash-in-hand" },
    { name: "HDFC Bank", parentGroup: "Bank Accounts" }
  ];

  console.log(`Syncing ${ledgersArray.length} ledgers for client ${client.name}...`);

  for (const ledger of ledgersArray) {
    const groupName = ledger.parentGroup || "Uncategorized";
    const nature = groupName.toLowerCase().includes("creditor") || 
                   groupName.toLowerCase().includes("liabilit") || 
                   groupName.toLowerCase().includes("capital") || 
                   groupName.toLowerCase().includes("income") || 
                   groupName.toLowerCase().includes("sales") || 
                   groupName.toLowerCase().includes("tax") ||
                   groupName.toLowerCase().includes("duty")
                   ? "CREDIT" : "DEBIT";

    const existingLedger = await prisma.normalizedLedger.findFirst({
      where: { clientId: client.id, name: ledger.name }
    });

    if (existingLedger) {
      await prisma.normalizedLedger.update({
        where: { id: existingLedger.id },
        data: { groupName, nature, isActive: true }
      });
      console.log(`Updated ${ledger.name} -> ${groupName}`);
    } else {
      await prisma.normalizedLedger.create({
        data: {
          clientId: client.id,
          name: ledger.name,
          groupName,
          nature,
          isActive: true
        }
      });
      console.log(`Created ${ledger.name} -> ${groupName}`);
    }
  }

  console.log("Master COA Sync Complete! Check the Unified Mapping UI.");
}

syncMasterCOA().catch(console.error).finally(() => prisma.$disconnect());
