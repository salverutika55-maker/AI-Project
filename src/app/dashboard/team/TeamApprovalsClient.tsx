"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Mail, Building2, UserCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

interface MembershipRequest {
  id: string;
  role: string;
  organization: { name: string };
  user: { email: string; createdAt: Date };
}

interface ActiveMember {
  id: string;
  role: string;
  organization: { name: string };
  user: { email: string; lastLogin: Date | null };
}

export default function TeamApprovalsClient({ 
  initialPending, 
  initialActive 
}: { 
  initialPending: any[], 
  initialActive: any[] 
}) {
  const router = useRouter();
  const [pending, setPending] = useState<MembershipRequest[]>(initialPending);
  const [active, setActive] = useState<ActiveMember[]>(initialActive);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"pending" | "active">("pending");

  const handleAction = async (membershipId: string, action: "APPROVE" | "REJECT") => {
    setLoadingId(membershipId);
    try {
      const res = await fetch("/api/team/approvals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ membershipId, action })
      });

      if (res.ok) {
        // Optimistic Update
        if (action === "APPROVE") {
          const approved = pending.find(p => p.id === membershipId);
          if (approved) {
            setActive([...active, { ...approved, user: { ...approved.user, lastLogin: null } } as any]);
          }
        }
        setPending(pending.filter(p => p.id !== membershipId));
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Action failed");
      }
    } catch (error) {
      console.error("Approval Error:", error);
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex gap-4 border-b border-white/5">
        <button 
          onClick={() => setActiveTab("pending")}
          className={`pb-4 px-2 text-sm font-bold transition-all relative ${activeTab === 'pending' ? 'text-cyan-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Pending Requests
          {pending.length > 0 && (
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 text-[10px]">
              {pending.length}
            </span>
          )}
          {activeTab === 'pending' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-cyan-500" />}
        </button>
        <button 
          onClick={() => setActiveTab("active")}
          className={`pb-4 px-2 text-sm font-bold transition-all relative ${activeTab === 'active' ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}
        >
          Active Team
          {activeTab === 'active' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-500" />}
        </button>
      </div>

      {activeTab === "pending" ? (
        <div className="grid grid-cols-1 gap-4">
          {pending.length === 0 ? (
            <div className="py-20 text-center bg-[#13131A] rounded-2xl border border-white/5">
              <UserCircle className="w-12 h-12 text-slate-700 mx-auto mb-4" />
              <p className="text-slate-500">No pending access requests.</p>
            </div>
          ) : (
            pending.map((request) => (
              <div key={request.id} className="bg-[#13131A] border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6 hover:border-cyan-500/30 transition-all group">
                <div className="flex items-center gap-4 flex-1">
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-cyan-500/20">
                    <Mail className="w-6 h-6 text-slate-400 group-hover:text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-lg">{request.user.email}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Building2 className="w-3 h-3" /> {request.organization.name}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-slate-700" />
                      <span className="px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 text-[10px] font-black border border-indigo-500/20 uppercase tracking-tight">
                        Requested: {request.role}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => handleAction(request.id, "REJECT")}
                    disabled={loadingId === request.id}
                    className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 rounded-xl text-sm font-bold border border-rose-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                  <button 
                    onClick={() => handleAction(request.id, "APPROVE")}
                    disabled={loadingId === request.id}
                    className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-xl text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve Access
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-[#13131A] border border-white/10 rounded-2xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-black/20 border-b border-white/5 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                <th className="px-6 py-4">Team Member</th>
                <th className="px-6 py-4">Organization</th>
                <th className="px-6 py-4">Role</th>
                <th className="px-6 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {active.map((member) => (
                <tr key={member.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-bold text-white text-sm">{member.user.email}</span>
                      <span className="text-[10px] text-slate-500">
                        {member.user.lastLogin ? `Last active: ${new Date(member.user.lastLogin).toLocaleDateString()}` : 'Never active'}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-xs text-slate-400 font-medium">
                    {member.organization.name}
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-400 text-[10px] font-black border border-indigo-500/20 uppercase">
                      {member.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tighter">Active Member</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
