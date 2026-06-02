async function test() {
  const dayBookXmlPayload = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Day Book</REPORTNAME>
        <STATICVARIABLES>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>1-Apr-2024</SVFROMDATE>
          <SVTODATE>31-Mar-2027</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    const res = await fetch("http://localhost:9000", { method: 'POST', body: dayBookXmlPayload, headers: { "Content-Type": "text/xml" }});
    const data = await res.text();
    console.log("Response length:", data.length);
    console.log(data.substring(0, 1000));
    const matches = data.match(/<VOUCHER[\s\S]*?<\/VOUCHER>/g);
    console.log(`Found ${matches ? matches.length : 0} vouchers.`);
  } catch(e) {
    console.error(e.message);
  }
}
test();
