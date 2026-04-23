const axios = require('axios');
const xml2js = require('xml2js');

async function testTally() {
  const xmlPayload = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Trial Balance</REPORTNAME>
        <STATICVARIABLES>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>20230401</SVFROMDATE>
          <SVTODATE>20240331</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    console.log("Sending request to Tally...");
    const res = await axios.post("http://localhost:9000", xmlPayload, {
      headers: { "Content-Type": "text/xml" },
      timeout: 10000 
    });
    console.log("Received response from Tally! Length:", res.data.length);
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const parsedData = await parser.parseStringPromise(res.data);
    
    // Test extraction logic
    let totalRev = 0;
    const names = parsedData?.ENVELOPE?.DSPACCNAME || [];
    const infos = parsedData?.ENVELOPE?.DSPACCINFO || [];
    const nameArr = Array.isArray(names) ? names : [names];
    const infoArr = Array.isArray(infos) ? infos : [infos];
    
    console.log(`Found ${nameArr.length} accounts in Trial Balance.`);
    
    nameArr.forEach((nameObj, idx) => {
      if (!nameObj || !nameObj.DSPDISPNAME) return;
      const name = String(nameObj.DSPDISPNAME).toLowerCase();
      
      const isRev = ["sales accounts", "direct incomes", "revenue"].some(kw => name.includes(kw));
      if (isRev) {
        console.log(`Matched Revenue Account: ${name}`);
        const info = infoArr[idx];
        if (info) {
          let drAmtStr = info.DSPCLDRAMT && info.DSPCLDRAMT.DSPCLDRAMTA ? info.DSPCLDRAMT.DSPCLDRAMTA : null;
          let crAmtStr = info.DSPCLCRAMT && info.DSPCLCRAMT.DSPCLCRAMTA ? info.DSPCLCRAMT.DSPCLCRAMTA : null;
          
          if (drAmtStr) {
             const amt = parseFloat(String(drAmtStr).replace(/[^0-9.-]+/g, ""));
             if (!isNaN(amt)) totalRev += Math.abs(amt);
          }
          if (crAmtStr) {
             const amt = parseFloat(String(crAmtStr).replace(/[^0-9.-]+/g, ""));
             if (!isNaN(amt)) totalRev += Math.abs(amt);
          }
        }
      }
    });
    
    console.log("Total Revenue Extracted:", totalRev);

  } catch (err) {
    console.error("Failed to connect to Tally:", err.message);
  }
}

testTally();
