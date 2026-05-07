import { prisma } from "@/lib/prisma";
import UnifiedClientDashboard from "@/components/UnifiedClientDashboard";
import { SECTOR_CONFIGS } from "@/lib/sector-configs";
import { redirect } from "next/navigation";
import { Sector } from "@prisma/client";

export default async function ClientPNLPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
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
    />
  );
}

