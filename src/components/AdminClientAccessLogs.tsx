"use client";

import { useEffect, useMemo, useState } from "react";

type ClientOption = {
  id: string;
  name: string;
};

type AccessLog = {
  id: string;
  clientId: string;
  email: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  loggedAt: string;
  client: { id: string; name: string };
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdminClientAccessLogs() {
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function loadData(selectedClientId?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedClientId) params.set("clientId", selectedClientId);
      const res = await fetch(`/api/admin/client-access?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch client access logs");
      const payload = await res.json();
      setClients(payload.clients || []);
      setLogs(payload.logs || []);
    } catch (error) {
      console.error(error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredLogs = useMemo(() => {
    if (!clientId) return logs;
    return logs.filter((log) => log.clientId === clientId);
  }, [logs, clientId]);

  return (
    <section className="bg-[#13131A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl mt-8">
      <div className="p-6 border-b border-white/10 bg-white/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Admin Client Access Logs</h2>
            <p className="text-sm text-slate-400">Only ADMIN can view who accessed which client, from where, and when.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={clientId}
              onChange={(event) => {
                const next = event.target.value;
                setClientId(next);
                loadData(next || undefined);
              }}
              className="bg-[#0f1119] border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="">All Clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-black/20 text-slate-400">
            <tr>
              <th className="px-4 py-3">Log ID</th>
              <th className="px-4 py-3">Client</th>
              <th className="px-4 py-3">User Email</th>
              <th className="px-4 py-3">User ID</th>
              <th className="px-4 py-3">IP Address</th>
              <th className="px-4 py-3">User Agent</th>
              <th className="px-4 py-3">Login Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredLogs.map((log) => (
              <tr key={log.id} className="hover:bg-white/5 transition-colors">
                <td className="px-4 py-3 text-xs text-slate-300 font-mono">{log.id}</td>
                <td className="px-4 py-3 text-white">{log.client.name}</td>
                <td className="px-4 py-3 text-slate-300">{log.email}</td>
                <td className="px-4 py-3 text-xs text-slate-400 font-mono">{log.userId}</td>
                <td className="px-4 py-3 text-xs text-slate-400 font-mono">{log.ipAddress || "-"}</td>
                <td className="px-4 py-3 text-xs text-slate-400 max-w-xs truncate" title={log.userAgent || "-"}>{log.userAgent || "-"}</td>
                <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{formatDate(log.loggedAt)}</td>
              </tr>
            ))}
            {!loading && filteredLogs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                  No access logs found.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  Loading logs...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
