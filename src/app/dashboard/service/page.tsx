import { prisma } from "@/lib/prisma";
import SectorDashboard from "@/components/SectorDashboard";

export default async function ServicePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const params = await searchParams;
  const clients = await prisma.client.findMany({
    where: { sector: "SERVICE" },
    orderBy: { name: "asc" }
  });

  const activeClientId = params.client || null;
  const activeClient = activeClientId ? await prisma.client.findUnique({ where: { id: activeClientId } }) : null;

  if (activeClientId && activeClient?.sector !== "SERVICE") {
    return (
      <div className="min-h-screen bg-[#0A0A0C] flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-[#13131A] p-10 rounded-3xl border border-white/10 shadow-2xl">
          <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
          </div>
          <h1 className="text-2xl font-black text-white mb-4">Invalid Sector Access</h1>
          <p className="text-slate-400 mb-8 font-medium">The client "{activeClient?.name}" is classified under {activeClient?.sector} and cannot be viewed in the Service P&L.</p>
          <a href="/dashboard" className="inline-block px-8 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold rounded-xl transition-all">Back to Client Hub</a>
        </div>
      </div>
    );
  }

  const sections = [
    {
      name: "Revenue from Operation",
      items: [
        "Service Revenue (Primary income)", 
        "Consulting / Professional Fees", 
        "Maintenance / AMC Income", 
        "Commission Income", 
        "Other Operating Income", 
        "Less : Commission",
        "Total Revenue"
      ],
      isBold: true
    },
    {
      name: "Direct Expenses",
      items: [
        "Salaries - Service Staff / Engineers / Consultants", 
        "Freelance / Contract Charges", 
        "Project Expenses", 
        "Travel & Conveyance (Service-related)", 
        "Consumables / Tools Used", 
        "Site Expenses", 
        "Subcontracting Charges", 
        "Other Direct Expense"
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
      items: ["Interest on Fixed Deposit"]
    },
    {
      name: "Indirect Expenses",
      items: [
        "Administrative Expenses", "Sales & Advertisement Expenses", 
        "Director Remuneration", "Office Staff Salary", 
        "Repairs & Maintenance - Office", "Travelling Expenses", 
        "Legal & Professional Fees", "Other Exp",
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
      title="Service" 
      type="service" 
      sections={sections} 
      activeClientId={activeClientId || undefined}
      clients={clients}
    />
  );
}
