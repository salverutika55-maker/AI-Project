import { getServerSession } from "next-auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { authOptions } from "@/lib/auth";
import AdminLoginRegister from "@/components/AdminLoginRegister";
import AdminClientAccessLogs from "@/components/AdminClientAccessLogs";

export default async function AdminLoginRegisterPage() {
  const session = await getServerSession(authOptions);

  if (!session || (session.user as { role?: string } | undefined)?.role !== "ADMIN") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-200 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8 border-b border-white/10 pb-6">
          <div className="flex items-center gap-3">
            <div className="bg-cyan-500/20 p-2 rounded-lg border border-cyan-500/30">
              <FileSpreadsheet className="w-6 h-6 text-cyan-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">User Login Register</h1>
              <p className="text-sm text-slate-400">Historical login history with filters, analytics, and export.</p>
            </div>
          </div>
          <Link href="/admin" className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10">
            <ArrowLeft className="w-4 h-4" /> Back to Admin Dashboard
          </Link>
        </header>

        <AdminLoginRegister />
        <AdminClientAccessLogs />
      </div>
    </div>
  );
}
