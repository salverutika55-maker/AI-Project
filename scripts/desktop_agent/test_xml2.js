const fs = require('fs');
const xml2js = require('xml2js');

function parseTallyAmount(str) {
  if (!str || String(str).trim() === '') return 0;
  const cleaned = String(str).replace(/[^0-9.-]+/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? 0 : Math.abs(val);
}

function extractAllLedgers(parsedData) {
  let ledgers = {};
  if (!parsedData || !parsedData.ENVELOPE) return ledgers;
  const names = parsedData.ENVELOPE.DSPACCNAME || [];
  const infos = parsedData.ENVELOPE.DSPACCINFO || [];
  const nameArr = Array.isArray(names) ? names : [names];
  const infoArr = Array.isArray(infos) ? infos : [infos];

  const getVal = (infoObj, baseTag) => {
    if (!infoObj || !infoObj[baseTag]) return 0;
    let node = infoObj[baseTag];
    if (Array.isArray(node)) node = node[0]; // Unwrap xml2js array
    
    if (node && typeof node === 'object' && node[`${baseTag}A`] !== undefined) {
        let inner = node[`${baseTag}A`];
        if (Array.isArray(inner)) inner = inner[0];
        return parseTallyAmount(inner);
    }
    return parseTallyAmount(node);
  };

  nameArr.forEach((nameObj, idx) => {
    if (!nameObj || !nameObj.DSPDISPNAME) return;
    const name = String(nameObj.DSPDISPNAME);
    const info = infoArr[idx];
    if (info) {
      const clDrAmt = getVal(info, 'DSPCLDRAMT') || getVal(info, 'DSPCLOSDR') || getVal(info, 'DSPCLAMT') || 0;
      const clCrAmt = getVal(info, 'DSPCLCRAMT') || getVal(info, 'DSPCLOSCR') || getVal(info, 'DSPCLAMT') || 0;
      
      const closingNet = clCrAmt - clDrAmt;
      const amt = Math.abs(closingNet);
      
      if (amt !== 0) {
        ledgers[name] = amt;
      }
    }
  });
  return ledgers;
}

async function run() {
  const xml = fs.readFileSync('scripts/desktop_agent/tally_debug_raw.xml', 'utf8');
  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
  const parsedData = await parser.parseStringPromise(xml);
  const ledgers = extractAllLedgers(parsedData);
  console.log("Rajesh Shinde:", ledgers['Rajesh Shinde']);
  console.log("Supriya Shinde:", ledgers['Supriya Shinde']);
}

run();
