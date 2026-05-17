const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const Database = require('better-sqlite3');

// Configuration
const TALLY_URL = 'http://localhost:9000';
const API_BASE_URL = 'https://your-vercel-app.vercel.app/api';
const CLIENT_TOKEN = 'your-jwt-auth-token'; // From dashboard
const DB_PATH = path.join(__dirname, 'tally_cache.db');

console.log("Starting Tally Incremental Sync Connector (Node.js Edition)...");

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

// 2. Main Event Loop
async function mainLoop() {
  while (true) {
    console.log("Checking for pending tasks...");
    const task = await fetchTaskFromCloud();

    if (task && task.type === "TALLY_SYNC") {
      console.log("Sync triggered! Starting incremental export...");
      await performIncrementalSync();
    }

    // Wait 15 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 15000));
  }
}

async function performIncrementalSync() {
  const alterId = getLastAlterId();
  console.log(`Syncing from AlterID > ${alterId}`);

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
    console.log("Requesting data from Tally...");
    const response = await fetch(TALLY_URL, {
      method: 'POST',
      body: xmlReq,
      headers: { 'Content-Type': 'text/xml' }
    });

    if (!response.ok) {
      console.error(`Error contacting Tally: ${response.statusText}`);
      return;
    }

    // Read XML Stream and write to local temp file to avoid RAM bloat
    const tempFilePath = path.join(__dirname, `tally_chunk_${Date.now()}.xml`);
    const fileStream = fs.createWriteStream(tempFilePath);
    
    // Web stream to Node stream conversion
    await pipeline(response.body, fileStream);
    console.log("XML Generated successfully to disk. Requesting upload URL...");

    // Request Upload URL from Vercel
    const uploadUrl = await getBlobUploadUrl();
    if (!uploadUrl) return;

    // Upload the file to Blob Storage
    console.log("Uploading to Blob Storage...");
    const fileStats = fs.statSync(tempFilePath);
    const fileBuffer = fs.readFileSync(tempFilePath);
    
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: fileBuffer,
      headers: {
        'Content-Type': 'application/xml',
        'Content-Length': fileStats.size.toString()
      }
    });

    if (!uploadRes.ok) throw new Error("Blob upload failed");

    // Clean up local temp file
    fs.unlinkSync(tempFilePath);

    // Update local DB (Simulating 100 records processed)
    const newAlterId = alterId + 100; 
    updateLastAlterId(newAlterId);
    
    console.log(`Chunk uploaded successfully! New checkpoint: AlterID ${newAlterId}`);
    
  } catch (error) {
    console.error("Error during sync:", error.message);
  }
}

// Stubs for cloud communication
async function fetchTaskFromCloud() {
  // Replace with actual fetch to /api/connector/tasks/pending
  return null; 
}

async function getBlobUploadUrl() {
  // Replace with actual fetch to /api/connector/upload
  return "https://your-upload-url-from-vercel.com"; 
}

// Start the app
mainLoop().catch(console.error);
