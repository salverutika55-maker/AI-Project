"use client";

import { useEffect, useState } from "react";

export default function AdminAlerts() {
  const [alerts, setAlerts] = useState<any[]>([]);

  async function fetchAlerts() {
    try {
      const res = await fetch("/api/admin/alerts", { cache: "no-store" });
      if (!res.ok) throw new Error("Unauthorized or failed to fetch alerts");
      const data = await res.json();
      setAlerts(data.recentAlerts || []);
    } catch (err) {
      console.error(err);
    }
  }

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, 30000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="bg-[#13131A] border border-white/10 rounded-2xl overflow-hidden shadow-2xl mb-12">
      <div className="p-6 border-b border-white/10 bg-white/5">
        <h2 className="text-lg font-bold text-white">Security Alerts</h2>
        <p className="text-sm text-slate-400">Generated alerts for suspicious activity</p>
      </div>
      <div className="p-6">
        <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#13131A]">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/20 text-slate-400">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {alerts.map((a: any) => (
                <tr key={a.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-4 text-white font-medium">{new Date(a.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-4 text-slate-300">{a.action}</td>
                  <td className="px-4 py-4 text-slate-300">{a.severity}</td>
                  <td className="px-4 py-4 text-slate-400 font-mono text-xs truncate max-w-[220px]">{a.ipAddress || '-'}</td>
                  <td className="px-4 py-4 text-slate-400 text-xs break-words">{a.details || '-'}</td>
                </tr>
              ))}
              {alerts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">No alerts</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
