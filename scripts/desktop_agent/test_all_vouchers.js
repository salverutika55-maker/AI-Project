const fs = require('fs');
const xml2js = require('xml2js');
const path = require('path');

const xmlPath = path.join(__dirname, '..', '..', 'tally_all_vouchers.xml');
if (!fs.existsSync(xmlPath)) {
  console.error("tally_all_vouchers.xml not found");
  process.exit(1);
}

const xmlData = fs.readFileSync(xmlPath, 'utf8');
const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });

parser.parseString(xmlData, (err, result) => {
  if (err) {
    console.error("Error parsing XML:", err.message);
    process.exit(1);
  }
  
  const body = result.ENVELOPE.BODY;
  let messages = null;
  if (body.DATA && body.DATA.COLLECTION && body.DATA.COLLECTION.VOUCHER) {
    messages = body.DATA.COLLECTION.VOUCHER;
  }
  if (!messages) {
    console.log("No vouchers found in XML");
    process.exit(0);
  }
  if (!Array.isArray(messages)) messages = [messages];

  console.log("Total vouchers in XML:", messages.length);
  const months = {};
  messages.forEach(v => {
    if (v && v.DATE) {
      const dStr = String(v.DATE);
      const year = dStr.substring(0, 4);
      const month = dStr.substring(4, 6);
      const key = `${year}-${month}`;
      months[key] = (months[key] || 0) + 1;
    }
  });
  console.log("Months distribution:", months);
});
