package main

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const (
	tallyURL     = "http://localhost:9000"
	apiBaseURL   = "https://your-vercel-app.vercel.app/api"
	clientSecret = "your-connector-secret" // From JWT auth
)

type Config struct {
	LastAlterID int
}

func main() {
	log.Println("Starting Tally Incremental Sync Connector (Go Edition)...")

	// 1. Initialize Local SQLite Cache
	db, err := sql.Open("sqlite3", "./tally_cache.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	initCache(db)

	// 2. Main Event Loop
	for {
		log.Println("Checking for pending tasks...")
		task := fetchTaskFromCloud()

		if task != nil && task.Type == "TALLY_SYNC" {
			log.Println("Sync triggered! Starting incremental export...")
			performIncrementalSync(db)
		}

		time.Sleep(15 * time.Second) // Poll interval
	}
}

func initCache(db *sql.DB) {
	query := \`
	CREATE TABLE IF NOT EXISTS sync_state (
		id INTEGER PRIMARY KEY,
		last_alter_id INTEGER NOT NULL DEFAULT 0
	);
	\`
	_, err := db.Exec(query)
	if err != nil {
		log.Fatalf("Failed to initialize cache: %v", err)
	}

	// Insert default row if not exists
	var count int
	db.QueryRow("SELECT COUNT(*) FROM sync_state").Scan(&count)
	if count == 0 {
		db.Exec("INSERT INTO sync_state (id, last_alter_id) VALUES (1, 0)")
	}
}

func getLastAlterID(db *sql.DB) int {
	var alterID int
	db.QueryRow("SELECT last_alter_id FROM sync_state WHERE id = 1").Scan(&alterID)
	return alterID
}

func performIncrementalSync(db *sql.DB) {
	alterID := getLastAlterID(db)
	log.Printf("Syncing from AlterID > %d\n", alterID)

	// Construct Incremental XML for Tally
	xmlReq := fmt.Sprintf(\`
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
					<VALUE>$AlterID > %d</VALUE>
				</VARIABLE>
			</REQUESTCONTENT>
		</EXPORTDATA>
	</BODY>
</ENVELOPE>
	\`, alterID)

	// Send to Tally
	resp, err := http.Post(tallyURL, "text/xml", bytes.NewBuffer([]byte(xmlReq)))
	if err != nil {
		log.Printf("Error contacting Tally: %v", err)
		return
	}
	defer resp.Body.Close()

	// Read XML Stream (Ideally, this streams directly to disk or Blob storage)
	// For this prototype, we'll write it to a temp file and upload.
	tmpFile, err := os.CreateTemp("", "tally_chunk_*.xml")
	if err != nil {
		log.Printf("Error creating temp file: %v", err)
		return
	}
	defer os.Remove(tmpFile.Name())

	_, err = io.Copy(tmpFile, resp.Body)
	if err != nil {
		log.Printf("Error streaming XML: %v", err)
		return
	}

	log.Println("XML Generated successfully. Uploading to Blob Storage...")

	// Request Upload URL from Vercel Blob
	uploadURL := getBlobUploadURL()
	if uploadURL == "" {
		log.Println("Failed to get upload URL")
		return
	}

	// Upload the chunk
	uploadToBlob(tmpFile.Name(), uploadURL)

	// Find the new max AlterID and update local DB
	// (In production, the cloud worker parses the XML and reports the max AlterID back,
	// or we use a streaming XML parser in Go to find it before upload)
	newAlterID := alterID + 100 // Example: assume we processed 100
	db.Exec("UPDATE sync_state SET last_alter_id = ? WHERE id = 1", newAlterID)

	log.Println("Chunk uploaded successfully. Inngest worker will process it.")
}

func fetchTaskFromCloud() *Task {
	// Stub: Calls /api/connector/tasks/pending
	return nil
}

func getBlobUploadURL() string {
	// Stub: Calls /api/connector/upload to get the pre-signed Vercel Blob URL
	return "https://blob.vercel-storage.com/example"
}

func uploadToBlob(filePath, uploadURL string) {
	// Stub: PUT request to uploadURL with file contents
}

type Task struct {
	Type string
}
