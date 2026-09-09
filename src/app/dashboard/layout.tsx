import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LineChart, LayoutDashboard, LogOut, FilePlus, Factory, Briefcase, ArrowRightLeft } from "lucide-react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }


  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-200 flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 border-r border-white/5 bg-[#13131A] flex flex-col hidden md:flex sticky top-0 h-screen">
        <div className="p-6 border-b border-white/5 flex items-center">
          <Link href="/" className="flex items-center hover:opacity-95 transition-opacity">
            <img src="/FinAnalyzer-logo.svg" alt="FinAnalyzer" className="h-8 w-auto" />
          </Link>
        </div>
        <div className="p-4 flex-1">
          <nav className="space-y-1">
            <Link href="/dashboard" className="flex items-center gap-3 px-3 py-2.5 bg-cyan-500/10 text-cyan-400 rounded-lg transition-colors font-medium">
              <LayoutDashboard className="w-5 h-5" />
              Main Dashboard
            </Link>
            {(session.user as any)?.role === 'ADMIN' && (
              <Link href="/admin" className="flex items-center gap-3 px-3 py-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors font-medium">
                <FilePlus className="w-5 h-5" />
                Admin Panel
              </Link>
            )}
            

          </nav>
        </div>
        <div className="p-4 border-t border-white/5">
          <div className="mb-4 px-3">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Logged in as</p>
            <p className="text-sm font-medium text-slate-300 truncate">{session.user?.email}</p>
          </div>
          <Link href="/api/auth/signout" className="flex items-center gap-3 px-3 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors font-medium">
            <LogOut className="w-5 h-5" />
            Sign Out
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-y-auto w-full">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 border-b border-white/5 bg-[#13131A] sticky top-0 z-50">
          <Link href="/" className="flex items-center">
            <img src="/FinAnalyzer-logo.svg" alt="FinAnalyzer" className="h-7 w-auto" />
          </Link>
          <Link href="/api/auth/signout" className="text-sm font-medium text-red-400">Log Out</Link>
        </header>

        <div className="p-6 md:p-10 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  );
}
