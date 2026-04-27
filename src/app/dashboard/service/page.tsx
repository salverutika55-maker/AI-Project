import { prisma } from "@/lib/prisma";
import SectorDashboard from "@/components/SectorDashboard";

export default async function ServicePage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const params = await searchParams;
  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" }
  });

  const activeClientId = params.client || null;

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
