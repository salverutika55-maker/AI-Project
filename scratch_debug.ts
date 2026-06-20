import { prisma } from "./src/lib/prisma";

async function main() {
    const clients = await prisma.client.findMany();
    if (clients.length === 0) {
        console.log("No clients found.");
        return;
    }
    
    for (const client of clients) {
        console.log(`\nClient: ${client.name} (${client.id})`);
        
        const ledgers = await prisma.normalizedLedger.findMany({
            where: { clientId: client.id, isActive: true },
            take: 5
        });
        
        console.log("Sample Ledgers:", ledgers.map(l => ({ name: l.name, group: l.groupName, opening: l.openingBalance, closing: l.closingBalance })));
        
        const mappings = await prisma.unifiedLedgerMapping.count({
            where: { clientId: client.id, statementType: "BS" }
        });
        
        console.log(`BS Mappings Count: ${mappings}`);
        
        const voucherLines = await prisma.normalizedVoucherLine.count({
            where: { voucher: { clientId: client.id } }
        });
        
        console.log(`Voucher Lines Count: ${voucherLines}`);

        // Try to check "Bank Accounts"
        const bankMapping = await prisma.unifiedLedgerMapping.findFirst({
            where: { clientId: client.id, statementType: "BS", subHeadName: "Bank Accounts" }
        });
        console.log("Sample Bank Mapping:", bankMapping);
    }
}

main().catch(console.error).finally(() => prisma.$disconnect());
