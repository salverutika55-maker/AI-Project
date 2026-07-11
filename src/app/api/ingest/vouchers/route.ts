import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import crypto from "crypto";

export const maxDuration = 60; // Extend to 60s for voucher ingestion with PNL aggregation

export async function POST(req: Request) {
  let requestId = "UNKNOWN";
  let currentStage = "START";
  let currentVoucherRef = "N/A";
  let currentVoucherIdx = -1;
  const startTime = Date.now();

  try {
    requestId = crypto.randomUUID();
    console.log(`[INGEST_START] requestId=${requestId} route=/api/ingest/vouchers timestamp=${new Date().toISOString()}`);

    // ── Environment pre-flight ──────────────────────────────────────────────
    currentStage = "ENV_CHECK";
    if (!process.env.DATABASE_URL) {
      console.error(`[INGEST_ERROR] requestId=${requestId} stage=ENV_CHECK reason=DATABASE_URL_MISSING`);
      return NextResponse.json({ requestId, stage: currentStage, message: "Server misconfiguration: DATABASE_URL missing" }, { status: 500 });
    }
    if (!process.env.ENCRYPTION_KEY) {
      console.error(`[INGEST_ERROR] requestId=${requestId} stage=ENV_CHECK reason=ENCRYPTION_KEY_MISSING`);
      return NextResponse.json({ requestId, stage: currentStage, message: "Server misconfiguration: ENCRYPTION_KEY missing" }, { status: 500 });
    }
    console.log(`[ENV_CHECK_OK] requestId=${requestId} DATABASE_URL_present=true ENCRYPTION_KEY_present=true`);

    // ── Auth ────────────────────────────────────────────────────────────────
    currentStage = "AUTH";
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log(`[AUTH_FAILED] requestId=${requestId} reason=MISSING_HEADER`);
      return NextResponse.json({ message: "Missing or invalid Authorization header" }, { status: 401 });
    }

    const apiKey = authHeader.split('Bearer ')[1].trim();
    const client = await prisma.client.findUnique({
      where: { id: apiKey },
      include: { pnlMappings: true }
    });

    if (!client) {
      console.log(`[AUTH_FAILED] requestId=${requestId} reason=INVALID_KEY`);
      return NextResponse.json({ message: "Invalid API Key" }, { status: 401 });
    }
    console.log(`[AUTH_SUCCESS] requestId=${requestId} clientId=${client.id} clientName=${client.name}`);

    // ── Body parsing ────────────────────────────────────────────────────────
    currentStage = "BODY_PARSE";
    const body = await req.json();
    const vouchers = body.vouchers || [];
    const syncTaskId = body.syncTaskId;
    const forceFull = body.forceFull === true;
    const companyGuid = body.companyGuid;
    const periodKey = body.periodKey || "N/A";
    const fromDate = body.fromDate;
    const toDate = body.toDate;

    console.log(`[BODY_PARSED] requestId=${requestId} month=${periodKey} voucherCount=${vouchers.length} fromDate=${fromDate} toDate=${toDate} forceFull=${forceFull}`);

    if (!fromDate || !toDate) {
      return NextResponse.json({ requestId, stage: currentStage, message: "Missing fromDate or toDate" }, { status: 400 });
    }

    // ── Company GUID validation ─────────────────────────────────────────────
    currentStage = "COMPANY_GUID_CHECK";
    if (companyGuid && client.software === 'TALLY') {
      if (!client.sourceCompanyId) {
        await prisma.client.update({ where: { id: client.id }, data: { sourceCompanyId: companyGuid } });
      } else {
        const cleanDbId = client.sourceCompanyId.split('-')[0].toLowerCase();
        const cleanIncomingId = companyGuid.split('-')[0].toLowerCase();
        if (cleanDbId !== cleanIncomingId) {
          return NextResponse.json({
            message: `Sync rejected: Tally Company GUID mismatch!`
          }, { status: 400 });
        }
      }
    }
    console.log(`[COMPANY_FOUND] requestId=${requestId}`);

    // ── SyncTask state machine ──────────────────────────────────────────────
    currentStage = "SYNC_TASK_INIT";
    if (syncTaskId) {
      const task = await prisma.syncTask.findUnique({ where: { id: syncTaskId } });
      if (task && task.status === "PENDING") {
        let purgedCount = 0;
        await prisma.syncTask.update({ where: { id: syncTaskId }, data: { status: "PROCESSING" } });
        if (forceFull) {
          console.log(`[FORCE_FULL_SYNC] requestId=${requestId} clientName=${client.name}`);
          const deleteVouchers = await prisma.normalizedVoucher.deleteMany({ where: { clientId: client.id } });
          purgedCount = deleteVouchers.count;
          await prisma.pNLValue.deleteMany({ where: { clientId: client.id } });
          await prisma.financialRecord.deleteMany({ where: { clientId: client.id } });
          await prisma.normalizedLedger.updateMany({ where: { clientId: client.id }, data: { closingBalance: 0 } });
        }
        await prisma.syncTask.update({ where: { id: syncTaskId }, data: { payload: { forceFull, purgedCount } } });
      }
    }

    // ── Ledger map ──────────────────────────────────────────────────────────
    currentStage = "LEDGER_MAP_BUILD";
    console.log(`[LEDGER_LOOKUP_START] requestId=${requestId}`);
    const existingLedgers = await prisma.normalizedLedger.findMany({ where: { clientId: client.id } });
    const ledgerMap = new Map<string, string>();
    for (const l of existingLedgers) ledgerMap.set(l.name.toLowerCase(), l.id);
    console.log(`[LEDGER_LOOKUP_DONE] requestId=${requestId} count=${existingLedgers.length}`);

    // ── Auto-create unknown ledgers ─────────────────────────────────────────
    currentStage = "LEDGER_CREATE";
    const uniqueLedgerNames = new Map<string, string>();
    for (const v of vouchers) {
      for (const line of v.lines) {
        if (line.ledgerName) {
          const original = line.ledgerName.trim();
          const lower = original.toLowerCase();
          if (!ledgerMap.has(lower) && !uniqueLedgerNames.has(lower)) {
            uniqueLedgerNames.set(lower, original);
          }
        }
      }
    }

    if (uniqueLedgerNames.size > 0) {
      console.log(`[LEDGER_CREATE_START] requestId=${requestId} newCount=${uniqueLedgerNames.size}`);
      const ledgersToCreate = Array.from(uniqueLedgerNames.values()).map(name => {
        const id = crypto.randomUUID();
        ledgerMap.set(name.toLowerCase(), id);
        return { id, clientId: client.id, name, groupName: "Uncategorized", nature: "DEBIT" };
      });
      await prisma.normalizedLedger.createMany({ data: ledgersToCreate, skipDuplicates: true });
      const finalLedgers = await prisma.normalizedLedger.findMany({ where: { clientId: client.id } });
      for (const l of finalLedgers) ledgerMap.set(l.name.toLowerCase(), l.id);
      console.log(`[LEDGER_CREATE_DONE] requestId=${requestId}`);
    }

    // ── Stale voucher purge ─────────────────────────────────────────────────
    currentStage = "STALE_PURGE";
    const startYear = parseInt(fromDate.substring(0, 4), 10);
    const startMonth = parseInt(fromDate.substring(4, 6), 10) - 1;
    const startDay = parseInt(fromDate.substring(6, 8), 10);
    const startUtc = new Date(Date.UTC(startYear, startMonth, startDay, 0, 0, 0, 0));
    const endYear = parseInt(toDate.substring(0, 4), 10);
    const endMonth = parseInt(toDate.substring(4, 6), 10) - 1;
    const endDay = parseInt(toDate.substring(6, 8), 10);
    const endUtc = new Date(Date.UTC(endYear, endMonth, endDay, 23, 59, 59, 999));
    const incomingRefs = vouchers.map((v: any, idx: number) => v.guid || v.voucherNumber || `VCH-${v.date}-${idx}`);

    const staleVouchers = await prisma.normalizedVoucher.findMany({
      where: { clientId: client.id, date: { gte: startUtc, lte: endUtc }, referenceNo: { notIn: incomingRefs } },
      select: { id: true }
    });
    if (staleVouchers.length > 0) {
      const staleIds = staleVouchers.map(sv => sv.id);
      console.log(`[STALE_PURGE] requestId=${requestId} count=${staleIds.length} period=${fromDate}-${toDate}`);
      await prisma.normalizedVoucherLine.deleteMany({ where: { voucherId: { in: staleIds } } });
      await prisma.normalizedVoucher.deleteMany({ where: { id: { in: staleIds } } });
    }

    // ── Build voucher + line payloads ───────────────────────────────────────
    currentStage = "VOUCHER_BUILD";
    console.log(`[VOUCHER_PROCESSING_START] requestId=${requestId} month=${periodKey} total=${vouchers.length}`);

    const referenceNos = vouchers.map((v: any, idx: number) => v.guid || v.voucherNumber || `VCH-${v.date}-${idx}`);
    const existingVouchersList = await prisma.normalizedVoucher.findMany({
      where: { clientId: client.id, referenceNo: { in: referenceNos } }
    });
    const existingMap = new Map(existingVouchersList.map(v => [v.referenceNo, v.id]));

    const vouchersToCreate: any[] = [];
    const linesToCreate: any[] = [];
    const vouchersToDeleteLines: string[] = [];
    const seenRefsThisBatch = new Set<string>();
    let processedCount = 0;

    for (const v of vouchers) {
      currentVoucherIdx = processedCount;
      const referenceNo = v.guid || v.voucherNumber || `VCH-${v.date}-${processedCount}`;
      currentVoucherRef = referenceNo;

      if (seenRefsThisBatch.has(referenceNo)) { processedCount++; continue; }
      seenRefsThisBatch.add(referenceNo);

      // ── Validate date ──
      const parsedDate = new Date(v.date);
      if (isNaN(parsedDate.getTime())) {
        console.error(`[INGEST_ERROR] requestId=${requestId} stage=VOUCHER_BUILD voucherIdx=${processedCount} ref="${referenceNo}" reason=INVALID_DATE value="${v.date}"`);
        processedCount++;
        continue; // skip bad voucher, don't fail whole batch
      }

      const existingId = existingMap.get(referenceNo);
      const voucherId = existingId || crypto.randomUUID();

      if (!existingId) {
        vouchersToCreate.push({
          id: voucherId,
          clientId: client.id,
          voucherNumber: v.voucherNumber || "N/A",
          referenceNo,
          date: parsedDate,
          type: v.voucherType || "JOURNAL",
          narration: v.narration || null,
          totalAmount: v.totalAmount || 0,
          isManual: false
        });
      } else {
        vouchersToDeleteLines.push(existingId);
      }

      const linePayloads = v.lines.map((line: any) => {
        const ledId = ledgerMap.get((line.ledgerName || "").toLowerCase());
        if (!ledId) return null;
        const amount = Math.abs(line.amount || 0);
        return {
          voucherId: voucherId as string,
          ledgerId: ledId,
          amount,
          entryType: line.isDebit ? "DEBIT" : "CREDIT"
        };
      }).filter(Boolean);

      linesToCreate.push(...linePayloads);
      processedCount++;
    }

    console.log(`[VOUCHER_BUILD_DONE] requestId=${requestId} toCreate=${vouchersToCreate.length} toUpdate=${vouchersToDeleteLines.length} lines=${linesToCreate.length}`);

    // ── DB writes ───────────────────────────────────────────────────────────
    currentStage = "VOUCHER_DELETE_LINES";
    if (vouchersToDeleteLines.length > 0) {
      await prisma.normalizedVoucherLine.deleteMany({ where: { voucherId: { in: vouchersToDeleteLines } } });
    }

    currentStage = "VOUCHER_CREATE";
    if (vouchersToCreate.length > 0) {
      await prisma.normalizedVoucher.createMany({ data: vouchersToCreate });
      console.log(`[VOUCHER_CREATED] requestId=${requestId} count=${vouchersToCreate.length}`);
    }

    currentStage = "LINES_CREATE";
    if (linesToCreate.length > 0) {
      await prisma.normalizedVoucherLine.createMany({ data: linesToCreate });
      console.log(`[VOUCHER_LINES_CREATED] requestId=${requestId} count=${linesToCreate.length}`);
    }

    // ── PNL Aggregation ─────────────────────────────────────────────────────
    currentStage = "PNL_AGGREGATION";
    const pnlMappings = await prisma.unifiedLedgerMapping.findMany({
      where: { clientId: client.id, statementType: "PNL" }
    });
    console.log(`[PNL_START] requestId=${requestId} mappings=${pnlMappings.length} vouchers=${vouchers.length}`);

    if (vouchers.length === 0 && pnlMappings.length > 0) {
      const year = parseInt(fromDate.substring(0, 4), 10);
      const monthNum = parseInt(fromDate.substring(4, 6), 10) - 1;
      const MONTH_SHORT_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const mShort = MONTH_SHORT_NAMES[monthNum];
      const syncYearToSave = monthNum < 3 ? year - 1 : year;
      await prisma.pNLValue.deleteMany({ where: { clientId: client.id, month: mShort, year: syncYearToSave } });
    }

    if (pnlMappings.length > 0 && vouchers.length > 0) {
      const MONTH_SHORT_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
      const monthBalances: Record<string, Record<string, number>> = {};

      for (const v of vouchers) {
        const d = new Date(v.date);
        if (isNaN(d.getTime())) continue;
        const mShort = MONTH_SHORT_NAMES[d.getUTCMonth()];
        const year = d.getUTCFullYear();
        const syncYearToSave = d.getUTCMonth() < 3 ? year - 1 : year;
        const pk = `${syncYearToSave}-${mShort}`;
        if (!monthBalances[pk]) monthBalances[pk] = {};
        for (const line of v.lines) {
          if (!line.ledgerName) continue;
          const amt = line.isDebit ? -line.amount : line.amount;
          const k = line.ledgerName.trim().toLowerCase();
          monthBalances[pk][k] = (monthBalances[pk][k] || 0) + amt;
        }
      }

      for (const [pk, accounts] of Object.entries(monthBalances)) {
        const [yearStr, mShort] = pk.split('-');
        const syncYearToSave = parseInt(yearStr);
        const headBalances: Record<string, number> = {};

        for (const m of pnlMappings) {
          const k = Object.keys(accounts).find(k2 => k2.trim().toLowerCase() === m.softwareLedgerName.trim().toLowerCase());
          if (k && accounts[k] !== 0) {
            headBalances[m.subHeadName] = (headBalances[m.subHeadName] || 0) + accounts[k];
          }
        }

        const finalEntries = Object.entries(headBalances).map(([headName, balance]) => ({
          clientId: client.id,
          headName,
          month: mShort,
          year: syncYearToSave,
          amount: encrypt(Math.abs(balance).toString())
        }));

        if (finalEntries.length > 0) {
          await prisma.pNLValue.deleteMany({ where: { clientId: client.id, month: mShort, year: syncYearToSave } });
          await prisma.pNLValue.createMany({ data: finalEntries });
          console.log(`[PNL_WRITTEN] requestId=${requestId} period=${pk} entries=${finalEntries.length}`);
        }
      }
    }
    console.log(`[TRANSACTION_COMMITTED] requestId=${requestId}`);

    // ── SyncTask result update ──────────────────────────────────────────────
    currentStage = "SYNC_TASK_UPDATE";
    if (syncTaskId) {
      const task = await prisma.syncTask.findUnique({ where: { id: syncTaskId } });
      if (task) {
        const currentResult = (task.result || {}) as any;
        currentResult.vouchersProcessed = (currentResult.vouchersProcessed || 0) + processedCount;
        currentResult.vouchersCreated = (currentResult.vouchersCreated || 0) + vouchersToCreate.length;
        currentResult.vouchersUpdated = (currentResult.vouchersUpdated || 0) + vouchersToDeleteLines.length;
        await prisma.syncTask.update({ where: { id: syncTaskId }, data: { result: currentResult } });
      }
    }

    const durationMs = Date.now() - startTime;
    console.log(`[INGEST_SUCCESS] requestId=${requestId} month=${periodKey} processed=${processedCount} durationMs=${durationMs}`);

    return NextResponse.json({
      message: `Successfully processed ${processedCount} vouchers.`,
      recordsProcessed: processedCount
    }, { status: 200 });

  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    console.error(`[INGEST_ERROR] requestId=${requestId} stage=${currentStage} voucherIdx=${currentVoucherIdx} voucherRef="${currentVoucherRef}" errorName=${error.name} errorCode=${error.code || 'N/A'} errorMessage=${error.message} durationMs=${durationMs}`);
    console.error(`[INGEST_ERROR_STACK] requestId=${requestId}`, error.stack);
    if (error.meta) console.error(`[INGEST_ERROR_PRISMA_META] requestId=${requestId}`, JSON.stringify(error.meta));

    return NextResponse.json({
      requestId,
      stage: currentStage,
      voucherRef: currentVoucherRef,
      message: `Ingestion failed at stage: ${currentStage}. Error: ${error.message}`
    }, { status: 500 });
  }
}
