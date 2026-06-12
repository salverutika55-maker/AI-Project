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

  const names = parsedData.ENVELOPE?.DSPACCNAME || [];
  const infos = parsedData.ENVELOPE?.DSPACCINFO || [];
  
  const nameArr = Array.isArray(names) ? names : [names];
  const infoArr = Array.isArray(infos) ? infos : [infos];
  
  nameArr.forEach((n, i) => {
      const name = n.DSPDISPNAME ? String(n.DSPDISPNAME) : '';
      if (name === 'TDS') {
          console.log(`\n--- ${name} ---`);
          console.log(JSON.stringify(infoArr[i], null, 2));
      }
  });
}

dump().catch(console.error);
