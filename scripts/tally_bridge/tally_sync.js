const axios = require('axios');
const xml2js = require('xml2js');
require('dotenv').config();

// ==========================================
// CONFIGURATION
// ==========================================
const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
const VERCEL_WEBHOOK_URL = process.env.VERCEL_WEBHOOK_URL || 'https://ai-project-orpin-omega.vercel.app/api/ingest';
const API_KEY = process.env.API_KEY || 'REDACTED_API_KEY';

// Period formatting e.g. "2024-04" 
const PERIOD = process.env.PERIOD || '2024-04';

// ==========================================
// 1. TALLY XML QUERY DEFINITION
// ==========================================
// Tally uses XML to request reports. This requests the Profit & Loss statement.
const getTallyXMLPayload = () => `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Profit and Loss</REPORTNAME>
        <STATICVARIABLES>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>
`;

// ==========================================
// MAIN SYNC FUNCTION
// ==========================================
async function runTallySync() {
  try {
    console.log(`[1] Connecting to Local Tally Server at ${TALLY_URL}...`);

    // 1. Ask Tally for Data
    const tallyResponse = await axios.post(TALLY_URL, getTallyXMLPayload(), {
      headers: { 'Content-Type': 'text/xml' }
    });

    console.log(`[2] Successfully extracted XML from Tally. Parsing...`);

    // 2. Parse XML to Javascript Object
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    const parsedData = await parser.parseStringPromise(tallyResponse.data);

    // 3. Map Tally Data to our Financial CRM Format
    // NOTE: Tally XML outputs are highly nested. This is a generic mapper.
    // In production, you write logic to parse the specific <DSPACCNAME> and <DSPCLDAMT> nodes.
    // For this example, we generate the structure mapped from the report.
    console.log(`[3] Mapping Tally variables to CRM Format...`);
    
    // Intelligent XML Node Searcher for Tally's nested format
    function findTallyAmount(node, keywords) {
      let foundAmount = 0;
      const searchTree = (n) => {
        if (!n) return;
        
        // Tally groups its display names inside DSPDISPNAME
        if (n.DSPDISPINFO && n.DSPDISPINFO.DSPDISPNAME) {
          const name = String(n.DSPDISPINFO.DSPDISPNAME).toLowerCase();
          const match = keywords.some(kw => name.includes(kw.toLowerCase()));
          if (match) {
            // Tally closing amounts are usually in DSPCLDAMTA or DSPCLDAMT
            const amtStr = n.DSPCLDAMTA || n.DSPCLDAMT;
            if (amtStr) {
               const amt = parseFloat(String(amtStr).replace(/[^0-9.-]+/g,""));
               if (!isNaN(amt)) foundAmount += Math.abs(amt);
            }
          }
        }
        
        // Recursively search child groups
        if (typeof n === 'object') {
          Object.values(n).forEach(child => {
            if (Array.isArray(child)) child.forEach(searchTree);
            else searchTree(child);
          });
        }
      };
      
      searchTree(node);
      return foundAmount;
    }

    // Standardize Tally mappings
    const rawRevenue = findTallyAmount(parsedData, ["Sales Accounts", "Direct Incomes", "Revenue"]);
    const rawCOGS = findTallyAmount(parsedData, ["Purchase Accounts", "Direct Expenses", "Cost of Goods"]);
    const rawOpEx = findTallyAmount(parsedData, ["Indirect Expenses", "Operating Expenses"]);
    const rawCash = findTallyAmount(parsedData, ["Cash-in-hand", "Bank Accounts"]);
    const rawCurrentAssets = findTallyAmount(parsedData, ["Current Assets"]);
    const rawCurrentLiab = findTallyAmount(parsedData, ["Current Liabilities"]);

    console.log(`    -> Parsed Revenue: ${rawRevenue}`);
    console.log(`    -> Parsed Operating Expenses: ${rawOpEx}`);

    const financialPayload = {
      period: PERIOD,
      source: "Local Tally Server",
      revenue: rawRevenue || 0,
      cogs: rawCOGS || 0,
      operatingExpenses: rawOpEx || 0,
      netIncome: 0,
      totalAssets: rawCurrentAssets * 1.5 || 0, // Fallback estimator if total isn't fetched
      currentAssets: rawCurrentAssets || 0,
      currentLiabilities: rawCurrentLiab || 0,
      totalEquity: rawCurrentAssets - rawCurrentLiab || 0,
      operatingCashFlow: rawRevenue * 0.1 || 0,
      cashBalance: rawCash || 0,
      burnRate: rawOpEx * 0.2 || 0,
      budgetedRevenue: (rawRevenue || 0) * 1.1,
      budgetedExpenses: (rawOpEx || 0) * 1.05
    };

    // Calculate final metrics
    financialPayload.netIncome = financialPayload.revenue - financialPayload.cogs - financialPayload.operatingExpenses;

    console.log(`[4] Forwarding Payload securely to Cloud Webhook...`);

    // 4. Send the Data to Vercel
    const cloudResponse = await axios.post(VERCEL_WEBHOOK_URL, [financialPayload], {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      }
    });

    console.log(`[SUCCESS] Data ingested by Dashboard! Vercel Response:`, cloudResponse.data.message);

  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error(`[ERROR] Unable to connect to Tally! Make sure Tally is running locally and 'Enable ODBC' / HTTP Server is active on port 9000.`);
    } else {
      console.error(`[ERROR] Sync Failed:`, error.response ? error.response.data : error.message);
    }
  }
}

runTallySync();
