import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const c = await prisma.unifiedLedgerMapping.findFirst({
      where: { statementType: "BS" }
  });
  if (!c) {
      console.log("No client found");
      return;
  }
  const clientId = c.clientId;
  
  const res = await fetch(`http://localhost:3000/api/clients/${clientId}/balance-sheet`);
  if (!res.ok) {
     console.log("API Error:", await res.text());
     return;
  }
  const bsData = await res.json();
  const marNodes = bsData.dataNodes.filter((n: any) => n.period === "Mar");
  console.log("Total Mar Nodes:", marNodes.length);
  if (marNodes.length > 0) {
      console.log("Sample Mar Node:", marNodes[0]);
  }
  
  const totalAssets = marNodes.filter((n: any) => n.mainGroup === "Assets").reduce((s: number, n: any) => s + n.amount, 0);
  const totalLiabs = marNodes.filter((n: any) => n.mainGroup === "Liabilities").reduce((s: number, n: any) => s + n.amount, 0);
  
  console.log("Total Assets (Mar):", totalAssets);
  console.log("Total Liabs (Mar):", totalLiabs);
}

run().catch(console.error).finally(() => prisma.$disconnect());
