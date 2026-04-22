# Local Tally ERP9 / Prime Bridge

This folder contains the NodeJS proxy script required to bridge your physical, local Tally installation with your Vercel-hosted Cloud Dashboard.

Because Tally is a local application, it cannot spontaneously fire data out to Vercel without a script actively "asking" Tally for data, and then forwarding it. This script handles that extraction.

## Prerequisites
1. **Tally Must Be Open:** Keep your Tally software running locally.
2. **Enable OBDC / HTTP Server:** Inside Tally, go to F12 (Configure) -> Advanced Configuration. Set `Enable ODBC` to **Both** or **Yes**. Note the port number (usually `9000`).

## How to Configure
In this directory, create a `.env` file or simply open `tally_sync.js` and modify the variables at the top:
- `TALLY_URL`: Keep as `http://localhost:9000` assuming Tally is running on that port.
- `VERCEL_WEBHOOK_URL`: Your live host + `/api/ingest`.
- `API_KEY`: Your super-secret API Key. Go to the web dashboard -> Manage Data Source -> Custom API Webhook to copy your active key!
- `PERIOD`: The financial month you are pushing data for (e.g., `2024-04`).

## How to Run
Open your Windows Command Prompt here and run:
`npm start` (or `node tally_sync.js`)

The script will query Tally for its XML, map it to your CRM Keys, and securely post it to Vercel!
