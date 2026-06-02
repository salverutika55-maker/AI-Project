const http = require('http');

const xmlPayload = `<ENVELOPE>
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
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

const options = {
    hostname: 'localhost',
    port: 9000,
    path: '/',
    method: 'POST',
    headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(xmlPayload)
    }
};

const req = http.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        // Simple string matching to count ledgers
        const matches = data.match(/<NAME>(.*?)<\/NAME>/g);
        if (matches) {
            const ledgers = matches.map(m => m.replace(/<\/?NAME>/g, ''));
            console.log("Total Ledgers Extracted:", ledgers.length);
            
            // Output them to a file for manual inspection
            require('fs').writeFileSync('tally_ledgers_dump.txt', ledgers.join('\n'));
            console.log("Dumped to tally_ledgers_dump.txt");
        } else {
            console.log("No ledgers found.");
        }
    });
});

req.on('error', (e) => {
    console.error(`Problem with request: ${e.message}`);
});

req.write(xmlPayload);
req.end();
