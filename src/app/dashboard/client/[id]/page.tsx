import { prisma } from "@/lib/prisma";
import UnifiedClientDashboard from "@/components/UnifiedClientDashboard";
import { SECTOR_CONFIGS } from "@/lib/sector-configs";
import { redirect } from "next/navigation";
import { Sector } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserRoleInOrg } from "@/lib/rbac";

export default async function ClientPNLPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) redirect("/login");

  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      devices: {
        orderBy: { lastSeen: "desc" },
        take: 1
      }
    }
  });

  if (!client) {
    redirect("/dashboard");
  }

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) redirect("/login");

  const userRole = await getUserRoleInOrg(user.id, client.organizationId);
  if (!userRole) redirect("/dashboard"); // Not in this org

  // Automatically mark as OFFLINE if no heartbeat received for > 40 seconds
  if (client.connectorStatus === "ONLINE" && client.lastHeartbeat) {
    const timeSinceHeartbeat = Date.now() - client.lastHeartbeat.getTime();
    if (timeSinceHeartbeat > 40000) {
      client.connectorStatus = "OFFLINE";
      // Background update
      prisma.client.update({
        where: { id: client.id },
        data: { connectorStatus: "OFFLINE" }
      }).catch(console.error);
    }
  }

  try {

    const config = SECTOR_CONFIGS[client.sector as Sector];

    if (!config) {
      return (
        <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center p-6 text-center">
          <div className="max-w-md bg-[#13131A] p-10 rounded-3xl border border-white/10 shadow-2xl">
            <h1 className="text-2xl font-black text-white mb-4">Invalid Sector</h1>
            <p className="text-slate-400 mb-8 font-medium">The sector "{client.sector}" is not configured in the system.</p>
            <a href="/dashboard" className="inline-block px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl transition-all">Back to Client Hub</a>
          </div>
        </div>
      );
    }

    // Fetch all clients (for the dropdown)
    const allClients = await prisma.client.findMany({
      orderBy: { name: "asc" }
    });

    return (
      <UnifiedClientDashboard 
        client={client}
        allClients={allClients}
        sections={config.sections}
        userRole={userRole}
      />
    );
  } catch (error: any) {
    console.error("Client PNL Page Error:", error);
    return (
      <div className="min-h-screen bg-[#0A0A0C] p-10 text-white font-mono flex items-center justify-center">
        <div className="max-w-2xl w-full bg-[#13131A] border border-red-500/20 p-8 rounded-3xl shadow-2xl">
          <h1 className="text-red-500 text-2xl font-black mb-4">DATA FETCHING ERROR</h1>
          <p className="text-slate-400 mb-6 font-medium">We encountered an issue while retrieving the financial data for this client.</p>
          <div className="bg-black/50 p-4 rounded-xl mb-8 overflow-auto max-h-40">
            <code className="text-xs text-red-400/80">{error.message}</code>
          </div>
          <div className="flex gap-4">
            <a href="/dashboard" className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-bold transition-all">Back to Dashboard</a>
            <a href={`/dashboard/client/${id}`} className="px-6 py-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-xl text-sm font-bold transition-all">Retry Loading</a>
          </div>
        </div>
      </div>
    );
  }
}

