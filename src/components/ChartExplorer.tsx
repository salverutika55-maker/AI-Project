"use client";

import { useState, useEffect, useMemo } from "react";
import { 
  LineChart as RechartsLineChart, Line, BarChart as RechartsBarChart, Bar,
  AreaChart as RechartsAreaChart, Area, PieChart as RechartsPieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  Legend, Treemap as RechartsTreemap
} from "recharts";
import { 
  LineChart, BarChart2, PieChart, RefreshCw, Download, HelpCircle, 
  Table, Info, FileSpreadsheet, FileText, Activity, ShieldCheck, Flame
} from "lucide-react";

interface Summary {
  currentValue: number;
  previousPeriod: number;
  variance: number;
  growthPct: number;
  max: number;
  min: number;
  average: number;
}

interface ChartDataPoint {
  name: string;
  value: number;
  category?: string;
  risk?: string;
}

interface SourceLedger {
  id: string;
  name: string;
  groupName: string;
  nature: string;
  closingBalance: number;
}

interface Voucher {
  id: string;
  date: string;
  voucherNumber: string;
  voucherType: string;
  ledgerName: string;
  entryType: string;
  amount: number;
  narration: string | null;
}

interface DrilldownData {
  month: string;
  metric: string;
  sourceLedgers: SourceLedger[];
  vouchers: Voucher[];
}

interface ChartExplorerProps {
  clientId: string;
  selectedYear: number;
  client: any;
}

// Curated Sleek Colors
const CHART_COLORS = [
  "#22D3EE", "#10B981", "#A855F7", "#F59E0B", "#EF4444", 
  "#3B82F6", "#EC4899", "#84CC16", "#06B6D4", "#F43F5E"
];

const RISK_COLORS: Record<string, string> = {
  HIGH: "#EF4444",
  MEDIUM: "#F59E0B",
  LOW: "#10B981"
};

export default function ChartExplorer({ clientId, selectedYear, client }: ChartExplorerProps) {
  // Filters
  const [chartType, setChartType] = useState<"line" | "bar" | "area" | "column" | "pie" | "donut" | "treemap" | "heatmap" | "gauge">("line");
  const [selectedMetric, setSelectedMetric] = useState("revenue_trend");
  const [selectedMonth, setSelectedMonth] = useState("Mar");
  
  // Data state
  const [loading, setLoading] = useState(false);
  const [loadingDrilldown, setLoadingDrilldown] = useState(false);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [formula, setFormula] = useState("");
  const [drilldown, setDrilldown] = useState<DrilldownData | null>(null);
  const [sector, setSector] = useState("TRADING");

  // Load dashboard data
  useEffect(() => {
    fetchChartData();
  }, [clientId, selectedYear, selectedMetric]);

  // Load drilldown on month selection or metric change
  useEffect(() => {
    fetchDrilldownData();
  }, [clientId, selectedYear, selectedMetric, selectedMonth]);

  const fetchChartData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/chart-explorer?metric=${selectedMetric}&year=${selectedYear}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load chart data");
      setChartData(data.chartData || []);
      setSummary(data.summary || null);
      setFormula(data.formula || "");
      setSector(data.sector || "TRADING");
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const fetchDrilldownData = async () => {
    setLoadingDrilldown(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/chart-explorer/drilldown?metric=${selectedMetric}&year=${selectedYear}&month=${selectedMonth}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load drilldown data");
      setDrilldown(data);
    } catch (e) {
      console.error(e);
    }
    setLoadingDrilldown(false);
  };

  // Metadata Driven Smart Filtering Configuration
  const metricOptions = useMemo(() => {
    const allMetrics = [
      { id: "revenue_trend", label: "Revenue Trend", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "expense_trend", label: "Expense Trend", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "profit_trend", label: "Net Profit Trend", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "cash_flow", label: "Cash Flow Trend", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "working_capital", label: "Working Capital", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "receivable_trend", label: "Receivable Trend", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "payable_trend", label: "Payable Trend", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "asset_trend", label: "Total Assets", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "liability_trend", label: "Total Liabilities", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "inventory_trend", label: "Inventory Stock Trend", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "provision_trend", label: "Accrued Provisions", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      
      // Composition Group
      { id: "expense_breakdown", label: "Expense Breakdown Shares", charts: ["pie", "donut", "treemap"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "income_breakdown", label: "Revenue Breakdown Shares", charts: ["pie", "donut", "treemap"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "customer_concentration", label: "Customer Concentration", charts: ["pie", "donut", "treemap"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "vendor_concentration", label: "Vendor Concentration", charts: ["pie", "donut", "treemap"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "receivable_ageing", label: "Receivables Ageing Shares", charts: ["pie", "donut"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "payable_ageing", label: "Payables Ageing Shares", charts: ["pie", "donut"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },

      // KPI Group (Gauge)
      { id: "financial_health", label: "Financial Health Score", charts: ["gauge"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "liquidity", label: "Liquidity Ratio (Current Ratio)", charts: ["gauge"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "profitability", label: "Profitability Score (NP Margin %)", charts: ["gauge"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "working_capital_ratio", label: "Working Capital Ratio", charts: ["gauge"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },
      { id: "compliance_score", label: "Audit Compliance Score", charts: ["gauge"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },

      // Heatmap Group
      { id: "ledger_risk_heatmap", label: "Ledger Vulnerability Heatmap", charts: ["heatmap"], sectors: ["MANUFACTURING", "TRADING", "SERVICE"] },

      // Industry Specifics
      // Manufacturing
      { id: "power_consumption", label: "Power & Fuel Utility cost", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING"] },
      { id: "production_trend", label: "Production expenses trend", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING"] },
      { id: "scrap_analysis", label: "Scrap & Byproduct sales", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING"] },
      { id: "inventory_movement", label: "Stock ledger turnover volume", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING"] },
      { id: "raw_material_consumption", label: "Raw material usage", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING"] },
      { id: "machine_repairs", label: "Machinery maintenance repairs", charts: ["line", "bar", "area", "column"], sectors: ["MANUFACTURING"] },

      // Trading
      { id: "purchase_trend", label: "Goods purchase volume", charts: ["line", "bar", "area", "column"], sectors: ["TRADING"] },
      { id: "sales_trend", label: "Trading sales volume", charts: ["line", "bar", "area", "column"], sectors: ["TRADING"] },

      // Service
      { id: "employee_cost", label: "Employee Wages & Benefits", charts: ["line", "bar", "area", "column"], sectors: ["SERVICE"] },
      { id: "consultancy_revenue", label: "Consultancy services revenue", charts: ["line", "bar", "area", "column"], sectors: ["SERVICE"] },
      { id: "unbilled_revenue", label: "Accrued unbilled revenue assets", charts: ["line", "bar", "area", "column"], sectors: ["SERVICE"] },
      { id: "advance_from_customers", label: "Customer advances balance", charts: ["line", "bar", "area", "column"], sectors: ["SERVICE"] },
      { id: "project_revenue", label: "Project contracts turnover", charts: ["line", "bar", "area", "column"], sectors: ["SERVICE"] },
      { id: "revenue_recognition", label: "Revenue recognition adjustments", charts: ["line", "bar", "area", "column"], sectors: ["SERVICE"] }
    ];

    // Filter based on compatible chart type and client industry sector
    return allMetrics.filter(m => 
      m.charts.includes(chartType) && m.sectors.includes(sector)
    );
  }, [chartType, sector]);

  // Adjust selected metric if it is incompatible with the newly selected chart type
  useEffect(() => {
    if (metricOptions.length > 0) {
      const exists = metricOptions.some(m => m.id === selectedMetric);
      if (!exists) {
        setSelectedMetric(metricOptions[0].id);
      }
    }
  }, [chartType, metricOptions]);

  // Exporters
  const exportCSV = () => {
    if (chartData.length === 0) return;
    const headers = "Name,Value\n";
    const rows = chartData.map(c => `"${c.name}",${c.value}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${selectedMetric}_ChartData.csv`;
    a.click();
  };

  const formatCurrency = (amt: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(amt);
  };

  // Custom Treemap Content
  const TreemapContent = (props: any) => {
    const { x, y, width, height, index, name, value } = props;
    return (
      <g>
        <rect
          x={x}
          y={y}
          width={width}
          height={height}
          style={{
            fill: CHART_COLORS[index % CHART_COLORS.length],
            stroke: "#13131A",
            strokeWidth: 2,
            opacity: 0.85
          }}
        />
        {width > 50 && height > 30 && (
          <text
            x={x + width / 2}
            y={y + height / 2}
            textAnchor="middle"
            fill="#ffffff"
            fontSize={10}
            fontWeight="bold"
          >
            {name} ({formatCurrency(value)})
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="space-y-8">
      {/* Filters and Control Row */}
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Activity className="w-5 h-5 text-cyan-400" /> Dynamic Chart Explorer
            </h3>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
              Central dynamic analytics workspace powered by synced double-entry books
            </p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button 
              onClick={fetchChartData}
              className="p-2.5 bg-white/5 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-colors"
              title="Refresh Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Export Menu */}
            <div className="relative group">
              <button className="px-4 py-2.5 bg-white/5 border border-white/10 text-slate-300 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-white/10 transition-all flex items-center gap-2">
                <Download className="w-4 h-4 text-cyan-400" /> Export
              </button>
              <div className="absolute right-0 mt-2 w-40 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-[70] overflow-hidden">
                <button onClick={exportCSV} className="w-full text-left px-4 py-2.5 hover:bg-white/5 text-xs text-slate-300 font-bold flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> CSV / Excel
                </button>
                <button onClick={() => window.print()} className="w-full text-left px-4 py-2.5 hover:bg-white/5 text-xs text-slate-300 font-bold flex items-center gap-2">
                  <FileText className="w-4 h-4 text-cyan-400" /> PDF / Print
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-black/30 p-4 rounded-2xl border border-white/5">
          {/* Chart Type Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">1. Selection: Chart Type</label>
            <select 
              value={chartType}
              onChange={(e) => setChartType(e.target.value as any)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            >
              <option value="line" className="bg-[#13131A]">Line Chart</option>
              <option value="bar" className="bg-[#13131A]">Bar Chart (Horizontal)</option>
              <option value="column" className="bg-[#13131A]">Column Chart (Vertical)</option>
              <option value="area" className="bg-[#13131A]">Area Chart</option>
              <option value="pie" className="bg-[#13131A]">Pie Chart</option>
              <option value="donut" className="bg-[#13131A]">Donut Chart</option>
              <option value="treemap" className="bg-[#13131A]">Treemap</option>
              <option value="heatmap" className="bg-[#13131A]">Vulnerability Heatmap</option>
              <option value="gauge" className="bg-[#13131A]">Gauge Scorecard</option>
            </select>
          </div>

          {/* Metric Selector (dynamically loaded based on chosen chart type) */}
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">2. Selection: Business Metric</label>
            <select 
              value={selectedMetric}
              onChange={(e) => setSelectedMetric(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            >
              {metricOptions.map(opt => (
                <option key={opt.id} value={opt.id} className="bg-[#13131A]">{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Drill-down selector month */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">3. Drill-down: target Month</label>
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2 text-xs font-bold text-white focus:outline-none focus:border-cyan-500/50 cursor-pointer"
            >
              {["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map(m => (
                <option key={m} value={m} className="bg-[#13131A]">{m.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Summary Ratios / Cards Row */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
          {[
            { label: "Current Metric Value", value: summary.currentValue, isCurrency: !["financial_health", "liquidity", "profitability", "working_capital_ratio", "compliance_score"].includes(selectedMetric) },
            { label: "Previous Period", value: summary.previousPeriod, isCurrency: !["financial_health", "liquidity", "profitability", "working_capital_ratio", "compliance_score"].includes(selectedMetric) },
            { label: "Variance", value: summary.variance, isCurrency: !["financial_health", "liquidity", "profitability", "working_capital_ratio", "compliance_score"].includes(selectedMetric), isVariance: true },
            { label: "Period Growth %", value: `${summary.growthPct}%`, isRaw: true, isGrowth: true, pctVal: summary.growthPct },
            { label: "Maximum Peak", value: summary.max, isCurrency: !["financial_health", "liquidity", "profitability", "working_capital_ratio", "compliance_score"].includes(selectedMetric) },
            { label: "Minimum Floor", value: summary.min, isCurrency: !["financial_health", "liquidity", "profitability", "working_capital_ratio", "compliance_score"].includes(selectedMetric) },
            { label: "Period Average", value: summary.average, isCurrency: !["financial_health", "liquidity", "profitability", "working_capital_ratio", "compliance_score"].includes(selectedMetric) }
          ].map((card, idx) => {
            const isNegative = card.isGrowth ? card.pctVal < 0 : card.isVariance ? card.value < 0 : false;
            const colorClass = card.isGrowth || card.isVariance
              ? isNegative ? "text-rose-400" : "text-emerald-400"
              : "text-white";
            
            return (
              <div key={idx} className="bg-[#13131A] border border-white/5 rounded-2xl p-4 shadow-md text-xs">
                <span className="text-slate-500 text-[9px] font-black uppercase tracking-wider block mb-1">{card.label}</span>
                <span className={`font-mono font-black text-sm block ${colorClass}`}>
                  {card.isRaw 
                    ? card.value 
                    : card.isCurrency 
                      ? formatCurrency(card.value) 
                      : card.value}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Chart Space */}
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl">
        <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
          <LineChart className="w-4 h-4 text-cyan-400" /> Interactive Plot Canvas
        </h3>

        <div className="h-[400px] w-full relative">
          {loading ? (
            <div className="absolute inset-0 bg-[#13131A]/90 z-20 flex items-center justify-center animate-pulse text-xs font-mono font-black uppercase text-cyan-500">
              Generating dynamic SVG layout...
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center border border-dashed border-white/5 rounded-2xl">
              <HelpCircle className="w-12 h-12 text-slate-700 mb-3" />
              <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">No matching accounting entries for this metric.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              {/* LINE CHART */}
              {chartType === "line" ? (
                <RechartsLineChart data={chartData} onClick={(data: any) => {
                  if (data?.activeLabel) setSelectedMonth(String(data.activeLabel));
                }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis dataKey="name" stroke="#ffffff20" tick={{ fill: "#ffffff50", fontSize: 9, fontWeight: "bold" }} />
                  <YAxis stroke="#ffffff20" tick={{ fill: "#ffffff50", fontSize: 9, fontWeight: "bold" }} tickFormatter={(v) => formatCurrency(v)} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff10", borderRadius: "12px" }} formatter={(v: any) => formatCurrency(Number(v))} />
                  <Legend />
                  <Line type="monotone" name={metricOptions.find(m => m.id === selectedMetric)?.label} dataKey="value" stroke="#22D3EE" strokeWidth={3} dot={{ r: 4, fill: "#22D3EE" }} activeDot={{ r: 6 }} />
                </RechartsLineChart>
              ) : 
              /* AREA CHART */
              chartType === "area" ? (
                <RechartsAreaChart data={chartData} onClick={(data: any) => {
                  if (data?.activeLabel) setSelectedMonth(String(data.activeLabel));
                }}>
                  <defs>
                    <linearGradient id="colorArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22D3EE" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22D3EE" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis dataKey="name" stroke="#ffffff20" tick={{ fill: "#ffffff50", fontSize: 9, fontWeight: "bold" }} />
                  <YAxis stroke="#ffffff20" tick={{ fill: "#ffffff50", fontSize: 9, fontWeight: "bold" }} tickFormatter={(v) => formatCurrency(v)} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff10", borderRadius: "12px" }} formatter={(v: any) => formatCurrency(Number(v))} />
                  <Area type="monotone" name={metricOptions.find(m => m.id === selectedMetric)?.label} dataKey="value" stroke="#22D3EE" strokeWidth={3} fillOpacity={1} fill="url(#colorArea)" />
                </RechartsAreaChart>
              ) :
              /* BAR CHART */
              chartType === "bar" ? (
                <RechartsBarChart data={chartData} layout="vertical" onClick={(data: any) => {
                  if (data?.activePayload?.[0]?.payload?.name) setSelectedMonth(String(data.activePayload[0].payload.name));
                }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" horizontal={false} />
                  <XAxis type="number" stroke="#ffffff20" tick={{ fill: "#ffffff50", fontSize: 9, fontWeight: "bold" }} tickFormatter={(v) => formatCurrency(v)} />
                  <YAxis dataKey="name" type="category" stroke="#ffffff20" tick={{ fill: "#ffffff50", fontSize: 9, fontWeight: "bold" }} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff10", borderRadius: "12px" }} formatter={(v: any) => formatCurrency(Number(v))} />
                  <Bar dataKey="value" fill="#22D3EE" radius={[0, 4, 4, 0]} />
                </RechartsBarChart>
              ) :
              /* COLUMN CHART */
              chartType === "column" ? (
                <RechartsBarChart data={chartData} onClick={(data: any) => {
                  if (data?.activeLabel) setSelectedMonth(String(data.activeLabel));
                }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                  <XAxis dataKey="name" stroke="#ffffff20" tick={{ fill: "#ffffff50", fontSize: 9, fontWeight: "bold" }} />
                  <YAxis stroke="#ffffff20" tick={{ fill: "#ffffff50", fontSize: 9, fontWeight: "bold" }} tickFormatter={(v) => formatCurrency(v)} />
                  <RechartsTooltip contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff10", borderRadius: "12px" }} formatter={(v: any) => formatCurrency(Number(v))} />
                  <Bar dataKey="value" fill="#22D3EE" radius={[4, 4, 0, 0]} />
                </RechartsBarChart>
              ) :
              /* PIE / DONUT CHART */
              chartType === "pie" || chartType === "donut" ? (
                <RechartsPieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    label={({ name, percent }) => `${name} (${((percent || 0) * 100).toFixed(0)}%)`}
                    outerRadius={120}
                    innerRadius={chartType === "donut" ? 70 : 0}
                    dataKey="value"
                    onClick={(entry) => {
                      if (entry?.name) {
                        // If composition, select month or inspect share
                      }
                    }}
                  >
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ backgroundColor: "#13131A", borderColor: "#ffffff10", borderRadius: "12px" }} formatter={(v: any) => formatCurrency(Number(v))} />
                </RechartsPieChart>
              ) :
              /* TREEMAP */
              chartType === "treemap" ? (
                <RechartsTreemap
                  data={chartData as any}
                  dataKey="value"
                  stroke="#13131A"
                  fill="#22D3EE"
                  content={<TreemapContent />}
                />
              ) :
              /* HEATMAP (Risk Vulnerability) */
              chartType === "heatmap" ? (
                <div className="h-full flex flex-col justify-between space-y-4">
                  <div className="flex-1 grid grid-cols-3 md:grid-cols-6 gap-3 overflow-y-auto max-h-[340px] pr-2">
                    {chartData.map((point) => (
                      <div 
                        key={point.name} 
                        className="bg-[#1A1A24] border border-white/5 p-4 rounded-xl flex flex-col justify-between transition-all hover:scale-[1.02]"
                        style={{ borderLeft: `4px solid ${RISK_COLORS[point.risk || "LOW"]}` }}
                      >
                        <div>
                          <span className="text-[10px] text-white font-bold block truncate max-w-[120px]">{point.name}</span>
                          <span className="text-[8px] font-mono text-slate-500 uppercase block tracking-wider mt-0.5">{point.category}</span>
                        </div>
                        <div className="flex justify-between items-center mt-3 pt-2 border-t border-white/5">
                          <span className="font-mono font-black text-slate-300">{point.value}</span>
                          <span className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded font-mono" style={{ backgroundColor: `${RISK_COLORS[point.risk || "LOW"]}15`, color: RISK_COLORS[point.risk || "LOW"] }}>
                            {point.risk}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Legend */}
                  <div className="flex gap-4 text-[10px] font-bold text-slate-400">
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-rose-500" /> High Vulnerability</div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Medium Vulnerability</div>
                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Low/Satisfied Risk</div>
                  </div>
                </div>
              ) :
              /* GAUGE (KPI Score) */
              (
                <div className="h-full flex flex-col items-center justify-center">
                  <div className="relative w-56 h-56 rounded-full border-[16px] border-white/5 flex items-center justify-center shadow-2xl"
                       style={{ borderTopColor: "#22D3EE", borderRightColor: "#22D3EE", borderBottomColor: "#ffffff05" }}>
                    <div className="text-center">
                      <span className="text-4xl font-mono font-black text-white">{chartData[0]?.value || 0}</span>
                      <span className="text-xs text-slate-500 font-bold block uppercase tracking-widest mt-1">Score / Ratio</span>
                    </div>
                  </div>
                  <div className="text-center mt-6 text-slate-400 text-xs font-bold leading-relaxed max-w-sm">
                    {selectedMetric === "compliance_score" ? "Passed double-entry compliance scrutiny checks ratio" : "Operational financial health assessment index"}
                  </div>
                </div>
              )}
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Drill-down Verification table */}
      <div className="bg-[#13131A] border border-white/5 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="border-b border-white/5 pb-4 flex justify-between items-center">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Table className="w-5 h-5 text-cyan-400" /> Financial Audit Trail & Voucher Drill-down
            </h3>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mt-1">
              Double-entry audit verification trace for {selectedMonth.toUpperCase()} Month
            </p>
          </div>
          
          <div className="flex items-center gap-2 bg-black/20 p-2 rounded-xl border border-white/5 text-xs text-slate-400">
            <Info className="w-4 h-4 text-cyan-400" />
            <span>Formula: <strong>{formula}</strong></span>
          </div>
        </div>

        {loadingDrilldown ? (
          <div className="py-16 text-center text-cyan-500 animate-pulse text-xs font-mono font-black uppercase">Resolving transaction ledger traces...</div>
        ) : !drilldown ? (
          <div className="py-10 text-center text-slate-500 text-xs font-bold uppercase">Click on a chart node or select a month to view transactions.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Contributing Ledgers Weight */}
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">1. Mapped Source Ledgers ({drilldown.sourceLedgers.length})</h4>
              
              <div className="max-h-[300px] overflow-y-auto border border-white/5 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-black/40 border-b border-white/5 text-[9px] font-mono text-slate-500 uppercase">
                      <th className="p-3">Ledger Name</th>
                      <th className="p-3 text-right">Closing Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                    {drilldown.sourceLedgers.map((l) => (
                      <tr key={l.id} className="hover:bg-white/[0.01]">
                        <td className="p-3 font-bold text-white">
                          {l.name}
                          <span className="block text-[9px] text-slate-500 font-mono mt-0.5">{l.groupName}</span>
                        </td>
                        <td className={`p-3 text-right font-mono font-bold ${l.closingBalance < 0 ? "text-rose-400" : "text-emerald-400"}`}>
                          {formatCurrency(l.closingBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Contributing Vouchers List */}
            <div className="lg:col-span-2 space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">2. Contributing Vouchers List ({drilldown.vouchers.length} Transactions)</h4>
              
              <div className="max-h-[300px] overflow-y-auto border border-white/5 rounded-xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-black/40 border-b border-white/5 text-[9px] font-mono text-slate-500 uppercase">
                      <th className="p-3">Voucher Details</th>
                      <th className="p-3">Ledger Name</th>
                      <th className="p-3">Type</th>
                      <th className="p-3 text-right">Amount</th>
                      <th className="p-3">Narration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-medium text-slate-300">
                    {drilldown.vouchers.map((v) => (
                      <tr key={v.id} className="hover:bg-white/[0.01]">
                        <td className="p-3 font-bold text-white">
                          {v.voucherNumber}
                          <span className="block text-[9px] text-slate-500 mt-0.5">{new Date(v.date).toLocaleDateString("en-IN")}</span>
                        </td>
                        <td className="p-3 font-mono text-slate-300">{v.ledgerName}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase font-mono ${v.entryType === "DEBIT" ? "bg-cyan-500/10 text-cyan-400" : "bg-purple-500/10 text-purple-400"}`}>
                            {v.entryType}
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono font-bold text-white">{formatCurrency(v.amount)}</td>
                        <td className="p-3 max-w-[200px] truncate text-slate-400 italic" title={v.narration || ""}>
                          "{v.narration || "N/A"}"
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
