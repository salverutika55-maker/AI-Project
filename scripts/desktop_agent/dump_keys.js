const axios = require('axios');
const xml2js = require('xml2js');

async function dump() {
  const tbXmlPayload = `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA><REQUESTDESC>
        <REPORTNAME>Trial Balance</REPORTNAME>
        <STATICVARIABLES>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <EXPLODEALLLEVELS>Yes</EXPLODEALLLEVELS>
          <ISLEDGERWISE>Yes</ISLEDGERWISE>
          <DSPSHOWOPENING>Yes</DSPSHOWOPENING>
          <DSPSHOWTRANS>Yes</DSPSHOWTRANS>
          <DSPSHOWCLOSING>Yes</DSPSHOWCLOSING>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>20240401</SVFROMDATE>
          <SVTODATE>20260331</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>`;
  
  const res = await axios.post('http://localhost:9000', tbXmlPayload, { headers: { 'Content-Type': 'text/xml' }});
  const parser = new xml2js.Parser();
  const parsedData = await parser.parseStringPromise(res.data);

  const infos = parsedData.ENVELOPE?.DSPACCINFO || [];
  const infoArr = Array.isArray(infos) ? infos : [infos];
  
  const allKeys = new Set();
  infoArr.forEach(info => {
      Object.keys(info).forEach(k => allKeys.add(k));
  });
  console.log("All DSPACCINFO Keys:", Array.from(allKeys));
}

dump().catch(console.error);
