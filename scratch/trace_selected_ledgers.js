const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const tracePath = path.resolve(__dirname, '../src/lib/services/balance-sheet-trace');
const { buildBalanceSheetTrace } = require(tracePath);

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  const client = await prisma.client.findUnique({
    where: { id: clientId }
  });
  if (!client) {
    console.log("No client found");
    return;
  }
  
  const trace = await buildBalanceSheetTrace(client.id, 2025);

  const ledgersToTrace = [
    { name: "Ajit Pathak", type: "1. Asset with incorrect figure (expected 500 Cr, app shows -500)" },
    { name: "Drawing", type: "2. Liability with incorrect figure (expected 483715 Dr, app shows -483715)" },
    { name: "Nilson Electricals", type: "3. Ledger with closing balance exactly ₹0" },
    { name: "GST Payments", type: "4. Mapped ledger showing ₹0 despite activity" },
    { name: "Gst Tax Account", type: "5. Ledger with Cr opening balance" },
    { name: "TDS Receivable", type: "6. Ledger with Dr opening balance" }
  ];

  console.log("=== PHASE 1: END-TO-END LEDGER TRACES ===");

  for (const item of ledgersToTrace) {
    const l = await prisma.normalizedLedger.findFirst({
      where: { clientId: client.id, name: { equals: item.name, mode: 'insensitive' } }
    });
    
    if (!l) {
      console.log(`\n[Not Found] ${item.name} (${item.type})`);
      continue;
    }

    const t = trace.ledgerTraces.find(x => x.ledgerId === l.id);
    const mapping = trace.mappings.find(m => m.softwareLedgerName.trim().toLowerCase() === l.name.trim().toLowerCase());
    
    console.log(`\n==================================================`);
    console.log(`Category: ${item.type}`);
    console.log(`==================================================`);
    console.log(`Ledger Name:               ${l.name}`);
    console.log(`Ledger ID / GUID:          ${l.id}`);
    console.log(`Company ID:                ${client.sourceCompanyId || 'N/A'}`);
    console.log(`Company Name:              ${client.name}`);
    console.log(`Financial Year:            2025-26`);
    console.log(`Tally Parent Group:        ${l.groupName}`);
    console.log(`Mapped Statement Type:     ${mapping ? mapping.statementType : 'UNMAPPED'}`);
    console.log(`Mapped Group:              ${mapping ? mapping.groupName : 'UNMAPPED'}`);
    console.log(`Mapped Subhead:            ${mapping ? mapping.subHeadName : 'UNMAPPED'}`);
    console.log(`Active/Deleted Status:     ${l.isActive ? 'Active' : 'Inactive'} (Status: ${l.sourceStatus})`);
    
    // DB state
    console.log(`Raw DB Opening Amount:     ${l.openingBalance}`);
    console.log(`Raw DB Nature:             ${l.nature}`);
    console.log(`Raw DB Closing Amount:     ${l.closingBalance}`);
    
    // Calculate Monthly total debits and credits in 2025
    let monthlyDr = 0;
    let monthlyCr = 0;
    if (t) {
      for (const m of ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]) {
        const mt = t.monthTraces[m];
        if (mt) {
          monthlyDr += mt.debit;
          monthlyCr += mt.credit;
        }
      }
    }

    // Engine trace
    if (t) {
      console.log(`Opening Source:            ${t.openingSource}`);
      console.log(`Normalized Opening Amount: ${t.monthTraces.Opening?.closing}`);
      console.log(`Monthly Debit Sum:         ${monthlyDr}`);
      console.log(`Monthly Credit Sum:        ${monthlyCr}`);
      console.log(`Calculated Closing:        ${t.monthTraces.Mar?.closing}`);
      console.log(`Calculated Closing Nature: ${t.monthTraces.Mar?.closing > 0 ? (t.mainGroup === 'Assets' ? 'Dr' : 'Cr') : (t.mainGroup === 'Assets' ? 'Cr' : 'Dr')}`);
    } else {
      console.log(`Calculated Trace:          NOT APPLICABLE (unmapped/inactive)`);
    }

    // API / Frontend state
    const node = trace.dataNodes.find(n => n.ledgerId === l.id && n.period === "Mar");
    console.log(`API Returned Amount:       ${node ? node.amount : 'N/A'}`);
    console.log(`Frontend Displayed Amount: ${node ? node.amount : 'N/A'}`);
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
