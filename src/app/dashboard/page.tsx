import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: { client?: string } }) {
  const session = await getServerSession(authOptions);

  const user = await prisma.user.findUnique({
    where: { email: session?.user?.email as string },
  });

  const clients = await prisma.client.findMany({
    where: { userId: user?.id },
    orderBy: { createdAt: "desc" },
  });

  const activeClientId = searchParams.client || (clients.length > 0 ? clients[0].id : null);

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
