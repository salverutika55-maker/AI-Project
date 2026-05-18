import { inngest } from "../client";
import { prisma } from "@/lib/prisma";
import { XMLParser } from "fast-xml-parser";

export const processTallyChunk = inngest.createFunction(
  { id: "process-tally-chunk", triggers: [{ event: "sync/tally.chunk.uploaded" }] },
  async ({ event, step }) => {
    const { clientId, blobUrl, alterId } = event.data as any;

    // 1. Fetch the Blob from Vercel Blob
    const xmlData = await step.run("fetch-blob", async () => {
      const response = await fetch(blobUrl);
      if (!response.ok) throw new Error("Failed to fetch blob");
      return await response.text();
    });

    // 2. Parse XML using fast-xml-parser
    const parsedVouchers = await step.run("parse-xml", async () => {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        isArray: (name) => {
          if (name === "VOUCHER" || name === "ALLLEDGERENTRIES.LIST") return true;
          return false;
        }
      });
      const jsonObj = parser.parse(xmlData);
      
      const vouchers = jsonObj?.ENVELOPE?.BODY?.EXPORTDATA?.REQUESTCONTENT?.COLLECTION?.VOUCHER 
                    || jsonObj?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER 
                    || [];
      
      const formattedVouchers: any[] = [];
      for (const v of vouchers) {
        const vchKey = v["@_VCHKEY"] || v.GUID || Math.random().toString();
        const altId = parseInt(v["@_ALTERID"] || "0");
        const dateStr = v.DATE; // YYYYMMDD
        let parsedDate = new Date();
        if (dateStr && dateStr.length === 8) {
          parsedDate = new Date(`${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`);
        }

        const entries = v["ALLLEDGERENTRIES.LIST"] || [];
        for (const entry of entries) {
          formattedVouchers.push({
            clientId,
            tallyGuid: `${vchKey}-${entry.LEDGERNAME}`, // Unique per ledger line
            alterId: altId,
            date: parsedDate,
            voucherType: v.VOUCHERTYPENAME || "Unknown",
            ledgerName: entry.LEDGERNAME || "Unknown",
            amount: Math.abs(parseFloat(entry.AMOUNT || "0")),
            isDebit: entry.ISDEEMEDPOSITIVE === "Yes",
          });
        }
      }
      return formattedVouchers;
    });

    // 3. Upsert into Database (TallyVoucher Staging Table)
    await step.run("upsert-database", async () => {
      for (const v of parsedVouchers as any[]) {
        await prisma.tallyVoucher.upsert({
          where: { tallyGuid: v.tallyGuid },
          update: {
            alterId: v.alterId,
            date: v.date,
            voucherType: v.voucherType,
            ledgerName: v.ledgerName,
            amount: v.amount,
            isDebit: v.isDebit,
          },
          create: v
        });
      }
    });

    // 4. Aggregate to Monthly FinancialRecord view
    await step.run("aggregate-financials", async () => {
      const allVouchers = await prisma.tallyVoucher.findMany({ where: { clientId } });
      const monthlyTotals: Record<string, { revenue: number, expenses: number }> = {};
      
      for (const v of allVouchers) {
        const period = `${v.date.getFullYear()}-${String(v.date.getMonth() + 1).padStart(2, '0')}`;
        if (!monthlyTotals[period]) monthlyTotals[period] = { revenue: 0, expenses: 0 };
        
        const type = v.voucherType.toLowerCase();
        if (type.includes("sales") || type.includes("receipt")) {
           monthlyTotals[period].revenue += v.amount;
        } else if (type.includes("purchase") || type.includes("payment")) {
           monthlyTotals[period].expenses += v.amount;
        }
      }

      for (const [period, totals] of Object.entries(monthlyTotals)) {
        const existing = await prisma.financialRecord.findFirst({
          where: { clientId, period }
        });
        
        if (existing) {
          await prisma.financialRecord.update({
            where: { id: existing.id },
            data: { revenue: totals.revenue, operatingExpenses: totals.expenses }
          });
        } else {
          await prisma.financialRecord.create({
            data: {
              clientId,
              period,
              source: "Tally Prime",
              revenue: totals.revenue,
              operatingExpenses: totals.expenses
            }
          });
        }
      }
    });

    // 5. Update the Client's lastAlterId
    await step.run("update-checkpoint", async () => {
      await prisma.client.update({
        where: { id: clientId },
        data: {
          lastAlterId: alterId.toString(),
          lastSyncedAt: new Date(),
        },
      });
    });

    return { success: true, recordsProcessed: (parsedVouchers as any[]).length };
  }
);
