import { getServerSession } from "next-auth";
import { authOptions } from "../api/auth/[...nextauth]/route";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { LineChart, ShieldCheck, UserCheck, Clock, ShieldAlert } from "lucide-react";
import Link from "next/link";

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

        <div className="bg-[#13131A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          <div className="p-6 border-b border-white/10 bg-white/5">
            <h2 className="text-lg font-bold text-white">Recent Logins</h2>
            <p className="text-sm text-slate-400">Track all users currently interacting with the platform.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/5 text-sm font-medium text-slate-400 bg-black/20">
                  <th className="p-4 pl-6">Email Address</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Account Created</th>
                  <th className="p-4 pr-6">Last Login</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-white/5 transition-colors">
                    <td className="p-4 pl-6 font-medium text-white">{user.email}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 text-xs rounded-lg font-medium border ${user.role === 'ADMIN' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-800 text-slate-300 border-white/10'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-4 text-slate-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-4 pr-6 text-slate-400">
                      {user.lastLogin ? (
                        <span className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                          {new Date(user.lastLogin).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-slate-500">Never logged in</span>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-slate-500">
                      No users found.
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
