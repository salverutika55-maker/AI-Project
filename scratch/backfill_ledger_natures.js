const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const ledgers = await prisma.normalizedLedger.findMany({
    where: { isActive: true }
  });

  const creditGroups = [
    "capital account", "reserves & surplus", "current liabilities", "duties & taxes",
    "provisions", "sundry creditors", "loans (liability)", "bank od a/c",
    "secured loans", "unsecured loans", "suspense a/c", "equity", "owner's funds",
    "liabilities", "revenue", "income", "sales"
  ];

  console.log(`Starting backfill for ${ledgers.length} active ledgers...`);

  let updatedCount = 0;
  for (const l of ledgers) {
    // 1. Calculate transaction movements from raw voucher lines
    const lines = await prisma.normalizedVoucherLine.findMany({
      where: { ledgerId: l.id },
      select: { amount: true, entryType: true }
    });

    let debits = 0;
    let credits = 0;
    for (const line of lines) {
      if (line.entryType === "DEBIT") debits += line.amount;
      else credits += line.amount;
    }

    let resolvedNature = null;
    if (debits !== credits) {
      resolvedNature = debits > credits ? "DEBIT" : "CREDIT";
    } else {
      // Fallback to parent group name
      const gLower = l.groupName.trim().toLowerCase();
      const isCreditGroup = creditGroups.some(cg => gLower.includes(cg));
      resolvedNature = isCreditGroup ? "CREDIT" : "DEBIT";
    }

    if (l.nature !== resolvedNature) {
      updatedCount++;
      console.log(`Updating Nature for ${l.name} (${l.groupName}): ${l.nature} -> ${resolvedNature} (Vouchers count: ${lines.length}, Dr: ${debits}, Cr: ${credits})`);
      await prisma.normalizedLedger.update({
        where: { id: l.id },
        data: { nature: resolvedNature }
      });
    }
  }

  console.log(`\nBackfill complete. Updated nature for ${updatedCount} ledgers.`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
