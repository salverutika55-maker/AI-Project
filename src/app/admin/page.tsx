import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ShieldCheck, UserCheck, Clock, ShieldAlert } from "lucide-react";
import Link from "next/link";
import AdminLoginActivity from "@/components/AdminLoginActivity";

export default async function AdminDashboard() {
  const session = await getServerSession(authOptions);

  // Hardcore protection for Admin only
  if (!session || (session.user as any)?.role !== "ADMIN") {
    redirect("/");
  }

  // Fetch all users securely on the server
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      lastLogin: true,
      createdAt: true,
    },
    orderBy: {
      lastLogin: 'desc'
    }
  });

  // Fetch security audit logs
  const auditLogs = await prisma.auditLog.findMany({
    take: 100,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      action: true,
      entityId: true,
      details: true,
      ipAddress: true,
      userAgent: true,
      createdAt: true,
      user: {
        select: { email: true }
      }
    }
  });

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-200 p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-12 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/20 p-2 rounded-lg border border-emerald-500/30">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Master Admin Dashboard</h1>
              <p className="text-sm text-slate-400">Restricted Access • Logged in as {session.user?.email}</p>
            </div>
          </div>
          <Link href="/" className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm transition-colors text-slate-300">
            Back to App
          </Link>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-[#13131A] border border-white/10 p-6 rounded-2xl">
            <div className="flex items-center gap-3 mb-2">
              <UserCheck className="w-5 h-5 text-cyan-400" />
              <h3 className="font-semibold text-slate-300">Total Users</h3>
            </div>
            <p className="text-4xl font-bold text-white">{users.length}</p>
          </div>
          <div className="bg-[#13131A] border border-white/10 p-6 rounded-2xl">
            <div className="flex items-center gap-3 mb-2">
              <ShieldAlert className="w-5 h-5 text-emerald-400" />
              <h3 className="font-semibold text-slate-300">Admin Accounts</h3>
            </div>
            <p className="text-4xl font-bold text-white">{users.filter(u => u.role === 'ADMIN').length}</p>
          </div>
          <div className="bg-[#13131A] border border-white/10 p-6 rounded-2xl">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold text-slate-300">Active Today</h3>
            </div>
            <p className="text-4xl font-bold text-white">
              {users.filter(u => u.lastLogin && new Date(u.lastLogin).toDateString() === new Date().toDateString()).length}
            </p>
          </div>
        </div>

        <AdminLoginActivity />

        {/* Security Audit Log Section */}
        <div className="bg-[#13131A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-emerald-500"/> Security Activity Log</h2>
              <p className="text-sm text-slate-400">Comprehensive audit trail of all sensitive platform actions.</p>
            </div>
            <span className="text-xs px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded border border-emerald-500/20">AES-256 Secured</span>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-[#13131A] shadow-md z-10">
                <tr className="border-b border-white/5 text-sm font-medium text-slate-400 bg-black/20">
                  <th className="p-4 pl-6">Timestamp (IST)</th>
                  <th className="p-4">User</th>
                  <th className="p-4">Action</th>
                  <th className="p-4">IP Address</th>
                  <th className="p-4 pr-6">Changes / Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 pl-6 text-slate-400 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'short', timeStyle: 'medium' })}
                    </td>
                    <td className="p-4 font-medium text-white">
                      {log.user?.email || <span className="text-slate-500 italic">System</span>}
                    </td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs rounded font-medium border 
                        ${log.action.includes('SUCCESS') ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                          log.action.includes('FAIL') || log.action.includes('UNAUTHORIZED') ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                          'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-slate-400 text-xs font-mono">
                      {log.ipAddress || '-'}
                    </td>
                    <td className="p-4 pr-6 text-slate-400">
                      {log.details || '-'}
                      {log.userAgent && (
                        <div className="mt-2 text-[11px] text-slate-500 break-all">
                          {log.userAgent}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      No security logs recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
