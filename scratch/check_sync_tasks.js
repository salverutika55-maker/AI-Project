const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const latestTasks = await prisma.syncTask.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  
  console.log(`Found ${latestTasks.length} sync tasks:`);
  for (const t of latestTasks) {
    console.log(`- Task ID: ${t.id}, Status: ${t.status}, CreatedAt: ${t.createdAt}`);
    if (t.result) {
      const res = t.result;
      console.log(`  Added: ${res.added}, Updated: ${res.updated}, Deleted: ${res.deleted}, SourceCount: ${res.sourceLedgerCount}`);
      // Print first 5 items from traceLog if any
      if (res.traceLog && res.traceLog.length > 0) {
        console.log("  TraceLog (first 3):");
        res.traceLog.slice(0, 3).forEach(x => {
          console.log(`    - Action: ${x.syncAction}, Name: ${x.currentName || x.previousName}, Group: ${x.currentGroup}, Reason: ${x.reason}`);
        });
      }
    }
  }
}

run().catch(console.error).finally(() => prisma.$disconnect());
