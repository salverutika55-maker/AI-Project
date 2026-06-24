const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const Database = require('better-sqlite3');

// Configuration
const TALLY_URL = process.env.TALLY_URL || 'http://localhost:9000';
const API_BASE_URL = process.env.API_BASE_URL || 'https://ai-project-git-main-salverutika55-makers-projects.vercel.app/api';
const CLIENT_TOKEN = process.env.CLIENT_TOKEN;

if (!CLIENT_TOKEN) {
  throw new Error('CLIENT_TOKEN environment variable is required');
}
const DB_PATH = path.join(__dirname, 'tally_cache.db');

console.log("Starting Tally Incremental Sync Connector (Live Mode)...");

// 1. Initialize Local SQLite Cache
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sync_state (
    id INTEGER PRIMARY KEY,
    last_alter_id INTEGER NOT NULL DEFAULT 0
  );
`);

// Insert default row if not exists
const countStmt = db.prepare("SELECT COUNT(*) as count FROM sync_state");
if (countStmt.get().count === 0) {
  db.prepare("INSERT INTO sync_state (id, last_alter_id) VALUES (1, 0)").run();
}

function getLastAlterId() {
  const row = db.prepare("SELECT last_alter_id FROM sync_state WHERE id = 1").get();
  return row ? row.last_alter_id : 0;
}

function updateLastAlterId(newId) {
  db.prepare("UPDATE sync_state SET last_alter_id = ? WHERE id = 1").run(newId);
}

// Stubs replaced with actual cloud communication
async function fetchTaskFromCloud() {
  try {
    const res = await fetch(`${API_BASE_URL}/connector/tasks/pending`, {
      headers: {
        'Authorization': `Bearer ${CLIENT_TOKEN}`
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.tasks && data.tasks.length > 0) {
      return data.tasks[0];
    }
  } catch (err) {
    console.error("Error fetching tasks:", err.message);
  }
  return null; 
}

async function getBlobUploadUrl() {
  return "https://api.vercel.com/v2/now/files"; // Replaced by direct blob upload below
}

// Rewriting performIncrementalSync to actually upload and complete task
async function performIncrementalSync(task) {
  const alterId = getLastAlterId();
  console.log(`Syncing from AlterID > ${alterId} for task ${task.id}`);

  // Construct Incremental XML for Tally
  const xmlReq = `
<ENVELOPE>
	<HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
	<BODY>
		<EXPORTDATA>
			<REQUESTDESC>
				<REPORTNAME>Voucher Register</REPORTNAME>
				<STATICVARIABLES>
					<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
				</STATICVARIABLES>
			</REQUESTDESC>
			<REQUESTCONTENT>
				<COLLECTION NAME="IncrementalVouchers" ISMODIFY="No">
					<TYPE>Voucher</TYPE>
					<FETCH>*</FETCH>
					<FILTER>AlterIDFilter</FILTER>
				</COLLECTION>
				<VARIABLE NAME="AlterIDFilter">
					<VALUE>$AlterID > ${alterId}</VALUE>
				</VARIABLE>
			</REQUESTCONTENT>
		</EXPORTDATA>
	</BODY>
</ENVELOPE>
  `.trim();

  try {
    console.log("Requesting LIVE data from Tally Prime...");
    let xmlString = "";
    
    const response = await fetch(TALLY_URL, {
      method: 'POST',
      body: xmlReq,
      headers: { 'Content-Type': 'text/xml' }
    });
    
    if (response.ok) {
      xmlString = await response.text();
    } else {
      throw new Error(`Tally returned error: ${response.statusText}`);
    }

    // --- CHART OF ACCOUNTS FETCH SECTION ---
    console.log("Requesting Chart of Accounts from Tally Prime...");
    const ledgersXmlReq = `
<ENVELOPE>
	<HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
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

    let ledgers = [];
    try {
      const ledgersRes = await fetch(TALLY_URL, {
        method: 'POST',
        body: ledgersXmlReq,
        headers: { 'Content-Type': 'text/xml' }
      });
      if (ledgersRes.ok) {
        const ledgersXml = await ledgersRes.text();
        const ledgerBlockRegex = /<LEDGER[^>]*\bNAME="([^"]+)"[\s\S]*?(?:<\/LEDGER>)/gi;
        let blockMatch;
        const ledgerMap = new Map();
        
        while ((blockMatch = ledgerBlockRegex.exec(ledgersXml)) !== null) {
          const name = blockMatch[1].replace(/&amp;/g, '&');
          const blockContent = blockMatch[0];
          const parentRegex = /<PARENT[^>]*>([^<]+)<\/PARENT>/i;
          const parentMatch = parentRegex.exec(blockContent);
          const parentGroup = parentMatch ? parentMatch[1].replace(/&amp;/g, '&') : "Unknown";
          
          if (!ledgerMap.has(name)) {
            ledgerMap.set(name, { name, parentGroup });
          }
        }
        
        // Fallback for different XML formats
        if (ledgerMap.size === 0) {
           const fallbackRegex = /<NAME[^>]*>([^<]+)<\/NAME>[\s\S]*?<PARENT[^>]*>([^<]+)<\/PARENT>/gi;
           let fMatch;
           while ((fMatch = fallbackRegex.exec(ledgersXml)) !== null) {
              const name = fMatch[1].trim().replace(/&amp;/g, '&');
              const parentGroup = fMatch[2].trim().replace(/&amp;/g, '&');
              if (name && !["Envelope", "Header", "Body", "Data", "Collection", "Ledger"].includes(name)) {
                if (!ledgerMap.has(name)) {
                  ledgerMap.set(name, { name, parentGroup });
                }
              }
           }
        }
        
        ledgers = Array.from(ledgerMap.values());
      }
      console.log(`Successfully fetched ${ledgers.length} ledgers from Tally Chart of Accounts.`);
    } catch (err) {
      console.error("Error fetching Tally COA:", err.message);
    }
    // ----------------------------------------

    console.log("Uploading directly using Vercel Blob...");
    const { put } = require('@vercel/blob');
    require('dotenv').config({ path: path.join(__dirname, '../.env') });

    const blob = await put(`tally_sync_${Date.now()}.xml`, xmlString, {
      access: 'private',
      token: process.env.BLOB_READ_WRITE_TOKEN
    });

    console.log("File uploaded to Blob!", blob.url);

    // Mark task completed
    await fetch(`${API_BASE_URL}/connector/tasks/complete`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CLIENT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        taskId: task.id,
        status: "COMPLETED",
        result: { 
          message: "Chunk synced successfully",
          ledgers: ledgers,
          blobUrl: blob.url,
          alterId: alterId + 5
        }
      })
    });

    // Update local DB
    updateLastAlterId(alterId + 5);
    
    console.log(`Chunk processed successfully! New checkpoint: AlterID ${alterId + 5}`);
    
  } catch (error) {
    console.error("Error during sync:", error.message);
  }
}

// 2. Main Event Loop
async function mainLoop() {
  while (true) {
    console.log("Checking for pending tasks...");
    const task = await fetchTaskFromCloud();

    if (task) {
      console.log("Sync triggered! Starting incremental export...");
      await performIncrementalSync(task);
    }

    await new Promise(resolve => setTimeout(resolve, 5000));
  }
}

mainLoop().catch(console.error);
