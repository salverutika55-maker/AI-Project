const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const tracePath = path.resolve(__dirname, '../src/lib/services/balance-sheet-trace');
const { buildBalanceSheetTrace } = require(tracePath);

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre";
  const year = 2025;

  const targetFYStart = new Date(`${year}-04-01T00:00:00.000Z`);
  const targetFYEnd = new Date(`${year + 1}-03-31T23:59:59.999Z`);

  console.log(`Reconciling for client: ${clientId}, FY: ${year}`);
  console.log(`Target FY start: ${targetFYStart.toISOString()}`);
  console.log(`Target FY end:   ${targetFYEnd.toISOString()}`);

  // Fetch all voucher lines for the client directly from DB
  const rawVLines = await prisma.normalizedVoucherLine.findMany({
    where: {
      voucher: {
        clientId,
        date: {
          gte: targetFYStart,
          lte: targetFYEnd
        }
      }
    },
    include: {
      ledger: true,
      voucher: true
    }
  });

  console.log(`\nFound ${rawVLines.length} raw voucher lines in DB for this period.`);

  // Aggregate by ledger name
  const dbTotals = {};
  for (const line of rawVLines) {
    const lName = line.ledger.name;
    if (!dbTotals[lName]) dbTotals[lName] = { debit: 0, credit: 0 };
    
    if (line.entryType === "DEBIT") {
      dbTotals[lName].debit += line.amount;
    } else {
      dbTotals[lName].credit += line.amount;
    }
  }

  // Get calculation engine traces
  const trace = await buildBalanceSheetTrace(clientId, year);

  console.log("\n=== COMPARING DB TOTALS VS ENGINE TOTALS ===");
  let discrepancies = 0;
  
  // Iterate through all active mapped ledgers
  for (const t of trace.ledgerTraces) {
    const name = t.ledgerName;
    const dbVal = dbTotals[name] || { debit: 0, credit: 0 };
    
    // Sum monthly movements from engine
    let engineDr = 0;
    let engineCr = 0;
    for (const m of ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]) {
      const mt = t.monthTraces[m];
      if (mt) {
        engineDr += mt.debit;
        engineCr += mt.credit;
      }
    }

    const diffDr = Math.abs(dbVal.debit - engineDr);
    const diffCr = Math.abs(dbVal.credit - engineCr);

    if (diffDr > 0.01 || diffCr > 0.01) {
      discrepancies++;
      console.log(`- Mismatch in ${name}:`);
      console.log(`  DB:     Dr = ${dbVal.debit.toFixed(2)}, Cr = ${dbVal.credit.toFixed(2)}`);
      console.log(`  Engine: Dr = ${engineDr.toFixed(2)}, Cr = ${engineCr.toFixed(2)}`);
      console.log(`  Diff:   Dr = ${diffDr.toFixed(2)}, Cr = ${diffCr.toFixed(2)}`);
    }
  }

  console.log(`\nTotal ledger discrepancies found: ${discrepancies}`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
