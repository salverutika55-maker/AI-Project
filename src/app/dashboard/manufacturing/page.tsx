import { prisma } from "@/lib/prisma";
import SectorDashboard from "@/components/SectorDashboard";
import { Factory } from "lucide-react";

export default async function ManufacturingPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const params = await searchParams;
  const clients = await prisma.client.findMany({
    where: { sector: "MANUFACTURING" },
    orderBy: { name: "asc" }
  });

  const activeClientId = params.client || null;
  const activeClient = activeClientId ? await prisma.client.findUnique({ where: { id: activeClientId } }) : null;

  if (activeClientId && activeClient?.sector !== "MANUFACTURING") {
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-[#13131A] p-10 rounded-3xl border border-white/10 shadow-2xl">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <Factory className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-black text-white mb-4">Invalid Sector Access</h1>
          <p className="text-slate-400 mb-8 font-medium">The client "{activeClient?.name}" is classified under {activeClient?.sector} and cannot be viewed in the Manufacturing P&L.</p>
          <a href="/dashboard" className="inline-block px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl transition-all">Back to Client Hub</a>
        </div>
      </div>
    );
  }

  const sections = [
    {
      name: "Revenue from Operation",
      items: ["Domestic", "Export", "Less : Commission", "Total Revenue"],
      isBold: true
    },
    {
      name: "Cost of Goods Sold",
      items: ["Opening Stock", "Purchase", "Transport on Purchases", "Closing Stock", "COGS"],
      isBold: true
    },
    {
      name: "Contribution",
      items: ["Contribution"],
      isBold: true,
      isSubtotal: true
    },
    {
      name: "Direct Expenses",
      items: [
        "Coal Charges", "Power Bill", "Other Mfg. Expenses", 
        "Repairs & Maintenance - Factory", "Depreciation - Factory", 
        "Clearing & Forwarding Charges", "Consumables", "Factory Expenses", 
        "Security Charges", "Factory Staff", "Factory Workers", 
        "Hiring Charges", "Jobwork Charges", "Payment to Contractor", 
        "Transport on Sales"
      ]
    },
    {
      name: "Gross Profit",
      items: ["Gross Profit"],
      isBold: true,
      isSubtotal: true
    },
    {
      name: "Indirect Income",
      items: ["Interest on Fixed Deposit", "Gain/ Loss on (Export/Import)", "Duty Drawback"]
    },
    {
      name: "Indirect Expenses",
      items: [
        "Administrative Expenses", "Sales & Advertisement Expenses", 
        "Director Remuneration", "Office Staff Salary", 
        "Repairs & Maintenance - Office", "Travelling Expenses", 
        "Legal & Professional Fees", "Rent Expenses", "Other Exp",
        "Total Indirect Expenses"
      ],
      isBold: true
    },
    {
      name: "EBITDA",
      items: ["Earnings Before Interest Taxes & Amortization"],
      isBold: true,
      isSubtotal: true
    },
    {
      name: "Financials",
      items: ["Interest Expense", "Depreciation"]
    },
    {
      name: "Final Result",
      items: ["Net Profit Before Tax"],
      isBold: true,
      isTotal: true
    }
  ];

  return (
    <SectorDashboard 
      title="Manufacturing" 
      type="manufacturing" 
      sections={sections} 
      activeClientId={activeClientId || undefined}
      clients={clients}
    />
  );
}
