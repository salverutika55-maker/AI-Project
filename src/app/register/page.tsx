"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LineChart, ArrowRight } from "lucide-react";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgRole, setOrgRole] = useState("ORG_ADMIN");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, orgName, orgRole }),
      });

      if (res.ok) {
        // Automatically sign in after registration
        const signInRes = await signIn("credentials", {
          email,
          password,
          redirect: false,
        });

        if (signInRes?.error) {
          setError(signInRes.error);
        } else {
          router.push("/");
          router.refresh();
        }
      } else {
        const data = await res.json();
        setError(data.message || "Something went wrong");
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-200 flex flex-col items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />
      
      <div className="w-full max-w-md bg-[#13131A] border border-white/10 rounded-2xl p-8 relative z-10 shadow-2xl">
        <div className="flex items-center mb-8 justify-center">
          <Link href="/" className="flex items-center hover:opacity-95 transition-opacity">
            <img src="/FinAnalyzer-logo.svg" alt="FinAnalyzer" className="h-10 w-auto" />
          </Link>
        </div>
        
        <h2 className="text-xl font-bold text-white mb-2 text-center">Create an Account</h2>
        <p className="text-slate-400 text-sm text-center mb-8">Join the elite financial analytics platform</p>

        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-xl mb-6 text-center">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[#0A0A0C] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-colors"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-[#0A0A0C] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-colors"
              placeholder="••••••••"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Organization Name</label>
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              className="w-full bg-[#0A0A0C] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-colors"
              placeholder="e.g. Acme Corp"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Organization Role</label>
            <select
              value={orgRole}
              onChange={(e) => setOrgRole(e.target.value)}
              className="w-full bg-[#0A0A0C] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500/50 transition-colors"
            >
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ORG_ADMIN">Organization Admin</option>
              <option value="FINANCE_MANAGER">Finance Manager</option>
              <option value="ACCOUNTANT">Accountant</option>
              <option value="STAFF">Staff</option>
              <option value="READ_ONLY">Read Only</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold py-3 rounded-xl transition-all mt-4 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? "Creating Account..." : "Register"}
            {!loading && <ArrowRight className="w-4 h-4" />}
          </button>
        </form>

        <p className="text-center text-slate-400 text-sm mt-8">
          Already have an account? <Link href="/login" className="text-purple-400 hover:text-purple-300 transition-colors font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
