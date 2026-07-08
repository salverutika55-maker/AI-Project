const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const xml2js = require('xml2js');
const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
const net = require('net');

const PORT = 4500;
// Config path: %APPDATA%/FinAnalyzer/config.json
const configDir = path.join(os.homedir(), 'AppData', 'Roaming', 'FinAnalyzer');
const configPath = path.join(configDir, 'config.json');

// Default API URL (pointing to custom domain, fallback dynamically configurable in config.json)
const DEFAULT_VERCEL_API = 'https://finanalyzer-app.vercel.app/api';

function getVercelApi() {
  let source = "default";
  let rawConfiguredValue = null;
  let resolvedBaseUrl = DEFAULT_VERCEL_API;

  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (parsed && parsed.apiUrl) {
        rawConfiguredValue = parsed.apiUrl;
        source = "config.json";
        resolvedBaseUrl = parsed.apiUrl;
      }
    }
  } catch (e) {
    source = "error_reading_config";
  }

  // Enforce dev vs production checks
  const isLocalHost = resolvedBaseUrl.includes('localhost') || resolvedBaseUrl.includes('127.0.0.1') || resolvedBaseUrl.includes('[::1]');
  const isDevMode = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');

  console.log(`[AGENT_RUNTIME] pid=${process.pid}`);
  console.log(`[AGENT_RUNTIME] cwd=${process.cwd()}`);
  console.log(`[AGENT_RUNTIME] execPath=${process.execPath}`);
  console.log(`[AGENT_RUNTIME] scriptPath=${__filename}`);
  console.log(`[AGENT_RUNTIME] buildVersion=2026-07-08T16:00:00Z`);
  console.log(`[AGENT_RUNTIME] nodeEnv=${process.env.NODE_ENV || 'undefined'}`);

  console.log(`[BACKEND_CONFIG] source=${source}`);
  console.log(`[BACKEND_CONFIG] rawConfiguredValue=${rawConfiguredValue || 'null'}`);
  console.log(`[BACKEND_CONFIG] resolvedBaseUrl=${resolvedBaseUrl}`);
  console.log(`[BACKEND_CONFIG] voucherEndpoint=${resolvedBaseUrl}/ingest/vouchers`);

  if (isLocalHost && !isDevMode) {
    console.error(`[BACKEND_CONFIG_ERROR] Production backend URL is missing or set to localhost: "${resolvedBaseUrl}". Refusing localhost fallback in production mode.`);
    throw new Error(`[BACKEND_CONFIG_ERROR] Production backend URL cannot be localhost: "${resolvedBaseUrl}".`);
  }

  return resolvedBaseUrl;
}
let syncInterval;
let heartbeatInterval;
let guiServer = null;
let tallyActiveCompanyName = null;
let isSyncing = false;
let pendingForceSyncOptions = null;
let syncStartTime = 0;
const MAX_SYNC_DURATION = 15 * 60 * 1000; // 15 minutes

const TALLY_STATUS = {
  TCP_UNREACHABLE: 'TCP_UNREACHABLE',
  HTTP_UNREACHABLE: 'HTTP_UNREACHABLE',
  HTTP_RESPONDED: 'HTTP_RESPONDED',
  XML_INVALID: 'XML_INVALID',
  COMPANY_NOT_LOADED: 'COMPANY_NOT_LOADED',
  COMPANY_MISMATCH: 'COMPANY_MISMATCH',
  READY: 'READY'
};

function probeTcpPort(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isResolved = false;

    socket.setTimeout(timeout);

    socket.on('connect', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ success: true, errorCode: null, errorMessage: null });
      }
    });

    socket.on('timeout', () => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ success: false, errorCode: 'ETIMEDOUT', errorMessage: 'Connection timed out' });
      }
    });

    socket.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        socket.destroy();
        resolve({ success: false, errorCode: err.code || 'ERR_CONN', errorMessage: err.message });
      }
    });

    socket.connect(port, host);
  });
}

function extractNodeValue(node) {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const val of node) {
      if (typeof val === 'string') return val;
      if (val && typeof val === 'object' && val._) return val._;
    }
    return extractNodeValue(node[0]);
  }
  if (typeof node === 'object') {
    return node._ || null;
  }
  return node;
}

let TALLY_URL = 'http://127.0.0.1:9000';

async function checkTallyStatus(targetCompanyName = null) {
  const timeout = 15000;
  
  // 1. Run TCP probes sequentially
  const tcp127 = await probeTcpPort('127.0.0.1', 9000);
  const tcpLocal = await probeTcpPort('localhost', 9000);
  const tcpIPv6 = await probeTcpPort('::1', 9000);

  console.log(`[TALLY_TCP_PROBE] host=127.0.0.1 port=9000 success=${tcp127.success}`);
  console.log(`[TALLY_TCP_PROBE] host=localhost port=9000 success=${tcpLocal.success}`);
  console.log(`[TALLY_TCP_PROBE] host=::1 port=9000 success=${tcpIPv6.success}`);

  let activeHost = null;
  let exactErrorCode = null;
  let exactErrorMessage = null;
  
  if (tcp127.success) {
    activeHost = '127.0.0.1';
  } else if (tcpLocal.success) {
    activeHost = 'localhost';
  } else if (tcpIPv6.success) {
    activeHost = '::1';
  } else {
    exactErrorCode = tcp127.errorCode || tcpLocal.errorCode || tcpIPv6.errorCode || 'TCP_UNREACHABLE';
    exactErrorMessage = tcp127.errorMessage || tcpLocal.errorMessage || tcpIPv6.errorMessage || 'All TCP probes failed';
    console.log(`[TALLY_TCP_PROBE] errorCode=${exactErrorCode}`);
    console.log(`[TALLY_TCP_PROBE] errorMessage=${exactErrorMessage}`);
    
    logDiag('TCP_UNREACHABLE', null, 0);
    return { status: TALLY_STATUS.TCP_UNREACHABLE, company: null };
  }

  const url = `http://${activeHost}:9000`;
  TALLY_URL = url; // Update TALLY_URL contextually
  let tcpConnected = true;
  let httpReachable = false;
  let httpStatus = null;
  let responseContentType = null;
  let responseLength = 0;
  let xmlParseSuccess = false;
  let companyDetectionSuccess = false;
  let detectedCompanies = [];
  let exactErrorStack = null;
  
  const xmlPayload = `
<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Collection</TYPE>
    <ID>CustomCompanyCollection</ID>
  </HEADER>
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="CustomCompanyCollection" ISMODIFY="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>Company</TYPE>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>GUID</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`.trim();

  try {
    const res = await axios.post(url, xmlPayload, {
      headers: { "Content-Type": "text/xml" },
      timeout: timeout
    });
    
    httpReachable = true;
    httpStatus = res.status;
    responseContentType = res.headers['content-type'] || 'text/xml';
    responseLength = res.data ? String(res.data).length : 0;
    
    console.log(`[TALLY_XML_PROBE] url=${url}`);
    console.log(`[TALLY_XML_PROBE] status=${httpStatus}`);
    console.log(`[TALLY_XML_PROBE] responseLength=${responseLength}`);
    console.log(`[TALLY_XML_PROBE] responsePreview=${String(res.data).substring(0, 150).replace(/\s+/g, ' ')}`);
    
    let parsed;
    try {
      parsed = await parser.parseStringPromise(res.data);
      xmlParseSuccess = true;
      console.log(`[TALLY_XML_PROBE] parseSuccess=true`);
      console.log(`[TALLY_XML_PROBE] errorCode=null`);
      console.log(`[TALLY_XML_PROBE] errorMessage=null`);
    } catch (parseErr) {
      xmlParseSuccess = false;
      exactErrorCode = parseErr.code || 'XML_PARSE_ERR';
      exactErrorMessage = parseErr.message;
      exactErrorStack = parseErr.stack;
      
      console.log(`[TALLY_XML_PROBE] parseSuccess=false`);
      console.log(`[TALLY_XML_PROBE] errorCode=${exactErrorCode}`);
      console.log(`[TALLY_XML_PROBE] errorMessage=${exactErrorMessage}`);
      
      logDiag('XML_INVALID', null, responseLength);
      return { status: TALLY_STATUS.XML_INVALID, company: null };
    }
    
    const coNode = parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.COMPANY;
    if (!coNode) {
      logDiag('COMPANY_NOT_LOADED', null, responseLength);
      return { status: TALLY_STATUS.COMPANY_NOT_LOADED, company: null };
    }
    
    const coArr = Array.isArray(coNode) ? coNode : [coNode];
    for (const co of coArr) {
      const name = extractNodeValue(co.NAME);
      const guid = extractNodeValue(co.GUID);
      if (name) {
        detectedCompanies.push({ name: String(name).trim(), guid: guid ? String(guid).trim() : null });
      }
    }
    
    if (detectedCompanies.length === 0) {
      logDiag('COMPANY_NOT_LOADED', null, responseLength);
      return { status: TALLY_STATUS.COMPANY_NOT_LOADED, company: null };
    }
    
    companyDetectionSuccess = true;
    
    let selectedCo = detectedCompanies[0];
    if (targetCompanyName) {
      const matched = detectedCompanies.find(c => c.name.toLowerCase() === targetCompanyName.toLowerCase());
      if (matched) {
        selectedCo = matched;
      } else {
        logDiag('COMPANY_MISMATCH', selectedCo, responseLength);
        return { status: TALLY_STATUS.COMPANY_MISMATCH, company: selectedCo, allCompanies: detectedCompanies };
      }
    }
    
    logDiag('READY', selectedCo, responseLength);
    return { status: TALLY_STATUS.READY, company: selectedCo, allCompanies: detectedCompanies };
    
  } catch (err) {
    exactErrorCode = err.code || 'UNKNOWN_ERR';
    exactErrorMessage = err.message;
    exactErrorStack = err.stack;
    
    console.log(`[TALLY_XML_PROBE] url=${url}`);
    console.log(`[TALLY_XML_PROBE] status=null`);
    console.log(`[TALLY_XML_PROBE] responseLength=0`);
    console.log(`[TALLY_XML_PROBE] parseSuccess=false`);
    console.log(`[TALLY_XML_PROBE] errorCode=${exactErrorCode}`);
    console.log(`[TALLY_XML_PROBE] errorMessage=${exactErrorMessage}`);
    
    logDiag('HTTP_UNREACHABLE', null, 0);
    return { status: TALLY_STATUS.HTTP_UNREACHABLE, company: null };
  }

  function logDiag(state, selectedCo = null, len = 0) {
    console.log(`[TALLY_STATE] ${state}`);
    if (selectedCo) {
      console.log(`[TALLY_COMPANY] ${selectedCo.name}`);
    }
    
    let hostname = activeHost || '127.0.0.1';
    let port = '9000';

    console.log(`[TALLY_DIAG] configuredHost=${hostname}`);
    console.log(`[TALLY_DIAG] configuredPort=${port}`);
    console.log(`[TALLY_DIAG] resolvedUrl=${url || 'http://127.0.0.1:9000'}`);
    console.log(`[TALLY_DIAG] requestMethod=POST`);
    console.log(`[TALLY_DIAG] timeoutMs=${timeout}`);
    console.log(`[TALLY_DIAG] tcpConnected=${tcpConnected}`);
    console.log(`[TALLY_DIAG] httpReachable=${httpReachable}`);
    console.log(`[TALLY_DIAG] httpStatus=${httpStatus || 'null'}`);
    console.log(`[TALLY_DIAG] responseContentType=${responseContentType || 'null'}`);
    console.log(`[TALLY_DIAG] responseLength=${len}`);
    console.log(`[TALLY_DIAG] xmlParseSuccess=${xmlParseSuccess}`);
    console.log(`[TALLY_DIAG] companyDetectionSuccess=${companyDetectionSuccess}`);
    console.log(`[TALLY_DIAG] detectedCompanies=${JSON.stringify(detectedCompanies.map(c => c.name))}`);
    console.log(`[TALLY_DIAG] selectedCompany=${selectedCo ? selectedCo.name : 'null'}`);
    console.log(`[TALLY_DIAG] exactErrorCode=${exactErrorCode || 'null'}`);
    console.log(`[TALLY_DIAG] exactErrorMessage=${exactErrorMessage || 'null'}`);
    console.log(`[TALLY_DIAG] exactErrorStack=${exactErrorStack ? 'present' : 'null'}`);
  }
}

async function getActiveTallyCompanyDetails() {
  const check = await checkTallyStatus();
  return check.company;
}

async function getActiveTallyCompanyName() {
  const details = await getActiveTallyCompanyDetails();
  return details ? details.name : null;
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
  function parseTallyAmount(str, keepSign = false) {
    if (!str || str.trim() === '') return 0;
    const isCredit = String(str).toUpperCase().includes('CR') || String(str).includes('-');
    const cleaned = String(str).replace(/[^0-9.-]+/g, '');
    const val = parseFloat(cleaned);
    if (isNaN(val)) return 0;
    const absVal = Math.abs(val);
    return keepSign ? (isCredit ? -absVal : absVal) : absVal;
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

    const getVal = (infoObj, baseTag, keepSign = false) => {
      if (!infoObj || !infoObj[baseTag]) return 0;
      let node = infoObj[baseTag];
      if (Array.isArray(node)) node = node[0]; // Unwrap xml2js array
      
      if (node && typeof node === 'object' && node[`${baseTag}A`] !== undefined) {
          let inner = node[`${baseTag}A`];
          if (Array.isArray(inner)) inner = inner[0];
          return parseTallyAmount(inner, keepSign);
      }
      return parseTallyAmount(node, keepSign);
    };

    nameArr.forEach((nameObj, idx) => {
      if (!nameObj || !nameObj.DSPDISPNAME) return;
      const name = String(nameObj.DSPDISPNAME);
      const info = infoArr[idx];
      if (info) {
        // Try ALL known Tally movement/period tag variations
        const totDrAmt = getVal(info, 'DSPTOTDRAMT') || getVal(info, 'DSPDRAMT') || getVal(info, 'DSPTRDRAMT') || getVal(info, 'DSPTRANSDR') || 0;
        const totCrAmt = getVal(info, 'DSPTOTCRAMT') || getVal(info, 'DSPCRAMT') || getVal(info, 'DSPTRCRAMT') || getVal(info, 'DSPTRANSCR') || 0;
        
        // For Balance Sheet, we need the ACTUAL CLOSING BALANCE, not the net movement.
        // P&L uses /ingest/vouchers directly, so Trial Balance ledgers are exclusively for Balance Sheet.
        let clDrAmt = getVal(info, 'DSPCLDRAMT') || getVal(info, 'DSPCLOSDR') || 0;
        let clCrAmt = getVal(info, 'DSPCLCRAMT') || getVal(info, 'DSPCLOSCR') || 0;
        
        if (clDrAmt === 0 && clCrAmt === 0) {
          const clAmt = getVal(info, 'DSPCLAMT', true); // KEEP SIGN
          // In Tally XML: Negative is DEBIT, Positive is CREDIT
          if (clAmt < 0) clDrAmt = Math.abs(clAmt);
          else if (clAmt > 0) clCrAmt = clAmt;
        }
        
        const closingNet = clDrAmt - clCrAmt;
        ledgers[name] = closingNet;
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
            <NATIVEMETHOD>GUID</NATIVEMETHOD>
            <NATIVEMETHOD>MASTERID</NATIVEMETHOD>
            <NATIVEMETHOD>ALTERID</NATIVEMETHOD>
            <NATIVEMETHOD>Name</NATIVEMETHOD>
            <NATIVEMETHOD>Parent</NATIVEMETHOD>
            <NATIVEMETHOD>OpeningBalance</NATIVEMETHOD>
          </COLLECTION>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;
      
      const response = await axios.post(TALLY_URL, coaXml, {
        headers: { "Content-Type": "text/xml" },
        timeout: 60000 
      });
      const rawText = response.data;
      const tallyRawCount = (rawText.match(/<LEDGER/g) || []).length;

      const parsed = await parser.parseStringPromise(response.data);
      let ledgers = [];
      let parsedCount = 0;
      let normalizedCount = 0;
      let filteredCount = 0;
      
      if (parsed?.ENVELOPE?.BODY?.DATA?.COLLECTION?.LEDGER) {
        const ledgerNodes = parsed.ENVELOPE.BODY.DATA.COLLECTION.LEDGER;
        const msgArr = Array.isArray(ledgerNodes) ? ledgerNodes : [ledgerNodes];
        parsedCount = msgArr.length;
        normalizedCount = msgArr.length;
        
        msgArr.forEach(msg => {
          let ledgerName = null;
          if (msg.$?.NAME) ledgerName = msg.$.NAME;
          else if (msg.NAME) ledgerName = Array.isArray(msg.NAME) ? msg.NAME[0] : msg.NAME;
          
          let parentGroup = "Unknown";
          if (msg.PARENT) {
            let pRaw = Array.isArray(msg.PARENT) ? msg.PARENT[0] : msg.PARENT;
            if (typeof pRaw === 'object' && pRaw._) {
              parentGroup = pRaw._;
            } else if (typeof pRaw === 'string') {
              parentGroup = pRaw;
            }
          }

          let guid = null;
          if (msg.GUID) guid = Array.isArray(msg.GUID) ? msg.GUID[0] : msg.GUID;
          if (typeof guid === 'object' && guid._) guid = guid._;

          let masterId = null;
          if (msg.MASTERID) masterId = Array.isArray(msg.MASTERID) ? msg.MASTERID[0] : msg.MASTERID;
          if (typeof masterId === 'object' && masterId._) masterId = masterId._;

          let alterId = null;
          if (msg.ALTERID) alterId = Array.isArray(msg.ALTERID) ? msg.ALTERID[0] : msg.ALTERID;
          if (typeof alterId === 'object' && alterId._) alterId = alterId._;

          let openingBalance = 0;
          if (msg.OPENINGBALANCE) {
            let opRaw = Array.isArray(msg.OPENINGBALANCE) ? msg.OPENINGBALANCE[0] : msg.OPENINGBALANCE;
            if (typeof opRaw === 'object' && opRaw._) opRaw = opRaw._;
            openingBalance = parseTallyAmount(opRaw, true);
          }
          
          if (ledgerName) {
            filteredCount++;
            ledgers.push({ 
              name: String(ledgerName).trim(), 
              groupName: String(parentGroup).trim(),
              guid: guid ? String(guid).trim() : null,
              masterId: masterId ? String(masterId).trim() : null,
              alterId: alterId ? String(alterId).trim() : null,
              openingBalance: openingBalance
            });
          }
        });
      }
      // Deduplicate by masterId or guid, falling back to name
      const uniqueLedgers = [];
      const seen = new Set();
      for (const l of ledgers) {
          const key = l.masterId || l.guid || l.name.toLowerCase();
          if (!seen.has(key)) {
              seen.add(key);
              uniqueLedgers.push(l);
          }
      }

      const dedupedCount = uniqueLedgers.length;
      const agentPayloadCount = uniqueLedgers.length;

      console.log(`[COA_TRACE] tallyRawCount=${tallyRawCount}`);
      console.log(`[COA_TRACE] parsedCount=${parsedCount}`);
      console.log(`[COA_TRACE] normalizedCount=${normalizedCount}`);
      console.log(`[COA_TRACE] filteredCount=${filteredCount}`);
      console.log(`[COA_TRACE] dedupedCount=${dedupedCount}`);
      console.log(`[COA_TRACE] agentPayloadCount=${agentPayloadCount}`);

      return uniqueLedgers;
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

    messages.forEach(vch => {
      if (!vch) return;
      
      let dateStr = vch.DATE ? String(vch.DATE) : "20000101";
      
      let dateObj = `${dateStr.substring(0,4)}-${dateStr.substring(4,6)}-${dateStr.substring(6,8)}T00:00:00Z`;
          
          let alterId = vch.ALTERID || null;
          if (Array.isArray(alterId)) alterId = alterId[0];
          if (typeof alterId === 'object' && alterId._) alterId = alterId._;

          let masterId = vch.MASTERID || null;
          if (Array.isArray(masterId)) masterId = masterId[0];
          if (typeof masterId === 'object' && masterId._) masterId = masterId._;

          const v = {
            guid: vch.GUID ? (Array.isArray(vch.GUID) ? vch.GUID[0] : vch.GUID) : (vch.VOUCHERNUMBER || "N/A"),
            voucherNumber: vch.VOUCHERNUMBER ? (Array.isArray(vch.VOUCHERNUMBER) ? vch.VOUCHERNUMBER[0] : vch.VOUCHERNUMBER) : "N/A",
            voucherType: vch.VOUCHERTYPENAME ? (Array.isArray(vch.VOUCHERTYPENAME) ? vch.VOUCHERTYPENAME[0] : vch.VOUCHERTYPENAME) : "JOURNAL",
            date: dateObj,
            narration: vch.NARRATION ? (Array.isArray(vch.NARRATION) ? vch.NARRATION[0] : vch.NARRATION) : "",
            alterId: alterId ? String(alterId) : null,
            masterId: masterId ? String(masterId) : null,
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
    
    return vouchers;
  }

  async function performSync(options = { forceFull: false, syncTaskId: null }) {
    if (isSyncing) {
      if (syncStartTime > 0 && (Date.now() - syncStartTime) > MAX_SYNC_DURATION) {
        console.warn(`[AGENT] ⚠️ Detected stale sync lock (active for ${Math.round((Date.now() - syncStartTime)/1000)}s). Force releasing lock.`);
        isSyncing = false;
      } else {
        if (options.syncTaskId) {
          console.log(`[AGENT] Sync already in progress. Queueing Force Sync task ${options.syncTaskId}.`);
          pendingForceSyncOptions = options;
        } else {
          console.log("[AGENT] Sync already in progress, skipping auto-sync...");
        }
        return;
      }
    }
    
    isSyncing = true;
    syncStartTime = Date.now();
    try {
      const check = await checkTallyStatus(tallyActiveCompanyName);
      let activeCo = check.company;
      let activeCompany = activeCo ? activeCo.name : null;

      if (check.status === TALLY_STATUS.COMPANY_MISMATCH) {
        console.log(`[AGENT] Executing Sync: Active Tally company "${check.company?.name}" does not match target company "${tallyActiveCompanyName}".`);
        isSyncing = false;
        return;
      }

      if (!activeCompany) {
        if (tallyActiveCompanyName) {
          console.log(`[AGENT] Tally check failed with status "${check.status}" — using last known company: "${tallyActiveCompanyName}". Retrying sync...`);
          activeCompany = tallyActiveCompanyName;
          activeCo = { name: tallyActiveCompanyName, guid: null };
        } else {
          if (check.status === TALLY_STATUS.TCP_UNREACHABLE) {
            console.log(`[AGENT] Executing Sync: Tally Prime is offline or unreachable. Please open Tally Prime and load a company.`);
          } else if (check.status === TALLY_STATUS.COMPANY_NOT_LOADED) {
            console.log(`[AGENT] Executing Sync: Tally is online but no company is loaded. Please load a company in Tally.`);
          } else {
            console.log(`[AGENT] Executing Sync: Tally connection check failed with status "${check.status}".`);
          }
          isSyncing = false;
          return;
        }
      }
    
    tallyActiveCompanyName = activeCompany;
    
    const currentConfig = loadConfig() || { companies: {} };
    let companyConfig = currentConfig.companies && currentConfig.companies[activeCompany];
    
    // Fallback removed: We must require exact Tally Company Name matching to prevent pushing data to the wrong dashboard.
    
    if (!companyConfig || !companyConfig.apiKey) {
      console.log(`[AGENT] Executing Sync: Active Tally company "${activeCompany}" is not paired yet.`);
      console.log(`[AGENT] Launching setup interface. Please enter the handshake code in your browser.`);
      isSyncing = false;
      startLocalGUI();
      return;
    }
    
    console.log(`[AGENT] Executing Sync for client: "${companyConfig.clientName}" (Active Tally: "${activeCompany}")`);

    // Pre-sync Backend Reachability Check
    try {
      const backendUrl = getVercelApi();
      console.log(`[AGENT] Pre-sync reachability check starting for backend: ${backendUrl}`);
      await axios.post(`${backendUrl}/connector/heartbeat`, {
        apiKey: companyConfig.apiKey,
        clientName: companyConfig.clientName,
        status: "probing",
        companyGuid: activeCo?.guid || null
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${companyConfig.apiKey}`
        },
        timeout: 10000
      });
      console.log(`[AGENT] Pre-sync reachability check SUCCESS.`);
    } catch (probeErr) {
      let errorClass = "BACKEND_CONNECTION_FAILED";
      if (probeErr.code === 'ECONNREFUSED') errorClass = "BACKEND_CONNECTION_REFUSED";
      else if (probeErr.code === 'ETIMEDOUT') errorClass = "BACKEND_CONNECTION_TIMEOUT";
      else if (probeErr.response) {
        const status = probeErr.response.status;
        if (status === 500) errorClass = "BACKEND_INTERNAL_SERVER_ERROR";
        else if (status === 401) errorClass = "BACKEND_UNAUTHORIZED";
        else if (status === 403) errorClass = "BACKEND_FORBIDDEN";
        else if (status === 404) errorClass = "BACKEND_ROUTE_NOT_FOUND";
      }
      
      console.log(`[AGENT] Pre-sync reachability check result: ${probeErr.message} (Class: ${errorClass})`);

      const isReachable = !!probeErr.response;
      if (!isReachable) {
        console.error(`[AGENT] Refusing to sync while backend is unreachable (${errorClass}). Stopping sync cleanly.`);
        isSyncing = false;
        return;
      } else {
        console.log(`[AGENT] Pre-sync reachability check passed (received response status ${probeErr.response.status}). Proceeding with sync.`);
      }
    }
    
    // Calculate last 36 months (3 years) to ensure full fiscal years are captured
    const periodsToSync = [];
    const now = new Date();
    for (let i = 35; i >= 0; i--) {
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
    const allUniqueLedgersMap = new Map();
    let hasPushFailure = false;

    const concurrencyLimit = 1; // Serialized to prevent concurrent DB write conflicts
    
    // Helper for concurrency
    async function processConcurrently(items, limit, asyncFn) {
        const results = [];
        let index = 0;
        const exec = async () => {
            while (index < items.length) {
                const i = index++;
                results[i] = await asyncFn(items[i]);
            }
        };
        const workers = Array(Math.min(limit, items.length)).fill(null).map(exec);
        await Promise.all(workers);
        return results;
    }

    await processConcurrently(periodsToSync, concurrencyLimit, async (period) => {
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
          <EXPLODEALLLEVELS>Yes</EXPLODEALLLEVELS>
          <ISLEDGERWISE>Yes</ISLEDGERWISE>
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
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const formatTdlDate = (yyyymmdd) => {
            const d = String(yyyymmdd);
            const year = d.substring(0,4);
            const month = parseInt(d.substring(4,6), 10) - 1;
            const day = parseInt(d.substring(6,8), 10);
            return `${day}-${monthNames[month]}-${year}`;
        };
        const tdlFrom = formatTdlDate(period.fromDate);

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
        <SVFROMDATE>${period.fromDate}</SVFROMDATE>
        <SVTODATE>${period.toDate}</SVTODATE>
      </STATICVARIABLES>
      <TDL>
        <TDLMESSAGE>
          <COLLECTION NAME="FinVoucherCollection" ISMODIFY="No" ISINITIALIZE="No" ISOPTION="No" ISINTERNAL="No">
            <TYPE>Voucher</TYPE>
            <FETCH>*, AllLedgerEntries.*</FETCH>
            <FILTER>PeriodFilter</FILTER>
          </COLLECTION>
          <SYSTEM TYPE="Formulae" NAME="PeriodFilter">
            $Date &gt;= $$Date:"${tdlFrom}" AND $Date &lt;= $$MonthEnd:$$Date:"${tdlFrom}"
          </SYSTEM>
        </TDLMESSAGE>
      </TDL>
    </DESC>
  </BODY>
</ENVELOPE>`;

        try {
            // -- Trial Balance & Day Book Requests Concurrently --
            const [tbResponse, dbResponse] = await Promise.all([
                axios.post(TALLY_URL, tbXmlPayload, { headers: { "Content-Type": "text/xml" }, timeout: 60000 }).catch(() => null),
                axios.post(TALLY_URL, dayBookXmlPayload, { headers: { "Content-Type": "text/xml" }, timeout: 90000 }).catch(() => null)
            ]);

            if (tbResponse && tbResponse.data) {
                const parsedTb = await parser.parseStringPromise(tbResponse.data);
                const rawLedgers = extractAllLedgers(parsedTb);
                
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
            }

            if (dbResponse && dbResponse.data) {
                const parsedDb = await parser.parseStringPromise(dbResponse.data);
                const stats = { outOfBounds: 0 };
                const periodVouchers = extractDayBookVouchers(parsedDb, period.fromDate, period.toDate, stats);
                
                if (periodVouchers.length >= 0) {
                   console.log(`    -> Pushing ${periodVouchers.length} vouchers for ${period.periodKey}.`);
                   try {
                         console.log(`[MONTH_PUSH_START] month=${period.periodKey} requestId=${options.syncTaskId || 'N/A'}`);
                         await axios.post(`${getVercelApi()}/ingest/vouchers`, 
                            { 
                                 vouchers: periodVouchers,
                                 syncTaskId: options.syncTaskId,
                                 forceFull: options.forceFull,
                                 companyGuid: activeCo?.guid || null,
                                 fromDate: period.fromDate,
                                 toDate: period.toDate,
                                 periodKey: period.periodKey
                            },
                            {
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${companyConfig.apiKey}` },
                                timeout: 60000
                            }
                         );
                         console.log(`[MONTH_PUSH_END] month=${period.periodKey} requestId=${options.syncTaskId || 'N/A'}`);
                    } catch(pushErr) {
                        const res = pushErr.response;
                        let errorClass = "BACKEND_CONNECTION_FAILED";
                        if (pushErr.code === 'ECONNREFUSED') errorClass = "BACKEND_CONNECTION_REFUSED";
                        else if (pushErr.code === 'ETIMEDOUT') errorClass = "BACKEND_CONNECTION_TIMEOUT";
                        else if (res) {
                          const status = res.status;
                          if (status === 500) errorClass = "BACKEND_INTERNAL_SERVER_ERROR";
                          else if (status === 401) errorClass = "BACKEND_UNAUTHORIZED";
                          else if (status === 403) errorClass = "BACKEND_FORBIDDEN";
                          else if (status === 404) errorClass = "BACKEND_ROUTE_NOT_FOUND";
                        }

                        console.error(`    -> Backend timeout/error pushing ${period.periodKey}: ${pushErr.message} (Class: ${errorClass})`);
                        
                        console.log(`[MONTH_PUSH_FAILED] month=${period.periodKey}`);
                        console.log(`[MONTH_PUSH_FAILED] url=${pushErr.config?.url}`);
                        console.log(`[MONTH_PUSH_FAILED] method=${pushErr.config?.method}`);
                        console.log(`[MONTH_PUSH_FAILED] voucherCount=${periodVouchers.length}`);
                        console.log(`[MONTH_PUSH_FAILED] payloadBytes=${pushErr.config?.data ? Buffer.byteLength(String(pushErr.config.data)) : 0}`);
                        console.log(`[MONTH_PUSH_FAILED] status=${res ? res.status : 'N/A'}`);
                        console.log(`[MONTH_PUSH_FAILED] responseBody=${res ? (typeof res.data === 'object' ? JSON.stringify(res.data) : String(res.data).substring(0, 500)) : 'N/A'}`);
                        console.log(`[MONTH_PUSH_FAILED] errorCode=${pushErr.code || 'N/A'}`);
                        console.log(`[MONTH_PUSH_FAILED] errorMessage=${pushErr.message || 'N/A'}`);
                        console.log(`[MONTH_PUSH_FAILED] errorClass=${errorClass}`);
                        hasPushFailure = true;
                    }
                }
                
                console.log(`    -> Fetched ${period.periodKey} | Vouchers: ${periodVouchers.length}`);
            }

        } catch (e) {
            console.error(`    -> Error fetching ${period.periodKey}: Tally not running or unreachable.`);
        }
    });

    // Fetch Chart of Accounts & Sync unconditionally
    let finalLedgers = [];
    try {
        console.log("[AGENT] [TALLY_COA_FETCH_START] Fetching complete Tally Chart of Accounts...");
        const masterLedgers = await extractChartOfAccounts();
        if (!masterLedgers || masterLedgers.length === 0) {
            throw new Error("Chart of Accounts extraction returned 0 ledgers. Aborting sync to prevent database ledger loss.");
        }
        console.log(`[AGENT] [TALLY_COA_FETCH_COMPLETE] Successfully fetched ${masterLedgers.length} master ledgers from Tally.`);
        masterLedgers.forEach(ledger => {
            if (ledger && ledger.name) {
                const lower = ledger.name.toLowerCase();
                if (!allUniqueLedgersMap.has(lower)) allUniqueLedgersMap.set(lower, ledger);
            }
        });
        finalLedgers = Array.from(allUniqueLedgersMap.values());
    } catch (coaErr) {
        console.error(`[AGENT] Failed to extract complete Chart of Accounts: ${coaErr.message}`);
        throw coaErr; // Re-throw to prevent proceeding with empty/failed COA
    }

    if (hasPushFailure) {
        throw new Error("One or more monthly voucher pushes failed. Aborting final summary and Chart of Accounts sync to prevent partial sync states.");
    }

    try {
        // Push Trial Balance summary and complete Chart of Accounts
        await axios.post(`${getVercelApi()}/ingest`, 
            { 
                records: allFinancialPayloads, 
                chartOfAccounts: finalLedgers,
                syncTaskId: options.syncTaskId,
                forceFull: options.forceFull,
                companyGuid: activeCo?.guid || null
            },
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
        throw err;
    }
    } finally {
      isSyncing = false;
      syncStartTime = 0;
      if (pendingForceSyncOptions) {
        const nextOpts = pendingForceSyncOptions;
        pendingForceSyncOptions = null;
        console.log(`\n[AGENT] Executing queued Force Sync task ${nextOpts.syncTaskId} now...`);
        setTimeout(() => {
          performSync(nextOpts).catch(err => console.error("[AGENT] Error running queued Force Sync:", err.message));
        }, 0);
      }
    }
  }

  async function sendHeartbeat() {
    try {
      const activeCompany = await getActiveTallyCompanyName();
      if (!activeCompany) return;
      
      const currentConfig = loadConfig();
      let companyConfig = currentConfig && currentConfig.companies && currentConfig.companies[activeCompany];
      
      // Fallback removed for security
      
      if (companyConfig && companyConfig.apiKey) {
        const res = await axios.post(`${getVercelApi()}/connector/heartbeat`, {
          apiKey: companyConfig.apiKey,
          status: 'ONLINE'
        }, { timeout: 15000 });

        if (res.data && res.data.pendingSync) {
           const pTask = res.data.pendingTask || {};
           console.log(`\n[AGENT] ⚡ Cloud requested sync (Force Full: ${pTask.forceFull || false})! Starting now...`);
           performSync({ 
             forceFull: pTask.forceFull || false, 
             syncTaskId: pTask.id || null 
           });
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
       const response = await axios.put(`${getVercelApi()}/handshake`, { code });
      
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

  if (process.argv.includes('--reset')) {
    console.log("[AGENT] Reset command received. Disconnecting from cloud...");
    const currentConfig = loadConfig();
    if (currentConfig && currentConfig.companies) {
      for (const [companyName, companyConfig] of Object.entries(currentConfig.companies)) {
        if (companyConfig.apiKey) {
          try {
             await axios.post(`${getVercelApi()}/connector/heartbeat`, {
              apiKey: companyConfig.apiKey,
              status: 'OFFLINE'
            }, { timeout: 10000 });
            console.log(`[AGENT] Successfully marked "${companyName}" as OFFLINE in the cloud.`);
          } catch (err) {
            console.error(`[AGENT] Failed to reach cloud for "${companyName}":`, err.message);
          }
        }
      }
    }
    
    // Delete local config
    if (fs.existsSync(configPath)) {
      try {
        fs.unlinkSync(configPath);
        console.log(`[AGENT] Local credentials deleted successfully.`);
      } catch (err) {
        console.error(`[AGENT] Failed to delete local config:`, err.message);
      }
    } else {
      console.log(`[AGENT] Local credentials already deleted.`);
    }
    
    console.log("\n[AGENT] Reset complete. You can close this window.");
    return;
  }

  console.log(`[TALLY_RUNTIME_PROBE] build=2026-07-08T10:30:00Z`);
  console.log(`[TALLY_RUNTIME_PROBE] file=${__filename}`);
  console.log(`[TALLY_RUNTIME_PROBE] pid=${process.pid}`);
  console.log(`[TALLY_RUNTIME_PROBE] cwd=${process.cwd()}`);
  console.log(`[TALLY_RUNTIME_PROBE] execPath=${process.execPath}`);
  console.log(`[TALLY_RUNTIME_PROBE] node=${process.version}`);

  const check = await checkTallyStatus();
  const activeCompany = check.company ? check.company.name : null;
  tallyActiveCompanyName = activeCompany;

  const currentConfig = loadConfig() || { companies: {} };

  if (activeCompany) {
    console.log(`[AGENT] Connected to Tally Prime. Active Tally Company: "${activeCompany}"`);
    
    let companyConfig = currentConfig.companies && currentConfig.companies[activeCompany];
    
    // Fallback removed for security

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

  // Tally is offline/unreachable/no company loaded
  if (check.status === TALLY_STATUS.TCP_UNREACHABLE) {
    console.log("[AGENT] ⚠️  Tally Prime is offline or unreachable.");
    console.log("[AGENT] Please ensure Tally Prime is running on port 9000 and a company is open.");
  } else if (check.status === TALLY_STATUS.COMPANY_NOT_LOADED) {
    console.log("[AGENT] ⚠️  Tally is online, but no company is loaded in Tally Prime.");
    console.log("[AGENT] Please open your company in Tally Prime.");
  } else {
    console.log(`[AGENT] ⚠️  Tally connection check failed with status: ${check.status}`);
  }
  
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
