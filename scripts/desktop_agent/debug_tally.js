/**
 * Debug script: Fetch Trial Balance from Tally and dump raw XML + parsed structure
 * Run: node debug_tally.js
 */
const axios = require('axios');
const xml2js = require('xml2js');
const fs = require('fs');

async function debugTally() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const endDay = new Date(yyyy, now.getMonth() + 1, 0).getDate();

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
          <SVFROMDATE>${yyyy}${mm}01</SVFROMDATE>
          <SVTODATE>${yyyy}${mm}${endDay}</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    console.log(`Sending Trial Balance request to Tally for ${yyyy}-${mm}...`);
    const res = await axios.post("http://localhost:9000", xmlPayload, {
      headers: { "Content-Type": "text/xml" },
      timeout: 15000
    });

    console.log("✅ Got response from Tally! Length:", res.data.length, "bytes");

    // Save raw XML
    fs.writeFileSync('tally_debug_raw.xml', res.data, 'utf8');
    console.log("📄 Raw XML saved to: tally_debug_raw.xml");

    // Parse XML
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const parsedData = await parser.parseStringPromise(res.data);

    // Save parsed JSON
    fs.writeFileSync('tally_debug_parsed.json', JSON.stringify(parsedData, null, 2), 'utf8');
    console.log("📄 Parsed JSON saved to: tally_debug_parsed.json");

    // Try to locate account data at various paths
    console.log("\n=== Structure Analysis ===");
    console.log("Top-level keys in ENVELOPE:", Object.keys(parsedData.ENVELOPE || {}));

    // Check BODY path
    const body = parsedData?.ENVELOPE?.BODY;
    if (body) {
      console.log("BODY keys:", Object.keys(body));
      const data = body?.DATA;
      if (data) {
        console.log("BODY.DATA keys:", Object.keys(data));
        const tallyMsg = data?.TALLYMESSAGE;
        if (tallyMsg) {
          console.log("BODY.DATA.TALLYMESSAGE type:", typeof tallyMsg, Array.isArray(tallyMsg) ? `(array of ${tallyMsg.length})` : '');
        }
      }
    }

    // Direct ENVELOPE keys check
    const env = parsedData?.ENVELOPE;
    if (env) {
      // Look for any key that contains account-like data
      for (const key of Object.keys(env)) {
        if (key !== 'HEADER' && key !== 'BODY') {
          console.log(`ENVELOPE.${key} type:`, typeof env[key], Array.isArray(env[key]) ? `(array of ${env[key].length})` : '');
        }
      }
    }

    // Try extracting from BODY > DATA > TALLYMESSAGE
    const tallymsg = parsedData?.ENVELOPE?.BODY?.DATA?.TALLYMESSAGE;
    if (tallymsg) {
      const msgs = Array.isArray(tallymsg) ? tallymsg : [tallymsg];
      console.log(`\nFound ${msgs.length} TALLYMESSAGE entries.`);
      
      // Inspect first few
      for (let i = 0; i < Math.min(5, msgs.length); i++) {
        console.log(`  [${i}] keys:`, Object.keys(msgs[i]));
      }
    }

    // Try direct DSPACCNAME/DSPACCINFO
    const names = parsedData?.ENVELOPE?.DSPACCNAME;
    const infos = parsedData?.ENVELOPE?.DSPACCINFO;
    if (names) {
      const arr = Array.isArray(names) ? names : [names];
      console.log(`\nDirect DSPACCNAME count: ${arr.length}`);
      if (arr.length > 0) {
        console.log("  Sample[0]:", JSON.stringify(arr[0]).substring(0, 200));
      }
    } else {
      console.log("\n⚠️  No DSPACCNAME found at ENVELOPE level!");
    }

    if (infos) {
      const arr = Array.isArray(infos) ? infos : [infos];
      console.log(`Direct DSPACCINFO count: ${arr.length}`);
    } else {
      console.log("⚠️  No DSPACCINFO found at ENVELOPE level!");
    }

    // Try Profit & Loss approach instead of Trial Balance
    console.log("\n=== Trying Profit & Loss request ===");
  } catch (err) {
    console.error("❌ Failed:", err.message);
    if (err.code === 'ECONNREFUSED') {
      console.error("   → Tally Prime is not running on port 9000.");
    }
  }

  // Now try Profit & Loss report
  const plPayload = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Profit and Loss</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>${now.getFullYear()}0401</SVFROMDATE>
          <SVTODATE>${now.getFullYear()}${mm}${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

  try {
    console.log("Sending P&L request to Tally...");
    const res2 = await axios.post("http://localhost:9000", plPayload, {
      headers: { "Content-Type": "text/xml" },
      timeout: 15000
    });
    console.log("✅ Got P&L response! Length:", res2.data.length, "bytes");
    fs.writeFileSync('tally_debug_pl_raw.xml', res2.data, 'utf8');
    console.log("📄 P&L Raw XML saved to: tally_debug_pl_raw.xml");

    const parser2 = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const parsedPL = await parser2.parseStringPromise(res2.data);
    fs.writeFileSync('tally_debug_pl_parsed.json', JSON.stringify(parsedPL, null, 2), 'utf8');
    console.log("📄 P&L Parsed JSON saved to: tally_debug_pl_parsed.json");

    console.log("P&L ENVELOPE keys:", Object.keys(parsedPL?.ENVELOPE || {}));
  } catch (err2) {
    console.error("❌ P&L Failed:", err2.message);
  }
}

debugTally().catch(console.error);
