const axios = require('axios');
const xml2js = require('xml2js');
async function test() {
  const tbXmlPayload = `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA><REQUESTDESC>
        <REPORTNAME>Trial Balance</REPORTNAME>
        <STATICVARIABLES>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <DSPSHOWOPENING>Yes</DSPSHOWOPENING>
          <DSPSHOWTRANS>Yes</DSPSHOWTRANS>
          <DSPSHOWCLOSING>Yes</DSPSHOWCLOSING>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>20260401</SVFROMDATE>
          <SVTODATE>20260430</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>`;
  const res = await axios.post('http://localhost:9000', tbXmlPayload, { headers: { 'Content-Type': 'text/xml' }});
  const parser = new xml2js.Parser(); // NO explicitArray false
  const parsed = await parser.parseStringPromise(res.data);
  const names = parsed.ENVELOPE?.DSPACCNAME;
  console.log('Names count:', names ? names.length : 0);
  if (names && names.length > 0) {
      console.log('Sample names:', JSON.stringify(names.slice(0, 3)));
  } else {
      console.log('Missing DSPACCNAME tag in ENVELOPE!');
      console.log('Object keys:', Object.keys(parsed.ENVELOPE || {}));
  }
}
test();
