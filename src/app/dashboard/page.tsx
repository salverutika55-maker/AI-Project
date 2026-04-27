import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    return null; // NextAuth will handle the redirect if configured, but let's be safe
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  let whereClause = {};
  if (user?.role !== "ADMIN") {
    whereClause = { userId: user?.id };
  }

  const clients = await prisma.client.findMany({
    where: whereClause,
    orderBy: { createdAt: "desc" },
  });

  // Only select a client if it's explicitly in the URL
  const activeClientId = params.client || null;

  let records: any[] = [];
  if (activeClientId) {
    records = await prisma.financialRecord.findMany({
      where: { clientId: activeClientId },
      orderBy: { period: "asc" },
    });
  }

  return (
    <DashboardClient 
      initialRecords={records} 
      clients={clients} 
      activeClientId={activeClientId} 
    />
  );
}
