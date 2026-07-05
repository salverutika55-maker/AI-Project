import assert from "assert";
import { prisma } from "../prisma";
import { buildBalanceSheetTrace } from "./balance-sheet-trace";

async function runTests() {
  console.log("=== RUNNING PERIOD ISOLATION REGRESSION TESTS ===");
  const testClientId = "client_test_period_isolation";

  // Cleanup pre-existing mock data to start clean
  await cleanup(testClientId);

  try {
    // Get an existing organization ID to link with
    const realClient = await prisma.client.findFirst();
    if (!realClient) {
      throw new Error("No existing client/organization found in database to link tests to.");
    }
    const orgId = realClient.organizationId;

    // 1. Create client
    await prisma.client.create({
      data: {
        id: testClientId,
        name: "Test Period Isolation Org",
        software: "TALLY",
        organizationId: orgId
      }
    });

    // 2. Create Suspense Account ledger
    const suspenseLedgerId = "ledger_suspense_test";
    await prisma.normalizedLedger.create({
      data: {
        id: suspenseLedgerId,
        clientId: testClientId,
        name: "Suspense Account",
        groupName: "Suspense A/c",
        openingBalance: 0,
        closingBalance: 1600,
        nature: "CREDIT",
        isActive: true,
        sourceStatus: "active"
      }
    });

    // 2b. Create Drawing ledger
    const drawingLedgerId = "ledger_drawing_test";
    await prisma.normalizedLedger.create({
      data: {
        id: drawingLedgerId,
        clientId: testClientId,
        name: "Drawing",
        groupName: "Capital Account",
        openingBalance: 0,
        closingBalance: 483715,
        nature: "DEBIT",
        isActive: true,
        sourceStatus: "active"
      }
    });

    // 3. Create mapping for Suspense Account
    await prisma.unifiedLedgerMapping.create({
      data: {
        id: "mapping_suspense_test",
        clientId: testClientId,
        softwareLedgerName: "Suspense Account",
        statementType: "BS",
        groupName: "Suspense A/c",
        subHeadName: "Suspense A/c"
      }
    });

    // 3b. Create mapping for Drawing ledger
    await prisma.unifiedLedgerMapping.create({
      data: {
        id: "mapping_drawing_test",
        clientId: testClientId,
        softwareLedgerName: "Drawing",
        statementType: "BS",
        groupName: "Capital Account",
        subHeadName: "Capital Account"
      }
    });

    // 4. Create April 2026 voucher (Credit 1600)
    const voucherId = "vch_suspense_test";
    await prisma.normalizedVoucher.create({
      data: {
        id: voucherId,
        clientId: testClientId,
        voucherNumber: "V-001",
        referenceNo: "REF-001",
        date: new Date("2026-04-04T10:00:00.000Z"),
        type: "JOURNAL",
        totalAmount: 1600
      }
    });

    await prisma.normalizedVoucherLine.create({
      data: {
        id: "line_suspense_test",
        voucherId,
        ledgerId: suspenseLedgerId,
        amount: 1600,
        entryType: "CREDIT"
      }
    });

    // 4b. Create Drawing vouchers (V1 in FY 24 Debit 443890, V2 in FY 25 Debit 39825)
    await prisma.normalizedVoucher.create({
      data: {
        id: "vch_drawing_fy24",
        clientId: testClientId,
        voucherNumber: "V-DRW-01",
        referenceNo: "REF-DRW-01",
        date: new Date("2024-06-24T10:00:00.000Z"),
        type: "JOURNAL",
        totalAmount: 443890
      }
    });
    await prisma.normalizedVoucherLine.create({
      data: {
        id: "line_drawing_fy24",
        voucherId: "vch_drawing_fy24",
        ledgerId: drawingLedgerId,
        amount: 443890,
        entryType: "DEBIT"
      }
    });

    await prisma.normalizedVoucher.create({
      data: {
        id: "vch_drawing_fy25",
        clientId: testClientId,
        voucherNumber: "V-DRW-02",
        referenceNo: "REF-DRW-02",
        date: new Date("2025-11-07T10:00:00.000Z"),
        type: "JOURNAL",
        totalAmount: 39825
      }
    });
    await prisma.normalizedVoucherLine.create({
      data: {
        id: "line_drawing_fy25",
        voucherId: "vch_drawing_fy25",
        ledgerId: drawingLedgerId,
        amount: 39825,
        entryType: "DEBIT"
      }
    });

    // --- TEST CASE 1: Suspense Account target year 2025 ---
    console.log("Running Test Case 1: FY 2025 target year (April 2026 transaction must not leak back)...");
    const trace2025 = await buildBalanceSheetTrace(testClientId, 2025);
    const suspenseTrace2025 = trace2025.ledgerTraces.find(t => t.ledgerId === suspenseLedgerId);

    assert(suspenseTrace2025, "Suspense Account trace should exist in FY 2025");
    
    // Assert Opening and all months are 0 in FY 2025
    assert.strictEqual(
      suspenseTrace2025.monthTraces["Opening"].opening, 
      0, 
      "FY 2025 Opening must be 0"
    );
    assert.strictEqual(
      suspenseTrace2025.monthTraces["Opening"].closing, 
      0, 
      "FY 2025 Opening closing must be 0"
    );
    assert.strictEqual(
      suspenseTrace2025.monthTraces["Mar"].closing, 
      0, 
      "FY 2025 March closing must be 0"
    );
    console.log("✔ Test Case 1 Passed!");

    // --- TEST CASE 2: Suspense Account target year 2026 ---
    console.log("Running Test Case 2: FY 2026 target year (Chronological roll-forward verification)...");
    const trace2026 = await buildBalanceSheetTrace(testClientId, 2026);
    const suspenseTrace2026 = trace2026.ledgerTraces.find(t => t.ledgerId === suspenseLedgerId);

    assert(suspenseTrace2026, "Suspense Account trace should exist in FY 2026");
    
    // Opening should be 0
    assert.strictEqual(
      suspenseTrace2026.monthTraces["Opening"].closing, 
      0, 
      "FY 2026 Opening must be 0"
    );
    // April should roll forward to 1600
    assert.strictEqual(
      suspenseTrace2026.monthTraces["Apr"].closing, 
      1600, 
      "FY 2026 April closing must be 1600"
    );
    // May should remain 1600
    assert.strictEqual(
      suspenseTrace2026.monthTraces["May"].closing, 
      1600, 
      "FY 2026 May closing must be 1600"
    );
    console.log("✔ Test Case 2 Passed!");

    // --- TEST CASE 3: May-only transaction isolation ---
    console.log("Running Test Case 3: May transaction must not affect April...");
    // Modify voucher date to May 2026
    await prisma.normalizedVoucher.update({
      where: { id: voucherId },
      data: { date: new Date("2026-05-15T10:00:00.000Z") }
    });

    const trace2026May = await buildBalanceSheetTrace(testClientId, 2026);
    const suspenseTrace2026May = trace2026May.ledgerTraces.find(t => t.ledgerId === suspenseLedgerId);

    assert(suspenseTrace2026May, "Suspense Account trace should exist");
    assert.strictEqual(
      suspenseTrace2026May.monthTraces["Apr"].closing, 
      0, 
      "April closing must be 0 when transaction is in May"
    );
    assert.strictEqual(
      suspenseTrace2026May.monthTraces["May"].closing, 
      1600, 
      "May closing must be 1600"
    );
    console.log("✔ Test Case 3 Passed!");

    // --- TEST CASE 4: Multi-year company isolation check ---
    console.log("Running Test Case 4: Isolation across different client accounts...");
    const otherClientId = "client_test_period_isolation_other";
    await cleanup(otherClientId);

    await prisma.client.create({
      data: {
        id: otherClientId,
        name: "Other Isolation Org",
        software: "TALLY",
        organizationId: orgId
      }
    });

    const otherTrace = await buildBalanceSheetTrace(otherClientId, 2026);
    const suspenseTraceOther = otherTrace.ledgerTraces.find(t => t.ledgerName === "Suspense Account");
    assert(!suspenseTraceOther, "Suspense Account from another client must not be matched or leak");
    console.log("✔ Test Case 4 Passed!");

    await cleanup(otherClientId);

    // --- TEST CASE 5: Drawing Ledger Owner's Funds Debit Balance check ---
    console.log("Running Test Case 5: Drawing Ledger Owner's Funds Debit Balance check...");
    
    // FY 2024 Check
    const trace2024D = await buildBalanceSheetTrace(testClientId, 2024);
    const drawingTrace2024 = trace2024D.ledgerTraces.find(t => t.ledgerId === drawingLedgerId);
    assert(drawingTrace2024, "Drawing trace should exist in FY 2024");
    assert.strictEqual(
      drawingTrace2024.monthTraces["Opening"].closing,
      0,
      "FY 2024 Opening balance of Drawing must be 0"
    );
    assert.strictEqual(
      drawingTrace2024.monthTraces["Mar"].closing,
      -443890,
      "FY 2024 March closing balance of Drawing must be -443890 (representing ₹4,43,890 Debit)"
    );

    // FY 2025 Check
    const trace2025D = await buildBalanceSheetTrace(testClientId, 2025);
    const drawingTrace2025 = trace2025D.ledgerTraces.find(t => t.ledgerId === drawingLedgerId);
    assert(drawingTrace2025, "Drawing trace should exist in FY 2025");
    assert.strictEqual(
      drawingTrace2025.monthTraces["Opening"].closing,
      -443890,
      "FY 2025 Opening balance of Drawing must carry forward as -443890"
    );
    assert.strictEqual(
      drawingTrace2025.monthTraces["Apr"].closing,
      -443890,
      "FY 2025 April closing balance of Drawing must carry forward as -443890"
    );
    assert.strictEqual(
      drawingTrace2025.monthTraces["Mar"].closing,
      -483715,
      "FY 2025 March closing balance of Drawing must include November addition and be -483715 (representing ₹4,83,715 Debit)"
    );
    console.log("✔ Test Case 5 Passed!");

    await cleanup(otherClientId);
    console.log("\n=== ALL REGRESSION TESTS COMPLETED SUCCESSFULLY! ===");

  } catch (error) {
    console.error("❌ REGRESSION TEST FAILURE:", error);
    process.exit(1);
  } finally {
    await cleanup(testClientId);
  }
}

async function cleanup(clientId: string) {
  try {
    const vList = await prisma.normalizedVoucher.findMany({ where: { clientId } });
    const vIds = vList.map(v => v.id);

    if (vIds.length > 0) {
      await prisma.normalizedVoucherLine.deleteMany({ where: { voucherId: { in: vIds } } });
      await prisma.normalizedVoucher.deleteMany({ where: { id: { in: vIds } } });
    }

    await prisma.unifiedLedgerMapping.deleteMany({ where: { clientId } });
    await prisma.normalizedLedger.deleteMany({ where: { clientId } });
    await prisma.client.deleteMany({ where: { id: clientId } });
  } catch (e) {
    console.error("Cleanup error:", e);
  }
}

runTests();
