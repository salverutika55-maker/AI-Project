const apiKey = 'cmprtm96f0001ju049crqkyre';
const url = 'http://localhost:3000/api/ingest/vouchers';

async function testCase(name, payload) {
  console.log(`\n=== Testing CASE: ${name} ===`);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });
    
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    try {
      console.log(`Body:`, JSON.parse(text));
    } catch {
      console.log(`Body:`, text);
    }
  } catch (err) {
    console.log(`Error:`, err.message);
  }
}

async function run() {
  // CASE A: 0 vouchers
  await testCase('CASE A: 0 Vouchers', {
    vouchers: [],
    fromDate: '20231101',
    toDate: '20231130',
    periodKey: '2023-11',
    companyGuid: 'edbc2cdb-28fd-4130-8df1-e96923584225-0000001d'
  });

  // CASE B: 1 voucher
  await testCase('CASE B: 1 Voucher', {
    vouchers: [
      {
        guid: 'test-guid-1',
        voucherNumber: 'TEST-01',
        date: '2024-04-15T00:00:00.000Z',
        voucherType: 'Payment',
        narration: 'Test payment',
        totalAmount: 100,
        lines: [
          { ledgerName: 'Cash', amount: 100, isDebit: true },
          { ledgerName: 'Rent', amount: 100, isDebit: false }
        ]
      }
    ],
    fromDate: '20240401',
    toDate: '20240430',
    periodKey: '2024-04',
    companyGuid: 'edbc2cdb-28fd-4130-8df1-e96923584225-0000001d'
  });
}
run();
