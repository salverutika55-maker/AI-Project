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
let isSyncing = false;

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
      timeout: 8000
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
  
  /**
   * Parse a Tally amount string safely.
   * Handles empty strings, negative values, and comma-separated numbers.
   */
  function parseTallyAmount(str) {
    if (!str || str.trim() === '') return 0;
    const cleaned = String(str).replace(/[^0-9.-]+/g, '');
    const val = parseFloat(cleaned);
    return isNaN(val) ? 0 : Math.abs(val);
  }

  /**
   * Extract closing balance (DSPCLDRAMT + DSPCLCRAMT) for matching accounts.
   * Tally's Trial Balance with EXPLODEFLAG=Yes returns closing balance fields.
   */
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
          // Closing balance DR
          const drAmt = parseTallyAmount(info?.DSPCLDRAMT?.DSPCLDRAMTA);
          // Closing balance CR
          const crAmt = parseTallyAmount(info?.DSPCLCRAMT?.DSPCLCRAMTA);
          // Also try period movement fields if available
          const totDrAmt = parseTallyAmount(info?.DSPTOTDRAMT?.DSPTOTDRAMTA);
          const totCrAmt = parseTallyAmount(info?.DSPTOTCRAMT?.DSPTOTCRAMTA);
          // Use whichever is larger (movement if available, else closing)
          total += Math.max(drAmt + crAmt, totDrAmt + totCrAmt);
        }
      }
    });
    return total;
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
      const node = infoObj[baseTag];
      if (typeof node === 'object' && node[`${baseTag}A`] !== undefined) {
          return parseTallyAmount(node[`${baseTag}A`]);
      }
      return parseTallyAmount(node);
    };

    nameArr.forEach((nameObj, idx) => {
      if (!nameObj || !nameObj.DSPDISPNAME) return;
      const name = String(nameObj.DSPDISPNAME);
      const info = infoArr[idx];
      if (info) {
        // Try ALL known Tally movement/period tag variations
        const totDrAmt = getVal(info, 'DSPTOTDRAMT') || getVal(info, 'DSPDRAMT') || getVal(info, 'DSPTRDRAMT') || getVal(info, 'DSPTRANSDR') || 0;
        const totCrAmt = getVal(info, 'DSPTOTCRAMT') || getVal(info, 'DSPCRAMT') || getVal(info, 'DSPTRCRAMT') || getVal(info, 'DSPTRANSCR') || 0;
        
        // For P&L reports, we need the NET movement during this period.
        const periodNet = Math.abs(totCrAmt - totDrAmt);
        
        // Fallback to closing net balance if transactions aren't available
        const clDrAmt = getVal(info, 'DSPCLDRAMT') || getVal(info, 'DSPCLOSDR') || getVal(info, 'DSPCLAMT') || 0;
        const clCrAmt = getVal(info, 'DSPCLCRAMT') || getVal(info, 'DSPCLOSCR') || getVal(info, 'DSPCLAMT') || 0;
        const opDrAmt = getVal(info, 'DSPOPDRAMT') || getVal(info, 'DSPOPENDR') || getVal(info, 'DSPOPAMT') || 0;
        const opCrAmt = getVal(info, 'DSPOPCRAMT') || getVal(info, 'DSPOPENCR') || getVal(info, 'DSPOPAMT') || 0;
        
        const closingNet = clCrAmt - clDrAmt;
        const openingNet = opCrAmt - opDrAmt;
        const derivedNet = Math.abs(closingNet - openingNet);

        // If Tally returned actual transaction figures, ALWAYS prioritize them.
        const amt = (totDrAmt > 0 || totCrAmt > 0) ? periodNet : derivedNet;
        
        if (amt !== 0) {
          ledgers[name] = amt;
        }
      }
    });
    return ledgers;
  }

  async function extractChartOfAccounts() {
    try {
      const coaXml = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>List of Ledgers</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="List of Ledgers" ISMODIFY="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>Ledger</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
      
      const response = await axios.post("http://localhost:9000", coaXml, {
        headers: { "Content-Type": "text/xml" },
        timeout: 5000 
      });
      const parsed = await parser.parseStringPromise(response.data);
      let ledgers = [];
      
      if (parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER) {
        const ledgerNodes = parsed.ENVELOPE.BODY.DATA.COLLECTION.LEDGER;
        const msgArr = Array.isArray(ledgerNodes) ? ledgerNodes : [ledgerNodes];
        msgArr.forEach(msg => {
          let ledgerName = null;
          if (msg.$?.NAME) {
            ledgerName = msg.$.NAME;
          } else if (msg.NAME) {
             ledgerName = Array.isArray(msg.NAME) ? msg.NAME[0] : msg.NAME;
          }
          if (ledgerName) ledgers.push(String(ledgerName));
        });
      }
      return [...new Set(ledgers)];
    } catch (e) {
      console.error("[AGENT] Failed to extract Chart of Accounts master list:", e.message);
      return [];
    }
  }

  function extractDayBookVouchers(parsedData, fromDateStr, toDateStr, stats = { outOfBounds: 0 }) {
    const vouchers = [];
    if (!parsedData || !parsedData.ENVELOPE || !parsedData.ENVELOPE.BODY) {
      return vouchers;
    }
    
    // Convert YYYYMMDD to integer for easy comparison
    const fromDtInt = parseInt(fromDateStr, 10);
    const toDtInt = parseInt(toDateStr, 10);
    
    // Tally Collection export returns <DATA><COLLECTION><VOUCHER>
    const body = parsedData.ENVELOPE.BODY;
    let messages = null;
    
    if (body.DATA && body.DATA.COLLECTION && body.DATA.COLLECTION.VOUCHER) {
      messages = body.DATA.COLLECTION.VOUCHER;
    }

    if (!messages) return vouchers;
    
    if (!Array.isArray(messages)) messages = [messages];

    messages.forEach(msg => {
      if (msg.VOUCHER) {
        let vList = Array.isArray(msg.VOUCHER) ? msg.VOUCHER : [msg.VOUCHER];
        
        vList.forEach(vch => {
          if (!vch) return;
          
          let dateStr = vch.DATE ? String(vch.DATE) : "20000101";
          
          let dateObj = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}T00:00:00Z`;
          
          const v = {
            guid: vch.GUID || vch.VOUCHERNUMBER,
            voucherNumber: vch.VOUCHERNUMBER || "N/A",
            voucherType: vch.VOUCHERTYPENAME || "JOURNAL",
            date: dateObj,
            narration: vch.NARRATION || "",
            lines: []
          };

          let entries = [];
          if (vch["ALLLEDGERENTRIES.LIST"]) {
            entries = entries.concat(Array.isArray(vch["ALLLEDGERENTRIES.LIST"]) ? vch["ALLLEDGERENTRIES.LIST"] : [vch["ALLLEDGERENTRIES.LIST"]]);
          }
          if (vch["LEDGERENTRIES.LIST"]) {
            entries = entries.concat(Array.isArray(vch["LEDGERENTRIES.LIST"]) ? vch["LEDGERENTRIES.LIST"] : [vch["LEDGERENTRIES.LIST"]]);
          }
          
          let vchTotal = 0;

          entries.forEach(entry => {
            if (!entry || !entry.LEDGERNAME) return;
            const amtStr = String(entry.AMOUNT || "0").replace(/[^0-9.-]+/g, '');
            const rawAmt = parseFloat(amtStr) || 0;
            // Tally represents debits as negative values in AMOUNT for Vouchers, or uses ISDEEMEDPOSITIVE="Yes"
            const isDebit = entry.ISDEEMEDPOSITIVE === "Yes" || rawAmt < 0;
            const absAmt = Math.abs(rawAmt);
            
            if (absAmt > 0) {
              v.lines.push({
                ledgerName: String(entry.LEDGERNAME),
                amount: absAmt,
                isDebit: isDebit
              });
              if (isDebit) vchTotal += absAmt;
            }
          });
          
          v.totalAmount = vchTotal;
          if (v.lines.length > 0) {
            vouchers.push(v);
          }
        });
      }
    });
    
    return vouchers;
  }

  async function performSync() {
    if (isSyncing) {
      console.log("[AGENT] Sync already in progress, skipping...");
      return;
    }
    
    isSyncing = true;
    try {
      let activeCompany = await getActiveTallyCompanyName();

      // If the live check timed out but we know the company from a previous successful check,
      // use the cached name rather than aborting the entire sync.
      if (!activeCompany) {
        if (tallyActiveCompanyName) {
          console.log(`[AGENT] Tally check timed out — using last known company: "${tallyActiveCompanyName}". Retrying sync...`);
          activeCompany = tallyActiveCompanyName;
        } else {
          console.log(`[AGENT] Executing Sync: Tally Prime is offline or unreachable. Please open Tally Prime and load a company.`);
          return;
        }
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
    const allUniqueLedgers = new Set();
    const allVouchers = [];

    for (const period of periodsToSync) {
        // 1. Fetch Trial Balance for high-level FinancialRecord (Assets, Liab, Cash)
        // 1. Fetch Trial Balance for high-level FinancialRecord (Assets, Liab, Cash)
        const tbXmlPayload = `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Export Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <EXPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Trial Balance</REPORTNAME>
        <STATICVARIABLES>
          <EXPLODEFLAG>Yes</EXPLODEFLAG>
          <DSPSHOWOPENING>Yes</DSPSHOWOPENING>
          <DSPSHOWTRANS>Yes</DSPSHOWTRANS>
          <DSPSHOWCLOSING>Yes</DSPSHOWCLOSING>
          <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          <SVFROMDATE>${period.fromDate}</SVFROMDATE>
          <SVTODATE>${period.toDate}</SVTODATE>
        </STATICVARIABLES>
      </REQUESTDESC>
    </EXPORTDATA>
  </BODY>
</ENVELOPE>`;

        // 2. Fetch Day Book for Transaction-Level Granularity
        // Convert YYYYMMDD to DD-Mmm-YYYY for TDL filter
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const formatTdlDate = (yyyymmdd) => {
            const d = String(yyyymmdd);
            const year = d.substring(0,4);
            const month = parseInt(d.substring(4,6), 10) - 1;
            const day = parseInt(d.substring(6,8), 10);
            return `${day}-${monthNames[month]}-${year}`;
        };
        
        const tdlFrom = formatTdlDate(period.fromDate);
        const tdlTo = formatTdlDate(period.toDate);

        const dayBookXmlPayload = `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>FinVoucherCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="FinVoucherCollection" ISMODIFY="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>Voucher</TYPE>
            <FETCH>*, AllLedgerEntries.*</FETCH>
            <FILTER>PeriodFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="PeriodFilter">
            $Date &gt;= $$Date:"${tdlFrom}" AND $Date &lt;= $$Date:"${tdlTo}"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

        try {
            // -- Trial Balance Request --
            const tbResponse = await axios.post("http://localhost:9000", tbXmlPayload, {
                headers: { "Content-Type": "text/xml" },
                timeout: 10000 
            });
            const parsedTb = await parser.parseStringPromise(tbResponse.data);
            const rawLedgers = extractAllLedgers(parsedTb);
            Object.keys(rawLedgers).forEach(name => allUniqueLedgers.add(name));
            
            let rawRevenue = 0, rawCOGS = 0, rawOpEx = 0;
            for (const [name, amt] of Object.entries(rawLedgers)) {
                const lowerName = name.toLowerCase();
                if (["sales", "income", "revenue"].some(kw => lowerName.includes(kw))) rawRevenue += amt;
                else if (["purchase", "direct expenses", "cost of goods", "opening stock"].some(kw => lowerName.includes(kw))) rawCOGS += amt;
                else if (["indirect expenses", "operating expenses", "admin", "office"].some(kw => lowerName.includes(kw))) rawOpEx += amt;
            }
            const rawCash = extractTrialBalance(parsedTb, ["Cash-in-hand", "Bank Accounts"]);
            const rawCurrentAssets = extractTrialBalance(parsedTb, ["Current Assets"]);
            const rawCurrentLiab = extractTrialBalance(parsedTb, ["Current Liabilities"]);
            const rawAR = extractTrialBalance(parsedTb, ["Sundry Debtors", "Accounts Receivable"]);
            const rawAP = extractTrialBalance(parsedTb, ["Sundry Creditors", "Accounts Payable"]);
            const rawInventory = extractTrialBalance(parsedTb, ["Closing Stock", "Stock-in-hand", "Inventory"]);

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
                inventory: rawInventory,
                ledgers: rawLedgers
            });

            // -- Day Book Request --
            try {
              const dbResponse = await axios.post("http://localhost:9000", dayBookXmlPayload, {
                  headers: { "Content-Type": "text/xml" },
                  timeout: 15000 
              });
              const parsedDb = await parser.parseStringPromise(dbResponse.data);
              const stats = { outOfBounds: 0 };
              const periodVouchers = extractDayBookVouchers(parsedDb, period.fromDate, period.toDate, stats);
              periodVouchers.forEach(v => allVouchers.push(v));
              
              console.log(`    -> Fetched ${period.periodKey} - Rev: ${finalRevenue} | Vouchers: ${periodVouchers.length}`);
            } catch (dbErr) {
              console.error(`    -> Warning: Failed to fetch Day Book vouchers for ${period.periodKey}`);
              console.log(`    -> Fetched ${period.periodKey} - Rev: ${finalRevenue} | Vouchers: 0 (Failed)`);
            }

        } catch (e) {
            console.error(`    -> Error fetching ${period.periodKey}: Tally not running or unreachable.`);
        }
    }

    if (allFinancialPayloads.length > 0) {
        try {
            // 1. Fetch Explicit Master Ledgers
            const masterLedgers = await extractChartOfAccounts();
            masterLedgers.forEach(l => allUniqueLedgers.add(l));
            const finalLedgers = Array.from(allUniqueLedgers);
            
            // 2. Push Vouchers
            if (allVouchers.length > 0) {
               console.log(`[AGENT] Pushing ${allVouchers.length} normalized vouchers to backend...`);
               await axios.post(`${VERCEL_API}/ingest/vouchers`, 
                   { vouchers: allVouchers },
                   {
                       headers: {
                           'Content-Type': 'application/json',
                           'Authorization': `Bearer ${companyConfig.apiKey}`
                       }
                   }
               );
            }
            
            // 3. Push Trial Balance summary (High level metrics)
            await axios.post(`${VERCEL_API}/ingest`, 
                { records: allFinancialPayloads, chartOfAccounts: finalLedgers },
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${companyConfig.apiKey}`
                    }
                }
            );
            console.log(`[AGENT] Pushed ${allFinancialPayloads.length} summary records and ${finalLedgers.length} ledgers to Vercel.`);
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
                    syncInterval = null;
                }
                if (heartbeatInterval) {
                    clearInterval(heartbeatInterval);
                    heartbeatInterval = null;
                }
                startLocalGUI();
            }
        }
    }
    } finally {
      isSyncing = false;
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
        const res = await axios.post(`${VERCEL_API}/connector/heartbeat`, {
          apiKey: companyConfig.apiKey,
          status: 'ONLINE'
        }, { timeout: 15000 });

        if (res.data && res.data.pendingSync) {
           console.log("\n[AGENT] ⚡ Cloud requested an immediate Force Sync! Starting now...");
           performSync(); // trigger immediately
        }
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
        
        if (syncInterval) {
          clearInterval(syncInterval);
          syncInterval = null;
        }
        if (heartbeatInterval) {
          clearInterval(heartbeatInterval);
          heartbeatInterval = null;
        }
        
        console.log('[AGENT] Restarting background sync daemon with new credentials...');
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

const readline = require('readline');
function preventExit(msg = "Press Enter to exit...") {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question(`\n${msg}`, () => {
    rl.close();
    process.exit(1);
  });
}

process.on('uncaughtException', (err) => {
  console.error('\n[FATAL ERROR]', err.message);
  preventExit();
});

process.on('unhandledRejection', (err) => {
  console.error('\n[FATAL ERROR]', err);
  preventExit();
});

init().catch(err => {
  console.error("\n[INIT ERROR]", err);
  preventExit();
});
