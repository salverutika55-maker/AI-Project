async function test() {
  try {
    const xml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Ledgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="List of Ledgers" ISMODIFY="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>Ledger</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>Parent</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

    const res = await fetch('http://localhost:9000', {
      method: 'POST',
      body: xml,
      headers: { 'Content-Type': 'text/xml' }
    });
    const text = await res.text();
    console.log(text.substring(1300, 2500));
  } catch (e) {
    console.log('Error connecting to Tally. Is it running on port 9000?', e.message);
  }
}
test();
