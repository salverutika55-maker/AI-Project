const fs = require('fs');

async function test() {
  const payload = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>Voucher</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        <SVFROMDATE>20240401</SVFROMDATE>
        <SVTODATE>20260630</SVTODATE>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>`;

  try {
    const res = await fetch("http://localhost:9000", { method: 'POST', body: payload, headers: { "Content-Type": "text/xml" }});
    const text = await res.text();
    fs.writeFileSync('tally_response.xml', text);
    console.log("Response saved. Length:", text.length);
  } catch(e) {
    console.error(e.message);
  }
}
test();
