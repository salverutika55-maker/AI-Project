"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Search, Users, Clock3, CalendarDays, Activity } from "lucide-react";

type LoginPeriod = "today" | "7d" | "30d" | "year" | "all";

type LoginRecord = {
  id: string;
  userId: string;
  loginTime: string;
  email: string;
  role: string;
  ipAddress: string;
  browser: string;
  device: string;
  status: "SUCCESS" | "RECOVERED";
  userAgent: string;
};

type RegisterResponse = {
  filters: {
    period: LoginPeriod;
    search: string;
    userId: string | null;
    page: number;
    pageSize: number;
  };
  summary: {
    today: number;
    last7Days: number;
    last30Days: number;
    thisYear: number;
    allTime: number;
  };
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  records: LoginRecord[];
};

type UserStatsResponse = {
  user: {
    id: string;
    email: string;
    role: string;
  };
  stats: {
    totalLogins: number;
    firstLogin: string | null;
    lastLogin: string | null;
    averageDailyLogins: number;
    currentStatus: "Online" | "Offline";
  };
};

const PERIOD_OPTIONS: Array<{ label: string; value: LoginPeriod }> = [
  { label: "Today", value: "today" },
  { label: "Last 7 Days", value: "7d" },
  { label: "Last 30 Days", value: "30d" },
  { label: "This Year", value: "year" },
  { label: "All Time", value: "all" },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdminLoginRegister() {
  const [period, setPeriod] = useState<LoginPeriod>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RegisterResponse | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<UserStatsResponse | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [period, debouncedSearch]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          period,
          page: String(page),
          pageSize: "50",
        });

        if (debouncedSearch) {
          params.set("search", debouncedSearch);
        }

        const res = await fetch(`/api/admin/login-register?${params.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load login register");
        const payload = (await res.json()) as RegisterResponse;
        setData(payload);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [period, debouncedSearch, page]);

  useEffect(() => {
    if (!selectedUserId) {
      setUserStats(null);
      return;
    }

    async function loadUserStats() {
      setStatsLoading(true);
      try {
        const res = await fetch(`/api/admin/login-register/user/${selectedUserId}`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load user login stats");
        const payload = (await res.json()) as UserStatsResponse;
        setUserStats(payload);
      } catch (error) {
        console.error(error);
        setUserStats(null);
      } finally {
        setStatsLoading(false);
      }
    }

    loadUserStats();
  }, [selectedUserId]);

  const totalPages = data?.totalPages || 1;
  const summaryCards = useMemo(() => {
    return [
      { label: "Today", value: data?.summary.today ?? 0, icon: Clock3 },
      { label: "Last 7 Days", value: data?.summary.last7Days ?? 0, icon: Activity },
      { label: "Last 30 Days", value: data?.summary.last30Days ?? 0, icon: CalendarDays },
      { label: "This Year", value: data?.summary.thisYear ?? 0, icon: Users },
      { label: "All Time", value: data?.summary.allTime ?? 0, icon: Users },
    ];
  }, [data]);

  function exportCsv() {
    const params = new URLSearchParams({
      period,
      format: "csv",
    });

    if (debouncedSearch) {
      params.set("search", debouncedSearch);
    }

    window.open(`/api/admin/login-register?${params.toString()}`, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="bg-[#13131A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
      <div className="p-6 border-b border-white/10 bg-white/5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">User Login Register</h2>
            <p className="text-sm text-slate-400">Complete historical login register for audit and compliance.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by email"
                className="w-full sm:w-72 rounded-lg bg-[#0f1119] border border-white/10 pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-300 hover:bg-cyan-500/20"
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPeriod(option.value)}
              className={`rounded-full px-4 py-1.5 text-sm border transition-colors ${
                period === option.value
                  ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  : "bg-white/5 border-white/10 text-slate-300 hover:bg-white/10"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 p-6 border-b border-white/10">
        {summaryCards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl bg-[#0f1119] p-4 border border-white/10">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <div className="mt-2 flex items-center gap-2">
              <Icon className="w-4 h-4 text-cyan-400" />
              <p className="text-2xl font-semibold text-white">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-0">
        <div className="xl:col-span-2 border-r border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/20 text-slate-400">
                <tr>
                  <th className="px-4 py-3">Login Time</th>
                  <th className="px-4 py-3">User Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">IP Address</th>
                  <th className="px-4 py-3">Browser</th>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(data?.records || []).map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => setSelectedUserId(record.userId)}
                    className={`cursor-pointer hover:bg-white/5 transition-colors ${
                      selectedUserId === record.userId ? "bg-white/5" : ""
                    }`}
                  >
                    <td className="px-4 py-4 text-slate-300 whitespace-nowrap">{formatDate(record.loginTime)}</td>
                    <td className="px-4 py-4 text-white font-medium">{record.email}</td>
                    <td className="px-4 py-4 text-slate-300">{record.role}</td>
                    <td className="px-4 py-4 text-slate-400 font-mono text-xs">{record.ipAddress}</td>
                    <td className="px-4 py-4 text-slate-300">{record.browser}</td>
                    <td className="px-4 py-4 text-slate-300">{record.device}</td>
                    <td className="px-4 py-4">
                      <span
                        className={`rounded px-2 py-1 text-xs border ${
                          record.status === "SUCCESS"
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                            : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                        }`}
                      >
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!loading && (data?.records.length || 0) === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                      No login records found for selected filters.
                    </td>
                  </tr>
                )}
                {loading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      Loading login register...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-[#0f1119]">
            <p className="text-sm text-slate-400">
              Showing {(data?.records.length || 0)} of {data?.total || 0} records
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 rounded bg-white/5 border border-white/10 text-slate-300 disabled:opacity-50"
              >
                Prev
              </button>
              <span className="text-sm text-slate-300">
                Page {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 rounded bg-white/5 border border-white/10 text-slate-300 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>

        <aside className="p-6 bg-[#0f1119]">
          <h3 className="text-base font-semibold text-white">User Wise Login Statistics</h3>
          <p className="text-sm text-slate-400 mt-1">Click a user row to inspect lifetime login behavior.</p>

          {!selectedUserId && (
            <div className="mt-6 rounded-xl border border-white/10 bg-[#13131A] p-4 text-sm text-slate-400">
              Select any user from the register table.
            </div>
          )}

          {selectedUserId && statsLoading && (
            <div className="mt-6 rounded-xl border border-white/10 bg-[#13131A] p-4 text-sm text-slate-300">
              Loading user stats...
            </div>
          )}

          {selectedUserId && !statsLoading && userStats && (
            <div className="mt-6 rounded-xl border border-white/10 bg-[#13131A] p-4 space-y-3 text-sm">
              <p className="text-white font-semibold break-words">User: {userStats.user.email}</p>
              <p className="text-slate-300">Total Logins: <span className="text-white">{userStats.stats.totalLogins}</span></p>
              <p className="text-slate-300">First Login: <span className="text-white">{formatDate(userStats.stats.firstLogin)}</span></p>
              <p className="text-slate-300">Last Login: <span className="text-white">{formatDate(userStats.stats.lastLogin)}</span></p>
              <p className="text-slate-300">Average Daily Logins: <span className="text-white">{userStats.stats.averageDailyLogins}</span></p>
              <p className="text-slate-300">
                Current Status:{" "}
                <span className={userStats.stats.currentStatus === "Online" ? "text-emerald-300" : "text-slate-400"}>
                  {userStats.stats.currentStatus}
                </span>
              </p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
