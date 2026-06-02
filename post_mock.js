async function test() {
  try {
    const payload = {
      vouchers: [
        {
          guid: "test-guid-1",
          voucherNumber: "V-01",
          voucherType: "Sales",
          date: "2026-04-01T00:00:00Z",
          narration: "Test",
          lines: [
            { ledgerName: "Sales", amount: 1000, isDebit: false },
            { ledgerName: "Cash", amount: 1000, isDebit: true }
          ]
        }
      ]
    };
    
    const res = await fetch("http://localhost:3000/api/ingest/vouchers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer REDACTED_TEST_BEARER"
      },
      body: JSON.stringify(payload)
    });
    
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
  } catch (e) {
    console.error(e.message);
  }
}
test();
