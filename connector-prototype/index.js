const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const Database = require('better-sqlite3');

// Configuration
const TALLY_URL = 'http://localhost:9000';
const API_BASE_URL = 'https://ai-project-git-main-salverutika55-makers-projects.vercel.app/api';
const CLIENT_TOKEN = 'REDACTED_CLIENT_TOKEN'; // Correct token for your account
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
        const nameRegex = /<LEDGER[^>]*\bNAME="([^"]+)"/gi;
        let match;
        while ((match = nameRegex.exec(ledgersXml)) !== null) {
          if (match[1]) {
            const cleanName = match[1].replace(/&amp;/g, '&');
            if (!ledgers.includes(cleanName)) {
              ledgers.push(cleanName);
            }
          }
        }
        if (ledgers.length === 0) {
          const fallbackRegex = /<NAME[^>]*>([^<]+)<\/NAME>/gi;
          while ((match = fallbackRegex.exec(ledgersXml)) !== null) {
            const name = match[1].trim();
            if (name && !["Envelope", "Header", "Body", "Data", "Collection", "Ledger"].includes(name)) {
              const cleanName = name.replace(/&amp;/g, '&');
              if (!ledgers.includes(cleanName)) {
                ledgers.push(cleanName);
              }
            }
          }
        }
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

    // Trigger Inngest
    const { Inngest } = require('inngest');
    const inngest = new Inngest({ id: "ai-project" });
    await inngest.send({
      name: 'sync/tally.chunk.uploaded',
      data: {
        clientId: task.clientId,
        blobUrl: blob.url,
        alterId: alterId + 5
      }
    });

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
          ledgers: ledgers
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
