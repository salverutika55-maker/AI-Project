# Tally Incremental Sync Specification (ALTERID Method)

To achieve sub-second syncs, the Tally Connector must use the `ALTERID` filtering method instead of full company exports.

## 1. Local State (Connector Side)
The connector must maintain a local `last_sync_alterid`. If this is the first sync, it should be set to `0`.

## 2. The Incremental XML Request
The following XML should be sent to Tally (`localhost:9000`). It defines a dynamic collection that filters vouchers based on their modification ID.

```xml
<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <EXPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Voucher Register</REPORTNAME>
                <STATICVARIABLES>
                    <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                    <!-- Adjust dates to cover entire history, filter handles the volume -->
                    <SVFROMDATE>20000401</SVFROMDATE>
                    <SVTODATE>20280331</SVTODATE>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTCONTENT>
                <!-- Define a Custom Collection with AlterID Filter -->
                <COLLECTION NAME="IncrementalVouchers" ISMODIFY="No">
                    <TYPE>Voucher</TYPE>
                    <FETCH>*</FETCH>
                    <FILTER>AlterIDFilter</FILTER>
                </COLLECTION>
                
                <VARIABLE NAME="AlterIDFilter">
                    <!-- Only fetch records changed since last sync -->
                    <VALUE>$AlterID > ${last_sync_alterid}</VALUE>
                </VARIABLE>
            </REQUESTCONTENT>
        </EXPORTDATA>
    </BODY>
</ENVELOPE>
```

## 3. Handling the Response
1.  **Extract Data**: Parse the returned XML and upsert into the cloud database.
2.  **Update Checkpoint**: Find the `MAX(ALTERID)` in the received dataset.
3.  **Persist**: Store this new `MAX(ALTERID)` in the `Client` table (`lastAlterId` field) via the `/api/connector/tasks/complete` endpoint.

## 4. Why this is Instant
- **Tally Side**: Tally's internal engine uses an index for `ALTERID`. It does not "scan" the whole database; it jumps directly to the new records.
- **Network Side**: Instead of 10,000 vouchers (50MB), you send 5 vouchers (10KB).
- **Processing Side**: The server only performs 5 database writes instead of 10,000.
