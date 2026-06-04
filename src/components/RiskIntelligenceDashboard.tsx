"use client";

import { useState, useEffect } from "react";
import { 
  ShieldAlert, Activity, TrendingUp, AlertTriangle, ShieldCheck, 
  BrainCircuit, Radar, Clock, FileWarning, ArrowRight 
} from "lucide-react";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface RiskIntelligenceProps {
  clientId: string;
  selectedYear: number;
  displayCurrency: string;
}

export default function RiskIntelligenceDashboard({ clientId, selectedYear, displayCurrency }: RiskIntelligenceProps) {
  const [loading, setLoading] = useState(true);
  const [riskData, setRiskData] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/clients/${clientId}/risk?year=${selectedYear}`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setRiskData(data);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [clientId, selectedYear]);

  const formatValue = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: displayCurrency,
      maximumFractionDigits: 0
    }).format(val);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-[#13131A] rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden">
        <Activity className="w-10 h-10 text-cyan-500 animate-spin mb-4" />
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest animate-pulse">Running AI Risk Models...</p>
      </div>
    );
  }

  if (!riskData) {
    return (
      <div className="flex flex-col items-center justify-center h-96 bg-[#13131A] rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden">
        <AlertTriangle className="w-10 h-10 text-rose-500 mb-4" />
        <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Failed to load risk intelligence</p>
      </div>
    );
  }

  const { globalScore, fraudAlerts, macroRisks, complianceForecast, scoreDistribution } = riskData;

  const COLORS = ["#f43f5e", "#f59e0b", "#3b82f6", "#10b981"];

  return (
    <div className="space-y-8">
      {/* 1. Global Risk Banner */}
      <div className="bg-gradient-to-br from-[#1A1A24] to-[#13131A] p-6 md:p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="absolute right-0 top-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-[80px] pointer-events-none" />
        
        <div className="flex items-center gap-6 relative z-10 w-full md:w-1/3">
          <div className="w-28 h-28 bg-[#0A0A0C] rounded-full flex items-center justify-center shadow-xl relative shrink-0 border border-white/5">
            <svg className="absolute inset-0 w-full h-full transform -rotate-90">
              <circle cx="56" cy="56" r="50" fill="none" stroke="currentColor" strokeWidth="6" className="text-white/5" />
              <circle 
                cx="56" cy="56" r="50" fill="none" stroke="currentColor" strokeWidth="8" 
                className={globalScore > 75 ? "text-emerald-400" : globalScore > 50 ? "text-amber-400" : "text-rose-500"} 
                strokeDasharray={`${(globalScore / 100) * (2 * Math.PI * 50)} 314`} 
              />
            </svg>
            <div className="text-center">
              <span className="text-4xl font-black text-white leading-none">{globalScore}</span>
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight">AI Risk Index</h2>
            <p className="text-xs font-bold text-cyan-400 uppercase tracking-widest mt-1">Holistic Exposure Score</p>
          </div>
        </div>

        <div className="flex-1 w-full bg-white/[0.02] p-5 rounded-2xl border border-white/5 relative z-10 flex items-center gap-6">
          <div className="w-1/3 h-24 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={scoreDistribution}
                  innerRadius={30}
                  outerRadius={45}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {scoreDistribution.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff10", borderRadius: "12px", fontSize: "12px" }}
                  itemStyle={{ fontWeight: "bold" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1">
             <div className="flex items-center gap-2 mb-2">
                <BrainCircuit className="w-4 h-4 text-cyan-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">AI Assessment</span>
             </div>
             <p className="text-sm text-slate-300 font-medium leading-relaxed">
               Current exposure is manageable. Compliance risk is the primary detractor (35%), followed closely by market volatility (25%). Immediate attention recommended for upcoming tax deadlines.
             </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 2. Fraud & Anomaly Detection */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <ShieldAlert className="w-5 h-5 text-rose-500" />
            <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest">Real-time Fraud & Anomalies</h3>
          </div>
          
          <div className="space-y-3">
            {fraudAlerts.map((alert: any) => (
              <motion.div 
                key={alert.id}
                whileHover={{ scale: 1.01 }}
                className={`p-5 rounded-2xl border flex flex-col md:flex-row justify-between items-start md:items-center gap-4 ${
                  alert.riskLevel === "CRITICAL" ? "bg-rose-500/10 border-rose-500/20" : 
                  alert.riskLevel === "HIGH" ? "bg-orange-500/10 border-orange-500/20" : 
                  "bg-amber-500/10 border-amber-500/20"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                      alert.riskLevel === "CRITICAL" ? "bg-rose-500 text-white" : 
                      alert.riskLevel === "HIGH" ? "bg-orange-500 text-white" : 
                      "bg-amber-500 text-slate-900"
                    }`}>{alert.riskLevel}</span>
                    <h4 className="text-sm font-bold text-white">{alert.title}</h4>
                  </div>
                  <p className="text-xs text-slate-400 font-medium mt-1">{alert.description}</p>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className="text-lg font-black text-white">{formatValue(alert.amount)}</span>
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">{alert.time}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* 3. Predictive Compliance */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 border-b border-white/5 pb-4">
            <Clock className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest">Compliance Forecast</h3>
          </div>

          <div className="bg-[#1A1A24] border border-white/5 rounded-3xl p-6 shadow-xl space-y-6">
            {complianceForecast.map((forecast: any, idx: number) => (
              <div key={idx} className="relative pl-6 before:content-[''] before:absolute before:left-0 before:top-2 before:bottom-[-24px] before:w-0.5 before:bg-white/10 last:before:hidden">
                <div className={`absolute left-[-4px] top-1.5 w-2.5 h-2.5 rounded-full ${
                  forecast.probability === "HIGH" ? "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]" : 
                  forecast.probability === "MEDIUM" ? "bg-amber-500" : "bg-emerald-500"
                }`} />
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-black text-cyan-400 uppercase tracking-wider">{forecast.deadline}</span>
                  <span className="text-[10px] font-bold text-slate-500 uppercase">{forecast.probability} PROBABILITY</span>
                </div>
                <p className="text-sm text-white font-medium mb-2">{forecast.description}</p>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 rounded-md">
                  <FileWarning className="w-3.5 h-3.5 text-rose-400" />
                  <span className="text-[10px] font-bold text-rose-300 uppercase tracking-wider">Impact: {forecast.impact}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Macroeconomic Risk Hedging */}
      <div className="space-y-4">
        <div className="flex items-center gap-3 border-b border-white/5 pb-4">
          <Radar className="w-5 h-5 text-indigo-400" />
          <h3 className="text-sm font-black text-slate-300 uppercase tracking-widest">Macroeconomic Exposure</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {macroRisks.map((risk: any, idx: number) => (
            <div key={idx} className="bg-[#1A1A24] border border-white/5 rounded-3xl p-6 shadow-xl relative overflow-hidden group hover:border-indigo-500/30 transition-colors">
              <div className="flex justify-between items-start mb-6 relative z-10">
                <h4 className="text-sm font-bold text-white max-w-[140px] leading-tight">{risk.factor}</h4>
                <div className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${
                  risk.exposure === "HIGH" ? "bg-rose-500/20 text-rose-400" :
                  risk.exposure === "MEDIUM" ? "bg-amber-500/20 text-amber-400" :
                  "bg-emerald-500/20 text-emerald-400"
                }`}>
                  {risk.exposure} EXPOSURE
                </div>
              </div>

              <div className="mb-4 relative z-10">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wider block mb-1">Value at Risk</span>
                <span className="text-2xl font-black text-white">{formatValue(risk.impact)}</span>
              </div>

              <p className="text-xs text-slate-400 font-medium leading-relaxed relative z-10">
                {risk.description}
              </p>

              {/* Background Chart decoration */}
              <div className="absolute -bottom-4 -right-4 text-white/5 group-hover:text-indigo-500/10 transition-colors">
                <TrendingUp className="w-32 h-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
