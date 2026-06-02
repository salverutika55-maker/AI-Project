const fs = require('fs');
async function test() {
  const payload = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>FinVoucherCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="FinVoucherCollection" ISMODIFY="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>Voucher</TYPE>
            <FETCH>*, AllLedgerEntries.*</FETCH>
            <FILTER>PeriodFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="PeriodFilter">
            $Date &gt;= $$Date:"20000101" AND $Date &lt;= $$Date:"20991231"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  try {
    const res = await fetch("http://localhost:9000", { method: 'POST', body: payload, headers: { "Content-Type": "text/xml" }});
    const data = await res.text();
    fs.writeFileSync('tally_all_vouchers.xml', data);
    console.log("Response saved to tally_all_vouchers.xml. Length:", data.length);
  } catch(e) {
    console.error(e.message);
  }
}
test();
