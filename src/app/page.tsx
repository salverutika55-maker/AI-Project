import React from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  GitMerge, 
  WalletCards, 
  Lock, 
  Fingerprint,
  LineChart,
  ArrowRight,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import Link from 'next/link';
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export default async function Home() {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-[#0A0A0C] text-slate-200 font-sans selection:bg-cyan-500/30 selection:text-cyan-100">
      
      {/* Navigation (Simple) */}
      <nav className="border-b border-white/5 bg-[#0A0A0C]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-cyan-500 rounded p-1.5">
              <LineChart className="w-6 h-6 text-slate-950" />
            </div>
            <span className="text-xl font-bold tracking-tight text-white">FinAnalyzer</span>
          </div>
          <div className="hidden md:flex gap-8 text-sm font-medium text-slate-400">
            <a href="#features" className="hover:text-white transition-colors">Platform</a>
            <a href="#how-it-works" className="hover:text-white transition-colors">How it Works</a>
            <a href="#security" className="hover:text-white transition-colors">Security</a>
          </div>
          <div>
            {!session ? (
              <>
                <Link href="/login" className="inline-block bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-full text-sm font-medium transition-all mr-3 cursor-pointer">
                  Log In
                </Link>
                <Link href="/register" className="inline-block bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-5 py-2.5 rounded-full text-sm font-semibold transition-all cursor-pointer">
                  Register
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-400 hidden sm:inline-block">{session.user?.email}</span>
                <Link href="/dashboard" className="text-sm font-medium text-cyan-400 hover:text-cyan-300">
                  Main Dashboard
                </Link>
                {(session.user as any)?.role === 'ADMIN' && (
                  <Link href="/admin" className="text-sm font-medium text-emerald-400 hover:text-emerald-300">
                    Admin Dashboard
                  </Link>
                )}
                <Link href="/api/auth/signout" className="bg-white/10 hover:bg-white/20 text-white px-5 py-2.5 rounded-full text-sm font-medium transition-all cursor-pointer">
                  Log Out
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-24 pb-32 overflow-hidden">
        {/* Glow effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[600px] bg-cyan-500/20 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-sm font-medium mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            FinAnalyzer Engine 2.0 is Live • Created by Rutika Salve
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-white mb-8 max-w-4xl mx-auto leading-[1.1]">
            Master your metrics. <br className="hidden md:block"/> Elevate your enterprise.
          </h1>
          <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            Unleash the full potential of your financial data with intelligent analysis tools. Track variance, project growth, and master cash flow instantly.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href={session ? "/dashboard" : "/register"} className="flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 px-8 py-4 rounded-full text-lg font-semibold transition-all w-full sm:w-auto group cursor-pointer">
              {session ? "Enter Dashboard" : "Start Analyzing Now"}
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Link>
            {!session && (
              <Link href="/login" className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 text-white px-8 py-4 rounded-full text-lg font-medium transition-all w-full sm:w-auto cursor-pointer">
                Log In to Account
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* Tools / Features Grid Section */}
      <section id="features" className="py-24 bg-[#0D0D12] border-y border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Complete Financial Intelligence</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              Our four core analytical engines provide unparalleled visibility into your company's fiscal health.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Tool 1 */}
            <div className="group bg-[#13131A] border border-white/10 hover:border-cyan-500/50 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_-15px_rgba(6,182,212,0.3)]">
              <div className="bg-cyan-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6 border border-cyan-500/20 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-7 h-7 text-cyan-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Financial Ratio Engine</h3>
              <p className="text-slate-400 mb-6 leading-relaxed">
                Automatically calculate and compare critical performance indicators to measure operational efficiency and profitability.
              </p>
              <ul className="space-y-3">
                {['Profit Margin tracking', 'EBITDA Margin analysis', 'ROCE (Return on Capital)', 'Current Ratio & Liquidity'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <CheckCircle2 className="w-5 h-5 text-cyan-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tool 2 */}
            <div className="group bg-[#13131A] border border-white/10 hover:border-purple-500/50 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_-15px_rgba(168,85,247,0.3)]">
              <div className="bg-purple-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6 border border-purple-500/20 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-7 h-7 text-purple-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Trend Analyzer</h3>
              <p className="text-slate-400 mb-6 leading-relaxed">
                Visualize historical performance and use predictive modelling to uncover cyclical patterns and growth trajectories.
              </p>
              <ul className="space-y-3">
                {['Monthly & Quarterly trends', 'Year-over-Year (YoY) metrics', 'Automated Growth Analysis', 'Seasonal adjustments'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <CheckCircle2 className="w-5 h-5 text-purple-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tool 3 */}
            <div className="group bg-[#13131A] border border-white/10 hover:border-emerald-500/50 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_-15px_rgba(16,185,129,0.3)]">
              <div className="bg-emerald-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                <GitMerge className="w-7 h-7 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Variance Analyzer</h3>
              <p className="text-slate-400 mb-6 leading-relaxed">
                Pinpoint exactly where and why your financial outcomes deviate from your forecasts and historical data.
              </p>
              <ul className="space-y-3">
                {['Budget vs. Actuals tracking', 'Previous vs. Current Period', 'Absolute Amount Variance', 'Percentage (%) Variance'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tool 4 */}
            <div className="group bg-[#13131A] border border-white/10 hover:border-orange-500/50 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_-15px_rgba(249,115,22,0.3)]">
              <div className="bg-orange-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6 border border-orange-500/20 group-hover:scale-110 transition-transform">
                <WalletCards className="w-7 h-7 text-orange-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Cash Flow Analyzer</h3>
              <p className="text-slate-400 mb-6 leading-relaxed">
                Maintain absolute control over your liquidity with real-time tracking of money entering and leaving your business.
              </p>
              <ul className="space-y-3">
                {['Operating Cash Flow', 'Real-time Burn Rate', 'Net Cash Position', 'Runway forecasting'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <CheckCircle2 className="w-5 h-5 text-orange-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tool 5 */}
            <div className="group bg-[#13131A] border border-white/10 hover:border-cyan-500/50 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_-15px_rgba(6,182,212,0.3)]">
              <div className="bg-cyan-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6 border border-cyan-500/20 group-hover:scale-110 transition-transform">
                <BarChart3 className="w-7 h-7 text-cyan-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">KPI Dashboard</h3>
              <p className="text-slate-400 mb-6 leading-relaxed">
                Instant snapshot of your core metrics including Revenue, EBITDA, Net Profit, and Cash.
              </p>
              <ul className="space-y-3">
                {['Real-time metrics', 'Conditional formatting', 'EBITDA calculations'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <CheckCircle2 className="w-5 h-5 text-cyan-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tool 6 */}
            <div className="group bg-[#13131A] border border-white/10 hover:border-amber-500/50 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_-15px_rgba(245,158,11,0.3)]">
              <div className="bg-amber-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6 border border-amber-500/20 group-hover:scale-110 transition-transform">
                <GitMerge className="w-7 h-7 text-amber-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Working Capital Analyzer</h3>
              <p className="text-slate-400 mb-6 leading-relaxed">
                Track liquidity by analyzing Receivables (DSO), Payables (DPO), and Inventory Days.
              </p>
              <ul className="space-y-3">
                {['Receivables Days (DSO)', 'Payables Days (DPO)', 'Inventory Lockup Days'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <CheckCircle2 className="w-5 h-5 text-amber-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tool 7 */}
            <div className="group bg-[#13131A] border border-white/10 hover:border-indigo-500/50 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_-15px_rgba(99,102,241,0.3)]">
              <div className="bg-indigo-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6 border border-indigo-500/20 group-hover:scale-110 transition-transform">
                <TrendingUp className="w-7 h-7 text-indigo-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Auto MIS Report Generator</h3>
              <p className="text-slate-400 mb-6 leading-relaxed">
                Algorithmic engine that automatically generates management reports and commentary.
              </p>
              <ul className="space-y-3">
                {['Executive Summaries', 'Highlights & Variance', 'One-click generation'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <CheckCircle2 className="w-5 h-5 text-indigo-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tool 8 */}
            <div className="group bg-[#13131A] border border-white/10 hover:border-pink-500/50 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_-15px_rgba(236,72,153,0.3)]">
              <div className="bg-pink-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6 border border-pink-500/20 group-hover:scale-110 transition-transform">
                <LineChart className="w-7 h-7 text-pink-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">Export & Sharing Tool</h3>
              <p className="text-slate-400 mb-6 leading-relaxed">
                Take your analytics offline with high-fidelity PDF and Excel raw data exports.
              </p>
              <ul className="space-y-3">
                {['High-res PDF Snapshots', 'Excel/CSV Raw Data', 'Board-ready formatting'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <CheckCircle2 className="w-5 h-5 text-pink-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Tool 9 */}
            <div className="group bg-[#13131A] border border-white/10 hover:border-rose-500/50 rounded-2xl p-8 transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_40px_-15px_rgba(244,63,94,0.3)]">
              <div className="bg-rose-500/10 w-14 h-14 rounded-xl flex items-center justify-center mb-6 border border-rose-500/20 group-hover:scale-110 transition-transform">
                <ShieldCheck className="w-7 h-7 text-rose-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">AI Anomaly Detector</h3>
              <p className="text-slate-400 mb-6 leading-relaxed">
                Automated scanning that alerts you to unusual spikes, deviations, and financial risks.
              </p>
              <ul className="space-y-3">
                {['Revenue Swings', 'Cash Divergences', 'Unusual Expenses'].map((item, i) => (
                  <li key={i} className="flex items-center gap-3 text-slate-300">
                    <CheckCircle2 className="w-5 h-5 text-rose-500 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

          </div>
        </div>
      </section>

      {/* How it Works / Workflow */}
      <section id="how-it-works" className="py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">From Raw Data to Strategy in Minutes</h2>
            <p className="text-slate-400 max-w-2xl mx-auto text-lg">
              A seamless workflow designed to eliminate manual spreadsheet manipulation.
            </p>
          </div>

          <div className="flex flex-col md:flex-row gap-8 relative items-center">
            {/* Connecting line for desktop */}
            <div className="hidden md:block absolute top-[60px] left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500/0 via-cyan-500/30 to-cyan-500/0 z-0"></div>

            <div className="flex-1 relative z-10 text-center bg-[#13131A] p-8 rounded-2xl border border-white/5 w-full">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-white/10 flex items-center justify-center mx-auto mb-6 shadow-xl">
                <span className="text-2xl font-bold text-white">1</span>
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Connect Data</h4>
              <p className="text-slate-400 text-sm">Integrate seamlessly with QuickBooks, Xero, or upload via CSV. We standardize formatting automatically.</p>
            </div>

            <div className="flex-1 relative z-10 text-center bg-[#13131A] p-8 rounded-2xl border border-white/5 w-full">
              <div className="w-16 h-16 rounded-2xl bg-cyan-900 border border-cyan-500/30 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-cyan-900/30">
                <span className="text-2xl font-bold text-cyan-400">2</span>
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Engines Analyze</h4>
              <p className="text-slate-400 text-sm">Our 4 specialized engines process millions of data points to generate ratios, trends, and variances instantly.</p>
            </div>

            <div className="flex-1 relative z-10 text-center bg-[#13131A] p-8 rounded-2xl border border-white/5 w-full">
              <div className="w-16 h-16 rounded-2xl bg-emerald-900 border border-emerald-500/30 flex items-center justify-center mx-auto mb-6 shadow-xl shadow-emerald-900/30">
                <span className="text-2xl font-bold text-emerald-400">3</span>
              </div>
              <h4 className="text-xl font-bold text-white mb-2">Make Decisions</h4>
              <p className="text-slate-400 text-sm">Review highly visual dashboards and export interactive reports for your executive board meetings.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-24 bg-[#0D0D12] border-t border-white/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="max-w-7xl mx-auto px-6 relative z-10 flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-sm font-medium mb-6">
              <ShieldCheck className="w-4 h-4" /> Enterprise-Grade Security
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Bank-level protection for your financial data.</h2>
            <p className="text-slate-400 text-lg mb-8 leading-relaxed">
              We understand the sensitivity of financial information. Our platform is built on a zero-trust architecture, ensuring your data remains impenetrable.
            </p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <Lock className="w-8 h-8 text-blue-400 mb-3" />
                <h4 className="font-bold text-white mb-1">AES-256 Encryption</h4>
                <p className="text-sm text-slate-500">Data encrypted at rest and in transit.</p>
              </div>
              <div>
                <Fingerprint className="w-8 h-8 text-blue-400 mb-3" />
                <h4 className="font-bold text-white mb-1">SOC 2 Type II</h4>
                <p className="text-sm text-slate-500">Certified secure infrastructure.</p>
              </div>
            </div>
          </div>
          <div className="flex-1 border border-white/10 bg-[#13131A] rounded-2xl p-8 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent rounded-2xl pointer-events-none" />
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-black/40 border border-white/5">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-xs text-slate-500 font-mono">0x{i}F</div>
                  <div className="flex-1">
                    <div className="h-2 w-3/4 bg-slate-800 rounded-full mb-2"></div>
                    <div className="h-2 w-1/2 bg-slate-800 rounded-full"></div>
                  </div>
                  <Lock className="w-4 h-4 text-emerald-500" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#0A0A0C] pt-20 pb-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-16">
            <div className="col-span-2">
              <div className="flex items-center gap-2 mb-6">
                <div className="bg-cyan-500 rounded p-1.5">
                  <LineChart className="w-5 h-5 text-slate-950" />
                </div>
                <span className="text-xl font-bold tracking-tight text-white">FinAnalyzer</span>
              </div>
              <p className="text-slate-400 max-w-sm">
                The most powerful AI-driven financial analytics platform for modern businesses.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Platform</h4>
              <ul className="space-y-3 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-cyan-400 transition-colors">Ratio Engine</a></li>
                <li><a href="#" className="hover:text-cyan-400 transition-colors">Trend Analysis</a></li>
                <li><a href="#" className="hover:text-cyan-400 transition-colors">Variance</a></li>
                <li><a href="#" className="hover:text-cyan-400 transition-colors">Cash Flow</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-3 text-slate-400 text-sm">
                <li><a href="#" className="hover:text-cyan-400 transition-colors">About Us</a></li>
                <li><a href="#" className="hover:text-cyan-400 transition-colors">Security</a></li>
                <li><a href="#" className="hover:text-cyan-400 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-cyan-400 transition-colors">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-slate-500 text-sm">
              © {new Date().getFullYear()} FinAnalyzer. All rights reserved. | <span className="text-cyan-400/80">Created by Rutika Salve</span>
            </p>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" />
              <div className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" />
              <div className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
