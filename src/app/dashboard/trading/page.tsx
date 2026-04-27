import { prisma } from "@/lib/prisma";
import SectorDashboard from "@/components/SectorDashboard";

export default async function TradingPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const params = await searchParams;
  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" }
  });

  const activeClientId = params.client || null;

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
      items: ["Clearing & Forwarding Charges", "Transport on Sales", "Other Direct Expense"]
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
      title="Trading" 
      type="trading" 
      sections={sections} 
      activeClientId={activeClientId || undefined}
      clients={clients}
    />
  );
}
