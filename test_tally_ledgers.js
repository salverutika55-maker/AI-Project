const axios = require('axios');
const xml2js = require('xml2js');
const parser = new xml2js.Parser({ explicitArray: false });

async function getLedgers() {
    const tbXmlPayload = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

    try {
        const response = await axios.post("http://localhost:9000", tbXmlPayload, { headers: { "Content-Type": "text/xml" } });
        const parsed = await parser.parseStringPromise(response.data);
        
        let ledgers = [];
        const messages = parsed.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER || [];
        const msgArr = Array.isArray(messages) ? messages : [messages];
        
        msgArr.forEach(l => {
            if (l && l.$.NAME) {
                ledgers.push(l.$.NAME);
            }
        });
        
        console.log("Total Ledgers in Tally:", ledgers.length);
        console.log("Unique Case-Insensitive Ledgers:", new Set(ledgers.map(l => l.toLowerCase())).size);
        console.log(ledgers);
    } catch (e) {
        console.error(e.message);
    }
}
getLedgers();
