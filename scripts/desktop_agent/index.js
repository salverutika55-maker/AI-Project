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
let syncInterval;
let heartbeatInterval;
let guiServer = null;
let tallyActiveCompanyName = null;

async function getActiveTallyCompanyName() {
  const xmlPayload = `
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>List of Accounts</REPORTNAME>
        <STATICVARIABLES>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>
  `.trim();

  try {
    const res = await axios.post("http://localhost:9000", xmlPayload, {
      headers: { "Content-Type": "text/xml" },
      timeout: 2000
    });
    const match = res.data.match(/<SVCURRENTCOMPANY>([^<]+)<\/SVCURRENTCOMPANY>/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch (err) {
    // Tally not running or unreachable
  }
  return null;
}

function loadConfig() {
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed && parsed.apiKey && parsed.clientName) {
        return {
          companies: {
            [parsed.clientName]: {
              apiKey: parsed.apiKey,
              clientName: parsed.clientName,
              software: parsed.software || 'tally'
            }
          }
        };
      }
      return parsed || { companies: {} };
    } catch (e) {
      return { companies: {} };
    }
  }
  return { companies: {} };
}

function saveConfig(config) {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  let current = loadConfig() || { companies: {} };
  if (!current.companies) {
    current.companies = {};
  }
  
  const entry = {
    apiKey: config.apiKey,
    clientName: config.clientName,
    software: config.software
  };
  
  current.companies[config.clientName] = entry;
  
  if (tallyActiveCompanyName) {
    current.companies[tallyActiveCompanyName] = entry;
  }
  
  fs.writeFileSync(configPath, JSON.stringify(current, null, 2));
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

  function extractTrialBalanceMovement(parsedData, keywords) {
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
           let drAmtStr = info.DSPTOTDRAMT && info.DSPTOTDRAMT.DSPTOTDRAMTA ? info.DSPTOTDRAMT.DSPTOTDRAMTA : null;
           let crAmtStr = info.DSPTOTCRAMT && info.DSPTOTCRAMT.DSPTOTCRAMTA ? info.DSPTOTCRAMT.DSPTOTCRAMTA : null;
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
    const activeCompany = await getActiveTallyCompanyName();
    if (!activeCompany) {
      console.log(`[AGENT] Executing Sync: Tally Prime is offline or unreachable. Please open Tally Prime and load a company.`);
      return;
    }
    
    tallyActiveCompanyName = activeCompany;
    
    const currentConfig = loadConfig() || { companies: {} };
    let companyConfig = currentConfig.companies && currentConfig.companies[activeCompany];
    
    // Fallback: If not paired by active Tally company name, but exactly one company is paired, use it!
    if (!companyConfig && currentConfig.companies) {
      const keys = Object.keys(currentConfig.companies);
      if (keys.length === 1) {
        companyConfig = currentConfig.companies[keys[0]];
      }
    }
    
    if (!companyConfig || !companyConfig.apiKey) {
      console.log(`[AGENT] Executing Sync: Active Tally company "${activeCompany}" is not paired yet.`);
      console.log(`[AGENT] Launching setup interface. Please enter the handshake code in your browser.`);
      startLocalGUI();
      return;
    }
    
    console.log(`[AGENT] Executing Sync for client: "${companyConfig.clientName}" (Active Tally: "${activeCompany}")`);
    
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

            const rawRevenue = extractTrialBalanceMovement(parsedData, ["Sales Accounts", "Direct Incomes", "Revenue"]);
            const rawCOGS = extractTrialBalanceMovement(parsedData, ["Purchase Accounts", "Direct Expenses", "Cost of Goods", "Opening Stock"]);
            const rawOpEx = extractTrialBalanceMovement(parsedData, ["Indirect Expenses", "Operating Expenses"]);
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
                        'Authorization': `Bearer ${companyConfig.apiKey}`
                    }
                }
            );
            console.log(`[AGENT] Pushed ${allFinancialPayloads.length} records to Vercel.`);
        } catch (err) {
            console.error(`[AGENT] Error pushing to Vercel: ${err.message}`);
            if (err.response?.status === 401) {
                console.log(`\n[AGENT] ⚠️  UNAUTHORIZED ACCESS (401)`);
                console.log(`[AGENT] The local sync credentials for "${companyConfig.clientName}" are invalid or belong to a different organization.`);
                console.log(`[AGENT] Removing paired credentials for "${activeCompany}" and launching pairing wizard...\n`);
                try {
                    let current = loadConfig();
                    if (current && current.companies) {
                        delete current.companies[activeCompany];
                        delete current.companies[companyConfig.clientName];
                        fs.writeFileSync(configPath, JSON.stringify(current, null, 2));
                    }
                } catch (e) {
                    console.error("[AGENT] Error updating config file:", e.message);
                }
                if (syncInterval) {
                    clearInterval(syncInterval);
                }
                if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                }
                startLocalGUI();
            }
        }
    }
  }

  async function sendHeartbeat() {
    try {
      const activeCompany = await getActiveTallyCompanyName();
      if (!activeCompany) return;
      
      const currentConfig = loadConfig();
      let companyConfig = currentConfig && currentConfig.companies && currentConfig.companies[activeCompany];
      
      // Fallback: If not paired by active Tally company name, but exactly one company is paired, use it!
      if (!companyConfig && currentConfig && currentConfig.companies) {
        const keys = Object.keys(currentConfig.companies);
        if (keys.length === 1) {
          companyConfig = currentConfig.companies[keys[0]];
        }
      }
      
      if (companyConfig && companyConfig.apiKey) {
        await axios.post(`${VERCEL_API}/connector/heartbeat`, {
          apiKey: companyConfig.apiKey,
          status: 'ONLINE'
        }, { timeout: 3000 });
      }
    } catch (err) {
      // Fail silently for background heartbeats
    }
  }

  // Run heartbeat immediately, then every 15 seconds
  sendHeartbeat();
  heartbeatInterval = setInterval(sendHeartbeat, 15000);

  // Run sync immediately, then every 12 hours
  await performSync();
  syncInterval = setInterval(performSync, 1000 * 60 * 60 * 12);
}


// ==========================================
// LOCAL GUI SERVER
// ==========================================
function startLocalGUI() {
  if (guiServer) {
    // Already running, just reopen user's browser
    const { exec } = require('child_process');
    exec(`start http://localhost:${PORT}`);
    return;
  }

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

      // After successful connection, start background sync if not already running
      setTimeout(() => {
        console.log('[AGENT] Connection successful. Shutting down GUI server...');
        server.close();
        guiServer = null;
        
        if (!syncInterval) {
          console.log('[AGENT] Starting background sync daemon...');
          startBackgroundSync(config);
        } else {
          console.log('[AGENT] Sync daemon already running. It will automatically pick up the new pairing.');
        }
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
  
  guiServer = server;
}

// ==========================================
// INIT
// ==========================================
async function init() {
  console.log("\n=======================================================");
  console.log("Starting Tally Multi-Company Sync Connector (Live Engine)");
  console.log("=======================================================\n");

  const activeCompany = await getActiveTallyCompanyName();
  tallyActiveCompanyName = activeCompany;

  const currentConfig = loadConfig() || { companies: {} };

  if (activeCompany) {
    console.log(`[AGENT] Connected to Tally Prime. Active Tally Company: "${activeCompany}"`);
    
    let companyConfig = currentConfig.companies && currentConfig.companies[activeCompany];
    
    // Fallback: If not paired by active Tally company name, but exactly one company is paired, use it!
    if (!companyConfig && currentConfig.companies) {
      const keys = Object.keys(currentConfig.companies);
      if (keys.length === 1) {
        companyConfig = currentConfig.companies[keys[0]];
      }
    }

    if (companyConfig && companyConfig.apiKey) {
      console.log(`[AGENT] Found paired credentials for "${activeCompany}" (Client: "${companyConfig.clientName}").`);
      console.log(`[AGENT] Initializing background sync engine...\n`);
      startBackgroundSync(companyConfig);
      return;
    } else {
      console.log(`[AGENT] Active Tally company "${activeCompany}" is not paired yet.`);
      console.log(`[AGENT] Launching setup interface. Please pair it in your browser...\n`);
      startLocalGUI();
      return;
    }
  }

  // Tally is offline/unreachable
  console.log("[AGENT] ⚠️  Tally Prime is offline or unreachable.");
  console.log("[AGENT] Please ensure Tally Prime is running on port 9000 and a company is open.");
  
  // Check if we have any paired companies in registry
  const keys = currentConfig.companies ? Object.keys(currentConfig.companies) : [];
  if (keys.length > 0) {
    console.log(`[AGENT] Registry has ${keys.length} paired company configuration(s).`);
    console.log("[AGENT] Starting background sync engine in standby/retry mode...\n");
    // Start background sync using the first configuration as standby
    startBackgroundSync(currentConfig.companies[keys[0]]);
  } else {
    console.log("[AGENT] No paired companies found in local registry.");
    console.log("[AGENT] Launching setup interface. Please pair it in your browser...\n");
    startLocalGUI();
  }
}

init().catch(console.error);
