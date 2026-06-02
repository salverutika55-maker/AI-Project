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
            $Date &gt;= $$Date:"1-Jul-2024" AND $Date &lt;= $$Date:"31-Jul-2024"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

  try {
    const res = await fetch("http://localhost:9000", { method: 'POST', body: payload, headers: { "Content-Type": "text/xml" }});
    const data = await res.text();
    fs.writeFileSync('tally_jul_2024.xml', data);
    console.log("Response saved. Length:", data.length);
    const matches = data.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/g);
    console.log("Found", matches ? matches.length : 0, "vouchers in Jul 2024.");
  } catch(e) {
    console.error(e.message);
  }
}
test();
