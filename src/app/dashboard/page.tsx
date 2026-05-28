import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const params = await searchParams;
  const session = await getServerSession(authOptions);

  if (!session || !session.user?.email) {
    redirect("/login");
  }

  try {

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    });

    if (!user) {
      return (
        <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center p-6 text-center">
          <div className="max-w-md">
            <h1 className="text-2xl font-bold text-white mb-4">User Record Not Found</h1>
            <p className="text-slate-400 mb-6">We found your session but couldn't find your user profile in the database.</p>
            <a href="/api/auth/signout" className="text-cyan-400 underline">Try signing out and back in</a>
          </div>
        </div>
      );
    }

    // Fetch User's Memberships
    const allMemberships = await prisma.organizationMembership.findMany({
      where: { userId: user.id },
      include: { organization: true }
    });

    // Global Admins (like salverutika55@gmail.com) bypass the approval process
    const isGlobalAdmin = user.role === "ADMIN";

    if (isGlobalAdmin) {
      const pendingAdminMemberships = allMemberships.filter(m => m.status === "PENDING");
      if (pendingAdminMemberships.length > 0) {
        // Auto-approve the global admin's own memberships
        await prisma.organizationMembership.updateMany({
          where: { userId: user.id, status: "PENDING" },
          data: { status: "APPROVED" }
        });
        // Update local state to reflect approval
        pendingAdminMemberships.forEach(m => m.status = "APPROVED");
      }
    }

    const approvedMemberships = allMemberships.filter(m => m.status === "APPROVED");
    const pendingMemberships = allMemberships.filter(m => m.status === "PENDING");

    if (approvedMemberships.length === 0 && !isGlobalAdmin) {
      if (pendingMemberships.length > 0) {
        return (
          <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center p-6 text-center">
            <div className="max-w-md bg-[#13131A] p-8 rounded-2xl border border-amber-500/20 shadow-2xl shadow-amber-500/10">
              <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-amber-500">⏳</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-4">Approval Pending</h1>
              <p className="text-slate-400 mb-6">Your access request for <b>{pendingMemberships[0].organization.name}</b> is currently under review by the administrator. Please check back later.</p>
              <a href="/api/auth/signout" className="text-amber-400 hover:text-amber-300 transition-colors text-sm font-medium">Log out</a>
            </div>
          </div>
        );
      }
      return (
        <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center p-6 text-center">
          <div className="max-w-md bg-[#13131A] p-8 rounded-2xl border border-white/10 shadow-2xl">
            <h1 className="text-2xl font-bold text-white mb-4">No Access</h1>
            <p className="text-slate-400 mb-6">You do not belong to any organizations yet.</p>
            <a href="/api/auth/signout" className="text-cyan-400 hover:text-cyan-300 transition-colors text-sm font-medium">Log out</a>
          </div>
        </div>
      );
    }

    const orgIds = approvedMemberships.map(m => m.organizationId);

    // Fetch Clients belonging to those organizations
    const clients = await prisma.client.findMany({
      where: { organizationId: { in: orgIds } },
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
        memberships={approvedMemberships}
        isGlobalAdmin={isGlobalAdmin}
      />
    );
  } catch (error: any) {
    console.error("Dashboard Page Error:", error);
    return (
      <div className="min-h-screen bg-[#0A0A0C] p-10 text-white font-mono">
        <h1 className="text-red-500 text-2xl font-bold mb-4">CRITICAL SERVER ERROR</h1>
        <p className="bg-red-500/10 p-4 border border-red-500/20 rounded mb-6">
          {error.message}
        </p>
        <p className="text-slate-500 text-sm mb-4">Technical Details:</p>
        <pre className="bg-black p-4 rounded overflow-auto max-h-96 text-xs text-slate-400">
          {error.stack}
        </pre>
        <div className="mt-8">
          <a href="/dashboard" className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg inline-block">
            Retry Loading
          </a>
        </div>
      </div>
    );
  }
}
