const { PrismaClient } = require('@prisma/client');
const axios = require('axios');
const xml2js = require('xml2js');
const prisma = new PrismaClient();

async function fixLedgers() {
  console.log("Fetching Tally TB...");
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
          <SVTODATE>20250331</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC></EXPORTDATA></BODY>
</ENVELOPE>`;
  
  const res = await axios.post('http://localhost:9000', tbXmlPayload, { headers: { 'Content-Type': 'text/xml' }});
  const parser = new xml2js.Parser();
  const parsedData = await parser.parseStringPromise(res.data);
  
  function parseTallyAmount(str, keepSign = false) {
    if (!str || str.trim() === '') return 0;
    const cleaned = String(str).replace(/[^0-9.-]+/g, '');
    const val = parseFloat(cleaned);
    if (isNaN(val)) return 0;
    return keepSign ? val : Math.abs(val);
  }

  const names = parsedData.ENVELOPE?.DSPACCNAME || [];
  const infos = parsedData.ENVELOPE?.DSPACCINFO || [];
  const nameArr = Array.isArray(names) ? names : [names];
  const infoArr = Array.isArray(infos) ? infos : [infos];

  const getVal = (infoObj, baseTag, keepSign = false) => {
      if (!infoObj || !infoObj[baseTag]) return 0;
      let node = infoObj[baseTag];
      if (Array.isArray(node)) node = node[0];
      if (node && typeof node === 'object' && node[`${baseTag}A`] !== undefined) {
          let inner = node[`${baseTag}A`];
          if (Array.isArray(inner)) inner = inner[0];
          return parseTallyAmount(inner, keepSign);
      }
      return parseTallyAmount(node, keepSign);
  };

  const ledgers = [];
  nameArr.forEach((nameObj, idx) => {
      if (!nameObj || !nameObj.DSPDISPNAME) return;
      const name = String(nameObj.DSPDISPNAME);
      const info = infoArr[idx];
      if (info) {
        let clDrAmt = getVal(info, 'DSPCLDRAMT') || getVal(info, 'DSPCLOSDR') || 0;
        let clCrAmt = getVal(info, 'DSPCLCRAMT') || getVal(info, 'DSPCLOSCR') || 0;
        
        if (clDrAmt === 0 && clCrAmt === 0) {
            const clAmt = getVal(info, 'DSPCLAMT', true); // KEEP SIGN
            // In Tally: Negative is DEBIT, Positive is CREDIT
            if (clAmt < 0) clDrAmt = Math.abs(clAmt);
            else if (clAmt > 0) clCrAmt = clAmt;
        }
        
        const closingNet = clDrAmt - clCrAmt;
        if (closingNet !== 0) {
          ledgers.push({ name, balance: closingNet });
        }
      }
  });

  console.log(`Found ${ledgers.length} ledgers. Updating DB directly...`);
  
  const clients = await prisma.client.findMany({ where: { software: 'TALLY' } });
  if (clients.length === 0) {
      console.log("No Tally client found");
      return;
  }

  for (const client of clients) {
      console.log(`Updating client: ${client.id}`);
      for (const l of ledgers) {
          const existing = await prisma.normalizedLedger.findFirst({
              where: { clientId: client.id, name: l.name }
          });
          if (existing) {
              await prisma.normalizedLedger.update({
                  where: { id: existing.id },
                  data: {
                      closingBalance: Math.abs(l.balance),
                      nature: l.balance > 0 ? "DEBIT" : "CREDIT"
                  }
              });
          } else {
              await prisma.normalizedLedger.create({
                  data: {
                      clientId: client.id,
                      name: l.name,
                      groupName: 'Unknown',
                      closingBalance: Math.abs(l.balance),
                      nature: l.balance > 0 ? "DEBIT" : "CREDIT",
                      isActive: true
                  }
              });
          }
      }
  }
  
  console.log("Fixed DB balances.");
}

fixLedgers().then(() => prisma.$disconnect());
