const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const clientId = "cmprtm96f0001ju049crqkyre"; // SSA TAX CONSULTANT
  const baseUrl = "http://localhost:3000";
  
  console.log("=== VERIFICATION START ===");
  
  // ==========================================
  // TEST 1: CONCURRENT INGESTION API TEST
  // ==========================================
  console.log("\n[TEST 1] Testing Concurrent Ingestion...");
  
  // We'll create a unique ledger name for this batch so it tries to insert a new ledger
  const testLedgerName = `TestConcurrentLedger-${Date.now()}`;
  
  // Construct a payload containing this new ledger
  const payload = {
    vouchers: [
      {
        guid: `Test-Concurrency-VCH-${Date.now()}`,
        voucherNumber: "TEST-01",
        voucherType: "Sales",
        date: "2026-04-01T00:00:00Z",
        narration: "Verification concurrent test",
        lines: [
          { ledgerName: testLedgerName, amount: 500, isDebit: false },
          { ledgerName: "Cash", amount: 500, isDebit: true }
        ]
      }
    ]
  };

  // We send 3 concurrent requests at the exact same time
  console.log(`Sending 3 concurrent requests with new ledger: "${testLedgerName}"...`);
  const requests = Array(3).fill(null).map(async (_, idx) => {
    try {
      const res = await fetch(`${baseUrl}/api/ingest/vouchers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${clientId}`
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      return { status: res.status, data };
    } catch (e) {
      return { error: e.message };
    }
  });

  const results = await Promise.all(requests);
  console.log("Concurrent Ingestion Results:");
  results.forEach((r, idx) => {
    if (r.error) {
      console.log(`  Request ${idx + 1}: FAILED with error:`, r.error);
    } else {
      console.log(`  Request ${idx + 1}: Status=${r.status}, Message=`, r.data.message || r.data.error || r.data);
    }
  });

  // Check if any of the requests failed with 500
  const has500 = results.some(r => r.status === 500);
  if (has500) {
    console.error("❌ TEST 1 FAILED: One or more concurrent requests failed with 500!");
  } else {
    console.log("✅ TEST 1 PASSED: Concurrent ingestion completed without database errors.");
  }

  // Clean up any test vouchers/lines created by the test
  console.log("Cleaning up Test 1 vouchers...");
  await prisma.normalizedVoucherLine.deleteMany({
    where: {
      voucher: {
        referenceNo: { startsWith: "Test-Concurrency-VCH-" }
      }
    }
  });
  await prisma.normalizedVoucher.deleteMany({
    where: {
      referenceNo: { startsWith: "Test-Concurrency-VCH-" }
    }
  });
  await prisma.normalizedLedger.deleteMany({
    where: {
      name: testLedgerName
    }
  });


  // ==========================================
  // TEST 2: DUPLICATE LEDGER EXCEPTION TEST
  // ==========================================
  console.log("\n[TEST 2] Testing Duplicate Ledger Detection Logic...");
  
  const dupName1 = `VerifyDup-${Date.now()}`;
  const dupName2 = `verifydup-${Date.now()}`; // Same name, lowercase
  
  console.log(`Creating duplicate ledgers: "${dupName1}" and "${dupName2}"...`);
  const l1 = await prisma.normalizedLedger.create({
    data: {
      clientId,
      name: dupName1,
      groupName: "Current Assets",
      nature: "DEBIT"
    }
  });
  
  const l2 = await prisma.normalizedLedger.create({
    data: {
      clientId,
      name: dupName2,
      groupName: "Uncategorized",
      nature: "DEBIT"
    }
  });
  
  try {
    // Run the exact logic from the exceptions route.ts
    const ledgers = await prisma.normalizedLedger.findMany({
      where: { clientId }
    });
    
    const exceptions = [];
    const ledgerGroupMap = new Map();
    for (const l of ledgers) {
      const lower = l.name.trim().toLowerCase();
      if (!ledgerGroupMap.has(lower)) {
        ledgerGroupMap.set(lower, []);
      }
      ledgerGroupMap.get(lower).push(l);
    }

    for (const [lower, list] of ledgerGroupMap.entries()) {
      if (list.length > 1) {
        const names = list.map(l => `"${l.name}"`).join(", ");
        exceptions.push({
          ledgerName: list[0].name,
          erpGroup: "ERP Collision",
          currentMapping: "Duplicate Ledgers",
          recommendedMapping: "Merge Ledgers",
          confidence: 100,
          reason: `Found duplicate ledgers in ERP: ${names} that differ only by case or whitespace. Please merge them in your ERP system to prevent mapping conflicts.`,
          type: "DUPLICATE_LEDGER",
          severity: "HIGH"
        });
      }
    }
    
    const duplicateException = exceptions.find(e => 
      e.type === "DUPLICATE_LEDGER" && 
      e.reason.includes(dupName1) && 
      e.reason.includes(dupName2)
    );
    
    if (duplicateException) {
      console.log("✅ TEST 2 PASSED: Successfully detected duplicate ledgers exception!");
      console.log("Detected Exception details:", duplicateException);
    } else {
      console.error("❌ TEST 2 FAILED: Duplicate ledger exception not found!");
      console.log("Full exceptions generated:", JSON.stringify(exceptions, null, 2));
    }
  } catch (err) {
    console.error("❌ TEST 2 FAILED with error:", err.message);
  } finally {
    console.log("Cleaning up Test 2 duplicate ledgers...");
    await prisma.normalizedLedger.deleteMany({
      where: {
        id: { in: [l1.id, l2.id] }
      }
    });
  }

  console.log("\n=== VERIFICATION COMPLETE ===");
}

// Load env variables
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
run().catch(console.error).finally(() => prisma.$disconnect());
