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
  const parser = new xml2js.Parser();
  const parsed = await parser.parseStringPromise(res.data);
  const infos = parsed.ENVELOPE?.DSPACCINFO;
  console.log('Infos count:', infos ? infos.length : 0);
  if (infos && infos.length > 0) {
      console.log('Sample info keys:', Object.keys(infos[0]));
      console.log('Sample info:', JSON.stringify(infos[0], null, 2));
  }
}
test();
