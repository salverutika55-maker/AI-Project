const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const xml2js = require('xml2js');

const PORT = 4500;
const VERCEL_API = 'https://ai-project-salverutika55-makers-projects.vercel.app/api';

// Config path: %APPDATA%/FinAnalyzer/config.json
const configDir = path.join(os.homedir(), 'AppData', 'Roaming', 'FinAnalyzer');
const configPath = path.join(configDir, 'config.json');

function loadConfig() {
  if (fs.existsSync(configPath)) {
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

function saveConfig(config) {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ==========================================
// BACKGROUND SYNC ENGINE
// ==========================================
async function startBackgroundSync(config) {
  console.log(`[AGENT] Starting background sync for client: ${config.clientName}`);
  console.log(`[AGENT] Selected Software: ${config.software}`);
  
  if (config.software !== 'tally') {
    console.log(`[AGENT] Currently only Tally Prime is supported. Extractor for ${config.software} is in development.`);
    // Exit or loop waiting for updates
    setInterval(() => {
        console.log(`[AGENT] Waiting for ${config.software} extractor update...`);
    }, 1000 * 60 * 60);
    return;
  }

  // TALLY EXTRACTION LOGIC
  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
  
  function extractTrialBalance(parsedData, keywords) {
    let total = 0;
    if (!parsedData || !parsedData.ENVELOPE) return 0;
    const names = parsedData.ENVELOPE.DSPACCNAME || [];
    const infos = parsedData.ENVELOPE.DSPACCINFO || [];
    const nameArr = Array.isArray(names) ? names : [names];
    const infoArr = Array.isArray(infos) ? infos : [infos];

    nameArr.forEach((nameObj, idx) => {
      if (!nameObj || !nameObj.DSPDISPNAME) return;
      const name = String(nameObj.DSPDISPNAME).toLowerCase();
      const match = keywords.some(kw => name.includes(kw.toLowerCase()));
      if (match) {
        const info = infoArr[idx];
        if (info) {
           let drAmtStr = info.DSPCLDRAMT && info.DSPCLDRAMT.DSPCLDRAMTA ? info.DSPCLDRAMT.DSPCLDRAMTA : null;
           let crAmtStr = info.DSPCLCRAMT && info.DSPCLCRAMT.DSPCLCRAMTA ? info.DSPCLCRAMT.DSPCLCRAMTA : null;
           if (drAmtStr) {
             const amt = parseFloat(String(drAmtStr).replace(/[^0-9.-]+/g, ""));
             if (!isNaN(amt)) total += Math.abs(amt);
           }
           if (crAmtStr) {
             const amt = parseFloat(String(crAmtStr).replace(/[^0-9.-]+/g, ""));
             if (!isNaN(amt)) total += Math.abs(amt);
           }
        }
      }
    });
    return total;
  }

  async function performSync() {
    console.log(`[AGENT] Executing Sync at ${new Date().toISOString()}`);
    
    // Calculate last 24 months
    const periodsToSync = [];
    const now = new Date();
    for (let i = 23; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        
        const endDay = new Date(yyyy, d.getMonth() + 1, 0).getDate();
        
        periodsToSync.push({
            periodKey: `${yyyy}-${mm}`,
            fromDate: `${yyyy}${mm}01`,
            toDate: `${yyyy}${mm}${endDay}`
        });
    }

    const allFinancialPayloads = [];

    for (const period of periodsToSync) {
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
          <SVFROMDATE>${period.fromDate}</SVFROMDATE>
          <SVTODATE>${period.toDate}</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

        try {
            const tallyResponse = await axios.post("http://localhost:9000", xmlPayload, {
                headers: { "Content-Type": "text/xml" },
                timeout: 5000 
            });

            const parsedData = await parser.parseStringPromise(tallyResponse.data);

            const rawRevenue = extractTrialBalance(parsedData, ["Sales Accounts", "Direct Incomes", "Revenue"]);
            const rawCOGS = extractTrialBalance(parsedData, ["Purchase Accounts", "Direct Expenses", "Cost of Goods", "Opening Stock"]);
            const rawOpEx = extractTrialBalance(parsedData, ["Indirect Expenses", "Operating Expenses"]);
            const rawCash = extractTrialBalance(parsedData, ["Cash-in-hand", "Bank Accounts"]);
            const rawCurrentAssets = extractTrialBalance(parsedData, ["Current Assets"]);
            const rawCurrentLiab = extractTrialBalance(parsedData, ["Current Liabilities"]);
            const rawAR = extractTrialBalance(parsedData, ["Sundry Debtors", "Accounts Receivable"]);
            const rawAP = extractTrialBalance(parsedData, ["Sundry Creditors", "Accounts Payable"]);
            const rawInventory = extractTrialBalance(parsedData, ["Closing Stock", "Stock-in-hand", "Inventory"]);

            const finalRevenue = rawRevenue > 0 ? rawRevenue : 0;
            const finalCOGS = rawCOGS > 0 ? rawCOGS : 0;
            const finalOpEx = rawOpEx > 0 ? rawOpEx : 0;
            
            const netIncome = finalRevenue - finalCOGS - finalOpEx;

            allFinancialPayloads.push({
                period: period.periodKey,
                source: "Tally Prime Agent",
                revenue: finalRevenue,
                cogs: finalCOGS,
                operatingExpenses: finalOpEx,
                netIncome: netIncome,
                totalAssets: rawCurrentAssets,
                currentAssets: rawCurrentAssets,
                currentLiabilities: rawCurrentLiab,
                totalEquity: rawCurrentAssets - rawCurrentLiab,
                operatingCashFlow: netIncome * 0.8,
                cashBalance: rawCash,
                burnRate: finalOpEx * 1.2,
                accountsReceivable: rawAR,
                accountsPayable: rawAP,
                inventory: rawInventory
            });

            console.log(`    -> Fetched ${period.periodKey} - Rev: ${finalRevenue}`);
        } catch (e) {
            console.error(`    -> Error fetching ${period.periodKey}: Tally not running or unreachable.`);
        }
    }

    if (allFinancialPayloads.length > 0) {
        try {
            await axios.post(`${VERCEL_API}/ingest`, 
                allFinancialPayloads,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${config.apiKey}`
                    }
                }
            );
            console.log(`[AGENT] Pushed ${allFinancialPayloads.length} records to Vercel.`);
        } catch (err) {
            console.error(`[AGENT] Error pushing to Vercel: ${err.message}`);
        }
    }
  }

  // Run immediately, then every 12 hours
  await performSync();
  setInterval(performSync, 1000 * 60 * 60 * 12);
}


// ==========================================
// LOCAL GUI SERVER
// ==========================================
function startLocalGUI() {
  const app = express();
  app.use(express.json());

  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
  });

  app.post('/connect', async (req, res) => {
    const { software, code } = req.body;
    
    if (!code) {
      return res.status(400).json({ message: 'Code is required' });
    }

    try {
      // Exchange 6-digit code for API Key via Vercel Cloud Handshake
      const response = await axios.put(`${VERCEL_API}/handshake`, { code });
      
      const { apiKey, clientName } = response.data;

      // Save to local config
      const config = { apiKey, clientName, software };
      saveConfig(config);

      res.json({ success: true, clientName });

      // After successful connection, start background sync and close server
      setTimeout(() => {
        console.log('[AGENT] Connection successful. Shutting down GUI server and starting background daemon.');
        server.close();
        startBackgroundSync(config);
      }, 2000);

    } catch (err) {
      const msg = err.response?.data?.message || err.message;
      res.status(400).json({ message: msg });
    }
  });

  const server = app.listen(PORT, async () => {
    console.log(`[AGENT] Starting connection interface on http://localhost:${PORT}`);
    // Automatically open the user's default browser (Windows)
    const { exec } = require('child_process');
    exec(`start http://localhost:${PORT}`);
  });
}

// ==========================================
// INIT
// ==========================================
const currentConfig = loadConfig();

if (currentConfig && currentConfig.apiKey) {
  // If we already have an API key, don't show the GUI, just start syncing silently.
  startBackgroundSync(currentConfig);
} else {
  // If no config exists, start the setup GUI.
  startLocalGUI();
}
