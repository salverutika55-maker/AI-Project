const fs = require('fs');
const xml2js = require('xml2js');

const getVal = (node) => {
    if (!node) return 0;
    if (Array.isArray(node)) node = node[0];
    if (typeof node === 'string') return parseFloat(node) || 0;
    if (typeof node === 'object' && node._) return parseFloat(node._) || 0;
    return 0;
};

async function run() {
    const xml = fs.readFileSync('scripts/desktop_agent/tally_debug_raw.xml', 'utf8');
    const parser = new xml2js.Parser({ explicitArray: true, ignoreAttributes: false });
    const parsedData = await parser.parseStringPromise(xml);

    let ledgers = {};
    if (parsedData?.ENVELOPE?.DSPACCNAME) {
        const names = parsedData.ENVELOPE.DSPACCNAME;
        const infos = parsedData.ENVELOPE.DSPACCINFO;

        for (let i = 0; i < names.length; i++) {
            let nameObj = names[i].DSPDISPNAME;
            let name = Array.isArray(nameObj) ? nameObj[0] : nameObj;
            if (typeof name === 'object' && name._) name = name._;
            
            let info = infos[i];
            
            let crAmt = getVal(info?.DSPCLCRAMT?.[0]?.DSPCLCRAMTA);
            let drAmt = getVal(info?.DSPCLDRAMT?.[0]?.DSPCLDRAMTA);
            
            // In Tally, Asset/Expense typically have Dr balances, Liabilities/Income have Cr.
            // But they can be negative. We will store absolute values for the Balance Sheet
            let finalAmt = 0;
            if (crAmt !== 0) {
               finalAmt = crAmt; // Credits are usually positive in Tally XML
            } else if (drAmt !== 0) {
               finalAmt = Math.abs(drAmt); // Debits are usually negative in Tally XML, so we absolute them
            }

            if (name === 'Rajesh Shinde' || name === 'Supriya Shinde') {
                console.log(`Extracted for ${name}:`, { crAmt, drAmt, finalAmt, rawDr: info?.DSPCLDRAMT?.[0]?.DSPCLDRAMTA });
            }
        }
    }
}

run();
