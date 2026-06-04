"use client";

import { useState, useEffect } from "react";
import { AlertOctagon, AlertTriangle, Info, BellRing, ArrowRight, Activity, TrendingUp, ShieldAlert, Clock, Box } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Alert {
  id: string;
  type: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: "CASH_FLOW" | "RECEIVABLES" | "COMPLIANCE" | "OPERATIONAL" | "INVENTORY";
  title: string;
  description: string;
  metric?: string;
  trend?: "UP" | "DOWN" | "STABLE";
}

export default function EarlyWarningSystem({ clientId, selectedYear }: { clientId: string; selectedYear: number }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // In a real implementation, this would fetch from /api/clients/[id]/alerts
    // For now, we generate contextual heuristic alerts.
    setTimeout(() => {
      setAlerts([
        {
          id: "1",
          type: "CRITICAL",
          category: "CASH_FLOW",
          title: "Cash Flow Shortage Predicted",
          description: "Based on current burn rate and outstanding payables, a cash deficit of ₹12.4L is likely within 45 days. Immediate capital injection or aggressive collection required.",
          metric: "45 Days",
          trend: "DOWN"
        },
        {
          id: "2",
          type: "HIGH",
          category: "RECEIVABLES",
          title: "DSO Deteriorating Rapidly",
          description: "Days Sales Outstanding has increased for 3 consecutive months, currently standing at 92 days. Top 3 customers are delaying payments.",
          metric: "92 Days",
          trend: "UP"
        },
        {
          id: "3",
          type: "HIGH",
          category: "COMPLIANCE",
          title: "GST Mismatch Risk Detected",
          description: "Potential ITC mismatch of ₹4.2L detected in GSTR-2A reconciliation for the last quarter. High risk of compliance penalty.",
          metric: "₹4.2L",
          trend: "UP"
        },
        {
          id: "4",
          type: "MEDIUM",
          category: "OPERATIONAL",
          title: "High Vendor Dependency",
          description: "Dependency on 'Global Tech Supplies' has exceeded 45% of total purchases. Supplier diversification recommended to mitigate supply chain risk.",
          metric: "47%",
          trend: "UP"
        },
        {
          id: "5",
          type: "LOW",
          category: "INVENTORY",
          title: "Inventory Ageing Increasing",
          description: "Slow-moving inventory (90+ days) has increased by 12% this month. Consider liquidating dead stock to free up working capital.",
          metric: "+12%",
          trend: "UP"
        }
      ]);
      setLoading(false);
    }, 1200);
  }, [clientId, selectedYear]);

  const getAlertStyles = (type: string) => {
    switch (type) {
      case "CRITICAL": return "bg-rose-500/10 border-rose-500/30 text-rose-400";
      case "HIGH": return "bg-amber-500/10 border-amber-500/30 text-amber-400";
      case "MEDIUM": return "bg-yellow-500/10 border-yellow-500/30 text-yellow-400";
      case "LOW": return "bg-blue-500/10 border-blue-500/30 text-blue-400";
      default: return "bg-slate-500/10 border-slate-500/30 text-slate-400";
    }
  };

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "CRITICAL": return <AlertOctagon className="w-5 h-5" />;
      case "HIGH": return <AlertTriangle className="w-5 h-5" />;
      case "MEDIUM": return <Info className="w-5 h-5" />;
      case "LOW": return <BellRing className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "CASH_FLOW": return <Activity className="w-3 h-3" />;
      case "RECEIVABLES": return <TrendingUp className="w-3 h-3" />;
      case "COMPLIANCE": return <ShieldAlert className="w-3 h-3" />;
      case "OPERATIONAL": return <ArrowRight className="w-3 h-3" />;
      case "INVENTORY": return <Box className="w-3 h-3" />;
      default: return <Activity className="w-3 h-3" />;
    }
  };

  if (loading) {
    return (
      <div className="bg-[#13131A] rounded-3xl border border-white/5 p-6 shadow-xl">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-white/5 rounded-md"></div>
          <div className="h-20 bg-white/5 rounded-2xl"></div>
          <div className="h-20 bg-white/5 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#13131A] rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-rose-500/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="p-6 md:p-8 border-b border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500/20 to-amber-500/20 flex items-center justify-center border border-rose-500/20">
            <BellRing className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">AI Early Warning System</h2>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Predictive CFO Alerts</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="px-4 py-2 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="text-xs font-black text-rose-400">1 Critical</span>
          </div>
          <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-xs font-black text-amber-400">2 High Risk</span>
          </div>
        </div>
      </div>

      <div className="p-6 md:p-8 relative z-10">
        <div className="space-y-4">
          <AnimatePresence>
            {alerts.map((alert, index) => (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                key={alert.id}
                className={`flex flex-col md:flex-row gap-4 p-5 rounded-2xl border ${getAlertStyles(alert.type)} bg-[#1a1a24] hover:bg-[#20202A] transition-all`}
              >
                {/* Icon & Severity Badge */}
                <div className="flex flex-col items-center gap-3 shrink-0 w-24">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center bg-black/20 shadow-inner">
                    {getAlertIcon(alert.type)}
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-[0.2em]">{alert.type}</span>
                </div>

                {/* Content */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest opacity-80">
                      {getCategoryIcon(alert.category)} {alert.category.replace("_", " ")}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white mb-2">{alert.title}</h3>
                  <p className="text-sm font-medium opacity-90 leading-relaxed max-w-3xl">
                    {alert.description}
                  </p>
                </div>

                {/* Metric/Action */}
                {alert.metric && (
                  <div className="flex flex-col justify-center items-end shrink-0 pl-4 border-l border-white/5">
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-60 mb-1">Key Metric</span>
                    <span className="text-xl font-black text-white font-mono">{alert.metric}</span>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
