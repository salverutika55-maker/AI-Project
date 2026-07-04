import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";

export async function POST(req: Request) {
  try {
    // 1. Authenticate via Bearer Token
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ message: "Missing or invalid Authorization header" }, { status: 401 });
    }

    const apiKey = authHeader.split('Bearer ')[1].trim();

    // 2. Find the client by API Key
    const client = await prisma.client.findUnique({
      where: { id: apiKey },
      include: { pnlMappings: true }
    });

    if (!client) {
      return NextResponse.json({ message: "Invalid API Key" }, { status: 401 });
    }

    // 3. Parse JSON Body payload
    const body = await req.json();
    const syncTaskId = body.syncTaskId;
    const forceFull = body.forceFull === true;

    // Validate Tally Company GUID (if provided)
    const companyGuid = body.companyGuid;
    if (companyGuid && client.software === 'TALLY') {
      if (!client.sourceCompanyId) {
        // Pair on first sync
        await prisma.client.update({
          where: { id: client.id },
          data: { sourceCompanyId: companyGuid }
        });
      } else if (client.sourceCompanyId !== companyGuid) {
        return NextResponse.json({ 
          message: `Sync rejected: Tally Company GUID mismatch! The currently loaded company in Tally does not match this client's paired company.` 
        }, { status: 400 });
      }
    }
    
    // Support either single object, array of objects, or object with 'records' array
    let records = [];
    if (Array.isArray(body)) {
      records = body;
    } else if (body.records && Array.isArray(body.records)) {
      records = body.records;
    } else {
      records = [body];
    }

    if (records.length === 0) {
      return NextResponse.json({ message: "Payload empty" }, { status: 400 });
    }

    // Force Full Sync: Purge existing records once per sync task session
    if (syncTaskId) {
      const task = await prisma.syncTask.findUnique({
        where: { id: syncTaskId }
      });
      if (task && task.status === "PENDING") {
        await prisma.syncTask.update({
          where: { id: syncTaskId },
          data: { status: "PROCESSING" }
        });

        if (forceFull) {
          console.log(`[INGEST] Force Full Sync: Purging data for client ${client.name}`);
          
          await prisma.normalizedVoucher.deleteMany({
            where: { clientId: client.id }
          });
          await prisma.pNLValue.deleteMany({
            where: { clientId: client.id }
          });
          await prisma.financialRecord.deleteMany({
            where: { clientId: client.id }
          });
          await prisma.normalizedLedger.updateMany({
            where: { clientId: client.id },
            data: { closingBalance: 0 }
          });
        }
      }
    }

    let processedCount = 0;

    // Process records in chunks of 10 to avoid Prisma connection pool exhaustion
    const recordChunkSize = 10;
    for (let i = 0; i < records.length; i += recordChunkSize) {
      const chunk = records.slice(i, i + recordChunkSize);
      
      await Promise.all(chunk.map(async (record: any) => {
        const { period, source, ledgers, ...financials } = record;

        if (!period) {
          return; // Skip invalid rows missing mandatory 'period' string
        }

        const syncSource = source || "Webhook_API";

        await prisma.financialRecord.upsert({
          where: {
            clientId_period: {
              clientId: client.id,
              period: period
            }
          },
          update: {
            source: syncSource,
            ...financials
          },
          create: {
            clientId: client.id,
            period,
            source: syncSource,
            revenue: financials.revenue || 0,
            cogs: financials.cogs || 0,
            operatingExpenses: financials.operatingExpenses || 0,
            netIncome: financials.netIncome || 0,
            totalAssets: financials.totalAssets || 0,
            currentAssets: financials.currentAssets || 0,
            currentLiabilities: financials.currentLiabilities || 0,
            totalEquity: financials.totalEquity || 0,
            operatingCashFlow: financials.operatingCashFlow || 0,
            cashBalance: financials.cashBalance || 0,
            burnRate: financials.burnRate || 0,
            accountsReceivable: financials.accountsReceivable || 0,
            accountsPayable: financials.accountsPayable || 0,
            inventory: financials.inventory || 0,
            budgetedRevenue: financials.budgetedRevenue || 0,
            budgetedExpenses: financials.budgetedExpenses || 0
          }
        });
        processedCount++;

        // Map and Save PNLValues for Detailed P&L
        if (syncSource !== "Tally Prime Agent" && record.ledgers && Object.keys(record.ledgers).length > 0 && client.pnlMappings) {
          const [yearStr, monthStr] = period.split("-");
          const dateObj = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1);
          const mShort = dateObj.toLocaleString('default', { month: 'short' });
          
          const monthNum = parseInt(monthStr);
          const syncYearToSave = monthNum < 4 ? parseInt(yearStr) - 1 : parseInt(yearStr);
          
          const headBalances: Record<string, number> = {};
          const accounts = record.ledgers;
          
          for (const m of client.pnlMappings) {
            const aliases = (m.softwareLedgerName || "").split(",").map(a => a.trim().toLowerCase()).filter(Boolean);
            let balance = 0;
            
            for (const alias of aliases) {
              const exactMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase() === alias);
              if (exactMatchKey) {
                balance += accounts[exactMatchKey];
              } else {
                const fuzzyMatchKey = Object.keys(accounts).find(k => k.trim().toLowerCase().includes(alias));
                if (fuzzyMatchKey) balance += accounts[fuzzyMatchKey];
              }
            }

            if (balance !== 0) {
              headBalances[m.sectorHead] = (headBalances[m.sectorHead] || 0) + Math.abs(balance);
            }
          }

          const finalEntries = Object.entries(headBalances).map(([headName, balance]) => ({
            clientId: client.id,
            headName,
            month: mShort,
            year: syncYearToSave,
            amount: encrypt(balance.toString())
          }));

          if (finalEntries.length > 0) {
            await prisma.pNLValue.deleteMany({
              where: { clientId: client.id, month: mShort, year: syncYearToSave }
            });
            await prisma.pNLValue.createMany({ data: finalEntries });
          }
        }
      }));
    }

    // 4c. Update Unique Ledgers for the Mapping UI & Save Closing Balances
    if (client.software === 'TALLY') {
      const chartOfAccounts = body.chartOfAccounts || [];
      
      // Read balances from Trial Balance records (latest one has current values)
      const ledgerBalances: Record<string, number> = {};
      for (const record of records) {
        if (record.ledgers) {
          Object.entries(record.ledgers).forEach(([k, v]) => {
            ledgerBalances[k.trim().toLowerCase()] = Number(v) || 0;
          });
        }
      }

      // Fetch all existing ledgers in DB for this client
      const dbLedgers = await prisma.normalizedLedger.findMany({
        where: { clientId: client.id }
      });

      const dbLedgerBySourceId = new Map<string, typeof dbLedgers[0]>();
      const dbLedgerByGuid = new Map<string, typeof dbLedgers[0]>();
      const dbLedgerByName = new Map<string, typeof dbLedgers[0]>();

      for (const l of dbLedgers) {
        if (l.sourceLedgerId) dbLedgerBySourceId.set(l.sourceLedgerId, l);
        if (l.sourceGuid) dbLedgerByGuid.set(l.sourceGuid, l);
        dbLedgerByName.set(l.name.toLowerCase(), l);
      }

      let addedCount = 0;
      let updatedCount = 0;
      let renamedCount = 0;
      let movedCount = 0;
      let deletedCount = 0;
      let unchangedCount = 0;
      let reactivatedCount = 0;

      const traceLog: any[] = [];
      const activeSourceIds = new Set<string>();
      const activeNames = new Set<string>();

      for (const src of chartOfAccounts) {
        const srcName = (src.name || "").trim();
        if (!srcName) continue;
        const srcNameLower = srcName.toLowerCase();
        const srcGroup = src.groupName || "Uncategorized";
        const srcMasterId = src.masterId ? String(src.masterId) : null;
        const srcGuid = src.guid ? String(src.guid) : null;
        const balanceVal = ledgerBalances[srcNameLower] || 0;

        activeNames.add(srcNameLower);
        if (srcMasterId) activeSourceIds.add(srcMasterId);

        // Find existing match by ID or Name
        let matchedLedger = null;
        if (srcMasterId && dbLedgerBySourceId.has(srcMasterId)) {
          matchedLedger = dbLedgerBySourceId.get(srcMasterId);
        } else if (srcGuid && dbLedgerByGuid.has(srcGuid)) {
          matchedLedger = dbLedgerByGuid.get(srcGuid);
        } else if (dbLedgerByName.has(srcNameLower)) {
          matchedLedger = dbLedgerByName.get(srcNameLower);
        }

        if (matchedLedger) {
          let isRename = matchedLedger.name !== srcName;
          let isMove = matchedLedger.groupName !== srcGroup;
          let isReactivate = !matchedLedger.isActive || matchedLedger.sourceStatus === 'deleted';
          let isBalanceChange = Math.abs(matchedLedger.closingBalance - Math.abs(balanceVal)) > 0.01;

          let action = "UNCHANGED";
          let reason = "No changes detected";

          const prevName = matchedLedger.name;
          const prevGroup = matchedLedger.groupName;

          if (isRename) {
            action = "RENAMED";
            reason = `Name changed from "${prevName}" to "${srcName}"`;
          }
          if (isMove) {
            if (action === "UNCHANGED") {
              action = "MOVED";
              reason = `Group changed from "${prevGroup}" to "${srcGroup}"`;
            } else {
              action += "_AND_MOVED";
              reason += ` and group changed from "${prevGroup}" to "${srcGroup}"`;
            }
          }
          if (isReactivate) {
            action = "REACTIVATED";
            reason = `Reactivated ledger previously marked as deleted`;
          }
          if (isBalanceChange && action === "UNCHANGED") {
            action = "UPDATED";
            reason = `Closing balance updated from ₹${matchedLedger.closingBalance} to ₹${Math.abs(balanceVal)}`;
          }

          // Update in DB
          await prisma.normalizedLedger.update({
            where: { id: matchedLedger.id },
            data: {
              name: srcName,
              groupName: srcGroup,
              sourceLedgerId: srcMasterId || matchedLedger.sourceLedgerId,
              sourceGuid: srcGuid || matchedLedger.sourceGuid,
              sourcePlatform: "TALLY",
              sourceStatus: "active",
              isActive: true,
              deletedAt: null,
              closingBalance: Math.abs(balanceVal),
              mappingStatus: isMove ? "review_required" : (isReactivate ? "active" : matchedLedger.mappingStatus),
              previousGroupName: isMove ? prevGroup : matchedLedger.previousGroupName
            }
          });

          // Renames propagation to mapping tables
          if (isRename) {
            renamedCount++;
            await prisma.unifiedLedgerMapping.updateMany({
              where: { clientId: client.id, softwareLedgerName: prevName },
              data: { softwareLedgerName: srcName }
            });
            await prisma.pNLMapping.updateMany({
              where: { clientId: client.id, softwareLedgerName: prevName },
              data: { softwareLedgerName: srcName }
            });
          }

          if (isMove) movedCount++;
          else if (isReactivate) reactivatedCount++;
          else if (isRename) {} // Already incremented renamedCount
          else if (isBalanceChange) updatedCount++;
          else unchangedCount++;

          traceLog.push({
            sourceId: srcMasterId || srcGuid || srcName,
            previousName: prevName,
            currentName: srcName,
            previousGroup: prevGroup,
            currentGroup: srcGroup,
            previousStatus: matchedLedger.sourceStatus,
            currentStatus: "active",
            mappingStatus: isMove ? "review_required" : matchedLedger.mappingStatus,
            syncAction: action,
            reason
          });

        } else {
          // ADDED ledger
          addedCount++;
          const newLedgerId = crypto.randomUUID();
          await prisma.normalizedLedger.create({
            data: {
              id: newLedgerId,
              clientId: client.id,
              name: srcName,
              groupName: srcGroup,
              openingBalance: 0,
              closingBalance: Math.abs(balanceVal),
              nature: balanceVal > 0 ? "DEBIT" : "CREDIT",
              isActive: true,
              sourcePlatform: "TALLY",
              sourceCompanyId: companyGuid || null,
              sourceLedgerId: srcMasterId,
              sourceGuid: srcGuid,
              sourceStatus: "active",
              mappingStatus: "review_required"
            }
          });

          traceLog.push({
            sourceId: srcMasterId || srcGuid || srcName,
            previousName: null,
            currentName: srcName,
            previousGroup: null,
            currentGroup: srcGroup,
            previousStatus: null,
            currentStatus: "active",
            mappingStatus: "review_required",
            syncAction: "ADDED",
            reason: `Newly created ledger in Tally under "${srcGroup}"`
          });
        }
      }

      // Check for DELETED / REMOVED ledgers
      for (const dbL of dbLedgers) {
        if (dbL.sourceStatus === "deleted") continue;

        let isPresent = false;
        if (dbL.sourceLedgerId) {
          isPresent = activeSourceIds.has(dbL.sourceLedgerId);
        } else {
          isPresent = activeNames.has(dbL.name.toLowerCase());
        }

        if (!isPresent) {
          deletedCount++;
          await prisma.normalizedLedger.update({
            where: { id: dbL.id },
            data: {
              sourceStatus: "deleted",
              isActive: false,
              deletedAt: new Date(),
              mappingStatus: "inactive_source_deleted",
              closingBalance: 0,
              openingBalance: 0
            }
          });

          // Mapping Reconciliation: Flag mappings pointing to deleted/nonexistent source ledger
          await prisma.unifiedLedgerMapping.updateMany({
            where: { clientId: client.id, softwareLedgerName: dbL.name },
            data: { source: "DELETED_SOURCE" }
          });

          traceLog.push({
            sourceId: dbL.sourceLedgerId || dbL.sourceGuid || dbL.name,
            previousName: dbL.name,
            currentName: null,
            previousGroup: dbL.groupName,
            currentGroup: null,
            previousStatus: dbL.sourceStatus,
            currentStatus: "deleted",
            mappingStatus: "inactive_source_deleted",
            syncAction: "DELETED",
            reason: `Ledger no longer exists in Tally`
          });
        }
      }

      // Write results to SyncTask if present
      if (syncTaskId) {
        const task = await prisma.syncTask.findUnique({ where: { id: syncTaskId } });
        if (task) {
          const currentResult = (task.result || {}) as any;
          const updatedResult = {
            ...currentResult,
            syncRunId: syncTaskId,
            clientId: client.id,
            sourcePlatform: "TALLY",
            sourceCompanyId: companyGuid || client.sourceCompanyId || "N/A",
            startedAt: task.createdAt.toISOString(),
            completedAt: new Date().toISOString(),
            sourceLedgerCount: chartOfAccounts.length,
            appLedgerCountBefore: dbLedgers.length,
            appLedgerCountAfter: dbLedgers.length + addedCount - deletedCount,
            added: addedCount,
            updated: updatedCount,
            renamed: renamedCount,
            moved: movedCount,
            deleted: deletedCount,
            unchanged: unchangedCount,
            reactivated: reactivatedCount,
            traceLog: traceLog
          };
          await prisma.syncTask.update({
            where: { id: syncTaskId },
            data: { result: updatedResult }
          });
        }
      }

      // Update Integration Credentials API Key (which holds the encrypted master ledgers list)
      const finalActiveLedgers = await prisma.normalizedLedger.findMany({
        where: { clientId: client.id, isActive: true }
      });
      const ledgersArr = finalActiveLedgers.map(x => x.name);
      const encryptedLedgers = encrypt(JSON.stringify(ledgersArr));
      
      await prisma.integrationCredential.upsert({
        where: { clientId: client.id },
        create: {
          clientId: client.id,
          encryptedApiKey: encryptedLedgers
        },
        update: {
          encryptedApiKey: encryptedLedgers
        }
      });
    }

    // 5. Resolve any pending UI sync tasks (non-destructively preserving diagnostics result)
    const pendingTasks = await prisma.syncTask.findMany({
      where: {
        clientId: client.id,
        status: { in: ["PENDING", "PROCESSING"] }
      }
    });

    for (const task of pendingTasks) {
      const currentResult = (task.result || {}) as any;
      await prisma.syncTask.update({
        where: { id: task.id },
        data: {
          status: "COMPLETED",
          result: {
            ...currentResult,
            message: client.pnlMappings?.length > 0 ? "Data successfully synced from desktop agent" : "Data synced successfully, but no Ledgers are Mapped! Please visit the Map Ledgers tab.",
            recordsProcessed: processedCount
          }
        }
      });
    }

    return NextResponse.json({ 
      message: client.pnlMappings?.length > 0 ? "Data successfully ingested via API" : "Data ingested, but no PNL Mappings found.",
      client: client.name,
      recordsProcessed: processedCount,
      warning: client.pnlMappings?.length === 0 ? "Please configure your Ledger Mappings in the dashboard to view the Detailed P&L." : null
    }, { status: 200 });

  } catch (error) {
    console.error("Ingestion API Error:", error);
    return NextResponse.json({ message: "Internal Error during API Ingestion" }, { status: 500 });
  }
}
