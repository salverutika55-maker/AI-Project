import { inngest } from "../client";
import { prisma } from "@/lib/prisma";

export const processTallyChunk = inngest.createFunction(
  { id: "process-tally-chunk" },
  { event: "sync/tally.chunk.uploaded" },
  async ({ event, step }) => {
    const { clientId, blobUrl, alterId } = event.data;

    // 1. Fetch the Blob from Vercel Blob
    const xmlData = await step.run("fetch-blob", async () => {
      const response = await fetch(blobUrl);
      if (!response.ok) throw new Error("Failed to fetch blob");
      return await response.text();
    });

    // 2. Parse XML (Stubbed for now)
    const records = await step.run("parse-xml", async () => {
      // Logic to stream parse the XML data
      // This step isolates the parsing logic
      return { status: "parsed", length: xmlData.length };
    });

    // 3. Upsert into Database
    await step.run("upsert-database", async () => {
      // Implementation of raw SQL batch upsert goes here
      // e.g. await prisma.$executeRaw\`INSERT INTO FinancialRecord ... ON CONFLICT DO UPDATE\`
    });

    // 4. Update the Client's lastAlterId
    await step.run("update-checkpoint", async () => {
      await prisma.client.update({
        where: { id: clientId },
        data: {
          lastAlterId: alterId.toString(),
          lastSyncedAt: new Date(),
        },
      });
    });

    return { success: true, recordsProcessed: records.length };
  }
);
