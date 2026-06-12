const axios = require('axios');
const xml2js = require('xml2js');

async function dump() {
  const tbXmlPayload = `<ENVELOPE>
  <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
  <BODY><EXPORTDATA><REQUESTDESC>
        <REPORTNAME>Trial Balance</REPORTNAME>
        <STATICVARIABLES>
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
  
  const getVal = (infoObj, key, keepSign=false) => {
      const valStr = infoObj[key]?.[0]?.[key + 'A']?.[0];
      if (!valStr) return 0;
      return keepSign ? parseFloat(valStr) : Math.abs(parseFloat(valStr));
  };
  
  nameArr.forEach((n, i) => {
      const name = n.DSPDISPNAME ? String(n.DSPDISPNAME) : '';
      const info = infoArr[i] || {};
      let clDrAmt = getVal(info, 'DSPCLDRAMT');
      let clCrAmt = getVal(info, 'DSPCLCRAMT') || getVal(info, 'DSPCLOSCR') || 0;
      if (clDrAmt === 0 && clCrAmt === 0) {
          const clAmt = getVal(info, 'DSPCLAMT', true);
          if (clAmt < 0) clDrAmt = Math.abs(clAmt);
          else if (clAmt > 0) clCrAmt = clAmt;
      }
      const net = clDrAmt - clCrAmt;
      if (net !== 0) {
          console.log(`${name}: ${Math.abs(net)} ${net > 0 ? 'DEBIT' : 'CREDIT'}`);
      }
  });
}

dump().catch(console.error);
