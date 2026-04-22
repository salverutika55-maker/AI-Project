import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { prisma } from "@/lib/prisma";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  const user = await prisma.user.findUnique({
    where: { email: session?.user?.email as string },
  });

  const records = await prisma.financialRecord.findMany({
    where: { userId: user?.id },
    orderBy: { period: "asc" },
  });

  return <DashboardClient initialRecords={records} />;
}
