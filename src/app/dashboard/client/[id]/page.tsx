import { prisma } from "@/lib/prisma";
import SectorDashboard from "@/components/SectorDashboard";
import { SECTOR_CONFIGS } from "@/lib/sector-configs";
import { redirect } from "next/navigation";
import { Sector } from "@prisma/client";

export default async function ClientPNLPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  const client = await prisma.client.findUnique({
    where: { id },
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

  // Fetch all clients of the same sector for the dropdown in the dashboard
  const clients = await prisma.client.findMany({
    where: { sector: client.sector },
    orderBy: { name: "asc" }
  });

  return (
    <SectorDashboard 
      title={`${config.title}`} 
      type={config.type} 
      sections={config.sections} 
      activeClientId={id}
      clients={clients}
    />
  );
}
