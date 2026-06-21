"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Wifi, WifiOff, Users, CircleDot, Activity, RefreshCcw } from "lucide-react";

type LoginEvent = {
  id: string;
  email: string;
  userRole?: string | null;
  loginTime: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type LoginStats = {
  totalUsers: number;
  activeUsersNow: number;
  usersLoggedInToday: number;
  lastLoginEvent?: string | null;
  lastDatabaseUpdate?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export default function AdminLoginActivity() {
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [stats, setStats] = useState<LoginStats>({
    totalUsers: 0,
    activeUsersNow: 0,
    usersLoggedInToday: 0,
    lastLoginEvent: null,
    lastDatabaseUpdate: null,
  });
  const [connected, setConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeout = useRef<number | null>(null);

  const activeUsersBadge = useMemo(() => {
    return stats.activeUsersNow > 0 ? (
      <span className="inline-flex items-center gap-2 text-emerald-300">
        <CircleDot className="w-2.5 h-2.5 text-emerald-400" />
        Online
      </span>
    ) : (
      <span className="inline-flex items-center gap-2 text-slate-400">
        <CircleDot className="w-2.5 h-2.5 text-slate-500" />
        Offline
      </span>
    );
  }, [stats.activeUsersNow]);

  async function refreshRecentLogins() {
    try {
      const res = await fetch("/api/admin/logins", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load recent logins");

      const payload = await res.json();
      if (!payload) return;

      setLoginEvents(payload.recentLogins || []);
      setStats({
        totalUsers: payload.totalUsers || 0,
        activeUsersNow: payload.activeUsersNow || 0,
        usersLoggedInToday: payload.usersLoggedInToday || 0,
        lastLoginEvent: payload.lastLoginEvent || null,
        lastDatabaseUpdate: payload.lastDatabaseUpdate || payload.fetchedAt || null,
      });
    } catch (error) {
      console.error("Failed to refresh login activity", error);
    }
  }

  function connectEventSource() {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const source = new EventSource("/api/admin/logins/stream");
    eventSourceRef.current = source;

    source.onopen = () => {
      setConnected(true);
    };

    source.onerror = () => {
      setConnected(false);
      setTimeout(() => {
        if (source.readyState !== EventSource.OPEN) {
          connectEventSource();
        }
      }, 3000);
    };

    source.addEventListener("login", async (event: MessageEvent) => {
      try {
        const nextLogin = JSON.parse(event.data) as LoginEvent;
        setLoginEvents((previous) => [nextLogin, ...previous].slice(0, 20));
        setLastEventAt(new Date().toISOString());
        setEventCount((count) => count + 1);
        await refreshRecentLogins();
      } catch (error) {
        console.error("Malformed login event payload", error);
      }
    });

    source.addEventListener("ping", () => {
      setConnected(true);
    });
  }

  useEffect(() => {
    refreshRecentLogins();
    connectEventSource();

    const refreshInterval = window.setInterval(refreshRecentLogins, 30000);
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      window.clearInterval(refreshInterval);
      if (retryTimeout.current) {
        window.clearTimeout(retryTimeout.current);
      }
    };
  }, []);

  return (
    <section className="bg-[#13131A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl mb-12">
      <div className="p-6 border-b border-white/10 bg-white/5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Recent Logins</h2>
            <p className="text-sm text-slate-400">Live login activity and user connection status.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-900/70 px-3 py-1 border border-white/10">
              <Wifi className="w-4 h-4 text-emerald-400" />
              {connected ? "Connected" : "Disconnected"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-slate-900/70 px-3 py-1 border border-white/10">
              <Activity className="w-4 h-4 text-cyan-400" />
              {eventCount} realtime events
            </span>
            <button
              type="button"
              onClick={refreshRecentLogins}
              className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 border border-white/10 text-slate-200 hover:bg-white/10"
            >
              <RefreshCcw className="w-4 h-4" /> Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 p-6">
        <div className="rounded-2xl bg-[#0f1119] p-4 border border-white/10">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Active Users Now</p>
          <p className="mt-3 text-3xl font-semibold text-white">{stats.activeUsersNow}</p>
          <p className="mt-2 text-sm text-slate-400">Within the last 5 minutes</p>
        </div>
        <div className="rounded-2xl bg-[#0f1119] p-4 border border-white/10">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Users Logged In Today</p>
          <p className="mt-3 text-3xl font-semibold text-white">{stats.usersLoggedInToday}</p>
          <p className="mt-2 text-sm text-slate-400">Today’s authenticated sessions</p>
        </div>
        <div className="rounded-2xl bg-[#0f1119] p-4 border border-white/10">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Users</p>
          <p className="mt-3 text-3xl font-semibold text-white">{stats.totalUsers}</p>
          <p className="mt-2 text-sm text-slate-400">Current registered accounts</p>
        </div>
        <div className="rounded-2xl bg-[#0f1119] p-4 border border-white/10">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Status</p>
          <div className="mt-3 text-2xl font-semibold">{activeUsersBadge}</div>
          <p className="mt-2 text-sm text-slate-400">Updated every event or refresh</p>
        </div>
      </div>

      <div className="p-6 border-t border-white/10 bg-[#0D0D12]">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-2xl bg-[#0f1119] p-4 border border-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Last Login Event</p>
            <p className="mt-3 text-sm text-white">{formatDate(stats.lastLoginEvent)}</p>
          </div>
          <div className="rounded-2xl bg-[#0f1119] p-4 border border-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Last DB Refresh</p>
            <p className="mt-3 text-sm text-white">{formatDate(stats.lastDatabaseUpdate)}</p>
          </div>
          <div className="rounded-2xl bg-[#0f1119] p-4 border border-white/10">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Realtime Event Received</p>
            <p className="mt-3 text-sm text-white">{lastEventAt ? formatDate(lastEventAt) : "No events yet"}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#13131A]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/20 text-slate-400">
              <tr>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Login Time</th>
                <th className="px-4 py-3">IP Address</th>
                <th className="px-4 py-3">User Agent</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loginEvents.map((event) => (
                <tr key={event.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-4 text-white font-medium">{event.email}</td>
                  <td className="px-4 py-4 text-slate-300">{event.userRole ?? "Unknown"}</td>
                  <td className="px-4 py-4 text-slate-400 whitespace-nowrap">{formatDate(event.loginTime)}</td>
                  <td className="px-4 py-4 text-slate-400 font-mono text-xs truncate max-w-[220px]">{event.ipAddress || "-"}</td>
                  <td className="px-4 py-4 text-slate-400 text-xs max-w-[320px] break-words">{event.userAgent || "-"}</td>
                </tr>
              ))}
              {loginEvents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    No login activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
