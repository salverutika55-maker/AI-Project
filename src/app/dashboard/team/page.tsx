import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TeamApprovalsClient from "./TeamApprovalsClient";
import { Users, ShieldAlert } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function TeamManagementPage() {
  const session = await getServerSession(authOptions);
  if (!session || !session.user?.email) redirect("/login");

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) redirect("/login");

  const adminMemberships = await prisma.organizationMembership.findMany({
    where: { 
      userId: user.id, 
      status: "APPROVED",
      role: { in: ["SUPER_ADMIN", "ORG_ADMIN"] } 
    },
    include: { organization: true }
  });

  const isGlobalAdmin = user.role === "ADMIN";

  if (adminMemberships.length === 0 && !isGlobalAdmin) {
    return (
      <div className="min-h-screen bg-[#0A0A0C] p-10 flex flex-col items-center justify-center text-center">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-slate-400 mb-6">You must be an Organization Admin or Super Admin to view team approvals.</p>
        <Link href="/dashboard" className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white">Return to Dashboard</Link>
      </div>
    );
  }

  // Global Admin sees all requests, Org Admin sees only their own
  let orgIds: string[] = [];
  if (isGlobalAdmin) {
    const allOrgs = await prisma.organization.findMany({ select: { id: true } });
    orgIds = allOrgs.map(o => o.id);
  } else {
    orgIds = adminMemberships.map(m => m.organizationId);
  }

  const pendingRequests = await prisma.organizationMembership.findMany({
    where: {
      organizationId: { in: orgIds },
      status: "PENDING"
    },
    include: {
      user: { select: { email: true, createdAt: true } },
      organization: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  const activeTeam = await prisma.organizationMembership.findMany({
    where: {
      organizationId: { in: orgIds },
      status: "APPROVED"
    },
    include: {
      user: { select: { email: true, lastLogin: true } },
      organization: { select: { name: true } }
    },
    orderBy: { role: 'asc' }
  });

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-200 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/20 p-2 rounded-lg border border-indigo-500/30">
              <Users className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Team Management</h1>
              <p className="text-sm text-slate-400">Manage access requests and active members across your organizations.</p>
            </div>
          </div>
          <Link href="/dashboard" className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-slate-300">
            Back to Dashboard
          </Link>
        </header>

        <TeamApprovalsClient initialPending={pendingRequests} initialActive={activeTeam} />
      </div>
    </div>
  );
}
